const express = require('express');
const router = express.Router();
const Bill = require('../models/Bill');
const CustomerItem = require('../models/CustomerItem');
const Customer = require('../models/Customer');

// Get all bills
router.get('/', async (req, res) => {
    try {
        const bills = await Bill.find().sort({ billNo: 1 });
        res.json(bills);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Delete bill and re-number
router.delete('/:id', async (req, res) => {
    try {
        await Bill.findByIdAndDelete(req.params.id);

        // Fetch all remaining bills sorted by their current billNo or creation date
        const remainingBills = await Bill.find().sort({ billNo: 1 });

        // Re-number them sequentially to avoid unique key collisions
        for (let i = 0; i < remainingBills.length; i++) {
            remainingBills[i].billNo = i + 1;
            await remainingBills[i].save();
        }

        res.json({ message: 'Bill deleted and re-numbered successfully' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Get next bill number
router.get('/next-number', async (req, res) => {
    try {
        const lastBill = await Bill.findOne().sort({ billNo: -1 });
        const nextNum = lastBill ? lastBill.billNo + 1 : 1;
        res.json({ nextBillNo: nextNum });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Create new bill
router.post('/', async (req, res) => {
    const { billNo, customer, items, totalAmount, date } = req.body;

    const bill = new Bill({
        billNo,
        customer,
        items,
        totalAmount,
        date
    });

    try {
        const newBill = await bill.save();

        // 1. Update/Create Customer record
        await Customer.findOneAndUpdate(
            { name: { $regex: new RegExp(`^${customer.name}$`, 'i') } },
            { name: customer.name, address: customer.address },
            { upsert: true, new: true }
        );

        // 2. Update CustomerItem records (Price List per customer)
        const updatePromises = items.map(async (item) => {
            // Find existing record case-insensitively
            const existing = await CustomerItem.findOne({
                customerName: { $regex: new RegExp(`^${customer.name}$`, 'i') },
                itemName: { $regex: new RegExp(`^${item.name}$`, 'i') }
            });

            if (existing) {
                existing.unit = item.unit;
                existing.rate = item.rate;
                existing.lastUpdated = Date.now();
                return existing.save();
            } else {
                return new CustomerItem({
                    customerName: customer.name,
                    itemName: item.name,
                    unit: item.unit,
                    rate: item.rate
                }).save();
            }
        });
        await Promise.all(updatePromises);

        res.status(201).json(newBill);
    } catch (err) {
        if (err.code === 11000) {
            res.status(409).json({ message: 'Duplicate Bill Number detected. Please refresh the bill number.' });
        } else {
            res.status(400).json({ message: err.message });
        }
    }
});

module.exports = router;
