// 스트레스 분석 결과 및 가이드 조회 API
const express = require('express');
const storage = require('../db/storage');
const analyzer = require('../services/stressAnalyzer');

const router = express.Router();

// GET /api/stress/:userId - 현재 스트레스 지수 / 상태 / 해결 가이드
router.get('/:userId', (req, res) => {
  const latest = storage.getLatest(req.params.userId);
  if (!latest || !latest.fitbit || !latest.environment) {
    return res.status(404).json({ error: '분석 가능한 데이터가 아직 없습니다' });
  }
  const analysis = analyzer.analyze(latest.fitbit, latest.environment);
  res.json({
    user_id: req.params.userId,
    timestamp: new Date().toISOString(),
    ...analysis,
  });
});

// GET /api/stress/:userId/history?limit=
router.get('/:userId/history', (req, res) => {
  const limit = req.query.limit ? parseInt(req.query.limit, 10) : 50;
  const samples = storage.getSamples({ userId: req.params.userId, limit });
  const series = samples
    .filter((s) => s.stress_analysis)
    .map((s) => ({
      timestamp: s.timestamp,
      stress_level: s.stress_analysis.current_stress_level,
      status: s.stress_analysis.stress_status,
      factor: s.stress_analysis.primary_factor,
    }));
  res.json(series);
});

module.exports = router;
