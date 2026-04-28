// On-Premise 스마트 헬스케어 로컬 서버 (Express.JS)
// 기획서 요구사항:
//   ① PC / Notebook / Raspberry Pi / EC2 위에서 구동
//   ② Raspberry Pi를 로컬 서버(백엔드)로 사용 권장
//   ③ RESTful API 인터페이스 설계
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');

const config = require('./config');
const mqttClient = require('./services/mqttClient');
const fitbitPoller = require('./services/fitbitPoller');
const dataRouter = require('./routes/data');
const stressRouter = require('./routes/stress');
const alertsRouter = require('./routes/alerts');
const authRouter = require('./routes/auth');
const storage = require('./db/storage');

const app = express();

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));

// 정적 대시보드 (public/index.html)
app.use(express.static(path.join(__dirname, '..', 'public')));

// API 라우터
app.use('/api/data', dataRouter);
app.use('/api/stress', stressRouter);
app.use('/api/alerts', alertsRouter);

// Fitbit OAuth2 라우터 (/auth/fitbit, /auth/fitbit/callback)
app.use('/auth', authRouter);

// 헬스체크
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'smart-healthcare-onprem',
    timestamp: new Date().toISOString(),
    users: storage.getAllLatest().length,
  });
});

// 서비스 정보 (과제 메타데이터)
app.get('/api/info', (req, res) => {
  res.json({
    team: 'Team 12',
    members: [
      { name: 'Kim Yeojin (202411265)', role: '팀장/헬스케어 서비스 기획' },
      { name: 'Yang Hyunjun (202011326)', role: 'LLM 보고서 및 PPT 제작' },
      { name: 'Kyung Jangwook (202315304)', role: '스마트 헬스케어 서비스 사례 조사' },
      { name: 'Jeong Gihyeon (202315318)', role: '웨어러블 기술 조사' },
    ],
    service: 'On-Premise 방식 스마트 헬스케어 - 스트레스 관리',
    stack: ['Express.JS', 'MQTT.JS', 'Axios.JS', 'Raspberry Pi', 'Fitbit'],
    endpoints: {
      health: 'GET /api/health',
      info: 'GET /api/info',
      fitbitIngest: 'POST /api/data/fitbit',
      sensorIngest: 'POST /api/data/sensor',
      latest: 'GET /api/data/latest/:userId',
      latestAll: 'GET /api/data/latest',
      history: 'GET /api/data/history',
      stress: 'GET /api/stress/:userId',
      stressHistory: 'GET /api/stress/:userId/history',
      alerts: 'GET /api/alerts',
    },
  });
});

// 404 처리
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'API not found', path: req.path });
});

// 서버 시작
const server = app.listen(config.server.port, config.server.host, () => {
  console.log(`\n=== 스마트 헬스케어 On-Premise 서버 구동 ===`);
  console.log(`URL:       http://${config.server.host}:${config.server.port}`);
  console.log(`Dashboard: http://localhost:${config.server.port}/`);
  console.log(`API Info:  http://localhost:${config.server.port}/api/info`);
  console.log(`========================================\n`);

  // MQTT 브로커 구독 시작
  mqttClient.start();
  // Fitbit 실기기 폴링 시작 (FITBIT_ENABLED=true 일 때만 실제 동작)
  fitbitPoller.start();
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[server] 종료 중...');
  mqttClient.stop();
  fitbitPoller.stop();
  server.close(() => process.exit(0));
});
