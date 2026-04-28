// Fitbit Web API 클라이언트
// 우리 서비스에 필요한 5개 지표만 가져온다 (기획서 1.3.1):
//   - HRV          : 스트레스 핵심 지표 (일별 1회 갱신, 수면 후)
//   - 심박수        : 1분 간격 인트라데이
//   - SpO2         : 야간 측정 → 일별 평균
//   - 수면 점수      : 전날 밤 efficiency (Web API에서 score 직접 미제공)
//   - 활동량 (steps): 분당 + 누적
const axios = require('axios');
const auth = require('./fitbitAuth');

const BASE = 'https://api.fitbit.com';

async function get(p) {
  const token = await auth.getValidAccessToken();
  if (!token) throw new Error('Fitbit 토큰 없음. /auth/fitbit 에서 인증하세요.');
  const res = await axios.get(`${BASE}${p}`, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 10000,
  });
  return res.data;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

async function safeGet(fn, fallback) {
  try {
    return await fn();
  } catch (err) {
    if (err.response && [404, 403].includes(err.response.status)) return fallback;
    throw err;
  }
}

async function getHrv() {
  const data = await safeGet(
    () => get(`/1/user/-/hrv/date/${todayStr()}.json`),
    { hrv: [] }
  );
  const day = data.hrv && data.hrv[0];
  return day ? day.value.dailyRmssd : null;
}

async function getLatestHeartRate() {
  const data = await safeGet(
    () => get(`/1/user/-/activities/heart/date/${todayStr()}/1d/1min.json`),
    {}
  );
  const ds =
    data['activities-heart-intraday'] && data['activities-heart-intraday'].dataset;
  if (ds && ds.length > 0) return ds[ds.length - 1].value;
  return null;
}

async function getSpo2() {
  const data = await safeGet(
    () => get(`/1/user/-/spo2/date/${todayStr()}.json`),
    null
  );
  return data && data.value ? data.value.avg : null;
}

async function getSleepEfficiency() {
  const data = await safeGet(
    () => get(`/1.2/user/-/sleep/date/${todayStr()}.json`),
    { sleep: [] }
  );
  if (data.sleep && data.sleep.length > 0) {
    return data.sleep[0].efficiency || null;
  }
  return null;
}

async function getStepsToday() {
  const data = await safeGet(
    () => get(`/1/user/-/activities/date/${todayStr()}.json`),
    null
  );
  return data && data.summary ? data.summary.steps : 0;
}

async function getStepsLastMinute() {
  const data = await safeGet(
    () => get(`/1/user/-/activities/steps/date/${todayStr()}/1d/1min.json`),
    {}
  );
  const ds =
    data['activities-steps-intraday'] && data['activities-steps-intraday'].dataset;
  if (ds && ds.length > 0) return parseInt(ds[ds.length - 1].value, 10) || 0;
  return 0;
}

async function fetchAllMetrics() {
  const [hrv, hr, spo2, sleepScore, stepsToday, stepsLastMin] = await Promise.all([
    getHrv().catch(() => null),
    getLatestHeartRate().catch(() => null),
    getSpo2().catch(() => null),
    getSleepEfficiency().catch(() => null),
    getStepsToday().catch(() => 0),
    getStepsLastMinute().catch(() => 0),
  ]);
  return {
    heart_rate: hr,
    hrv: hrv,
    spo2: spo2,
    sleep_score: sleepScore,
    steps_last_minute: stepsLastMin,
    steps_today: stepsToday,
  };
}

module.exports = { fetchAllMetrics };
