// Fitbit 생체 데이터 시뮬레이터
// 실제 환경: Fitbit Web API (OAuth2) → Raspberry Pi에서 Axios.JS로 폴링 → 로컬 서버로 전송
// 시뮬레이션: Fitbit Web API 응답과 유사한 구조의 데이터를 생성
//
// 기획서 요구사항 "Axios.JS" 시연을 위해 두 가지 경로를 모두 지원:
//   1) HTTP POST (axios.post → 로컬 Express 서버)      기본값
//   2) MQTT Publish                                       MODE=mqtt
const axios = require('axios');
const mqtt = require('mqtt');
const config = require('../server/config');

const USER_ID = process.env.USER_ID || 'user-001';
const INTERVAL = config.intervals.fitbit;
const MODE = (process.env.MODE || 'http').toLowerCase(); // 'http' | 'mqtt' | 'both'
const SERVER_URL = process.env.SERVER_URL || `http://localhost:${config.server.port}`;

// 내부 상태
const state = {
  heart_rate: 72,
  hrv: 55,
  spo2: 98,
  steps_last_minute: 20,
  sleep_score: 78,
  // 스트레스 상황을 시뮬레이션하기 위한 "긴장도" (0~1)
  tension: 0.2,
};

// 10% 확률로 긴장 이벤트 발생 (약 30~60초 지속)
let tensionTimer = 0;

function drift(value, step, min, max) {
  const next = value + (Math.random() - 0.5) * step;
  return Math.max(min, Math.min(max, next));
}

function sample() {
  // 랜덤하게 긴장 이벤트 트리거
  if (tensionTimer <= 0 && Math.random() < 0.1) {
    tensionTimer = Math.floor(30 / (INTERVAL / 1000)); // 30초 분량
  }
  if (tensionTimer > 0) {
    state.tension = Math.min(1, state.tension + 0.05);
    tensionTimer -= 1;
  } else {
    state.tension = Math.max(0.1, state.tension - 0.03);
  }

  // 긴장도에 따라 HR↑, HRV↓ 반영
  const hrTarget = 70 + state.tension * 45; // 70~115
  const hrvTarget = 60 - state.tension * 40; // 60~20
  state.heart_rate = drift((state.heart_rate + hrTarget) / 2, 4, 55, 130);
  state.hrv = drift((state.hrv + hrvTarget) / 2, 3, 15, 75);
  state.spo2 = drift(state.spo2, 0.4, 93, 100);

  // 부동 시뮬레이트: 가끔 0~5 걸음만
  state.steps_last_minute = Math.random() < 0.3 ? Math.floor(Math.random() * 6) : Math.floor(15 + Math.random() * 25);

  // 수면 점수는 하루 단위로 거의 고정 + 미세 변동
  state.sleep_score = drift(state.sleep_score, 0.5, 40, 95);

  return {
    user_id: USER_ID,
    timestamp: new Date().toISOString(),
    fitbit: {
      heart_rate: Math.round(state.heart_rate),
      hrv: Math.round(state.hrv * 10) / 10,
      spo2: Math.round(state.spo2),
      steps_last_minute: state.steps_last_minute,
      sleep_score: Math.round(state.sleep_score),
    },
  };
}

// ---- 전송 로직 ----
let mqttC = null;
if (MODE === 'mqtt' || MODE === 'both') {
  mqttC = mqtt.connect(config.mqtt.brokerUrl, {
    clientId: `fitbit-sim-${Math.floor(Math.random() * 10000)}`,
    reconnectPeriod: 3000,
  });
  mqttC.on('connect', () => console.log('[fitbit-sim] MQTT 연결 완료'));
  mqttC.on('error', (err) => console.error('[fitbit-sim] MQTT 오류:', err.message));
}

async function publish(payload) {
  // MQTT 경로
  if (mqttC && mqttC.connected) {
    mqttC.publish(config.mqtt.topics.fitbit, JSON.stringify(payload));
  }
  // HTTP 경로 (Axios.JS 활용)
  if (MODE === 'http' || MODE === 'both') {
    try {
      await axios.post(`${SERVER_URL}/api/data/fitbit`, payload, { timeout: 5000 });
    } catch (err) {
      console.error('[fitbit-sim] HTTP 전송 실패:', err.message);
    }
  }
}

console.log(`[fitbit-sim] 시작 — MODE=${MODE}, 주기=${INTERVAL}ms, user=${USER_ID}`);
setInterval(async () => {
  const payload = sample();
  await publish(payload);
  const f = payload.fitbit;
  console.log(
    `[fitbit-sim] hr=${f.heart_rate} hrv=${f.hrv} spo2=${f.spo2} ` +
      `steps1m=${f.steps_last_minute} sleep=${f.sleep_score}`
  );
}, INTERVAL);
