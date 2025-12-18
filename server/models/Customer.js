const mongoose = require('mongoose');

const CustomerSchema = new mongoose.Schema({
    name: { type: String, required: true },
    address: { type: String },
    gst: { type: String },
    phone: { type: String }
});

module.exports = mongoose.model('Customer', CustomerSchema);
