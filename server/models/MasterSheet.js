const mongoose = require('mongoose');

const MasterSheetSchema = new mongoose.Schema({
    sheetNo: { type: Number, required: true, unique: true },
    date: { type: Date, default: Date.now },
    vehicleNo: { type: String },
    headerColumns: [{ type: String }], // Array of Hotel/Party names
    dataRows: [{
        name: String,
        values: [Number], // Values corresponding to headerColumns
        total: Number
    }],
    totalQty: { type: Number, default: 0 }
});

module.exports = mongoose.model('MasterSheet', MasterSheetSchema);
