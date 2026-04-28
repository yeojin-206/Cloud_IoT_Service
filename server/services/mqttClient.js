// Raspberry Pi 엣지 서버 측 MQTT 구독자
// 옵션:
//   MQTT_ENABLED=false  → MQTT 사용 안 함 (HTTP 경로만 사용). 공용 브로커가 막힌 환경에서 권장.
const mqtt = require('mqtt');
const config = require('../config');
const storage = require('../db/storage');
const analyzer = require('./stressAnalyzer');

let client = null;
let subscribers = [];
let givenUp = false;
let errorCount = 0;
const MAX_ERRORS_BEFORE_GIVEUP = 3;

function onMessage(handler) {
  subscribers.push(handler);
}

function publish(topic, payload) {
  if (!client || !client.connected) return false;
  client.publish(topic, JSON.stringify(payload));
  return true;
}

function start() {
  if (!config.mqtt.enabled) {
    console.log('[mqtt] MQTT_ENABLED=false → MQTT 구독 비활성화 (HTTP 경로만 사용)');
    return;
  }

  console.log(`[mqtt] 브로커 연결 시도: ${config.mqtt.brokerUrl}`);
  client = mqtt.connect(config.mqtt.brokerUrl, {
    clientId: config.mqtt.clientId,
    reconnectPeriod: 5000,
    connectTimeout: 8000,
  });

  client.on('connect', () => {
    errorCount = 0;
    console.log('[mqtt] 브로커 연결 성공');
    const subs = [config.mqtt.topics.sensor, config.mqtt.topics.fitbit];
    subs.forEach((t) => {
      client.subscribe(t, (err) => {
        if (err) console.error(`[mqtt] 구독 실패 (${t}):`, err.message);
        else console.log(`[mqtt] 구독: ${t}`);
      });
    });
  });

  client.on('error', (err) => {
    errorCount += 1;
    if (givenUp) return;
    if (errorCount === 1) {
      console.error(`[mqtt] 브로커 연결 실패: ${err.message}`);
      console.error('[mqtt] 서버는 HTTP 경로(POST /api/data/...)만으로 정상 동작합니다.');
      console.error('[mqtt] 알림을 끄려면: MQTT_ENABLED=false npm run server');
    }
    if (errorCount >= MAX_ERRORS_BEFORE_GIVEUP) {
      givenUp = true;
      console.error('[mqtt] 재시도 포기. HTTP 경로만 사용합니다.');
      try {
        client.end(true);
      } catch (_) {}
    }
  });

  // 재연결 로그는 첫 한 번만 (소음 방지)
  let reconnectLogged = false;
  client.on('reconnect', () => {
    if (givenUp) return;
    if (!reconnectLogged) {
      console.log('[mqtt] 재연결 중...');
      reconnectLogged = true;
    }
  });

  client.on('message', (topic, message) => {
    let data;
    try {
      data = JSON.parse(message.toString());
    } catch (err) {
      console.error('[mqtt] JSON 파싱 실패:', err.message);
      return;
    }

    const userId = data.user_id || 'user-001';

    if (topic === config.mqtt.topics.sensor) {
      // IoT 환경 데이터 수신
      storage.updateLatest(userId, {
        environment: data.environment || data,
        location: data.location || 'unknown',
      });
    } else if (topic === config.mqtt.topics.fitbit) {
      // Fitbit 생체 데이터 수신
      storage.updateLatest(userId, {
        fitbit: data.fitbit || data,
        device_status: { fitbit_connected: true, rpi_status: 'online' },
      });
    }

    // 최신 Fitbit/환경이 모두 존재하면 스트레스 분석 실행
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

      // 알림이 있으면 저장 + MQTT 공지
      analysis.alerts.forEach((a) => {
        const alert = {
          user_id: userId,
          timestamp: new Date().toISOString(),
          ...a,
        };
        storage.addAlert(alert);
        publish(config.mqtt.topics.alert, alert);
      });

      subscribers.forEach((fn) => fn(combined, analysis));
    }
  });
}

function stop() {
  if (client) {
    try {
      client.end(true);
    } catch (_) {}
  }
}

module.exports = { start, stop, publish, onMessage };
