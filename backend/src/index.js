import { connectDB } from "./modules/database.js";
import Volatility100Strategy from "./strategies/Volatility100Strategy.js";

async function start() {
    try {
        await connectDB();
        
        const bot = new Volatility100Strategy();
        await bot.start();
        
    } catch (error) {
        console.error("💥 Fatal Error initializing bot:", error);
        process.exit(1);
    }
}

start();

// Boilerplate Graceful Shutdowns
process.on("SIGINT", () => {
    console.log("🚫 Received SIGINT - shutting down gracefully...");
    process.exit(0);
});

process.on("SIGTERM", () => {
    console.log("🚫 Received SIGTERM - shutting down gracefully...");
    process.exit(0);
});

process.on("uncaughtException", (error) => {
    console.error("🚨 UNCAUGHT EXCEPTION - CRITICAL ERROR", error);
    process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
    console.error("🚨 UNHANDLED PROMISE REJECTION at:", promise, "reason:", reason);
    process.exit(1);
});
