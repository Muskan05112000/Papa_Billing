const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Database Connection
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('MongoDB Connected'))
    .catch(err => console.log(err));

// Routes (to be added)
app.get('/', (req, res) => {
    res.send('Papa Billing Server Running');
});

// Import Routes
const itemRoutes = require('./routes/items');
const customerRoutes = require('./routes/customers');
const billRoutes = require('./routes/bills');
const masterSheetRoutes = require('./routes/masterSheets');

app.use('/api/items', itemRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/bills', billRoutes);
app.use('/api/master-sheets', masterSheetRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
