import env from "dotenv";

env.config();

const config = {
  APP_ID: process.env.APP_ID,
  DERIV_TOKEN: process.env.DERIV_TOKEN,
  STAKE_AMOUNT: parseFloat(process.env.STAKE_AMOUNT || "10"),
  MULTIPLIER: parseInt(process.env.MULTIPLIER || "400", 10),
  SQUEEZE_THRESHOLD: parseFloat(process.env.SQUEEZE_THRESHOLD || "0.0005"),
  SYMBOL: "1HZ100V",
  TICK_LIMIT: 10,
  HEARTBEAT_INTERVAL_MS: 15000,
  TAKE_PROFIT_MULTIPLIER: 0.5, 
  STOP_LOSS_MULTIPLIER: 0.4, 
};

if (!config.APP_ID || !config.DERIV_TOKEN) {
  console.error("💥 Fatal Error: APP_ID or DERIV_TOKEN missing in .env");
  process.exit(1);
}

export default config;
