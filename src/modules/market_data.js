const EventEmitter = require("events");
const connection = require("./connection");
const SMA = require("technicalindicators").SMA;
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

class MarketData extends EventEmitter {
  constructor() {
    super();
    this.symbol = "BOOM500";
    this.candles = [];
    this.currentPrice = null;
    this.smas = {
      sma200: null,
      sma100: null,
      sma50: null,
      sma25: null,
    };

    this.setupListeners();
  }

  setupListeners() {
    connection.on("open", () => {
      logger.info("🔌 Connected - subscribing to data");
      this.subscribeTicks();
      this.subscribeCandles();
    });

    connection.on("message", (message) => {
      this.handleMessage(message);
    });
  }

  subscribeTicks() {
    connection.send({
      ticks: this.symbol,
      subscribe: 1,
    });
  }

  subscribeCandles() {
    connection.send({
      ticks_history: this.symbol,
      adjust_start_time: 1,
      count: 300,
      end: "latest",
      start: 1,
      style: "candles",
      granularity: 60,
      subscribe: 1,
    });
  }

  handleMessage(message) {
    // Only handle market data related messages
    const marketDataMessageTypes = ["tick", "candles", "ohlc", "ticks_history"];
    const isMarketDataMessage = marketDataMessageTypes.includes(
      message.msg_type,
    );

    // Handle market data specific errors
    const isMarketDataError =
      message.error &&
      (message.req_id ||
        ["MarketIsClosed", "InvalidSymbol", "InvalidGranularity"].includes(
          message.error?.code,
        ));

    if (!isMarketDataMessage && !isMarketDataError) {
      // This message isn't for market data module, ignore silently
      return;
    }

    if (message.msg_type === "tick") {
      if (!message.tick) {
        logger.warn("⚠️ Tick message received but tick object is null", {
          message,
          msgType: message.msg_type,
        });
        return;
      }

      const tick = message.tick;
      if (typeof tick.quote === "undefined") {
        logger.warn("⚠️ Tick received but quote is undefined", {
          tick,
          message,
        });
        return;
      }

      const oldPrice = this.currentPrice;
      this.currentPrice = tick.quote;

      logger.debug("💰 Price tick received", {
        price: tick.quote,
        previousPrice: oldPrice,
        change: oldPrice ? tick.quote - oldPrice : null,
        changePercent: oldPrice
          ? (((tick.quote - oldPrice) / oldPrice) * 100).toFixed(4) + "%"
          : null,
        epoch: tick.epoch,
        id: tick.id,
      });

      this.emit("tick", {
        price: tick.quote,
        epoch: tick.epoch,
        id: tick.id,
      });
    } else if (message.msg_type === "candles") {
      if (!message.candles || !Array.isArray(message.candles)) {
        logger.warn(
          "⚠️ Candles message received but candles array is invalid",
          {
            message,
            hasCandles: !!message.candles,
            candlesType: typeof message.candles,
          },
        );
        return;
      }

      logger.info("🕯️ Initial candle history received", {
        candleCount: message.candles.length,
        firstCandle: message.candles[0],
        lastCandle: message.candles[message.candles.length - 1],
      });
      // Initial history
      this.candles = message.candles;
      this.calculateSMAs();
    } else if (message.msg_type === "ohlc") {
      if (!message.ohlc) {
        logger.warn("⚠️ OHLC message received but ohlc object is null", {
          message,
        });
        return;
      }

      // Candle update
      const ohlc = message.ohlc;
      logger.debug("🕯️ Candle update received", {
        epoch: ohlc.epoch,
        open: ohlc.open,
        high: ohlc.high,
        low: ohlc.low,
        close: ohlc.close,
      });

      // Check if it's a new candle or update to current
      // The API sends updates for the current open candle.
      // We need to manage the array.

      const lastCandle = this.candles[this.candles.length - 1];
      if (lastCandle && lastCandle.epoch === ohlc.epoch) {
        logger.debug("🔄 Updating current open candle", {
          epoch: ohlc.epoch,
          previousClose: lastCandle.close,
          newClose: ohlc.close,
        });
        // Update current candle
        this.candles[this.candles.length - 1] = ohlc;
      } else {
        // logger.info("🆕 New candle started!", {
        //   newCandleEpoch: ohlc.epoch,
        //   previousCandleEpoch: lastCandle ? lastCandle.epoch : null,
        //   candleCount: this.candles.length + 1,
        // });

        // New candle started, push the previous one (which is now closed)
        // Actually, the stream sends the new candle.
        // Wait, if epoch is different, it means a new candle has started.
        // The previous candle is closed.
        this.candles.push(ohlc);
        if (this.candles.length > 300) {
          const removedCandle = this.candles.shift();
          logger.debug("🗑️ Removed oldest candle to maintain size", {
            removedEpoch: removedCandle.epoch,
            currentCount: this.candles.length,
          });
        }

        logger.debug("📈 Triggering SMA recalculation due to new candle");
        // Recalculate SMAs on new candle (using the closed candle)
        this.calculateSMAs();
      }
    } else if (message.error) {
      logger.error("🚨 MarketData API error received", {
        error: message.error.message || message.error,
        code: message.error.code,
        details: message.error.details,
        fullError: message.error,
        originalMessage: message,
      });
    } else {
      logger.debug("🤔 Unknown/unhandled market data message type", {
        msgType: message.msg_type,
        messageKeys: Object.keys(message),
        message: JSON.stringify(message).substring(0, 500) + "...",
      });
    }
  }

