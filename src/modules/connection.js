const WebSocket = require("ws");
const EventEmitter = require("events");
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

class ConnectionManager extends EventEmitter {
  constructor() {
    super();
    logger.info("🔌 ConnectionManager initializing...");
    this.ws = null;
    this.appId = process.env.APP_ID || "1089"; // Default or from env
    this.token = process.env.DERIV_TOKEN;
    this.endpoint = `wss://ws.binaryws.com/websockets/v3?app_id=${this.appId}`;
    this.pingInterval = null;
    this.reconnectAttempts = 0;
    this.isExplicitlyClosed = false;

    logger.info("✅ ConnectionManager initialized", {
      appId: this.appId,
      endpoint: this.endpoint,
      hasToken: !!this.token,
    });
  }

  connect() {
    this.isExplicitlyClosed = false;
    logger.info("🔗 Attempting WebSocket connection", {
      endpoint: this.endpoint,
      attempt: this.reconnectAttempts + 1,
    });

    try {
      this.ws = new WebSocket(this.endpoint);

      this.ws.on("open", () => {
        logger.info("✅ WebSocket Connected successfully", {
          endpoint: this.endpoint,
          reconnectAttempts: this.reconnectAttempts,
        });
        logger.info("WebSocket Connected");
        this.reconnectAttempts = 0;
        this.startHeartbeat();
        this.authorize();
        this.emit("open");
      });

      this.ws.on("message", (data) => {
        logger.debug("📨 Raw WebSocket message received", {
          dataLength: data.length,
          timestamp: new Date().toISOString(),
        });

        try {
          const message = JSON.parse(data);

          logger.debug("📜 Parsed WebSocket message", {
            msgType: message.msg_type,
            hasError: !!message.error,
            messageId: message.req_id,
          });

          if (message.error) {
            logger.error(
              `🚨 API Error [${message.error.code}]: ${message.error.message}`,
            );

            if (message.error.code === "InvalidToken") {
              logger.error(
                "🔑 FATAL: Invalid authentication token - terminating bot",
                {
                  error: message.error.message,
                  code: message.error.code,
                },
              );
              logger.error("Invalid Token! Exiting...");
              process.exit(1);
            }
          }

          if (message.msg_type === "authorize") {
            logger.info("✅ Authorization successful", {
              loginid: message.authorize?.loginid,
              currency: message.authorize?.currency,
              country: message.authorize?.country,
            });
            logger.info("Authorized successfully");
          }

          if (message.msg_type === "ping") {
            logger.debug("🏓 Pong received - connection healthy");
            // Pong received, all good
          } else {
            logger.debug("📤 Emitting message to handlers", {
              msgType: message.msg_type,
              hasError: !!message.error,
              messageKeys: Object.keys(message).filter(
                (key) => key !== "echo_req",
              ), // Filter sensitive data
            });

            // Only log message preview in debug mode for troubleshooting
            if (process.env.NODE_ENV === "development") {
              logger.debug("📋 Message preview", {
                preview:
                  JSON.stringify(message, null, 0).substring(0, 200) + "...",
              });
            }

            this.emit("message", message);
          }
        } catch (e) {
          logger.error("🚨 Failed to parse WebSocket message", {
            error: e.message,
            stack: e.stack,
            rawData: data.toString(),
            dataLength: data.length,
          });
          logger.error("Failed to parse message", e);
        }
      });

      this.ws.on("close", () => {
        logger.warn("🚫 WebSocket connection closed", {
          wasExplicit: this.isExplicitlyClosed,
          reconnectAttempts: this.reconnectAttempts,
          willReconnect: !this.isExplicitlyClosed,
        });
        logger.warn("WebSocket Closed");
        this.stopHeartbeat();
        if (!this.isExplicitlyClosed) {
          this.reconnect();
        }
        this.emit("close");
      });

      this.ws.on("error", (err) => {
        logger.error("🚨 WebSocket connection error", {
          error: err.message,
          code: err.code,
          stack: err.stack,
          type: err.type,
          fullError: err,
        });
        logger.error("WebSocket Error", err);
        this.emit("error", err);
      });
    } catch (err) {
      logger.error("🚨 Failed to establish WebSocket connection", {
        error: err.message,
        code: err.code,
        stack: err.stack,
        endpoint: this.endpoint,
        fullError: err,
      });
      logger.error("Connection Failed", err);
      this.reconnect();
    }
  }

  authorize() {
    if (this.token) {
      logger.info("🔑 Sending authorization request", {
        hasToken: true,
        tokenLength: this.token.length,
      });
      this.send({ authorize: this.token });
    } else {
      logger.warn(
        "⚠️ No DERIV_TOKEN provided - operating without authorization",
        {
          appId: this.appId,
          endpoint: this.endpoint,
        },
      );
      logger.warn("No DERIV_TOKEN provided. Skipping authorization.");
    }
  }

  send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const jsonData = JSON.stringify(data);
      logger.debug("📤 Sending WebSocket message", {
        msgType: data.msg_type || Object.keys(data)[0],
        dataLength: jsonData.length,
        readyState: this.ws.readyState,
      });
      this.ws.send(jsonData);
    } else {
      logger.warn("⚠️ Cannot send message - WebSocket not ready", {
        readyState: this.ws ? this.ws.readyState : "null",
        expectedState: WebSocket.OPEN,
        message: data,
        wsExists: !!this.ws,
      });
      logger.warn("WebSocket not open. Cannot send message.", data);
    }
  }

  startHeartbeat() {
    this.stopHeartbeat();
    logger.debug("💓 Starting WebSocket heartbeat", {
      intervalMs: 10000,
    });
    this.pingInterval = setInterval(() => {
      logger.debug("🏓 Sending ping heartbeat");
      this.send({ ping: 1 });
    }, 10000); // 10 seconds
  }

  stopHeartbeat() {
    if (this.pingInterval) {
      logger.debug("🚫 Stopping WebSocket heartbeat");
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

    logger.warn("🔄 Scheduling WebSocket reconnection", {
      attempt: this.reconnectAttempts,
      delayMs: delay,
      delaySeconds: delay / 1000,
      scheduledTime: new Date(Date.now() + delay).toISOString(),
    });
    logger.info(
      `Reconnecting in ${delay}ms (Attempt ${this.reconnectAttempts})`,
    );

    setTimeout(() => {
      logger.info("🔗 Executing scheduled reconnection", {
        attempt: this.reconnectAttempts,
      });
      this.connect();
    }, delay);
  }

  close() {
    logger.info("🚫 Explicitly closing WebSocket connection", {
      currentState: this.ws ? this.ws.readyState : "null",
      hasHeartbeat: !!this.pingInterval,
    });
    this.isExplicitlyClosed = true;
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.close();
    }
  }
}

module.exports = new ConnectionManager();
