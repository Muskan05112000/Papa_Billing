const mongoose = require('mongoose');

const CustomerItemSchema = new mongoose.Schema({
    customerName: { type: String, required: true, trim: true, lowercase: true },
    itemName: { type: String, required: true, trim: true, lowercase: true },
    unit: { type: String, required: true, trim: true },
    rate: { type: Number, required: true },
    lastUpdated: { type: Date, default: Date.now }
});

// Ensure unique combination of customer and item
CustomerItemSchema.index({ customerName: 1, itemName: 1 }, { unique: true });

module.exports = mongoose.model('CustomerItem', CustomerItemSchema);
