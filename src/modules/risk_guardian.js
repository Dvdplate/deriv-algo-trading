const mongoose = require("mongoose");
const DailyStat = require("../models/DailyStat");
const Trade = require("../models/Trade");
const winston = require("winston");

const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp({ format: "HH:mm:ss" }),
    winston.format.printf(({ timestamp, message }) => {
      return `${timestamp} ${message}`;
    }),
  ),
  transports: [new winston.transports.Console()],
});

class RiskGuardian {
  constructor() {
    this.tickHistory = [];
    this.maxTickHistory = 5;
    this.isPaused = false;
    this.pauseUntil = null;
  }

  // Helper to get current date string "YYYY-MM-DD"
  getTodayDateString() {
    return new Date().toISOString().split("T")[0];
  }

  async checkDailyCap() {
    logger.debug("💰 Checking daily trading cap...");

    if (this.isPaused && Date.now() < this.pauseUntil) {
      const remainingPauseTime = Math.ceil(
        (this.pauseUntil - Date.now()) / 1000 / 60,
      );
      logger.warn("⏸️ Bot is paused due to risk management", {
        reason: "TRAIN_DETECTED",
        remainingMinutes: remainingPauseTime,
        pauseUntil: new Date(this.pauseUntil).toISOString(),
      });
      logger.info("Bot is paused due to Risk Management (Train detected).");
      return true; // Treat as cap reached/restricted
    } else if (this.isPaused && Date.now() >= this.pauseUntil) {
      logger.info("✅ Risk management pause expired - resuming operations", {
        pausedAt: new Date(this.pauseUntil - 15 * 60 * 1000).toISOString(),
        resumingAt: new Date().toISOString(),
      });
      this.isPaused = false;
      this.pauseUntil = null;
      logger.info("Risk Management pause expired. Resuming.");
    }

    const date = this.getTodayDateString();
    logger.debug("📅 Fetching daily statistics", { date });

    let dailyStat = await DailyStat.findOne({ date });

    if (!dailyStat) {
      logger.info("🆕 Creating new daily statistics record", { date });
      dailyStat = await DailyStat.create({ date });
    }

    logger.debug("📈 Current daily statistics", {
      date,
      accumulatedProfit: dailyStat.accumulated_profit,
      tradesTaken: dailyStat.trades_taken,
      isCapReached: dailyStat.is_cap_reached,
      target: 8.0,
      remaining: Math.max(0, 8.0 - dailyStat.accumulated_profit),
    });

    if (dailyStat.accumulated_profit >= 8.0) {
      if (!dailyStat.is_cap_reached) {
        logger.info("🏆 DAILY TARGET ACHIEVED! Activating sleep mode...", {
          finalProfit: dailyStat.accumulated_profit,
          target: 8.0,
          excessProfit: dailyStat.accumulated_profit - 8.0,
        });
        dailyStat.is_cap_reached = true;
        await dailyStat.save();
        logger.info("Daily Target Hit - Sleep Mode");
      } else {
        logger.debug("😴 Daily cap already reached and flagged");
      }
      return true;
    }

    return false;
  }

  async updateDailyStats(profit) {
    const date = this.getTodayDateString();

    logger.info("📈 Updating daily statistics", {
      date,
      tradeProfit: Number(profit).toFixed(2),
      profitFormatted:
        profit >= 0
          ? `+${Number(profit).toFixed(2)}`
          : Number(profit).toFixed(2),
    });

    // $inc is atomic
    const updatedStat = await DailyStat.findOneAndUpdate(
      { date },
      {
        $inc: { accumulated_profit: profit, trades_taken: 1 },
      },
      { new: true, upsert: true },
    );

    logger.info("✅ Daily statistics updated", {
      newAccumulatedProfit: updatedStat.accumulated_profit.toFixed(2),
      totalTrades: updatedStat.trades_taken,
      profitChange:
        profit >= 0
          ? `+${Number(profit).toFixed(2)}`
          : Number(profit).toFixed(2),
      targetProgress: `${updatedStat.accumulated_profit.toFixed(2)}/8.00`,
      targetPercentage: `${((updatedStat.accumulated_profit / 8.0) * 100).toFixed(1)}%`,
    });

    // Check if we crossed the threshold after update
    if (updatedStat.accumulated_profit >= 8.0) {
      logger.info("🏆 THRESHOLD CROSSED! Setting cap reached flag", {
        finalProfit: updatedStat.accumulated_profit,
        target: 8.0,
      });
      await DailyStat.findOneAndUpdate({ date }, { is_cap_reached: true });
      logger.info("Daily Target Hit - Sleep Mode");
    }
  }

  async recordTradeEntry(contractId, price, reason = "FIRST_SELL") {
    logger.info("📝 Recording trade entry", {
      contractId,
      entryPrice: Number(price).toFixed(2),
      triggerReason: reason,
      timestamp: new Date().toISOString(),
    });

    try {
      const tradeRecord = await Trade.create({
        contract_id: contractId,
        entry_price: price,
        trigger_reason: reason,
        status: "OPEN",
      });

      logger.info("✅ Trade entry recorded successfully", {
        contractId,
        entryPrice: Number(price).toFixed(2),
        dbId: tradeRecord._id,
      });
      logger.info(`Trade recorded: ${contractId} @ ${price}`);
    } catch (err) {
      logger.error("🚨 Failed to record trade entry", {
        contractId,
        price,
        reason,
        error: err.message,
        stack: err.stack,
      });
      logger.error(`Failed to record trade entry: ${err.message}`);
    }
  }

