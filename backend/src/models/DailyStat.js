import mongoose from 'mongoose';

const DailyStatSchema = new mongoose.Schema({
    date: {
        type: String,
        required: true,
        unique: true
    }, // Format: "YYYY-MM-DD"
    accumulated_profit: {
        type: Number,
        default: 0
    },
    trades_taken: {
        type: Number,
        default: 0
    },
    is_cap_reached: {
        type: Boolean,
        default: false
    }
});

export default mongoose.model('DailyStat', DailyStatSchema);
