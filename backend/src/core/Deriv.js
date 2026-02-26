import WebSocket from "ws";
import config from "../config.js";

/**
 * Deriv Framework
 * Base abstraction for connection management, heartbeats, and API payloads.
 * No EventEmitters. Classes relying on events must override specific hooks like `onTick` or `onContractSold`.
 */
export default class Deriv {
  constructor() {
    this.ws = null;
    this.url = `wss://ws.binaryws.com/websockets/v3?app_id=${config.APP_ID}`;
    this.token = config.DERIV_TOKEN;

    this.pendingRequests = new Map();
    this.reqIdCounter = 1;
    this.heartbeatInterval = null;
    this.isAuthenticated = false;
  }

  /**
   * Initializes the WebSocket connection and waits for the connection to fully open.
   */
  connect() {
    return new Promise((resolve, reject) => {
      console.log(`📡 Connecting to Deriv WebSocket...`);
      this.ws = new WebSocket(this.url);

      this.ws.on("open", () => {
        console.log("✅ WebSocket Connected.");
        this.startHeartbeat();
        resolve();
      });

      this.ws.on("message", (data) => this._handleMessage(data));

      this.ws.on("close", () => {
        console.log("🔴 WebSocket Closed.");
        this.stopHeartbeat();
        this.isAuthenticated = false;
        this.onDisconnect();
      });

      this.ws.on("error", (error) => {
        console.error("🚨 WebSocket Error:", error.message);
        reject(error);
      });
    });
  }

  /**
   * Send the authorization token to Deriv and resolve on success.
   */
  async authenticate() {
    console.log("🔐 Authenticating...");
    try {
      const response = await this.send({ authorize: this.token });
      if (response.error) {
        throw new Error(response.error.message);
      }
      console.log("✅ Authenticated successfully.");
      this.isAuthenticated = true;
      return response.authorize;
    } catch (err) {
      console.error("❌ Authentication Failed:", err.message);
      throw err;
    }
  }

  /**
   * Central async engine for wrapping WS payloads with Promises.
   */
  send(payload) {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        return reject(new Error("WebSocket is not open"));
      }

      // Track request dynamically
      const req_id = this.reqIdCounter++;
      const payloadWithId = { ...payload, req_id };

      this.pendingRequests.set(req_id, { resolve, reject, payload });

      this.ws.send(JSON.stringify(payloadWithId), (err) => {
        if (err) {
          this.pendingRequests.delete(req_id);
          reject(err);
        }
      });
    });
  }

  startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.send({ ping: 1 }).catch(() => {}); // Fire and forget
      }
    }, config.HEARTBEAT_INTERVAL_MS);
  }

  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  _handleMessage(data) {
    try {
      const message = JSON.parse(data);

      // Attempt to resolve any pending Promise payload
      if (message.req_id && this.pendingRequests.has(message.req_id)) {
        const { resolve } = this.pendingRequests.get(message.req_id);
        this.pendingRequests.delete(message.req_id);
        
        // Always resolve to the caller so they handle custom API errors (like RateLimit)
        resolve(message);
      } else if (message.error) {
        console.error(`🚨 Deriv API Error: [${message.error.code}] ${message.error.message}`);
      }

      // Route custom stream events to subclass overrides
      if (message.msg_type === "tick") {
        this.onTick(message.tick);
      } else if (message.msg_type === "proposal_open_contract") {
        this.onContractUpdate(message.proposal_open_contract);
      }

    } catch (error) {
      console.error("Error parsing WS message", error);
    }
  }

  // ------------------------------------------------------------------------
  // Hooks for subclasses to override (Replaces EventEmitter)
  // ------------------------------------------------------------------------
  onTick(tickData) { }
  onContractUpdate(contractInfo) { }
  onDisconnect() { }
}
