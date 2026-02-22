const EventEmitter = require("events");
const winston = require("winston");

const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp({ format: "HH:mm:ss" }),
    winston.format.printf(({ timestamp, message }) => `${timestamp} ${message}`)
  ),
  transports: [new winston.transports.Console()],
});

class RiskGuardian extends EventEmitter {
  constructor() {
    super();
    this.startingBalance = null;
    this.highestBalance = null;
    this.killswitchActiveUntil = 0;
  }

  updateBalance(balance) {
    if (this.startingBalance === null) {
      this.startingBalance = balance;
      this.highestBalance = balance;
    }
    
    if (balance > this.highestBalance) {
      this.highestBalance = balance;
    }

    const drawdown = (this.highestBalance - balance) / this.highestBalance;
    if (drawdown >= 0.045) {
      logger.error(`🚨 KILLSWITCH ACTIVATED! 4.5% Drawdown reached. Trading halted for 24h.`);
      this.killswitchActiveUntil = Date.now() + 24 * 60 * 60 * 1000;
      this.emit("killswitch_activated");
    }
  }

  isTradingAllowed() {
    if (Date.now() < this.killswitchActiveUntil) {
      return false; // Killswitch active
    }

    // Server Maintenance Exception: Sat 23:55 to Sun 00:05 GMT
    const now = new Date();
    const day = now.getUTCDay(); // 0 is Sunday, 6 is Saturday
    const hours = now.getUTCHours();
    const minutes = now.getUTCMinutes();

    if (day === 6 && hours === 23 && minutes >= 55) return false;
    if (day === 0 && hours === 0 && minutes < 5) return false;

    // London/New York session gating: 08:00 - 21:00 GMT
    if (hours < 8 || hours >= 21) {
      return false;
    }

    return true;
  }

  calculateRiskAmount(balance, multiplier, slDistancePoints) {
    // SL must NEVER exceed 1.5% of total account balance as per revised rules.
    if (!balance || !slDistancePoints) return 0;
    const amount = (balance * 0.015) * (multiplier / slDistancePoints);
    return Math.max(0.1, amount); // Sane minimum
  }
}

module.exports = new RiskGuardian();
