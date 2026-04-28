// Fitbit/환경 데이터 수신 및 조회 RESTful API
// 기획서 요구사항 ③: 로컬 서버 서비스 인터페이스는 RESTful API로 설계
const express = require('express');
const storage = require('../db/storage');
const analyzer = require('../services/stressAnalyzer');

const router = express.Router();

// POST /api/data/fitbit
// Axios.JS 기반 HTTP 전송 경로 (MQTT 대신 HTTP POST로도 수신 가능하도록 이원화)
router.post('/fitbit', (req, res) => {
  const { user_id, fitbit } = req.body || {};
  if (!user_id || !fitbit) {
    return res.status(400).json({ error: 'user_id, fitbit 필드는 필수입니다' });
  }
  const latest = storage.updateLatest(user_id, {
    fitbit,
    device_status: { fitbit_connected: true, rpi_status: 'online' },
  });
  runAnalysisAndStore(user_id);
  res.json({ ok: true, latest });
});

// POST /api/data/sensor
router.post('/sensor', (req, res) => {
  const { user_id, environment, location } = req.body || {};
  if (!user_id || !environment) {
    return res.status(400).json({ error: 'user_id, environment 필드는 필수입니다' });
  }
  const latest = storage.updateLatest(user_id, {
    environment,
    location: location || 'unknown',
  });
  runAnalysisAndStore(user_id);
  res.json({ ok: true, latest });
});

// GET /api/data/latest/:userId  - 사용자 현재 상태
router.get('/latest/:userId', (req, res) => {
  const latest = storage.getLatest(req.params.userId);
  if (!latest) return res.status(404).json({ error: '사용자 데이터 없음' });
  res.json(latest);
});

// GET /api/data/latest  - 모든 사용자 최신 상태 요약
router.get('/latest', (req, res) => {
  res.json(storage.getAllLatest());
});

// GET /api/data/history?user_id=&limit=
router.get('/history', (req, res) => {
  const { user_id, limit } = req.query;
  const samples = storage.getSamples({
    userId: user_id,
    limit: limit ? parseInt(limit, 10) : 50,
  });
  res.json(samples);
});

function runAnalysisAndStore(userId) {
  const latest = storage.getLatest(userId);
  if (!latest || !latest.fitbit || !latest.environment) return null;
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
    storage.addAlert({ user_id: userId, timestamp: new Date().toISOString(), ...a });
  });
  return analysis;
}

module.exports = router;
