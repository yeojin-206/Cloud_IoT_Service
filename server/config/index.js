// 서비스 전역 설정
// .env 파일이 있다면 로드 (선택사항)
try {
  require('dotenv').config();
} catch (e) {
  // dotenv가 설치되어 있지 않으면 process.env 값 그대로 사용
}

module.exports = {
  server: {
    port: process.env.PORT || 3000,
    host: process.env.HOST || '0.0.0.0',
  },
  mqtt: {
    // MQTT_ENABLED=false 이면 MQTT 구독을 시작하지 않는다 (HTTP 경로만 사용)
    enabled: (process.env.MQTT_ENABLED || 'true').toLowerCase() !== 'false',
    brokerUrl: process.env.MQTT_BROKER_URL || 'mqtt://test.mosquitto.org:1883',
    topics: {
      sensor: process.env.MQTT_TOPIC_SENSOR || 'healthcare/sensor',
      fitbit: process.env.MQTT_TOPIC_FITBIT || 'healthcare/fitbit',
      alert: 'healthcare/alert',
    },
    clientId: process.env.MQTT_CLIENT_ID || `rpi-edge-${Math.floor(Math.random() * 10000)}`,
  },
  intervals: {
    sensor: parseInt(process.env.SENSOR_INTERVAL_MS, 10) || 3000,
    fitbit: parseInt(process.env.FITBIT_INTERVAL_MS, 10) || 5000,
  },
  // Fitbit 실기기 연동 (Personal OAuth2 앱)
  fitbit: {
    enabled: (process.env.FITBIT_ENABLED || 'false').toLowerCase() === 'true',
    clientId: process.env.FITBIT_CLIENT_ID || '',
    clientSecret: process.env.FITBIT_CLIENT_SECRET || '',
    redirectUri: process.env.FITBIT_REDIRECT_URI || 'http://localhost:3000/auth/fitbit/callback',
    pollIntervalMs: parseInt(process.env.FITBIT_POLL_INTERVAL_MS, 10) || 60000,
  },
  // 스트레스 알림 임계치 (기획서 1.3.2 알람 로직)
  thresholds: {
    hrvLow: 30,
    heartRateHigh: 90,
    co2High: 1000,
    noiseHigh: 70,
    stepsLow: 10,
    sleepScoreLow: 60,
    hrvVeryLow: 20,
    stressHigh: 70,
    stressCaution: 50,
  },
};
