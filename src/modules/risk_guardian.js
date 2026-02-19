const mongoose = require('mongoose');
const DailyStat = require('../models/DailyStat');
const Trade = require('../models/Trade');
const winston = require('winston');

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    transports: [
        new winston.transports.Console()
    ]
});

class RiskGuardian {
    constructor() {
        this.tickHistory = []; // Store last 5 ticks
        this.maxTickHistory = 5;
        this.isPaused = false;
        this.pauseUntil = null;
    }

    // Helper to get current date string "YYYY-MM-DD"
    getTodayDateString() {
        return new Date().toISOString().split('T')[0];
    }

    async checkDailyCap() {
        if (this.isPaused && Date.now() < this.pauseUntil) {
            logger.info("Bot is paused due to Risk Management (Train detected).");
            return true; // Treat as cap reached/restricted
        } else if (this.isPaused && Date.now() >= this.pauseUntil) {
            this.isPaused = false;
            this.pauseUntil = null;
            logger.info("Risk Management pause expired. Resuming.");
        }

        const date = this.getTodayDateString();
        let dailyStat = await DailyStat.findOne({ date });

        if (!dailyStat) {
            dailyStat = await DailyStat.create({ date });
        }

        if (dailyStat.accumulated_profit >= 8.00) {
            if (!dailyStat.is_cap_reached) {
                dailyStat.is_cap_reached = true;
                await dailyStat.save();
                logger.info("Daily Target Hit - Sleep Mode");
            }
            return true;
        }

        return false;
    }

    async updateDailyStats(profit) {
        const date = this.getTodayDateString();
        // $inc is atomic
        await DailyStat.findOneAndUpdate(
            { date },
            {
                $inc: { accumulated_profit: profit, trades_taken: 1 }
            },
            { new: true, upsert: true }
        );

        // Check if we crossed the threshold after update
        const updatedStat = await DailyStat.findOne({ date });
        if (updatedStat.accumulated_profit >= 8.00) {
             await DailyStat.findOneAndUpdate({ date }, { is_cap_reached: true });
             logger.info("Daily Target Hit - Sleep Mode");
        }
    }

    async recordTradeEntry(contractId, price, reason = 'FIRST_SELL') {
        try {
            await Trade.create({
                contract_id: contractId,
                entry_price: price,
                trigger_reason: reason,
                status: 'OPEN'
            });
            logger.info(`Trade recorded: ${contractId} @ ${price}`);
        } catch (err) {
            logger.error(`Failed to record trade entry: ${err.message}`);
        }
    }

    async recordTradeExit(contractId, exitPrice, profit) {
        try {
            await Trade.findOneAndUpdate(
                { contract_id: contractId },
                {
                    status: 'CLOSED',
                    exit_time: Date.now(),
                    exit_price: exitPrice,
                    profit: profit
                }
            );
            logger.info(`Trade closed: ${contractId}. Profit: ${profit}`);
            await this.updateDailyStats(profit);
        } catch (err) {
            logger.error(`Failed to record trade exit: ${err.message}`);
        }
    }

    // Returns true if "Train" is detected
    processTick(currentPrice) {
        // We need ticks to calculate delta.
        // The spec says: "Store the last 5 ticks in a rolling array."
        // "Condition: If 2 consecutive ticks show Delta > 4.0"

        // Wait, "ticks" usually implies the price value.

        this.tickHistory.push(currentPrice);
        if (this.tickHistory.length > this.maxTickHistory) {
            this.tickHistory.shift();
        }

        if (this.tickHistory.length < 3) return false;

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

        if (delta1 > 4.0 && delta2 > 4.0) {
            logger.warn("TRAIN DETECTED! Emergency Brake Activated.");
            this.triggerEmergencyBrake();
            return true;
        }

        return false;
    }

    triggerEmergencyBrake() {
        this.isPaused = true;
        this.pauseUntil = Date.now() + 15 * 60 * 1000; // 15 minutes
    }
}

module.exports = new RiskGuardian();
