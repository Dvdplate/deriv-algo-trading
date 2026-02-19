require('dotenv').config();
const winston = require('winston');
const connectDB = require('./modules/database');
const connection = require('./modules/connection');
// Requiring strategy_engine initializes the whole chain (market_data, execution, risk_guardian)
const strategyEngine = require('./modules/strategy_engine');

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    transports: [
        new winston.transports.Console()
    ]
});

const start = async () => {
    try {
        logger.info('Starting BOOM 500 Algo Trading Bot...');

        // Connect to MongoDB
        await connectDB();

        // Connect to Deriv WebSocket
        connection.connect();

        logger.info('Bot initialized successfully.');
    } catch (error) {
        logger.error(`Fatal Error: ${error.message}`);
        process.exit(1);
    }
};

start();

// Graceful Shutdown
process.on('SIGINT', () => {
    logger.info('Shutting down...');
    connection.close();
    process.exit(0);
});

process.on('SIGTERM', () => {
    logger.info('Shutting down...');
    connection.close();
    process.exit(0);
});
