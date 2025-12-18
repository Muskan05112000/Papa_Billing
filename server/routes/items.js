const express = require('express');
const router = express.Router();
const Item = require('../models/Item');

// Get all items
router.get('/', async (req, res) => {
    try {
        const items = await Item.find().sort({ name: 1 });
        res.json(items);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Add/Update item (Upsert)
router.post('/', async (req, res) => {
    try {
        const { name, unit, defaultRate } = req.body;
        const updatedItem = await Item.findOneAndUpdate(
            { name: { $regex: new RegExp(`^${name}$`, 'i') } },
            { name, unit, defaultRate },
            { upsert: true, new: true }
        );
        res.status(200).json(updatedItem);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

// Delete item
router.delete('/:id', async (req, res) => {
    try {
        await Item.findByIdAndDelete(req.params.id);
        res.json({ message: 'Item deleted' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
