const EventEmitter = require('events');
const connection = require('./connection');
const SMA = require('technicalindicators').SMA;
const winston = require('winston');

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    transports: [
        new winston.transports.Console()
    ]
});

class MarketData extends EventEmitter {
    constructor() {
        super();
        this.symbol = 'BOOM500'; // BOOM 500
        this.candles = []; // Store candles
        this.currentPrice = null;
        this.smas = {
            sma200: null,
            sma100: null,
            sma50: null,
            sma25: null
        };

        this.setupListeners();
    }

    setupListeners() {
        connection.on('open', () => {
            this.subscribeTicks();
            this.subscribeCandles();
        });

        connection.on('message', (message) => {
            this.handleMessage(message);
        });
    }

    subscribeTicks() {
        connection.send({
            ticks: this.symbol,
            subscribe: 1
        });
    }

    subscribeCandles() {
        connection.send({
            ticks_history: this.symbol,
            adjust_start_time: 1,
            count: 300,
            end: 'latest',
            start: 1,
            style: 'candles',
            granularity: 60,
            subscribe: 1
        });
    }

    handleMessage(message) {
        if (message.msg_type === 'tick') {
            const tick = message.tick;
            this.currentPrice = tick.quote;
            this.emit('tick', {
                price: tick.quote,
                epoch: tick.epoch,
                id: tick.id
            });
        } else if (message.msg_type === 'candles') {
            // Initial history
            this.candles = message.candles;
            this.calculateSMAs();
        } else if (message.msg_type === 'ohlc') {
            // Candle update
            const ohlc = message.ohlc;
            // Check if it's a new candle or update to current
            // The API sends updates for the current open candle.
            // We need to manage the array.

            const lastCandle = this.candles[this.candles.length - 1];
            if (lastCandle && lastCandle.epoch === ohlc.epoch) {
                // Update current candle
                this.candles[this.candles.length - 1] = ohlc;
            } else {
                // New candle started, push the previous one (which is now closed)
                // Actually, the stream sends the new candle.
                // Wait, if epoch is different, it means a new candle has started.
                // The previous candle is closed.
                this.candles.push(ohlc);
                if (this.candles.length > 300) {
                    this.candles.shift(); // Keep size manageable
                }

                // Recalculate SMAs on new candle (using the closed candle)
                this.calculateSMAs();
            }
        }
    }

    calculateSMAs() {
        // Spec: Use the last closed candle (index length-2 in the array) to prevent repainting.
        // We need enough data.
        if (this.candles.length < 200) {
             logger.warn('Not enough candles for SMA calculation yet.');
             return;
        }

        const closePrices = this.candles.map(c => Number(c.close));

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

        const sma200 = SMA.calculate({ period: 200, values: closedCandlesPrices });
        const sma100 = SMA.calculate({ period: 100, values: closedCandlesPrices });
        const sma50 = SMA.calculate({ period: 50, values: closedCandlesPrices });
        const sma25 = SMA.calculate({ period: 25, values: closedCandlesPrices });

        this.smas = {
            sma200: sma200[sma200.length - 1],
            sma100: sma100[sma100.length - 1],
            sma50: sma50[sma50.length - 1],
            sma25: sma25[sma25.length - 1]
        };

        this.emit('smas', this.smas);
        // logger.info('SMAs Updated', this.smas);
    }
}

module.exports = new MarketData();
