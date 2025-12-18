const mongoose = require('mongoose');

const ItemSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    unit: { type: String, default: 'Kg' },
    defaultRate: { type: Number, default: 0 }
});

module.exports = mongoose.model('Item', ItemSchema);
