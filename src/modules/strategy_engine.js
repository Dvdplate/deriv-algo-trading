const EventEmitter = require("events");
const marketData = require("./market_data");
const execution = require("./execution");
const riskGuardian = require("./risk_guardian");
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

class StrategyEngine extends EventEmitter {
  constructor() {
    super();
    this.currentPrice = null;
    this.previousPrice = null;
    this.smas = {
      sma200: null,
      sma100: null,
      sma50: null,
      sma25: null,
    };
    this.marketState = "RESTRICTED"; // Default to safe
    this.activeTrades = new Map(); // contract_id -> { entry_price, ... }
    this.cooldownUntil = 0;
    this.prevSmas = null;
    this.isTrading = false; // Lock to prevent concurrent entries
    this.accountBalance = null;
    this.lastBalanceUpdate = 0;

    this.setupListeners();
  }

  setupListeners() {
    marketData.on("tick", (tickData) => {
      this.onTick(tickData);
    });

    marketData.on("smas", (smas) => {
      this.onSMAs(smas);
    });

    execution.on("trade_opened", (trade) => {
      logger.info(
        `✅ Trade opened: ${trade.contract_id} @ $${trade.buy_price}`,
      );
      this.isTrading = false;
      this.activeTrades.set(trade.contract_id, {
        entry_price: trade.buy_price,
        start_time: trade.start_time,
      });
      riskGuardian.recordTradeEntry(trade.contract_id, trade.buy_price);
    });

    execution.on("trade_closed", (trade) => {
      this.handleTradeClosed(trade);
    });

    execution.on("rate_limit", () => {
      logger.warn("⏸️ Rate limit hit - pausing for 60s");
      this.cooldownUntil = Date.now() + 60000;
      this.isTrading = false;
    });

    execution.on("error", (err) => {
      logger.error(`💥 Execution error: ${err.message}`);
      this.isTrading = false;
    });

    execution.on("balance_update", (balance) => {
      this.accountBalance = balance;
      this.lastBalanceUpdate = Date.now();
    });
  }

  logAccountStatus() {
    const now = Date.now();
    const activeCount = this.activeTrades.size;
    const balanceInfo = this.accountBalance
      ? `$${this.accountBalance.toFixed(2)}`
      : "Unknown";
    const marketInfo = `${this.marketState} | Price: ${this.currentPrice ? this.currentPrice.toFixed(2) : "N/A"}`;
    const cooldown =
      now < this.cooldownUntil
        ? `(Cooldown: ${Math.ceil((this.cooldownUntil - now) / 1000)}s)`
        : "";

    logger.info(
      `💰 Balance: ${balanceInfo} | Active: ${activeCount} | ${marketInfo} ${cooldown}`,
    );
  }

  handleTradeClosed(trade) {
    const activeTrade = this.activeTrades.get(trade.contract_id);
    if (activeTrade) {
      const profit = Number(trade.sell_price) - Number(activeTrade.entry_price);
      const profitStr =
        profit >= 0
          ? `+$${profit.toFixed(2)}`
          : `-$${Math.abs(profit).toFixed(2)}`;

      logger.info(`❌ Trade closed: ${trade.contract_id} ${profitStr}`);

      riskGuardian.recordTradeExit(trade.contract_id, trade.sell_price, profit);
      this.activeTrades.delete(trade.contract_id);
    } else {
      logger.warn(
        `⚠️ Closed trade ${trade.contract_id} not found in active trades`,
      );
    }
  }

