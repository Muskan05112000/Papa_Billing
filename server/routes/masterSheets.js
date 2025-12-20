const express = require('express');
const router = express.Router();
const MasterSheet = require('../models/MasterSheet');

// GET all sheets
router.get('/', async (req, res) => {
    try {
        const sheets = await MasterSheet.find().sort({ sheetNo: -1 });
        res.json(sheets);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// GET sheet by date
router.get('/by-date', async (req, res) => {
    try {
        const { date } = req.query;
        if (!date) return res.status(400).json({ message: 'Date is required' });

        const startOfDay = new Date(date);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(date);
        endOfDay.setHours(23, 59, 59, 999);

        const sheet = await MasterSheet.findOne({
            date: { $gte: startOfDay, $lte: endOfDay }
        }).sort({ sheetNo: -1 });
        res.json(sheet);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// GET next sheet number
router.get('/next-no', async (req, res) => {
    try {
        const lastSheet = await MasterSheet.findOne().sort({ sheetNo: -1 });
        const nextNo = lastSheet ? lastSheet.sheetNo + 1 : 1;
        res.json({ nextSheetNo: nextNo });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// POST new sheet
router.post('/', async (req, res) => {
    try {
        const sheet = new MasterSheet(req.body);
        const newSheet = await sheet.save();
        res.status(201).json(newSheet);
    } catch (err) {
        if (err.code === 11000) {
            return res.status(409).json({ message: 'Sheet Number already exists' });
        }
        res.status(400).json({ message: err.message });
    }
});

module.exports = router;
