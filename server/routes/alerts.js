// 알림 조회 API
const express = require('express');
const storage = require('../db/storage');

const router = express.Router();

// GET /api/alerts?user_id=&limit=
router.get('/', (req, res) => {
  const { user_id, limit } = req.query;
  const list = storage.getAlerts({
    userId: user_id,
    limit: limit ? parseInt(limit, 10) : 30,
  });
  res.json(list);
});

module.exports = router;