  onTick(tickData) {
    this.previousPrice = this.currentPrice;
    this.currentPrice = tickData.price;
    logger.debug("💰 Price update", {
      previousPrice: this.previousPrice,
      currentPrice: this.currentPrice,
      priceChange: this.previousPrice
        ? this.currentPrice - this.previousPrice
        : null,
    });

    // Check Train
    const trainDetected = riskGuardian.processTick(this.currentPrice);
    logger.debug("🚂 Train detection check", { trainDetected });
    if (trainDetected) {
      logger.error("🚨 TRAIN DETECTED! Emergency closure of all trades");
      // Train detected! RiskGuardian triggers its own pause.
      // But we need to "Cancel all pending logic. Send sell_expired or sell... for all open contract IDs."
      this.closeAllTrades("TRAIN_DETECTED");
      return;
    }

    // Check TP/SL for open trades
    logger.debug("🎯 Checking TP/SL for open trades", {
      activeTradesCount: this.activeTrades.size,
    });
    this.checkOpenTrades();

    if (this.previousPrice === null) {
      logger.debug("⏭️ Skipping entry logic - no previous price available");
      return;
    }

    // Calculate Delta
    const delta = this.currentPrice - this.previousPrice;
    logger.info(`📊 Delta: ${delta.toFixed(2)} | State: ${this.marketState}`);

    // Update Market State
    const oldState = this.marketState;
    this.updateMarketState();
    if (oldState !== this.marketState) {
      logger.info(`🔄 Market state: ${oldState} → ${this.marketState}`);
    }

    // Check Cooldown
    const cooldownRemaining = this.cooldownUntil - Date.now();
    if (cooldownRemaining > 0) {
      logger.debug("⏱️ In cooldown period", {
        remainingMs: cooldownRemaining,
        remainingSeconds: Math.ceil(cooldownRemaining / 1000),
      });
      return;
    }

    // Entry Logic
    logger.debug("🎯 Evaluating entry conditions", {
      marketState: this.marketState,
      delta,
      isTrading: this.isTrading,
      activeTradesCount: this.activeTrades.size,
    });

    if (this.marketState === "PERMISSIVE") {
      logger.debug("✅ Market is PERMISSIVE - checking spike conditions");
      // Scenario A: First Sell
      // Spike Detection: Delta > 4.0 (Boom 500 spikes UP)
      logger.debug("🔍 Spike detection analysis", {
        delta,
        spikeThreshold: 4.0,
        isSpike: delta > 4.0,
      });

      if (delta > 4.0) {
        logger.warn(`🚀 SPIKE DETECTED! Delta: ${delta.toFixed(2)}`);
        logger.info(`Spike Detected! Delta: ${delta}`);

        // Verification: Did spike push price above SMAs?
        // Spec: "If Price < SMAs (Still in Permissive State): EXECUTE SELL IMMEDIATELY."

        // If spike pushed price above SMAs, updateMarketState would have set RESTRICTED.
        // So checking this.marketState === 'PERMISSIVE' is enough.
        logger.debug("✅ Verifying market state post-spike", {
          marketStateAfterSpike: this.marketState,
        });

        if (this.marketState === "PERMISSIVE") {
          logger.info("🎯 EXECUTING TRADE - All conditions met!", {
            reason: "spike_in_permissive_state",
            delta,
            marketState: this.marketState,
          });
          this.executeTrade();
        } else {
          logger.warn(
            "❌ Spike pushed price into restricted zone - trade aborted",
            {
              marketState: this.marketState,
              delta,
            },
          );
          logger.info("Spike pushed price into Restricted Zone. Aborting.");
        }
      } else {
        logger.debug("📉 No spike detected", {
          delta,
          required: 4.0,
          difference: 4.0 - delta,
        });
      }
    } else {
      // Restricted State
      logger.debug("🚫 Market is RESTRICTED - blocking new trades", {
        marketState: this.marketState,
        currentPrice: this.currentPrice,
        activeTrades: this.activeTrades.size,
      });

      // "Action: Block all buy (short) signals. Close any existing open positions immediately."
      if (this.activeTrades.size > 0) {
        logger.warn(
          "🛑 RESTRICTED STATE: Closing all active trades immediately",
          {
            activeTradesCount: this.activeTrades.size,
            tradeIds: Array.from(this.activeTrades.keys()),
          },
        );
        logger.info("Market entered Restricted State. Closing all trades.");
        this.closeAllTrades("RESTRICTED_STATE");
      } else {
        logger.debug("✅ No active trades to close in restricted state");
      }
    }
  }

  onSMAs(smas) {
    logger.info("📈 Processing SMA update");

    this.smas = smas;

    // Scenario B: Crossover Guard
    if (this.prevSmas && this.prevSmas.sma25 && this.smas.sma25) {
      logger.debug("🔍 Checking for SMA crossovers...");

      const prevSma25 = this.prevSmas.sma25;
      const currSma25 = this.smas.sma25;

      const prevSma50 = this.prevSmas.sma50;
      const currSma50 = this.smas.sma50;

      const prevSma100 = this.prevSmas.sma100;
      const currSma100 = this.smas.sma100;

      // Check crossover SMA25 > SMA50
      const cross50 = prevSma25 <= prevSma50 && currSma25 > currSma50;
      // Check crossover SMA25 > SMA100
      const cross100 = prevSma25 <= prevSma100 && currSma25 > currSma100;

      logger.debug("🔄 Crossover analysis", {
        sma25_vs_sma50: {
          previous: {
            sma25: prevSma25,
            sma50: prevSma50,
            sma25_below: prevSma25 <= prevSma50,
          },
          current: {
            sma25: currSma25,
            sma50: currSma50,
            sma25_above: currSma25 > currSma50,
          },
          crossover: cross50,
        },
        sma25_vs_sma100: {
          previous: {
            sma25: prevSma25,
            sma100: prevSma100,
            sma25_below: prevSma25 <= prevSma100,
          },
          current: {
            sma25: currSma25,
            sma100: currSma100,
            sma25_above: currSma25 > currSma100,
          },
          crossover: cross100,
        },
      });

      if (cross50 || cross100) {
        logger.error("🚨 CROSSOVER GUARD TRIGGERED!", {
          sma25_crossed_sma50: cross50,
          sma25_crossed_sma100: cross100,
          activeTradesCount: this.activeTrades.size,
          cooldownMinutes: 5,
        });
        logger.warn("Crossover Guard Triggered! Momentum shifting bullish.");
        this.closeAllTrades("CROSSOVER_GUARD");
        this.cooldownUntil = Date.now() + 5 * 60 * 1000; // 5 mins
        logger.info("⏱️ Crossover cooldown activated", {
          cooldownUntil: new Date(this.cooldownUntil).toISOString(),
        });
      } else {
        logger.debug("✅ No crossovers detected");
      }
    } else {
      logger.debug(
        "🚀 Initializing SMA history - no previous data for crossover check",
      );
    }

    this.prevSmas = { ...this.smas };
    logger.debug("💾 SMAs stored for next crossover check");
  }

