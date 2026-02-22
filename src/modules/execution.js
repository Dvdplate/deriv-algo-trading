const EventEmitter = require("events");
const connection = require("./connection");
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

class Execution extends EventEmitter {
  constructor() {
    super();
    this.pendingProposals = new Map();
    this.openContracts = new Map();
    this.isAuthorized = false;
    this.balanceSubscribed = false;
    this.setupListeners();
  }

  setupListeners() {
    connection.on("message", (message) => {
      this.handleMessage(message);
    });

    // Start balance monitoring after authorization
    connection.on("open", () => {
      // Wait for authorization before requesting balance
      setTimeout(() => {
        if (this.isAuthorized) {
          this.startBalanceMonitoring();
        }
      }, 2000); // Wait 2 seconds for auth
    });
  }

  startBalanceMonitoring() {
    // Only subscribe once
    if (!this.balanceSubscribed) {
      this.requestBalance();
      this.balanceSubscribed = true;
      logger.info("💰 Balance subscription initiated");
    }
  }

  requestBalance() {
    logger.info("💳 Subscribing to balance updates");
    connection.send({
      balance: 1,
      subscribe: 1,
    });
  }

  handleMessage(message) {
    // Skip messages that aren't for execution module
    const executionMessageTypes = [
      "proposal",
      "buy",
      "sell",
      "balance",
      "authorize",
    ];
    const isExecutionMessage = executionMessageTypes.includes(message.msg_type);

    // Only handle execution-specific errors
    const isExecutionError =
      message.error &&
      (message.req_id ||
        [
          "RateLimit",
          "buy_limit_reached",
          "InsufficientBalance",
          "ContractBuyValidationError",
          "InvalidToken",
          "AuthorizationRequired",
        ].includes(message.error.code));

    if (!isExecutionMessage && !isExecutionError) {
      // This message isn't for the execution module, ignore it silently
      return;
    }

    logger.debug("🔍 Processing execution message", {
      type: message.msg_type,
      hasProposal: !!message.proposal,
      hasBuy: !!message.buy,
      hasSell: !!message.sell,
      hasError: !!message.error,
    });

    if (message.msg_type === "proposal") {
      if (!message.proposal) {
        logger.warn(
          "⚠️ Proposal message received but proposal object is null",
          {
            message,
          },
        );
        return;
      }

      logger.info("📄 Proposal received", {
        id: message.proposal.id,
        payout: message.proposal.payout,
        askPrice: message.proposal.ask_price,
      });
      this.handleProposal(message.proposal);
    } else if (message.msg_type === "buy") {
      if (!message.buy) {
        logger.warn("⚠️ Buy message received but buy object is null", {
          message,
        });
        return;
      }

      logger.info("🛍️ Buy response received", {
        contractId: message.buy.contract_id,
        buyPrice: message.buy.buy_price,
        startTime: message.buy.start_time,
      });
      this.handleBuy(message.buy);
    } else if (message.msg_type === "sell") {
      if (!message.sell) {
        logger.warn("⚠️ Sell message received but sell object is null", {
          message,
        });
        return;
      }

      logger.info("💰 Sell response received", {
        contractId: message.sell.contract_id,
        soldFor: message.sell.sold_for,
        transactionId: message.sell.transaction_id,
      });
      this.handleSell(message.sell);
    } else if (message.msg_type === "authorize") {
      if (message.authorize) {
        this.isAuthorized = true;
        logger.info(`✅ Authorized: ${message.authorize.loginid}`);
        // Start balance monitoring now that we're authorized
        this.startBalanceMonitoring();
      }
    } else if (message.msg_type === "balance") {
      if (message.balance && typeof message.balance.balance === "number") {
        const balance = parseFloat(message.balance.balance);
        logger.info(`💰 Balance updated: $${balance.toFixed(2)}`);
        this.emit("balance_update", balance);
      } else {
        logger.warn(
          `⚠️ Invalid balance response: ${JSON.stringify(message.balance)}`,
        );
      }
    } else if (message.error) {
      const error = message.error;

      // Log the specific error with more details
      logger.error(`💥 API Error [${error.code}]: ${error.message}`);

      if (error.code === "RateLimit") {
        logger.warn("⏸️ Rate limit hit - pausing 60s");
        this.emit("rate_limit");
      } else if (error.code === "buy_limit_reached") {
        logger.error("🚨 FATAL: Buy limit reached - stopping bot");
        this.emit("fatal_error");
        process.exit(1);
      } else if (
        error.code === "InvalidToken" ||
        error.code === "AuthorizationRequired"
      ) {
        logger.error("🔑 Authorization failed - check DERIV_TOKEN");
        process.exit(1);
      } else if (isExecutionError) {
        logger.error(`💥 Execution error: ${error.message}`);
        this.emit("error", error);
      }
    }
  }

