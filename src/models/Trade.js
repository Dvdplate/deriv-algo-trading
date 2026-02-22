const mongoose = require("mongoose");

const TradeSchema = new mongoose.Schema({
  contract_id: {
    type: String,
    required: true,
    unique: true,
  }, // Deriv Contract ID
  symbol: {
    type: String,
    default: "BOOM1000",
  },
  entry_time: {
    type: Date,
    default: Date.now,
  },
  entry_price: {
    type: Number,
    required: true,
  },
  // Status Fields
  status: {
    type: String,
    enum: ["OPEN", "CLOSED", "CANCELLED"],
    default: "OPEN",
  },
  // Exit Fields (Nullable until closed)
  exit_time: {
    type: Date,
  },
  exit_price: {
    type: Number,
  },
  profit: {
    type: Number,
  }, // Absolute value (e.g., -0.50 or +1.20)
  // Meta
  trigger_reason: {
    type: String,
    enum: ["FIRST_SELL", "TEST"],
    default: "FIRST_SELL",
  },
});

module.exports = mongoose.model("Trade", TradeSchema);
