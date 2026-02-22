const EventEmitter = require("events");
const connection = require("./connection");
const winston = require("winston");

const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp({ format: "HH:mm:ss" }),
    winston.format.printf(({ timestamp, message }) => `${timestamp} ${message}`)
  ),
  transports: [new winston.transports.Console()],
});

class Execution extends EventEmitter {
  constructor() {
    super();
    this.isAuthorized = false;
    this.openContracts = new Map();
    this.proposalCallbacks = new Map();
    this.setupListeners();
  }

  setupListeners() {
    connection.on("message", (msg) => this.handleMessage(msg));
  }

  handleMessage(message) {
    if (message.error) {
      logger.error(`Execution API Error [${message.error.code}]: ${message.error.message}`);
      if (message.error.code === "RateLimit") this.emit("rate_limit");
      return;
    }

    if (message.msg_type === "authorize" && message.authorize) {
      this.isAuthorized = true;
      connection.send({ balance: 1, subscribe: 1 });
    } else if (message.msg_type === "balance" && message.balance) {
      this.emit("balance_update", parseFloat(message.balance.balance));
    } else if (message.msg_type === "proposal" && message.proposal) {
      const cb = this.proposalCallbacks.get(message.req_id);
      if (cb) {
        cb(message.proposal);
        this.proposalCallbacks.delete(message.req_id);
      }
    } else if (message.msg_type === "buy" && message.buy) {
      logger.info(`✅ Limit Order Executed! Contract ID: ${message.buy.contract_id}`);
      this.openContracts.set(message.buy.contract_id, {
        buyPrice: message.buy.buy_price,
        startTime: message.buy.start_time
      });
      this.emit("trade_opened", message.buy);
    }
  }

  async executeLimitOrder(type, amount, tpPoints, slPoints, reqId = Date.now()) {
    // type is "MULTUP" (Long) or "MULTDOWN" (Short)
    // Step 1: Proposal Payload
    const proposalReq = {
      proposal: 1,
      amount: parseFloat(amount.toFixed(2)),
      basis: "multiplier",
      contract_type: type,
      currency: "USD",
      multiplier: 100, // Hardcoded per user or configurable
      symbol: "R_75",
      req_id: reqId,
      limit_order: {
        take_profit: parseFloat(tpPoints.toFixed(2)),
        stop_loss: parseFloat(slPoints.toFixed(2))
      }
    };

    logger.info(`📄 Requesting Limit Order Proposal: ${type} $${parseFloat(amount.toFixed(2))} - TP: ${parseFloat(tpPoints.toFixed(2))} SL: ${parseFloat(slPoints.toFixed(2))}`);
    connection.send(proposalReq);

    // Wait for proposal response via callback
    return new Promise((resolve) => {
      this.proposalCallbacks.set(reqId, (proposal) => {
        logger.info(`✅ Proposal Received, Triggering Execution ID: ${proposal.id}`);
        // Step 2: Ensure execution with the EXACT price needed
        const buyReq = {
          buy: proposal.id,
          price: parseFloat(amount.toFixed(2))
        };
        connection.send(buyReq);
        resolve(true);
      });
    });
  }

  cancelAllOrders() {
    for (const [id, details] of this.openContracts.entries()) {
      logger.info(`Selling open contract ${id} for abort`);
      connection.send({ sell: id, price: 0 });
    }
  }
}

module.exports = new Execution();
