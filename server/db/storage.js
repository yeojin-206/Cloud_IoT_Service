// 경량 인메모리 + JSON 파일 기반 저장소
// On-Premise 환경(Raspberry Pi, 개인 PC)에서 별도 DB 없이 동작하도록 설계
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const SAMPLES_FILE = path.join(DATA_DIR, 'samples.json');
const ALERTS_FILE = path.join(DATA_DIR, 'alerts.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadJSON(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    const raw = fs.readFileSync(file, 'utf-8');
    return raw ? JSON.parse(raw) : fallback;
  } catch (err) {
    console.error(`[storage] ${file} 로드 실패:`, err.message);
    return fallback;
  }
}

function saveJSON(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error(`[storage] ${file} 저장 실패:`, err.message);
  }
}

// 최신 N건만 유지
const MAX_SAMPLES = 500;
const MAX_ALERTS = 200;

// 센서 샘플 (IoT 환경 + Fitbit) 시간축 병합 전/후 데이터
const samples = loadJSON(SAMPLES_FILE, []);
const alerts = loadJSON(ALERTS_FILE, []);

// 사용자별 최신 Fitbit / 환경 스냅샷
const latestByUser = {};

function addSample(sample) {
  samples.push(sample);
  if (samples.length > MAX_SAMPLES) samples.splice(0, samples.length - MAX_SAMPLES);
  saveJSON(SAMPLES_FILE, samples);
}

function getSamples({ userId, limit = 50 } = {}) {
  const filtered = userId ? samples.filter((s) => s.user_id === userId) : samples;
  return filtered.slice(-limit);
}

function updateLatest(userId, partial) {
  if (!latestByUser[userId]) {
    latestByUser[userId] = {
      user_id: userId,
      timestamp: new Date().toISOString(),
      device_status: { fitbit_connected: false, rpi_status: 'online' },
      fitbit: null,
      environment: null,
      location: 'unknown',
    };
  }
  // environment / fitbit 은 부분 업데이트 가능하도록 deep merge
  // (DHT11=온습도만, MH-Z19=CO2만 등 여러 소스가 합쳐질 수 있음)
  const cur = latestByUser[userId];
  for (const [k, v] of Object.entries(partial)) {
    if (
      v &&
      typeof v === 'object' &&
      !Array.isArray(v) &&
      cur[k] &&
      typeof cur[k] === 'object'
    ) {
      cur[k] = { ...cur[k], ...v };
    } else {
      cur[k] = v;
    }
  }
  cur.timestamp = new Date().toISOString();
  return cur;
}

function getLatest(userId) {
  return latestByUser[userId] || null;
}

function getAllLatest() {
  return Object.values(latestByUser);
}

function addAlert(alert) {
  alerts.push(alert);
  if (alerts.length > MAX_ALERTS) alerts.splice(0, alerts.length - MAX_ALERTS);
  saveJSON(ALERTS_FILE, alerts);
}

function getAlerts({ userId, limit = 30 } = {}) {
  const filtered = userId ? alerts.filter((a) => a.user_id === userId) : alerts;
  return filtered.slice(-limit).reverse();
}

module.exports = {
  addSample,
  getSamples,
  updateLatest,
  getLatest,
  getAllLatest,
  addAlert,
  getAlerts,
};
