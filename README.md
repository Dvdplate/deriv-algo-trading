# Volatility 75: VDS-95 Algorithmic Trading System (SMC)

This project is a standalone, server-side algorithmic trading bot specifically engineered for **Volatility 75 (R_75)** on the Deriv platform. 

It implements the strict, rules-based **VDS-95 (Volatility Demand SMC)** strategy. This system moves away from traditional indicators and relies purely on institutional Smart Money Concepts (SMC) and price action delivery, engineered targeting a back-tested high win-rate profile by mastering market structure.

**Target Market:** Volatility 75 (R_75)
**Trading Style:** Multi-Timeframe Structural Sweeps (SMC)
**Risk Profile:** 1.5% Max Risk / 4.5% Max Daily Drawdown
**Platform:** Node.js (Server-Side)

---

## 🚀 Key Features

*   **Top-Down 3-Timeframe Narrative:** Analyzes the market from three perspectives: H1 (The Spotter), M15 (The Scout), and M5 (The Sniper).
*   **Confluence execution:** Only triggers trades when an exact mathematical overlap between a Fair Value Gap (FVG) and an Order Block (OB) forms concurrently.
*   **Institutional Structural Models:** Detects Break of Structure (BOS), Change of Character (CHoCH), and Liquidity Sweeps natively through automated candle-body mapping.
*   **Deriv Multipliers API:** Programmatically maps `take_profit` and `stop_loss` targets straight to the brokerage routing using multiplier contract limits. 
*   **Institutional-Grade Risk Manager:** Features a rigid 1.5% maximum margin risk-lock, a daily 4.5% drawdown Killswitch to protect capital, and restricts trading strictly to overlapping, high-volume London/New York sessions.

---

## 📈 The Strategy: VDS-95

The VDS-95 operates on the absolute rule that the Volatility 75 price delivery algorithm is mathematically obligated to rebalance price inefficiencies. 

### Stage 1: The Narrative (Timeframe: H1)
*   **The Spotter:** The system analyzes H1 to dictate the overall narrative trend (BULLISH vs BEARISH).
*   **FVG Overlap:** Looks for explosive moves leaving a Fair Value Gap (FVG) that directly overlaps with the initiating Order Block (OB).
*   If the exact mathematical threshold is met, the underlying narrative is validated.

### Stage 2: Liquidity Mapping (Timeframe: M15)
*   **The Scout:** Scans the 15-minute chart to map the closest minor Swing Highs/Lows acting as Inducement (IDM).
*   **The Sweep:** The bot physically arms its execution modules *only* after it detects a Wick Sweep (price pierces the IDM with a wick, but closes the body back inside the range).

### Stage 3: The Execution Trigger (Timeframe: M5)
*   **The Sniper:** Once armed, the M5 monitors for a localized Change of Character (CHoCH) moving in the direction of the H1 narrative.
*   **Confluence Check:** The bot verifies that the trigger itself features an overlapping FVG and Order Block.
*   **Entry Mapping:** Calculates the 50% equilibrium mark of the new M5 FVG and fires a `MULTUP` or `MULTDOWN` Limit Order directly to the broker.

---

## 🛡️ The "Iron Rules" (Risk Management)

You can have the slickest entry strategy on the planet, but if you don't have rock-solid institutional-grade risk management, you're just gambling.

1.  **Strict 1.5% Allocation:** The system calculates sizing dynamically. Stop Loss must NEVER exceed precisely 1.5% of the total account balance. *(Amount = (Account Balance * 0.015) * (Multiplier / Stop Loss Distance in Points))*
2.  **Max Daily Drawdown (4.5%):** If the bot registers three back-to-back 1.5% losses (a peak-to-trough drop of 4.5%), an automated 24-hour killswitch trips to protect remaining capital. 
3.  **Mandatory 1:3 Risk-to-Reward:** Limit proposals will abort natively if the structural distance of the closest liquidity target does not clear a strict 1-to-3 minimum margin ratio. 
4.  **Session Activity Wall:** Trading algorithms are fully suspended outside of high-volume overlaps. It trades exclusively between 08:00 GMT and 21:00 GMT. 

---

## 🏁 Getting Started

### Prerequisites
1.  **Deriv Account:** A Deriv account and an API Token with `read` and `trade` permissions.
2.  **Docker (Optional):** Ensure Docker and Docker Compose are installed on your machine.
3.  **App ID:** Register an application on Deriv to get an App ID.

### Installation

1.  **Clone the Repository:**
    ```bash
    git clone https://github.com/your-repo/deriv-algo-trading.git
    cd deriv-algo-trading
    ```

2.  **Configure Environment:**
    Copy the example environment file:
    ```bash
    cp .env.example .env
    ```
    Edit `.env` and fill in your details:
    ```env
    DERIV_TOKEN=your_deriv_api_token_here
    APP_ID=your_app_id
    ```
    *(Stake amount is now calculated dynamically under the 1.5% rule, bypassing fixed configuration inputs).*

3.  **Run with Node:**
    ```bash
    npm install
    node src/index.js
    ```
    Or via Docker Compose:
    ```bash
    docker-compose up --build -d
    ```

---

## 📂 Project Structure

```
├── src/
│   ├── config/          # Configuration files
│   ├── models/          # Database structural layouts
│   ├── modules/
│   │   ├── connection.js      # WebSocket manager (WSS) 
│   │   ├── database.js        # Data Persistence 
│   │   ├── execution.js       # Trade execution (Multiplier limits)
│   │   ├── market_data.js     # Tick/Candle subscription (H1, M15, M5)
│   │   ├── risk_guardian.js   # 1.5% scaling, 4.5% Drawdown Killswitch
│   │   └── strategy_engine.js # VDS-95 Logic State Machine
│   └── index.js         # Entry point
```

## ⚠️ Disclaimer
Trading synthetic volatility indices involves significant risk. This system's back-tested analytics do not guarantee forward-tested profitability. This bot is meant as educational execution logic surrounding Smart Money Concepts. Use strictly at your own financial risk.
