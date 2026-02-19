const EventEmitter = require('events');
const connection = require('./connection');
const winston = require('winston');

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    transports: [
        new winston.transports.Console()
    ]
});

class Execution extends EventEmitter {
    constructor() {
        super();
        this.pendingProposals = new Map(); // Store pending proposals
        this.openContracts = new Map(); // contract_id -> contract details
        this.setupListeners();
    }

    setupListeners() {
        connection.on('message', (message) => {
            this.handleMessage(message);
        });
    }

    handleMessage(message) {
        if (message.msg_type === 'proposal') {
            this.handleProposal(message.proposal);
        } else if (message.msg_type === 'buy') {
            this.handleBuy(message.buy);
        } else if (message.msg_type === 'sell') {
            this.handleSell(message.sell);
        } else if (message.error) {
            const error = message.error;
            logger.error(`Execution Error: ${error.code} - ${error.message}`);

            if (error.code === 'RateLimit') {
                logger.warn('Rate Limit Hit! Pausing for 60 seconds...');
                this.emit('rate_limit');
            } else if (error.code === 'buy_limit_reached') {
                logger.error('FATAL: Buy Limit Reached! Stopping bot.');
                this.emit('fatal_error');
                process.exit(1); // Spec says stop.
            } else {
                this.emit('error', error);
            }
        }
    }

    // Step 1: Request Proposal
    async requestProposal(symbol = '1HZ100V') {
        const stake = process.env.STAKE_AMOUNT || 10;
        const multiplier = process.env.MULTIPLIER || 100;
        const currency = 'USD';

        logger.info(`Requesting proposal for ${symbol} MULTDOWN stake=${stake} multiplier=${multiplier}`);

        connection.send({
            proposal: 1,
            amount: stake,
            basis: 'stake',
            contract_type: 'MULTDOWN',
            currency: currency,
            symbol: symbol,
            multiplier: multiplier
        });
    }

    // Step 2: Handle Proposal and Buy
    handleProposal(proposal) {
        logger.info(`Proposal received: ${proposal.id} Payout: ${proposal.payout}`);
        this.buy(proposal.id, proposal.ask_price);
    }

    buy(proposalId, price) {
        logger.info(`Buying proposal ${proposalId} at ${price}`);
        connection.send({
            buy: proposalId,
            price: price
        });
    }

    handleBuy(buyData) {
        logger.info(`Buy successful! Contract ID: ${buyData.contract_id}`);
        this.emit('trade_opened', {
            contract_id: buyData.contract_id,
            buy_price: buyData.buy_price,
            start_time: buyData.start_time
        });
    }

    // Sell / Close
    sellContract(contractId) {
        logger.info(`Selling contract ${contractId}`);
        connection.send({
            sell: contractId,
            price: 0 // Market sell
        });
    }

    handleSell(sellData) {
        logger.info(`Sold contract ${sellData.contract_id}. Profit: ${sellData.sold_for}`);
        this.emit('trade_closed', {
            contract_id: sellData.contract_id,
            sell_price: sellData.sold_for,
            transaction_id: sellData.transaction_id
        });
    }
}

module.exports = new Execution();
