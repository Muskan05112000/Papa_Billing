const mongoose = require('mongoose');

const BillItemSchema = new mongoose.Schema({
    name: { type: String, required: true },
    unit: { type: String, required: true },
    qty: { type: Number, required: true },
    rate: { type: Number, required: true },
    amount: { type: Number, required: true }
});

const BillSchema = new mongoose.Schema({
    billNo: { type: Number, required: true, unique: true },
    date: { type: Date, default: Date.now },
    customer: {
        name: String,
        address: String
    },
    items: [BillItemSchema],
    totalAmount: { type: Number, required: true }
});

module.exports = mongoose.model('Bill', BillSchema);
