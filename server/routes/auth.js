// Fitbit OAuth2 인증 라우트
//   GET /auth/fitbit          → Fitbit 로그인 페이지로 리다이렉트
//   GET /auth/fitbit/callback → 토큰 교환 후 저장
//   GET /auth/fitbit/status   → 현재 인증 상태 JSON
const express = require('express');
const auth = require('../services/fitbitAuth');

const router = express.Router();

router.get('/fitbit', (req, res) => {
  try {
    const url = auth.getAuthorizeUrl();
    res.redirect(url);
  } catch (err) {
    res.status(500).send(`인증 시작 실패: ${err.message}`);
  }
});

router.get('/fitbit/callback', async (req, res) => {
  const { code, error, error_description } = req.query;
  if (error) {
    return res
      .status(400)
      .send(`Fitbit 인증 거부: ${error_description || error}`);
  }
  if (!code) {
    return res.status(400).send('인증 코드가 없습니다.');
  }
  try {
    const tokens = await auth.exchangeCodeForToken(code);
    res.send(`<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8"><title>Fitbit 인증 완료</title></head>
<body style="font-family: system-ui, -apple-system, sans-serif; padding: 40px; max-width: 600px; margin: 0 auto; line-height: 1.6;">
  <h1>✅ Fitbit 연동 완료</h1>
  <p><strong>Fitbit 사용자 ID:</strong> <code>${tokens.user_id}</code></p>
  <p><strong>승인 권한:</strong> <code>${tokens.scope}</code></p>
  <p>토큰이 <code>data/fitbit-tokens.json</code> 에 저장되었습니다. 폴러가 자동으로 데이터를 가져옵니다.</p>
  <p style="margin-top: 24px;"><a href="/" style="background:#3b82f6;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;">→ 대시보드로 이동</a></p>
</body></html>`);
  } catch (err) {
    const detail = err.response ? JSON.stringify(err.response.data) : err.message;
    res.status(500).send(`토큰 교환 실패: ${detail}`);
  }
});

router.get('/fitbit/status', (req, res) => {
  res.json({
    authenticated: auth.isAuthenticated(),
    fitbit_user_id: auth.getFitbitUserId(),
  });
});

module.exports = router;
