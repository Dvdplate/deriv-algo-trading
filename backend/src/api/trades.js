import express from 'express';
import Trade from '../models/Trade.js';
import { authenticateToken } from './auth.js';

const router = express.Router();

// @route GET /api/trades/today
// Returns all trades from the start of today (UTC), sorted by entry_time ascending
router.get('/today', authenticateToken, async (req, res) => {
  try {
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);

    const trades = await Trade.find({ entry_time: { $gte: startOfDay } })
      .sort({ entry_time: 1 })
      .lean();

    res.json(trades);
  } catch (error) {
    console.error('Trades API Error:', error.message);
    res.status(500).json({ message: 'Server Error' });
  }
});

export default router;
