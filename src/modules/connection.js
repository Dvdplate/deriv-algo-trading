const WebSocket = require('ws');
const EventEmitter = require('events');
const winston = require('winston');

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    transports: [
        new winston.transports.Console()
    ]
});

class ConnectionManager extends EventEmitter {
    constructor() {
        super();
        this.ws = null;
        this.appId = process.env.APP_ID || '1089'; // Default or from env
        this.token = process.env.DERIV_TOKEN;
        this.endpoint = `wss://ws.binaryws.com/websockets/v3?app_id=${this.appId}`;
        this.pingInterval = null;
        this.reconnectAttempts = 0;
        this.isExplicitlyClosed = false;
    }

    connect() {
        this.isExplicitlyClosed = false;
        try {
            this.ws = new WebSocket(this.endpoint);

            this.ws.on('open', () => {
                logger.info('WebSocket Connected');
                this.reconnectAttempts = 0;
                this.startHeartbeat();
                this.authorize();
                this.emit('open');
            });

            this.ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data);

                    if (message.error) {
                         if (message.error.code === 'InvalidToken') {
                             logger.error('Invalid Token! Exiting...');
                             process.exit(1);
                         }
                    }

                    if (message.msg_type === 'authorize') {
                        logger.info('Authorized successfully');
                    }

                    if (message.msg_type === 'ping') {
                        // Pong received, all good
                    } else {
                        this.emit('message', message);
                    }
                } catch (e) {
                    logger.error('Failed to parse message', e);
                }
            });

            this.ws.on('close', () => {
                logger.warn('WebSocket Closed');
                this.stopHeartbeat();
                if (!this.isExplicitlyClosed) {
                    this.reconnect();
                }
                this.emit('close');
            });

            this.ws.on('error', (err) => {
                logger.error('WebSocket Error', err);
                this.emit('error', err);
            });

        } catch (err) {
            logger.error('Connection Failed', err);
            this.reconnect();
        }
    }

    authorize() {
        if (this.token) {
            this.send({ authorize: this.token });
        } else {
            logger.warn('No DERIV_TOKEN provided. Skipping authorization.');
        }
    }

    send(data) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data));
        } else {
            logger.warn('WebSocket not open. Cannot send message.', data);
        }
    }

    startHeartbeat() {
        this.stopHeartbeat();
        this.pingInterval = setInterval(() => {
            this.send({ ping: 1 });
        }, 10000); // 10 seconds
    }

    stopHeartbeat() {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
    }

    reconnect() {
        this.reconnectAttempts++;
        let delay = 1000;
        if (this.reconnectAttempts === 1) delay = 1000;
        else if (this.reconnectAttempts === 2) delay = 2000;
        else delay = 5000; // Cap at 5 seconds for subsequent attempts as per spec (or just stick to 5s)

        logger.info(`Reconnecting in ${delay}ms (Attempt ${this.reconnectAttempts})`);

        setTimeout(() => {
            this.connect();
        }, delay);
    }

    close() {
        this.isExplicitlyClosed = true;
        this.stopHeartbeat();
        if (this.ws) {
            this.ws.close();
        }
    }
}

module.exports = new ConnectionManager();
