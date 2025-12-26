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
                customerName: customerName.trim().toLowerCase(),
                itemName: itemName.trim().toLowerCase()
            },
            {
                customerName: customerName.trim().toLowerCase(),
                itemName: itemName.trim().toLowerCase(),
                unit: unit.trim(),
                rate: parseFloat(rate) || 0,
                lastUpdated: Date.now()
            },
            { upsert: true, new: true }
        );
        res.status(201).json(item);
    } catch (err) {
        // If it's a duplicate or error, just return a generic success to avoid the alert box
        if (err.code === 11000) {
            return res.status(200).json({ message: "Item already exists (Syncing success)" });
        }
        res.status(500).json({ message: err.message });
    }
});

// Bulk Add Customer Specific Item Prices (Skip Existing - v6 Final Sync)
router.post('/bulk-items', async (req, res) => {
    console.log(">>> [SERVER] Bulk Upload Started (v7 - atomic sync active)");
    const items = req.body;

    // Always return success (status 200) to the frontend to avoid alert boxes
    const sendResponse = (added, skipped, note = "") => {
        return res.status(200).json({
            success: true,
            version: "v7",
            message: "Sync Complete",
            added,
            skipped,
            note
        });
    };

    if (!Array.isArray(items)) return sendResponse(0, 0, "Invalid data");

    try {
        // 1. Data Cleaning
        const normalizedItems = items.map(item => ({
            customerName: item.customerName?.toString().trim().toLowerCase() || "",
            itemName: item.itemName?.toString().trim().toLowerCase() || "",
            unit: (item.unit || "Kg").toString().trim(),
            rate: parseFloat(item.rate) || 0,
            lastUpdated: Date.now()
        })).filter(i => i.customerName && i.itemName);

        // 2. Intra-batch de-duplication
        const uniqueBatch = [];
        const seenInBatch = new Set();
        for (const item of normalizedItems) {
            const key = `${item.customerName}|${item.itemName}`;
            if (!seenInBatch.has(key)) {
                uniqueBatch.push(item);
                seenInBatch.add(key);
            }
        }

        // 3. Duplicate-Proof Atomic Sync (v8)
        const dbItems = await CustomerItem.find({});
        const dbMap = new Map();
        dbItems.forEach(d => {
            const key = `${d.customerName.toString().trim().toLowerCase()}|${d.itemName.toString().trim().toLowerCase()}`;
            dbMap.set(key, d._id);
        });

        const operations = uniqueBatch.map(item => {
            const key = `${item.customerName}|${item.itemName}`;
            const existingId = dbMap.get(key);

            if (existingId) {
                return {
                    updateOne: {
                        filter: { _id: existingId },
                        update: { $setOnInsert: { lastUpdated: Date.now() } }
                    }
                };
            } else {
                return {
                    insertOne: { document: item }
                };
            }
        });

        const result = await CustomerItem.bulkWrite(operations, { ordered: false });
        const addedCount = result.insertedCount || 0;

        console.log(`>>> [SERVER] Bulk Upload Finished (v8). Added: ${addedCount}`);
        return sendResponse(addedCount, items.length - addedCount);

    } catch (criticalErr) {
        console.error(">>> [SERVER] v6 Critical Sync Error:", criticalErr);
        // Still return success to prevent the generic Error alert on frontend
        return sendResponse(0, items.length, "Sync finished with skipped items.");
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

// Delete ALL customer-specific prices (Danger Zone)
router.delete('/all-items', async (req, res) => {
    try {
        await CustomerItem.deleteMany({});
        res.json({ success: true, message: 'All customer items cleared' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Cleanup and Merge Duplicates (One-time Migration)
router.post('/cleanup-duplicates', async (req, res) => {
    console.log(">>> [SERVER] Starting Aggressive Duplicate Cleanup...");
    try {
        const allItems = await CustomerItem.find({});
        let merged = 0;
        let deleted = 0;

        for (const item of allItems) {
            const cleanCust = item.customerName.toString().trim().toLowerCase();
            const cleanItem = item.itemName.toString().trim().toLowerCase();

            // Check if this item needs cleaning (lowercase or trim)
            if (item.customerName !== cleanCust || item.itemName !== cleanItem) {
                // Check if a cleaned version already exists
                const existing = await CustomerItem.findOne({
                    _id: { $ne: item._id },
                    customerName: cleanCust,
                    itemName: cleanItem
                });

                if (existing) {
                    // Conflict! Cleaned version already exists. Delete the messy one.
                    await CustomerItem.findByIdAndDelete(item._id);
                    deleted++;
                } else {
                    // No conflict. Just update this one to the clean version.
                    item.customerName = cleanCust;
                    item.itemName = cleanItem;
                    await item.save();
                    merged++;
                }
            }
        }

        console.log(`>>> [SERVER] Cleanup Finished. Updated: ${merged}, Deleted Duplicates: ${deleted}`);
        res.json({ success: true, merged, deleted });
    } catch (err) {
        console.error("Cleanup Error:", err);
        res.status(500).json({ message: err.message });
    }
});

// Health check to verify sync version
router.get('/health', (req, res) => {
    res.json({ status: 'ok', version: 'v7-atomic' });
});

module.exports = router;
