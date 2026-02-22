require("dotenv").config();
const winston = require("winston");
const connectDB = require("./modules/database");
const connection = require("./modules/connection");
// Requiring strategy_engine initializes the whole chain (market_data, execution, risk_guardian)
const strategyEngine = require("./modules/strategy_engine");

const isDevelopment = process.env.NODE_ENV === "development";
const logLevel = isDevelopment ? "debug" : "info";

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

const start = async () => {
  try {
    logger.info("🚀 Starting BOOM 500 Algo Trading Bot...");
    await connectDB();
    connection.connect();

    // Start account balance monitoring
    setInterval(() => {
      strategyEngine.logAccountStatus();
    }, 30000); // Every 30 seconds

    logger.info("✅ Bot initialized successfully");
  } catch (error) {
    logger.error(`💥 Fatal Error: ${error.message}`);
    process.exit(1);
  }
};

start();

// Graceful Shutdown
process.on("SIGINT", () => {
  logger.info("🚫 Received SIGINT - initiating graceful shutdown...");
  logger.info("Shutting down...");
  connection.close();
  process.exit(0);
});

process.on("SIGTERM", () => {
  logger.info("🚫 Received SIGTERM - initiating graceful shutdown...");
  logger.info("Shutting down...");
  connection.close();
  process.exit(0);
});

process.on("uncaughtException", (error) => {
  logger.error("🚨 UNCAUGHT EXCEPTION - CRITICAL ERROR", {
    error: error.message,
    stack: error.stack,
    name: error.name,
    fullError: error,
  });
  console.error("Uncaught Exception:", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  logger.error("🚨 UNHANDLED PROMISE REJECTION - CRITICAL ERROR", {
    reason: reason instanceof Error ? reason.message : reason,
    stack: reason instanceof Error ? reason.stack : null,
    promise: promise.toString(),
    fullReason: reason,
  });
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
  process.exit(1);
});
