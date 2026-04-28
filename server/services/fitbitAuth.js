// Fitbit OAuth2 인증 + 토큰 관리
// Personal 앱 — Authorization Code Grant Flow with PKCE
// 토큰은 data/fitbit-tokens.json 에 영속 저장 (서버 재시작해도 유지)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const config = require('../config');

const TOKEN_FILE = path.join(__dirname, '..', '..', 'data', 'fitbit-tokens.json');
const SCOPES = ['heartrate', 'sleep', 'oxygen_saturation', 'activity', 'profile'];
const AUTH_URL = 'https://www.fitbit.com/oauth2/authorize';
const TOKEN_URL = 'https://api.fitbit.com/oauth2/token';

let pendingVerifier = null;
let tokens = null;

function loadTokens() {
  try {
    if (fs.existsSync(TOKEN_FILE)) {
      tokens = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
      return tokens;
    }
  } catch (err) {
    console.error('[fitbit-auth] 토큰 파일 읽기 실패:', err.message);
  }
  return null;
}

function saveTokens(t) {
  tokens = t;
  const dir = path.dirname(TOKEN_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(t, null, 2));
}

function generateCodeVerifier() {
  return crypto.randomBytes(64).toString('base64url').slice(0, 96);
}

function generateCodeChallenge(verifier) {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

function getAuthorizeUrl() {
  if (!config.fitbit.clientId) {
    throw new Error('FITBIT_CLIENT_ID 가 .env 에 설정되지 않았습니다.');
  }
  pendingVerifier = generateCodeVerifier();
  const challenge = generateCodeChallenge(pendingVerifier);
  const params = new URLSearchParams({
    client_id: config.fitbit.clientId,
    response_type: 'code',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    scope: SCOPES.join(' '),
    redirect_uri: config.fitbit.redirectUri,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

async function exchangeCodeForToken(code) {
  if (!pendingVerifier) {
    throw new Error('PKCE verifier 없음. /auth/fitbit 부터 다시 시작하세요.');
  }
  const basic = Buffer.from(
    `${config.fitbit.clientId}:${config.fitbit.clientSecret}`
  ).toString('base64');
  const body = new URLSearchParams({
    client_id: config.fitbit.clientId,
    grant_type: 'authorization_code',
    code,
    redirect_uri: config.fitbit.redirectUri,
    code_verifier: pendingVerifier,
  });
  const res = await axios.post(TOKEN_URL, body.toString(), {
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  });
  pendingVerifier = null;
  const t = {
    access_token: res.data.access_token,
    refresh_token: res.data.refresh_token,
    expires_at: Date.now() + res.data.expires_in * 1000,
    user_id: res.data.user_id,
    scope: res.data.scope,
  };
  saveTokens(t);
  return t;
}

async function refreshAccessToken() {
  if (!tokens || !tokens.refresh_token) {
    throw new Error('refresh_token 없음. 다시 인증하세요.');
  }
  const basic = Buffer.from(
    `${config.fitbit.clientId}:${config.fitbit.clientSecret}`
  ).toString('base64');
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: tokens.refresh_token,
  });
  const res = await axios.post(TOKEN_URL, body.toString(), {
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  });
  const t = {
    access_token: res.data.access_token,
    refresh_token: res.data.refresh_token,
    expires_at: Date.now() + res.data.expires_in * 1000,
    user_id: tokens.user_id,
    scope: tokens.scope,
  };
  saveTokens(t);
  return t;
}

async function getValidAccessToken() {
  if (!tokens) loadTokens();
  if (!tokens) return null;
  // 만료 5분 전 자동 갱신
  if (Date.now() > tokens.expires_at - 5 * 60 * 1000) {
    console.log('[fitbit-auth] 액세스 토큰 갱신 중...');
    await refreshAccessToken();
  }
  return tokens.access_token;
}

function isAuthenticated() {
  if (!tokens) loadTokens();
  return Boolean(tokens && tokens.refresh_token);
}

function getFitbitUserId() {
  if (!tokens) loadTokens();
  return tokens ? tokens.user_id : null;
}

module.exports = {
  getAuthorizeUrl,
  exchangeCodeForToken,
  getValidAccessToken,
  isAuthenticated,
  getFitbitUserId,
  loadTokens,
};
