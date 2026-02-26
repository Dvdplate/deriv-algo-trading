import mongoose from "mongoose";
import winston from "winston";
import Trade from "../models/Trade.js";
import DailyStat from "../models/DailyStat.js";

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

export const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGO_URI
    const conn = await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 5000,
    });

    logger.info(`📈 MongoDB connected: ${conn.connection.host}`);
  } catch (error) {
    logger.error(`💥 MongoDB connection failed: ${error.message}`);
    process.exit(1);
  }
};

/**
 * Creates a new trade record in MongoDB
 */
export const recordTradeEntry = async (contract_id, symbol, entry_price, trigger_reason) => {
  try {
    const trade = new Trade({
      contract_id,
      symbol,
      entry_price,
      trigger_reason,
      status: "OPEN"
    });
    await trade.save();
    return trade;
  } catch (err) {
    console.error(`DB Error saving trade entry: ${err.message}`);
  }
};

/**
 * Updates an open trade with profit, exit price, and marks it CLOSED
 */
export const recordTradeExit = async (contract_id, exit_price, profit, account_balance) => {
  try {
    const trade = await Trade.findOneAndUpdate(
      { contract_id },
      {
        $set: {
          exit_price,
          profit,
          account_balance,
          exit_time: Date.now(),
          status: "CLOSED"
        }
      },
      { new: true }
    );

    if (trade) {
      await updateDailyStats(profit);
    }
    return trade;
  } catch (err) {
    console.error(`DB Error closing trade: ${err.message}`);
  }
};

/**
 * Updates or creates the DailyStat log for accumulated stats
 */
const updateDailyStats = async (profit) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    await DailyStat.findOneAndUpdate(
      { date: today },
      {
        $inc: { 
          accumulated_profit: profit,
          trades_taken: 1
        }
      },
      { upsert: true, new: true }
    );
  } catch (err) {
    console.error(`DB Error updating Daily Stats: ${err.message}`);
  }
};

export default connectDB;
