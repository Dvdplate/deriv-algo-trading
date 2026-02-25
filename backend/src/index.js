import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';
import http from 'http';
import { connectDB } from "./modules/database.js";
import authRoutes from './api/auth.js';
import tradesRoutes from './api/trades.js';
import User from './models/User.js';
import Volatility100Strategy from "./strategies/Volatility100Strategy.js";

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.REACT_APP_BACKEND_PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-trading-key-12345';
const COOKIE_NAME = 'session_token';

// Express Middleware
app.use(cors({
  origin: 'http://localhost:3000', // Need to allow React dev server if different port, wait react runs on 3001 if backend is 3000
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/trades', tradesRoutes);

// Helper to authenticate WS connections
const verifyWebSocketClient = (req, next) => {
  // Parse cookies manually for WS initial request
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return next(new Error('Authentication failed (No cookies)'));

  const cookies = cookieHeader.split(';').reduce((acc, cookie) => {
    const [name, ...val] = cookie.trim().split('=');
    acc[name] = val.join('=');
    return acc;
  }, {});

  const token = cookies[COOKIE_NAME];
  if (!token) return next(new Error('Authentication failed (No session token)'));

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next(null);
  } catch (error) {
    next(new Error('Authentication failed (Invalid token)'));
  }
};

let botInstance = null;
const frontendClients = new Set();

// Helper to broadcast a message to all authenticated frontend clients
const broadcast = (msgObj) => {
  const payload = JSON.stringify(msgObj);
  frontendClients.forEach(client => {
    if (client.readyState === 1) client.send(payload);
  });
};

// Derive the current bot status string
const getBotStatus = () => {
  if (!botInstance) return 'STOPPED';
  return botInstance.isManuallyPaused ? 'STOPPED' : 'RUNNING';
};

wss.on('connection', (ws, req) => {
  verifyWebSocketClient(req, (err) => {
    if (err) {
      console.warn('Unauthorized WS connection attempt.');
      ws.close(1008, 'Unauthorized');
      return;
    }

    frontendClients.add(ws);

    // Push current state to newly connected client
    ws.send(JSON.stringify({ type: 'BOT_STATUS', status: getBotStatus() }));
    if (botInstance) {
      ws.send(JSON.stringify({ type: 'BALANCE_UPDATE', balance: botInstance.accountBalance }));
    }

    ws.on('message', (message) => {
      try {
        const msg = JSON.parse(message);
        if (msg.type === 'COMMAND' && botInstance) {
          if (msg.action === 'STOP') {
            botInstance.pauseManual();
            broadcast({ type: 'BOT_STATUS', status: 'STOPPED' });
          } else if (msg.action === 'START') {
            botInstance.resumeManual();
            broadcast({ type: 'BOT_STATUS', status: 'RUNNING' });
          }
        }
      } catch(e) { console.error('WS MSG Error:', e) }
    });

    ws.on('close', () => {
      frontendClients.delete(ws);
    });
  });
});

async function start() {
    try {
        await connectDB();
        
        // Ensure default user exists
        if (process.env.NODE_ENV !== 'production') {
          createDefaultUser();
        }
        
        server.listen(PORT, () => {
            console.log(`🚀 API and WebSocket Server running on port ${PORT}`);
        });

        try {
            botInstance = new Volatility100Strategy();

            // Wire up UI broadcast hooks
            botInstance.onUITradeOpen = (trade) => {
              broadcast({ type: 'TRADE_OPEN', trade });
            };
            botInstance.onUITradeClose = (trade) => {
              broadcast({ type: 'TRADE_CLOSE', trade });
            };
            botInstance.onUIBalanceChange = (balance) => {
              broadcast({ type: 'BALANCE_UPDATE', balance });
            };

            await botInstance.start();
            console.log("✅ Trading strategy successfully connected.");
        } catch (botError) {
            console.error("⚠️ Trading bot failed to initialize. Express server is still running. Error:", botError.message);
        }
        
    } catch (error) {
        console.error("💥 Fatal API Error:", error);
        process.exit(1);
    }
}

start();

process.on("SIGINT", () => {
    console.log("🚫 Received SIGINT - shutting down gracefully...");
    process.exit(0);
});
process.on("SIGTERM", () => {
    console.log("🚫 Received SIGTERM - shutting down gracefully...");
    process.exit(0);
});

async function createDefaultUser() {
  const defaultPassword = process.env.DEFAULT_USER_PASSWORD;
  const defaultEmail = process.env.DEFAULT_USER_EMAIL;
  if (!defaultPassword || !defaultEmail) {
    console.log('⚠️ Default user not created: Missing password or email from env');
    return;
  }
  const existingAdmin = await User.findOne({ email: defaultEmail });
  if (!existingAdmin) {
      console.log('🌱 Seeding database: Creating default user admin@test.com / password');
      const adminUser = new User({ email: defaultEmail, password: defaultPassword });
      await adminUser.save();
  }
}