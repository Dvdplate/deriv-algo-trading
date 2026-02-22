const EventEmitter = require("events");
const connection = require("./connection");
const winston = require("winston");

const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp({ format: "HH:mm:ss" }),
    winston.format.printf(({ timestamp, message }) => `${timestamp} ${message}`),
  ),
  transports: [new winston.transports.Console()],
});

class MarketData extends EventEmitter {
  constructor() {
    super();
    this.symbol = "R_75"; // Strict Volatility 75 symbol
    this.candles = {
      H1: [],
      M15: [],
      M5: []
    };
    this.currentPrice = null;
    this.setupListeners();
  }

  setupListeners() {
    connection.on("open", () => {
      logger.info("🔌 Connected - subscribing to data");
      this.subscribeTicks();
      this.subscribeCandles(3600, 3600); // H1
      this.subscribeCandles(900, 900);   // M15
      this.subscribeCandles(300, 300);   // M5
    });
    
    connection.on("message", (message) => this.handleMessage(message));
  }

  subscribeTicks() {
    connection.send({
      ticks: this.symbol,
      subscribe: 1,
      req_id: 1 // For general ticks
    });
  }

  subscribeCandles(granularity, reqId) {
    connection.send({
      ticks_history: this.symbol,
      adjust_start_time: 1,
      count: 300,
      end: "latest",
      start: 1,
      style: "candles",
      granularity: granularity,
      subscribe: 1,
      req_id: reqId
    });
  }

  handleMessage(message) {
    if (message.error) {
      if (message.error.code !== "RateLimit") {
         logger.error(`MarketData API error [${message.error.code}]: ${message.error.message}`);
      }
      return;
    }

    if (message.msg_type === "tick") {
      const tick = message.tick;
      if (!tick || typeof tick.quote === "undefined") return;
      this.currentPrice = tick.quote;
      this.emit("tick", { price: tick.quote, epoch: tick.epoch });
    } else if (message.msg_type === "candles") {
      const granularity = message.echo_req.granularity;
      const key = granularity === 3600 ? "H1" : granularity === 900 ? "M15" : "M5";
      
      this.candles[key] = message.candles;
      logger.info(`🕯️ Initial ${key} history received (${this.candles[key].length} candles)`);
      this.emit("candles_history", { timeframe: key });
    } else if (message.msg_type === "ohlc") {
      const ohlc = message.ohlc;
      if (!ohlc) return;

      const granularity = ohlc.granularity;
      const key = granularity === 3600 ? "H1" : granularity === 900 ? "M15" : "M5";
      
      const list = this.candles[key];
      if (list && list.length > 0) {
        const lastCandle = list[list.length - 1];
        if (lastCandle.epoch === ohlc.epoch) {
          list[list.length - 1] = ohlc;
        } else {
          list.push(ohlc);
          if (list.length > 300) list.shift();
          this.emit("candle_closed", { timeframe: key, candle: lastCandle });
        }
      }
      this.emit("candle_update", { timeframe: key });
    }
  }

  getCandles(timeframe) {
    return this.candles[timeframe] || [];
  }
}

module.exports = new MarketData();
