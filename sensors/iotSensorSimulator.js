// IoT 환경 센서 시뮬레이터
// 실제 환경: Raspberry Pi + GPIO/I2C 센서 (DHT22, MH-Z19 CO2, KY-038 소음)
// 시뮬레이션: 현실적인 범위의 값을 주기적으로 발행
//
// 전송 경로 (MODE 환경 변수):
//   - MODE=mqtt  : MQTT 퍼블리시만
//   - MODE=http  : Axios HTTP POST만 (MQTT 브로커 미설치 환경용, 기본값)
//   - MODE=both  : 두 경로 모두 사용
const mqtt = require('mqtt');
const axios = require('axios');
const config = require('../server/config');

const USER_ID = process.env.USER_ID || 'user-001';
const INTERVAL = config.intervals.sensor;
const MODE = (process.env.MODE || 'http').toLowerCase();
const SERVER_URL = process.env.SERVER_URL || `http://localhost:${config.server.port}`;
// SKIP_TEMP_HUMI=true 면 온도/습도는 안 보냄 (DHT11 등 실기기가 따로 보낼 때)
const SKIP_TEMP_HUMI = (process.env.SKIP_TEMP_HUMI || 'false').toLowerCase() === 'true';

// 내부 상태: 천천히 변동하는 값을 만들기 위한 기준값
const state = {
  temperature: 24.0,
  humidity: 45,
  co2_ppm: 600,
  noise_db: 40,
};

function drift(value, step, min, max) {
  const next = value + (Math.random() - 0.5) * step;
  return Math.max(min, Math.min(max, next));
}

function round1(v) {
  return Math.round(v * 10) / 10;
}

function sample() {
  state.temperature = drift(state.temperature, 0.3, 18, 32);
  state.humidity = drift(state.humidity, 1.5, 25, 75);
  // 가끔 환기 안 되는 상황을 시뮬레이트 (스파이크)
  const co2Step = Math.random() < 0.1 ? 80 : 20;
  state.co2_ppm = drift(state.co2_ppm, co2Step, 400, 1800);
  const noiseStep = Math.random() < 0.15 ? 15 : 3;
  state.noise_db = drift(state.noise_db, noiseStep, 30, 95);

  const env = {
    co2_ppm: Math.round(state.co2_ppm),
    noise_db: round1(state.noise_db),
  };
  if (!SKIP_TEMP_HUMI) {
    env.temperature = round1(state.temperature);
    env.humidity = Math.round(state.humidity);
  }
  return {
    user_id: USER_ID,
    timestamp: new Date().toISOString(),
    environment: env,
    location: 'study_room',
  };
}

// ---- MQTT 연결 (선택) ----
let mqttClient = null;
if (MODE === 'mqtt' || MODE === 'both') {
  mqttClient = mqtt.connect(config.mqtt.brokerUrl, {
    clientId: `sensor-sim-${Math.floor(Math.random() * 10000)}`,
    reconnectPeriod: 3000,
    connectTimeout: 8000,
  });
  mqttClient.on('connect', () =>
    console.log(`[sensor-sim] MQTT 연결 완료 → ${config.mqtt.topics.sensor}`)
  );
  mqttClient.on('error', (err) => console.error('[sensor-sim] MQTT 오류:', err.message));
}

async function publish(payload) {
  if (mqttClient && mqttClient.connected) {
    mqttClient.publish(config.mqtt.topics.sensor, JSON.stringify(payload));
  }
  if (MODE === 'http' || MODE === 'both') {
    try {
      await axios.post(`${SERVER_URL}/api/data/sensor`, payload, { timeout: 5000 });
    } catch (err) {
      console.error('[sensor-sim] HTTP 전송 실패:', err.message);
    }
  }
}

console.log(`[sensor-sim] 시작 — MODE=${MODE}, 주기=${INTERVAL}ms, user=${USER_ID}`);
setInterval(async () => {
  const payload = sample();
  await publish(payload);
  console.log(
    `[sensor-sim] temp=${payload.environment.temperature}°C ` +
      `humi=${payload.environment.humidity}% ` +
      `co2=${payload.environment.co2_ppm}ppm ` +
      `noise=${payload.environment.noise_db}dB`
  );
}, INTERVAL);