  updateMarketState() {
    if (!this.smas.sma200) {
      logger.debug("⏳ SMAs not ready yet - keeping current market state");
      return; // SMAs not ready
    }

    const { sma200, sma100, sma50 } = this.smas;
    const price = this.currentPrice;

    logger.debug("📊 Market state evaluation", {
      currentPrice: price,
      sma200,
      sma100,
      sma50,
      priceVsSMA200: price >= sma200 ? "ABOVE" : "BELOW",
      priceVsSMA100: price >= sma100 ? "ABOVE" : "BELOW",
      priceVsSMA50: price >= sma50 ? "ABOVE" : "BELOW",
    });

    const oldState = this.marketState;

    // Condition: Current_Price >= SMA_200 OR Current_Price >= SMA_100 OR Current_Price >= SMA_50.
    if (price >= sma200 || price >= sma100 || price >= sma50) {
      this.marketState = "RESTRICTED";
      logger.debug(
        "🚫 Market state: RESTRICTED (price above one or more SMAs)",
      );
    } else {
      this.marketState = "PERMISSIVE";
      logger.debug("✅ Market state: PERMISSIVE (price below all SMAs)");
    }

    if (oldState !== this.marketState) {
      logger.info("🔄 Market state transition", {
        from: oldState,
        to: this.marketState,
        trigger: {
          price,
          aboveSMA200: price >= sma200,
          aboveSMA100: price >= sma100,
          aboveSMA50: price >= sma50,
        },
      });
    }
  }

  async executeTrade() {
    if (this.isTrading) {
      logger.warn("🔒 Trade blocked - already in trading state");
      return;
    }

    this.isTrading = true;

    // Check Daily Cap
    const isCapReached = await riskGuardian.checkDailyCap();

    if (isCapReached) {
      logger.warn("❌ Daily cap reached - trade aborted");
      this.isTrading = false;
      return;
    }

    logger.info("📤 Requesting trade proposal");
    execution.requestProposal();
  }

  closeAllTrades(reason) {
    logger.warn(`🛑 Closing ${this.activeTrades.size} trades: ${reason}`);
    for (const contractId of this.activeTrades.keys()) {
      execution.sellContract(contractId);
    }
  }

  checkOpenTrades() {
    // Take Profit: +15 Pips (Points)
    // Stop Loss: -5 Pips (Points)

    const TP = 15.0;
    const SL = 5.0;

    logger.debug("🎯 TP/SL Check initiated", {
      activeTradesCount: this.activeTrades.size,
      currentPrice: this.currentPrice,
      takeProfitTarget: TP,
      stopLossTarget: SL,
    });

    for (const [contractId, tradeData] of this.activeTrades.entries()) {
      const entryPrice = tradeData.entry_price;
      const currentPrice = this.currentPrice;

      // We SELL to open.
      // Profit if Price Drops.
      // Profit = Entry - Current.

      const diff = entryPrice - currentPrice; // Positive if price dropped (Profit)
      const pnl = diff >= 0 ? `+${diff.toFixed(2)}` : diff.toFixed(2);

      logger.debug(`💹 Trade ${contractId} P&L analysis`, {
        contractId,
        entryPrice,
        currentPrice,
        priceDiff: diff,
        pnl,
        status: diff >= TP ? "TP_HIT" : -diff >= SL ? "SL_HIT" : "ACTIVE",
        tpDistance: TP - diff,
        slDistance: SL + diff,
      });

      if (diff >= TP) {
        logger.info(`🏆 TAKE PROFIT HIT for ${contractId}`, {
          profit: diff,
          target: TP,
          entryPrice,
          currentPrice,
        });
        logger.info(`TP Hit for ${contractId}. Profit: ${diff}`);
        execution.sellContract(contractId);
      } else if (-diff >= SL) {
        // Loss >= SL
        logger.warn(`🚨 STOP LOSS HIT for ${contractId}`, {
          loss: -diff,
          target: SL,
          entryPrice,
          currentPrice,
        });
        logger.info(`SL Hit for ${contractId}. Loss: ${-diff}`);
        execution.sellContract(contractId);
      }
    }

    if (this.activeTrades.size > 0) {
      logger.debug("✅ TP/SL check completed - all trades within limits");
    }
  }
}

module.exports = new StrategyEngine();