  // Step 1: Request Proposal
  async requestProposal(symbol = "BOOM1000") {
    const stake = process.env.STAKE_AMOUNT || 10;
    const multiplier = process.env.MULTIPLIER || 100;
    const currency = "USD";

    logger.info("📄 Requesting trade proposal", {
      symbol,
      contractType: "MULTDOWN",
      stake,
      multiplier,
      currency,
    });

    logger.info(
      `Requesting proposal for ${symbol} MULTDOWN stake=${stake} multiplier=${multiplier}`,
    );

    const proposalRequest = {
      proposal: 1,
      amount: stake,
      basis: "stake",
      contract_type: "MULTDOWN",
      currency: currency,
      symbol: symbol,
      multiplier: multiplier,
    };

    logger.debug("📤 Sending proposal request", proposalRequest);
    connection.send(proposalRequest);
  }

  // Step 2: Handle Proposal and Buy
  handleProposal(proposal) {
    logger.info("✅ Proposal validated - proceeding to buy", {
      proposalId: proposal.id,
      payout: proposal.payout,
      askPrice: proposal.ask_price,
      payoutRatio: (proposal.payout / proposal.ask_price).toFixed(2),
    });
    logger.info(`Proposal received: ${proposal.id} Payout: ${proposal.payout}`);
    this.buy(proposal.id, proposal.ask_price);
  }

  buy(proposalId, price) {
    logger.info("🛍️ Executing buy order", {
      proposalId,
      price,
      timestamp: new Date().toISOString(),
    });
    logger.info(`Buying proposal ${proposalId} at ${price}`);

    const buyRequest = {
      buy: proposalId,
      price: price,
    };

    logger.debug("📤 Sending buy request", buyRequest);
    connection.send(buyRequest);
  }

  handleBuy(buyData) {
    logger.info("✅ BUY SUCCESSFUL - Trade opened!", {
      contractId: buyData.contract_id,
      buyPrice: buyData.buy_price,
      startTime: buyData.start_time,
      startTimeFormatted: new Date(buyData.start_time * 1000).toISOString(),
    });
    logger.info(`Buy successful! Contract ID: ${buyData.contract_id}`);

    // Store contract details
    this.openContracts.set(buyData.contract_id, {
      buyPrice: buyData.buy_price,
      startTime: buyData.start_time,
      openedAt: new Date().toISOString(),
    });

    logger.debug("📝 Contract added to tracking", {
      contractId: buyData.contract_id,
      totalOpenContracts: this.openContracts.size,
    });

    this.emit("trade_opened", {
      contract_id: buyData.contract_id,
      buy_price: buyData.buy_price,
      start_time: buyData.start_time,
    });

    logger.debug("✅ Trade opened event emitted to strategy engine");
  }

  // Sell / Close
  sellContract(contractId) {
    const contractDetails = this.openContracts.get(contractId);

    logger.info("💰 Initiating contract sale", {
      contractId,
      contractDetails,
      totalOpenContracts: this.openContracts.size,
    });
    logger.info(`Selling contract ${contractId}`);

    const sellRequest = {
      sell: contractId,
      price: 0, // Market sell
    };

    logger.debug("📤 Sending sell request", sellRequest);
    connection.send(sellRequest);
  }

  handleSell(sellData) {
    const contractDetails = this.openContracts.get(sellData.contract_id);
    const profit = contractDetails
      ? (Number(sellData.sold_for) - Number(contractDetails.buyPrice)).toFixed(
          2,
        )
      : "unknown";

    logger.info("✅ SELL SUCCESSFUL - Trade closed!", {
      contractId: sellData.contract_id,
      soldFor: sellData.sold_for,
      transactionId: sellData.transaction_id,
      buyPrice: contractDetails?.buyPrice,
      profit,
      profitFormatted:
        profit !== "unknown" ? (profit >= 0 ? `+${profit}` : profit) : profit,
      duration: contractDetails
        ? `${((Date.now() - new Date(contractDetails.openedAt).getTime()) / 1000).toFixed(1)}s`
        : "unknown",
    });
    logger.info(
      `Sold contract ${sellData.contract_id}. Profit: ${sellData.sold_for}`,
    );

    // Remove from tracking
    if (this.openContracts.has(sellData.contract_id)) {
      this.openContracts.delete(sellData.contract_id);
      logger.debug("🗑️ Contract removed from tracking", {
        contractId: sellData.contract_id,
        remainingContracts: this.openContracts.size,
      });
    }

    this.emit("trade_closed", {
      contract_id: sellData.contract_id,
      sell_price: sellData.sold_for,
      transaction_id: sellData.transaction_id,
    });

    logger.debug("✅ Trade closed event emitted to strategy engine");
  }
}

module.exports = new Execution();
