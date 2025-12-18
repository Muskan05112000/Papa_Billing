const express = require('express');
const router = express.Router();
const Customer = require('../models/Customer');
const Bill = require('../models/Bill');
const CustomerItem = require('../models/CustomerItem');

// Get all customers
router.get('/', async (req, res) => {
    try {
        const customers = await Customer.find().sort({ name: 1 });
        res.json(customers);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Add new customer
router.post('/', async (req, res) => {
    const customer = new Customer({
        name: req.body.name,
        address: req.body.address,
        gst: req.body.gst,
        phone: req.body.phone
    });

    try {
        const newCustomer = await customer.save();
        res.status(201).json(newCustomer);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

// Get ALL unique customer item prices (for Master List)
router.get('/all-items', async (req, res) => {
    try {
        const items = await CustomerItem.find().sort({ customerName: 1, itemName: 1 });
        res.json(items);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Get unique items bought by a specific customer
router.get('/:name/items', async (req, res) => {
    try {
        const items = await CustomerItem.find({
            customerName: { $regex: new RegExp(`^${req.params.name}$`, 'i') }
        });
        res.json(items);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Manually Add/Update a Customer Specific Item Price
router.post('/items', async (req, res) => {
    const { customerName, itemName, unit, rate } = req.body;
    try {
        const item = await CustomerItem.findOneAndUpdate(
            {
                customerName: { $regex: new RegExp(`^${customerName}$`, 'i') },
                itemName: { $regex: new RegExp(`^${itemName}$`, 'i') }
            },
            { customerName, itemName, unit, rate, lastUpdated: Date.now() },
            { upsert: true, new: true }
        );
        res.status(201).json(item);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

// Delete customer-specific price
router.delete('/items/:id', async (req, res) => {
    try {
        await CustomerItem.findByIdAndDelete(req.params.id);
        res.json({ message: 'Customer item deleted' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
