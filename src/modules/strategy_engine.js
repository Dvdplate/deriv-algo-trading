const EventEmitter = require('events');
const marketData = require('./market_data');
const execution = require('./execution');
const riskGuardian = require('./risk_guardian');
const winston = require('winston');

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    transports: [
        new winston.transports.Console()
    ]
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
            sma25: null
        };
        this.marketState = 'RESTRICTED'; // Default to safe
        this.activeTrades = new Map(); // contract_id -> { entry_price, ... }
        this.cooldownUntil = 0;
        this.prevSmas = null;
        this.isTrading = false; // Lock to prevent concurrent entries

        this.setupListeners();
    }

    setupListeners() {
        marketData.on('tick', (tickData) => {
            this.onTick(tickData);
        });

        marketData.on('smas', (smas) => {
            this.onSMAs(smas);
        });

        execution.on('trade_opened', (trade) => {
             this.isTrading = false; // Release lock
             this.activeTrades.set(trade.contract_id, {
                 entry_price: trade.buy_price,
                 start_time: trade.start_time
             });
             riskGuardian.recordTradeEntry(trade.contract_id, trade.buy_price);
        });

        execution.on('trade_closed', (trade) => {
            this.handleTradeClosed(trade);
        });

        execution.on('rate_limit', () => {
            logger.warn('Strategy Engine: Rate Limit Pausing for 60s');
            this.cooldownUntil = Date.now() + 60000;
            this.isTrading = false;
        });

        execution.on('error', (err) => {
            logger.error(`Execution Error reported to Strategy: ${err.message}`);
            this.isTrading = false;
        });
    }

    handleTradeClosed(trade) {
        const activeTrade = this.activeTrades.get(trade.contract_id);
        if (activeTrade) {
            // If sell_price is available (it should be from execution.handleSell)
            const profit = Number(trade.sell_price) - Number(activeTrade.entry_price);
            riskGuardian.recordTradeExit(trade.contract_id, trade.sell_price, profit);
            this.activeTrades.delete(trade.contract_id);
        } else {
            // It might happen if we restarted and lost state, but DB has it.
            // For now, just log warning.
            logger.warn(`Closed trade ${trade.contract_id} not found in active trades.`);
        }
    }

    onTick(tickData) {
        this.previousPrice = this.currentPrice;
        this.currentPrice = tickData.price;

        // Check Train
        if (riskGuardian.processTick(this.currentPrice)) {
            // Train detected! RiskGuardian triggers its own pause.
            // But we need to "Cancel all pending logic. Send sell_expired or sell... for all open contract IDs."
            this.closeAllTrades("TRAIN_DETECTED");
            return;
        }

        // Check TP/SL for open trades
        this.checkOpenTrades();

        if (this.previousPrice === null) return;

        // Calculate Delta
        const delta = this.currentPrice - this.previousPrice;

        // Update Market State
        this.updateMarketState();

        // Check Cooldown
        if (Date.now() < this.cooldownUntil) return;

        // Entry Logic
        if (this.marketState === 'PERMISSIVE') {
            // Scenario A: First Sell
            // Spike Detection: Delta > 4.0 (Boom 500 spikes UP)
            if (delta > 4.0) {
                logger.info(`Spike Detected! Delta: ${delta}`);

                // Verification: Did spike push price above SMAs?
                // Spec: "If Price < SMAs (Still in Permissive State): EXECUTE SELL IMMEDIATELY."

                // If spike pushed price above SMAs, updateMarketState would have set RESTRICTED.
                // So checking this.marketState === 'PERMISSIVE' is enough.

                if (this.marketState === 'PERMISSIVE') {
                    this.executeTrade();
                } else {
                    logger.info("Spike pushed price into Restricted Zone. Aborting.");
                }
            }
        } else {
            // Restricted State
            // "Action: Block all buy (short) signals. Close any existing open positions immediately."
            if (this.activeTrades.size > 0) {
                logger.info("Market entered Restricted State. Closing all trades.");
                this.closeAllTrades("RESTRICTED_STATE");
            }
        }
    }

    onSMAs(smas) {
        this.smas = smas;

        // Scenario B: Crossover Guard
        if (this.prevSmas && this.prevSmas.sma25 && this.smas.sma25) {
            const prevSma25 = this.prevSmas.sma25;
            const currSma25 = this.smas.sma25;

            const prevSma50 = this.prevSmas.sma50;
            const currSma50 = this.smas.sma50;

            const prevSma100 = this.prevSmas.sma100;
            const currSma100 = this.smas.sma100;

            // Check crossover SMA25 > SMA50
            const cross50 = (prevSma25 <= prevSma50) && (currSma25 > currSma50);
            // Check crossover SMA25 > SMA100
            const cross100 = (prevSma25 <= prevSma100) && (currSma25 > currSma100);

            if (cross50 || cross100) {
                logger.warn("Crossover Guard Triggered! Momentum shifting bullish.");
                this.closeAllTrades("CROSSOVER_GUARD");
                this.cooldownUntil = Date.now() + 5 * 60 * 1000; // 5 mins
            }
        }

        this.prevSmas = { ...this.smas };
    }

    updateMarketState() {
        if (!this.smas.sma200) return; // SMAs not ready

        const { sma200, sma100, sma50 } = this.smas;
        const price = this.currentPrice;

        // Condition: Current_Price >= SMA_200 OR Current_Price >= SMA_100 OR Current_Price >= SMA_50.
        if (price >= sma200 || price >= sma100 || price >= sma50) {
            this.marketState = 'RESTRICTED';
        } else {
            this.marketState = 'PERMISSIVE';
        }
    }

    async executeTrade() {
        if (this.isTrading) return; // Prevent concurrent entries
        this.isTrading = true;

        // Check Daily Cap
        const isCapReached = await riskGuardian.checkDailyCap();
        if (isCapReached) {
            logger.info("Daily Cap Reached. Trade aborted.");
            this.isTrading = false;
            return;
        }

        execution.requestProposal();
    }

    closeAllTrades(reason) {
        for (const contractId of this.activeTrades.keys()) {
            logger.info(`Closing trade ${contractId} due to ${reason}`);
            execution.sellContract(contractId);
        }
    }

    checkOpenTrades() {
        // Take Profit: +15 Pips (Points)
        // Stop Loss: -5 Pips (Points)

        const TP = 15.0;
        const SL = 5.0;

        for (const [contractId, tradeData] of this.activeTrades.entries()) {
            const entryPrice = tradeData.entry_price;
            const currentPrice = this.currentPrice;

            // We SELL to open.
            // Profit if Price Drops.
            // Profit = Entry - Current.

            const diff = entryPrice - currentPrice; // Positive if price dropped (Profit)

            if (diff >= TP) {
                logger.info(`TP Hit for ${contractId}. Profit: ${diff}`);
                execution.sellContract(contractId);
            } else if (-diff >= SL) { // Loss >= SL
                logger.info(`SL Hit for ${contractId}. Loss: ${-diff}`);
                execution.sellContract(contractId);
            }
        }
    }
}

module.exports = new StrategyEngine();
