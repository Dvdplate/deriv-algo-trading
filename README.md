# BOOM 500 Algorithmic Trading System

This project is a standalone, server-side algorithmic trading bot designed specifically for the Deriv BOOM 500 Synthetic Index. It implements a high-frequency "First Sell" scalping strategy, utilizing Moving Average clusters to filter out high-risk "Spike" zones and enforce strict risk management protocols.

**Target Market:** Deriv BOOM 500 Synthetic Index
**Trading Style:** Scalping (Short/Sell/Put)
**Profit Target:** $8.00 Daily Cap (Hard Limit)
**Platform:** Node.js (Server-Side) + MongoDB

---

## 🚀 Key Features

*   **Modular Architecture:** Built with separate modules for Connection, Market Data, Strategy, Execution, and Risk Management.
*   **Real-time Analysis:** Subscribes to tick-by-tick data for instant trade execution.
*   **SMA Trend Filtering:** Uses a cluster of Simple Moving Averages (200, 100, 50, 25) to identify "Safe Zones" and "Restricted Zones".
*   **Risk Management:**
    *   **Daily Profit Cap:** Automatically stops trading after reaching $8.00 USD profit.
    *   **Train Detector:** Identifies consecutive spikes (momentum shifts) and triggers an emergency stop to prevent losses.
    *   **Rate Limit Handling:** Automatically pauses for 60 seconds if API rate limits are hit.
    *   **Buy Limit Protection:** Immediate shutdown if buy limits are reached.
*   **Persistence:** MongoDB stores daily statistics and detailed trade history.
*   **Dockerized:** Ready for deployment with Docker and Docker Compose.

---

## 📈 Strategy Overview: "First Sell" & MAC

The core strategy capitalizes on the downward ticks of the Boom 500 index while avoiding upward spikes.

### 1. The SMA Cluster
The bot calculates four Simple Moving Averages based on **closed** 1-minute candles to determine market trend and safety:
*   **SMA 200 (Blue):** Major Trend Baseline.
*   **SMA 100 (Green):** Intermediate Trend.
*   **SMA 50 (Yellow):** Short-term Trend.
*   **SMA 25 (Red):** Signal Trigger.

### 2. Market States
*   **RESTRICTED (Danger Zone):**
    *   Condition: Current Price >= SMA 200 OR SMA 100 OR SMA 50.
    *   Action: All buying is blocked. Open positions are closed immediately.
*   **PERMISSIVE (Safe Zone):**
    *   Condition: Current Price < SMA 200 AND SMA 100 AND SMA 50.
    *   Action: Entry logic is enabled.

### 3. Entry Logic (The "First Sell")
When in the **PERMISSIVE** state:
1.  **Spike Detection:** Monitors tick updates. If `Delta > 4.0` (price jumps up), a spike is detected.
2.  **Verification:** Checks if the spike pushed the price *above* the SMAs.
3.  **Execution:** If Price is still < SMAs (Market State remains PERMISSIVE), execute a **SELL** (Put) contract immediately.

### 4. Crossover Guard
If SMA 25 crosses ABOVE SMA 50 or SMA 100, momentum is shifting bullish. The bot closes all trades and enters a cooldown period.

---

## 🛡️ Risk Management (The "Iron Rules")

### Daily Profit Cap
*   **Goal:** Consistent, small daily gains.
*   **Limit:** $8.00 USD.
*   **Action:** Once the daily profit hits or exceeds $8.00, the bot enters "Sleep Mode" until the next day (00:00 GMT).

### The "Train" Detector
*   **Logic:** Monitors the last 5 ticks.
*   **Trigger:** Two consecutive ticks with `Delta > 4.0` (Back-to-back spikes).
*   **Action:** "Emergency Brake" - Cancels all pending logic, closes open trades, and pauses the bot for 15 minutes.

---

## 🛠️ Technology Stack

*   **Runtime:** Node.js (v18+)
*   **Database:** MongoDB (Mongoose ODM)
*   **Communication:** WebSocket (ws) for Deriv API
*   **Indicators:** `technicalindicators` library
*   **Containerization:** Docker & Docker Compose

---

## 🏁 Getting Started

### Prerequisites
1.  **Deriv Account:** You need a Deriv account and an API Token with `read` and `trade` permissions.
2.  **Docker:** Ensure Docker and Docker Compose are installed on your machine.
3.  **App ID:** Register an application on Deriv to get an App ID (or use default `1089` for testing).

### Installation

1.  **Clone the Repository:**
    ```bash
    git clone https://github.com/your-repo/boom-500-algo-bot.git
    cd boom-500-algo-bot
    ```

2.  **Configure Environment:**
    Copy the example environment file:
    ```bash
    cp .env.example .env
    ```
    Edit `.env` and fill in your details:
    ```env
    DERIV_TOKEN=your_deriv_api_token_here
    APP_ID=1089
    MONGO_URI=mongodb://mongo:27017/boom500
    STAKE_AMOUNT=10
    MULTIPLIER=100
    ```

3.  **Run with Docker Compose:**
    Build and start the services (Bot + MongoDB):
    ```bash
    docker-compose up --build -d
    ```

4.  **Verify Operation:**
    Check the logs to ensure the bot is connected and running:
    ```bash
    docker-compose logs -f boom-bot
    ```

### Manual Run (Local Node.js)
If you prefer running without Docker:
1.  Install MongoDB locally or use a cloud URI.
2.  Install dependencies: `npm install`
3.  Start the bot: `npm start`

---

## 📂 Project Structure

```
├── src/
│   ├── config/          # Configuration files
│   ├── models/          # Mongoose Schemas (DailyStat, Trade)
│   ├── modules/
│   │   ├── connection.js      # WebSocket manager
│   │   ├── database.js        # MongoDB connection
│   │   ├── execution.js       # Trade execution (Buy/Sell)
│   │   ├── market_data.js     # Tick/Candle subscription & SMA calc
│   │   ├── risk_guardian.js   # Profit Cap & Train Logic
│   │   └── strategy_engine.js # Core trading logic & state machine
│   └── index.js         # Entry point
├── Dockerfile           # Docker image definition
├── docker-compose.yml   # Service orchestration
├── .env.example         # Environment variables template
└── package.json         # Dependencies
```

## ⚠️ Disclaimer
Trading synthetic indices involves significant risk. This bot is provided for educational purposes only. Use at your own risk. The authors are not responsible for any financial losses incurred.
