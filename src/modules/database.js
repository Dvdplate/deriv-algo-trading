const mongoose = require("mongoose");
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

const connectDB = async () => {
  try {
    const mongoUri =
      process.env.MONGO_URI || "mongodb://localhost:27017/deriv_algo";
    const conn = await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 5000,
    });

    logger.info(`📈 MongoDB connected: ${conn.connection.host}`);
  } catch (error) {
    logger.error(`💥 MongoDB connection failed: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
