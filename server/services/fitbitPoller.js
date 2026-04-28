// Fitbit 실기기 폴러
// 인증 토큰으로 주기적으로 Fitbit Web API 폴링 → 내부 storage 갱신 → 스트레스 분석
// FITBIT_ENABLED=false 면 시작하지 않음 (시뮬레이터/HTTP 경로 사용)
const config = require('../config');
const auth = require('./fitbitAuth');
const fitbitClient = require('./fitbitClient');
const storage = require('../db/storage');
const analyzer = require('./stressAnalyzer');
const mqttClient = require('./mqttClient');

let timer = null;

async function tick() {
  try {
    if (!auth.isAuthenticated()) {
      console.log(
        '[fitbit-poll] 미인증 → http://localhost:' +
          config.server.port +
          '/auth/fitbit 접속 필요'
      );
      return;
    }
    const userId = process.env.USER_ID || 'user-001';
    const fitbit = await fitbitClient.fetchAllMetrics();

    storage.updateLatest(userId, {
      fitbit,
      device_status: { fitbit_connected: true, rpi_status: 'online' },
    });

    // 환경 데이터가 함께 있을 때만 스트레스 분석 실행
    const latest = storage.getLatest(userId);
    if (latest && latest.fitbit && latest.environment) {
      const analysis = analyzer.analyze(latest.fitbit, latest.environment);
      const combined = {
        ...latest,
        stress_analysis: {
          current_stress_level: analysis.current_stress_level,
          stress_status: analysis.stress_status,
          primary_factor: analysis.primary_factor,
        },
      };
      storage.addSample(combined);
      storage.updateLatest(userId, { stress_analysis: combined.stress_analysis });

      analysis.alerts.forEach((a) => {
        const alert = {
          user_id: userId,
          timestamp: new Date().toISOString(),
          ...a,
        };
        storage.addAlert(alert);
        if (mqttClient && mqttClient.publish) {
          mqttClient.publish(config.mqtt.topics.alert, alert);
        }
      });
    }

    console.log(
      `[fitbit-poll] hr=${fitbit.heart_rate} hrv=${fitbit.hrv} ` +
        `spo2=${fitbit.spo2} sleep=${fitbit.sleep_score} ` +
        `steps_min=${fitbit.steps_last_minute} steps_today=${fitbit.steps_today}`
    );
  } catch (err) {
    if (err.response && err.response.status === 401) {
      console.error('[fitbit-poll] 인증 만료 — /auth/fitbit 에서 다시 인증');
    } else if (err.response && err.response.status === 429) {
      console.error('[fitbit-poll] Rate Limit 초과 — FITBIT_POLL_INTERVAL_MS 늘리세요');
    } else {
      console.error('[fitbit-poll] 오류:', err.message);
    }
  }
}

function start() {
  if (!config.fitbit.enabled) {
    console.log(
      '[fitbit-poll] FITBIT_ENABLED=false → 실기기 폴링 비활성화 (시뮬레이터 사용)'
    );
    return;
  }
  if (!config.fitbit.clientId) {
    console.log('[fitbit-poll] FITBIT_CLIENT_ID 미설정 → 실기기 폴링 비활성화');
    return;
  }
  console.log(`[fitbit-poll] 시작 — 주기 ${config.fitbit.pollIntervalMs}ms`);
  setTimeout(tick, 5000);
  timer = setInterval(tick, config.fitbit.pollIntervalMs);
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { start, stop };