  async recordTradeExit(contractId, exitPrice, profit) {
    logger.info("📉 Recording trade exit", {
      contractId,
      exitPrice: Number(exitPrice).toFixed(2),
      profit: Number(profit).toFixed(2),
      profitFormatted:
        profit >= 0
          ? `+${Number(profit).toFixed(2)}`
          : Number(profit).toFixed(2),
      timestamp: new Date().toISOString(),
    });

    try {
      const updatedTrade = await Trade.findOneAndUpdate(
        { contract_id: contractId },
        {
          status: "CLOSED",
          exit_time: Date.now(),
          exit_price: exitPrice,
          profit: profit,
        },
        { new: true },
      );

      if (updatedTrade) {
        const duration = updatedTrade.exit_time - updatedTrade.entry_time;
        logger.info("✅ Trade exit recorded successfully", {
          contractId,
          entryPrice: Number(updatedTrade.entry_price).toFixed(2),
          exitPrice: Number(exitPrice).toFixed(2),
          profit: Number(profit).toFixed(2),
          profitFormatted:
            profit >= 0
              ? `+${Number(profit).toFixed(2)}`
              : Number(profit).toFixed(2),
          durationMs: duration,
          durationSeconds: (duration / 1000).toFixed(1),
        });
      } else {
        logger.warn(
          "⚠️ Trade exit recorded but original trade not found in database",
          {
            contractId,
          },
        );
      }

      logger.info(`Trade closed: ${contractId}. Profit: ${profit}`);
      await this.updateDailyStats(profit);
    } catch (err) {
      logger.error("🚨 Failed to record trade exit", {
        contractId,
        exitPrice,
        profit,
        error: err.message,
        stack: err.stack,
      });
      logger.error(`Failed to record trade exit: ${err.message}`);
    }
  }

  // Returns true if "Train" is detected
  processTick(currentPrice) {
    // We need ticks to calculate delta.
    // The spec says: "Store the last 5 ticks in a rolling array."
    // "Condition: If 2 consecutive ticks show Delta > 4.0"

    // Wait, "ticks" usually implies the price value.

    logger.debug("🚂 Processing tick for train detection", {
      currentPrice: Number(currentPrice).toFixed(2),
      tickHistoryLength: this.tickHistory.length,
      maxHistory: this.maxTickHistory,
    });

    this.tickHistory.push(currentPrice);
    if (this.tickHistory.length > this.maxTickHistory) {
      const removedTick = this.tickHistory.shift();
      logger.debug("🗑️ Removed oldest tick", {
        removedPrice: Number(removedTick).toFixed(2),
        currentHistoryLength: this.tickHistory.length,
      });
    }

    if (this.tickHistory.length < 3) {
      logger.debug("⏭️ Insufficient tick history for train detection", {
        current: this.tickHistory.length,
        required: 3,
      });
      return false;
    }

    // Check for 2 consecutive ticks with Delta > 4.0
    // A "tick" update gives us a new price.
    // Delta = Current - Previous.

    // We need at least 3 prices to have 2 deltas.
    // P1, P2, P3
    // D1 = P2 - P1
    // D2 = P3 - P2

    const prices = this.tickHistory;
    const len = prices.length;

    // Check the last 2 deltas
    const lastPrice = prices[len - 1];
    const prevPrice = prices[len - 2];
    const prevPrevPrice = prices[len - 3];

    const delta1 = lastPrice - prevPrice;
    const delta2 = prevPrice - prevPrevPrice;

    logger.debug("🔍 Train detection analysis", {
      prices: {
        p1: Number(prevPrevPrice).toFixed(2),
        p2: Number(prevPrice).toFixed(2),
        p3: Number(lastPrice).toFixed(2),
      },
      deltas: {
        delta1: Number(delta1).toFixed(2),
        delta2: Number(delta2).toFixed(2),
      },
      thresholds: {
        required: 4.0,
        delta1_exceeds: delta1 > 4.0,
        delta2_exceeds: delta2 > 4.0,
      },
      trainDetected: delta1 > 4.0 && delta2 > 4.0,
    });

    if (delta1 > 4.0 && delta2 > 4.0) {
      logger.error("🚨 TRAIN DETECTED! Consecutive high deltas found", {
        delta1: Number(delta1).toFixed(2),
        delta2: Number(delta2).toFixed(2),
        threshold: 4.0,
        prices: [
          Number(prevPrevPrice).toFixed(2),
          Number(prevPrice).toFixed(2),
          Number(lastPrice).toFixed(2),
        ],
      });
      logger.warn("TRAIN DETECTED! Emergency Brake Activated.");
      this.triggerEmergencyBrake();
      return true;
    } else {
      logger.debug(
        "✅ No train detected - price movements within acceptable range",
      );
    }

    return false;
  }

  triggerEmergencyBrake() {
    const pauseDuration = 15 * 60 * 1000; // 15 minutes
    const pauseUntil = Date.now() + pauseDuration;

    logger.error("🚨 EMERGENCY BRAKE ACTIVATED!", {
      reason: "TRAIN_DETECTED",
      pauseDurationMinutes: 15,
      pauseUntil: new Date(pauseUntil).toISOString(),
      currentTime: new Date().toISOString(),
    });

    this.isPaused = true;
    this.pauseUntil = pauseUntil;

    logger.warn("🚫 Risk management pause activated - all trading suspended", {
      pauseUntil: new Date(this.pauseUntil).toISOString(),
      durationMinutes: 15,
    });
  }
}

module.exports = new RiskGuardian();