  calculateSMAs() {
    // Spec: Use the last closed candle (index length-2 in the array) to prevent repainting.
    // We need enough data.
    logger.debug("📈 Starting SMA calculation", {
      totalCandles: this.candles.length,
      requiredForSMA200: 200,
    });

    if (this.candles.length < 200) {
      logger.warn("⚠️ Not enough candles for SMA calculation yet", {
        currentCount: this.candles.length,
        required: 200,
        remaining: 200 - this.candles.length,
      });
      return;
    }

    const closePrices = this.candles.map((c) => Number(c.close));

    logger.debug("📊 Preparing price data for SMA calculation", {
      totalPrices: closePrices.length,
      latestPrice: closePrices[closePrices.length - 1],
      previousPrice: closePrices[closePrices.length - 2],
    });

    // Note: technicalindicators SMA.calculate returns an array of SMA values.
    // The last value in the array corresponds to the SMA at the end of the input series.
    // But we want the SMA based on closed candles.
    // If we pass all candles including the open one (last one), the last SMA value is for the open candle.
    // We should probably pass `closePrices.slice(0, -1)` to ignore the current open candle.

    // Wait, spec says: "Use the last closed candle (index length-2 in the array)".
    // If `candles` has `N` elements (0 to N-1).
    // N-1 is the current (open) candle.
    // N-2 is the last closed candle.

    // So we want the SMA value calculated at N-2.
    // If we calculate SMA on `closePrices.slice(0, -1)`, the last element of the result will correspond to N-2.

    const closedCandlesPrices = closePrices.slice(0, -1);

    logger.debug("🔢 Using closed candles only for SMA calculation", {
      closedCandlesCount: closedCandlesPrices.length,
      excludedCurrentCandle: closePrices[closePrices.length - 1],
    });

    const sma200 = SMA.calculate({ period: 200, values: closedCandlesPrices });
    const sma100 = SMA.calculate({ period: 100, values: closedCandlesPrices });
    const sma50 = SMA.calculate({ period: 50, values: closedCandlesPrices });
    const sma25 = SMA.calculate({ period: 25, values: closedCandlesPrices });

    const previousSMAs = { ...this.smas };

    this.smas = {
      sma200: sma200[sma200.length - 1],
      sma100: sma100[sma100.length - 1],
      sma50: sma50[sma50.length - 1],
      sma25: sma25[sma25.length - 1],
    };

    // logger.info("📈 SMAs calculated and updated", {
    //   previous: previousSMAs,
    //   current: this.smas,
    //   changes: {
    //     sma200: previousSMAs.sma200
    //       ? (this.smas.sma200 - previousSMAs.sma200).toFixed(4)
    //       : "initial",
    //     sma100: previousSMAs.sma100
    //       ? (this.smas.sma100 - previousSMAs.sma100).toFixed(4)
    //       : "initial",
    //     sma50: previousSMAs.sma50
    //       ? (this.smas.sma50 - previousSMAs.sma50).toFixed(4)
    //       : "initial",
    //     sma25: previousSMAs.sma25
    //       ? (this.smas.sma25 - previousSMAs.sma25).toFixed(4)
    //       : "initial",
    //   },
    // });

    this.emit("smas", this.smas);
    logger.debug("✅ SMA update broadcast to strategy engine");
  }
}

module.exports = new MarketData();
