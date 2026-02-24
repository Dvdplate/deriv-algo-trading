import Deriv from "../core/Deriv.js";
import config from "../config.js";
import { calculateBollingerBands } from "../utils/math.js";
import { recordTradeEntry, recordTradeExit } from "../modules/database.js";

export default class Volatility100Strategy extends Deriv {
  constructor() {
    super();
    this.buffer = [];
    this.isArmed = false;
    this.isTradeOpen = false;
    this.isPaused = false;
    this.currentContractId = null;
    this.activeTradeDirection = null; // 'up' or 'down'
    this.accountBalance = 0;

    console.log(`🚀 Initialized Volatility100Strategy for asset: ${config.SYMBOL} (Multiplier: ${config.MULTIPLIER}x)`);
  }

  /**
   * Encapsulate the entire startup payload natively
   */
  async start() {
    console.log("▶️ Starting Strategy Engine...");
    await this.connect();
    const authData = await this.authenticate();
    this.accountBalance = authData.balance;
    console.log(`💲 Initial Account Balance: $${this.accountBalance.toFixed(2)}`);
    
    // Subscribe to Open Contracts stream (to track SL/TP triggers)
    const subContract = await this.send({ proposal_open_contract: 1, subscribe: 1 });
    if (subContract.error) {
      console.error("⚠️ Failed to subscribe to contract updates:", subContract.error.message);
    }

    // Subscribe to Live Ticks
    const subTick = await this.send({ ticks: config.SYMBOL, subscribe: 1 });
    if (subTick.error) {
      throw new Error(`Tick Subscription Failed: ${subTick.error.message}`);
    }

    console.log("✅ Strategy Engine fully online and subscribed. Awaiting market conditions...");
  }

  /**
   * Suspends tick processing manually (useful for rate-limit cooling off)
   */
  pause(ms = 2000) {
    this.isPaused = true;
    console.warn(`⏳ Strategy PAUSED for ${ms}ms.`);
    setTimeout(() => {
      this.isPaused = false;
      console.log(`▶️ Strategy RESUMED.`);
    }, ms);
  }

  // ------------------------------------------------------------------------
  // Deriv Base Overrides
  // ------------------------------------------------------------------------
  
  /**
   * Invoked continually by the base WS class whenever a new tick streams.
   */
  onTick(tickData) {
    if (this.isPaused) return;

    const price = tickData.quote;
    
    // 1. Manage strict rolling buffer memory
    this.buffer.push(price);
    if (this.buffer.length > config.TICK_LIMIT) {
      this.buffer.shift();
    }

    if (this.buffer.length < config.TICK_LIMIT) return;

    // 2. Mathematical calculation
    const bands = calculateBollingerBands(this.buffer);
    if (!bands) return;
    
    const { upper, lower, bandwidth } = bands;

    // 3. Execution conditions
    if (!this.isTradeOpen) {
      if (this.isArmed) {
        
        // INVERTED LOGIC: 
        // If price violently breaks UPPER band, we expect a reversal DOWN (SHORT)
        if (price > upper) {
          this.executeTrade("MULTDOWN", "down");
        } 
        // If price violently breaks LOWER band, we expect a reversal UP (LONG)
        else if (price < lower) {
          this.executeTrade("MULTUP", "up");
        }
        
        // Re-evaluate Squeeze continuously. If it expands prior to triggers, disarm.
        this._checkSqueeze(bandwidth);

      } else {
        // Evaluate for initial squeeze
        this._checkSqueeze(bandwidth);
      }
    }
  }

  /**
   * Invoked continually by the base WS class whenever our open contract state updates.
   */
  async onContractUpdate(contractInfo) {
    if (!this.currentContractId || contractInfo.contract_id !== this.currentContractId) return;

    if (contractInfo.is_sold) {
      this.accountBalance += contractInfo.profit;
      console.log(`✅ Closed trade bet ${this.activeTradeDirection.toUpperCase()} | Profit: $${contractInfo.profit} | New Balance: $${this.accountBalance.toFixed(2)}`);
      await recordTradeExit(this.currentContractId, contractInfo.sell_price, contractInfo.profit, this.accountBalance);
      this._cleanupTrade();
    }
  }

  onDisconnect() {
    console.log("🔴 Volatility100Strategy disconnected. Attempting auto-reconnect in 5s...");
    this.pause(5000);
    // basic reconnect logic could be inserted here
  }

  // ------------------------------------------------------------------------
  // Internal Mechanisms
  // ------------------------------------------------------------------------

  _checkSqueeze(bandwidth) {
    if (bandwidth < config.SQUEEZE_THRESHOLD) {
      if (!this.isArmed) {
        // Uncomment to see logs if desired
        // console.log(`🔫 SQUEEZE DETECTED! (Bandwidth: ${bandwidth.toFixed(6)})`);
      }
      this.isArmed = true;
    } else {
      if (this.isArmed) {
        // console.log(`🏳️ SQUEEZE LOST! (Bandwidth: ${bandwidth.toFixed(6)})`);
      }
      this.isArmed = false;
    }
  }

  /**
   * The rigid 2-step API proposal + buy process mapped out cleanly based on OOP Promises
   */
  async executeTrade(contractType, directionLabel) {
    if (this.isTradeOpen) return;
    this.isTradeOpen = true;

    try {
      // Step 1: Request Proposal
      const proposalPayload = {
        proposal: 1,
        amount: config.STAKE_AMOUNT,
        basis: "stake",
        contract_type: contractType,
        currency: "USD",
        multiplier: config.MULTIPLIER,
        symbol: config.SYMBOL,
        limit_order: {
          take_profit: config.STAKE_AMOUNT * config.TAKE_PROFIT_MULTIPLIER,
          stop_loss: config.STAKE_AMOUNT * config.STOP_LOSS_MULTIPLIER
        }
      };

      const proposalResponse = await this.send(proposalPayload);
      if (proposalResponse.error) {
        throw new Error(`[${proposalResponse.error.code}] ${proposalResponse.error.message}`);
      }

      const proposalId = Math.random().toString();
      let buy_id = proposalResponse.proposal.id;

      // Step 2: Execute Buy
      const buyPayload = {
        buy: buy_id,
        price: config.STAKE_AMOUNT
      };

      const buyResponse = await this.send(buyPayload);
      if (buyResponse.error) {
        throw new Error(`[${buyResponse.error.code}] ${buyResponse.error.message}`);
      }

      this.currentContractId = buyResponse.buy.contract_id;
      this.activeTradeDirection = directionLabel;
      
      console.log(`✅ Made trade bet ${directionLabel.toUpperCase()}`);

      // Async log entry to DB
      recordTradeEntry(this.currentContractId, config.SYMBOL, buyResponse.buy.buy_price, contractType);

    } catch (error) {
      console.error(`❌ Trade Execution Failed: ${error.message}`);
      if (error.message.includes("RateLimit")) {
         this.pause(2000);
      }
      this._cleanupTrade();
    }
  }

  _cleanupTrade() {
    this.currentContractId = null;
    this.activeTradeDirection = null;
    this.isTradeOpen = false;
    this.isArmed = false; // Require a fresh squeeze to take new action
  }
}
