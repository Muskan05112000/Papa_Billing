import React, { useEffect, useState } from 'react';
import { fetchItems, addItem, fetchCustomers, fetchAllCustomerItems, addCustomerItem, addBulkCustomerItems, deleteItem, deleteCustomerItem, checkServerHealth, cleanupDuplicates, resetCustomerItems } from '../services/api';
import { Mic, MicOff, Trash2, Upload, FileSpreadsheet } from 'lucide-react';
import * as XLSX from 'xlsx';

function MasterList() {
    const [items, setItems] = useState([]);
    const [customers, setCustomers] = useState([]);
    const [customerItems, setCustomerItems] = useState([]);
    const [newItem, setNewItem] = useState({ name: '', unit: 'Kg', rate: '', customerName: '' });
    const [loading, setLoading] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [voiceFeedback, setVoiceFeedback] = useState('');
    const [searchTerm, setSearchTerm] = useState('');

    const formatName = (str) => {
        if (!str) return "";
        return str.toString().toLowerCase().split(' ').map(word =>
            word.charAt(0).toUpperCase() + word.slice(1)
        ).join(' ');
    };

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const [itemsRes, custRes, custItemsRes] = await Promise.all([
                fetchItems(),
                fetchCustomers(),
                fetchAllCustomerItems()
            ]);
            setItems(itemsRes.data);
            setCustomers(custRes.data);
            setCustomerItems(custItemsRes.data);
        } catch (err) {
            console.error("Error loading master data:", err);
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e) => {
        if (e) e.preventDefault();
        try {
            if (newItem.customerName.trim()) {
                await addCustomerItem({
                    customerName: newItem.customerName,
                    itemName: newItem.name,
                    unit: newItem.unit,
                    rate: parseFloat(newItem.rate) || 0
                });
            } else {
                await addItem({
                    name: newItem.name,
                    unit: newItem.unit,
                    defaultRate: parseFloat(newItem.rate) || 0
                });
            }
            loadData();
            setNewItem({ name: '', unit: 'Kg', rate: '', customerName: '' });
            if (e) alert('Item Saved Successfully!');
            return true;
        } catch (err) {
            console.error(err);
            if (e) alert('Error saving item');
            return false;
        }
    };

    const handleDelete = async (id, isCustomerItem) => {
        if (!window.confirm('Are you sure you want to delete this price?')) return;
        try {
            if (isCustomerItem) await deleteCustomerItem(id);
            else await deleteItem(id);
            loadData();
        } catch (err) {
            alert('Error deleting item');
        }
    };

    // --- Voice Logic ---
    const startSpeech = () => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            alert("Your browser does not support Speech Recognition. Please use Chrome.");
            return;
        }

        const recognition = new SpeechRecognition();
        recognition.lang = 'en-IN';
        recognition.interimResults = false;

        recognition.onstart = () => {
            setIsListening(true);
            setVoiceFeedback('Listening...');
        };

        recognition.onresult = async (event) => {
            const transcript = event.results[0][0].transcript.toLowerCase();
            setVoiceFeedback(`Heard: "${transcript}"`);
            await processCommand(transcript);
        };

        recognition.onerror = () => {
            setIsListening(false);
            setVoiceFeedback('Error or No Speech detected.');
        };

        recognition.onend = () => {
            setIsListening(false);
        };

        recognition.start();
    };

    const processCommand = async (cmd) => {
        // More robust patterns
        const patterns = [
            {
                // "Add/Update Potato for John at/to 30"
                regex: /(?:add|update)\s+(.+)\s+for\s+(.+)\s+(?:at|to)\s+(\d+)/i,
                action: async (match) => {
                    const [_, item, customer, rate] = match;
                    await addCustomerItem({ customerName: customer.trim(), itemName: item.trim(), unit: 'Kg', rate: parseFloat(rate) });
                    return `Updated ${item} for ${customer} to ${rate}`;
                }
            },
            {
                // "Add/Update Potato at/to 30 for John"
                regex: /(?:add|update)\s+(.+)\s+(?:at|to)\s+(\d+)\s+for\s+(.+)/i,
                action: async (match) => {
                    const [_, item, rate, customer] = match;
                    await addCustomerItem({ customerName: customer.trim(), itemName: item.trim(), unit: 'Kg', rate: parseFloat(rate) });
                    return `Updated ${item} for ${customer} to ${rate}`;
                }
            },
            {
                // "Add/Update Potato at/to 30"
                regex: /(?:add|update)\s+(.+)\s+(?:at|to)\s+(\d+)/i,
                action: async (match) => {
                    const [_, item, rate] = match;
                    await addItem({ name: item.trim(), unit: 'Kg', defaultRate: parseFloat(rate) });
                    return `Updated ${item} to ${rate}`;
                }
            },
            {
                // "Delete Potato for John"
                regex: /delete\s+(.+)\s+for\s+(.+)/i,
                action: async (match) => {
                    const [_, item, customer] = match;
                    const found = customerItems.find(i =>
                        i.itemName.toLowerCase() === item.trim().toLowerCase() &&
                        i.customerName.toLowerCase() === customer.trim().toLowerCase()
                    );
                    if (found) {
                        await deleteCustomerItem(found._id);
                        return `Deleted ${item} for ${customer}`;
                    }
                    return `Could not find ${item} for ${customer}`;
                }
            },
            {
                // "Delete Potato"
                regex: /delete\s+(.+)/i,
                action: async (match) => {
                    const [_, item] = match;
                    const found = items.find(i => i.name.toLowerCase() === item.trim().toLowerCase());
                    if (found) {
                        await deleteItem(found._id);
                        return `Deleted ${item}`;
                    }
                    return `Could not find ${item} in Global List`;
                }
            }
        ];

        let feedback = "Command not recognized. Try 'Add Tomato for John at 40'";
        for (const p of patterns) {
            const match = cmd.match(p.regex);
            if (match) {
                feedback = await p.action(match);
                break;
            }
        }
        setVoiceFeedback(feedback);
        loadData();
    };

    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const data = new Uint8Array(event.target.result);
                const workbook = XLSX.read(data, { type: 'array' });

                let allFormattedData = [];
                let currentCustomer = ""; // To handle cases where customer name is merged or only written in the first row

                workbook.SheetNames.forEach(sheetName => {
                    const worksheet = workbook.Sheets[sheetName];
                    const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: "" }); // defval ensures empty cells are empty strings

                    if (jsonData.length > 0) {
                        const sheetData = jsonData.map(row => {
                            const normalizedRow = {};
                            Object.keys(row).forEach(key => {
                                normalizedRow[key.toString().toLowerCase().replace(/\s/g, '').replace(/_/g, '')] = row[key];
                            });

                            let customerName = (normalizedRow['customername'] || normalizedRow['customer'] || normalizedRow['partyname'] || normalizedRow['party'] || "").toString().trim();
                            const itemName = (normalizedRow['itemname'] || normalizedRow['items'] || normalizedRow['item'] || normalizedRow['vegetablename'] || normalizedRow['vegetable'] || "").toString().trim();
                            const unit = (normalizedRow['unit'] || 'Kg').toString().trim();
                            const rate = parseFloat(normalizedRow['rate'] || normalizedRow['price'] || normalizedRow['amount'] || normalizedRow['unitprice']) || 0;

                            // Carry over customer name if it's empty in this row (useful for grouped excel sheets)
                            if (customerName) {
                                currentCustomer = customerName;
                            } else {
                                customerName = currentCustomer;
                            }

                            return { customerName, itemName, unit, rate };
                        }).filter(item => item.customerName && item.itemName && item.itemName.length > 0);

                        allFormattedData = [...allFormattedData, ...sheetData];
                    }
                });

                if (allFormattedData.length === 0) {
                    alert('No valid data found in any sheet. Ensure columns are named "Customer name", "Items", "Unit", "Rate".');
                    return;
                }

                // --- DE-DUPLICATION STEP ---
                // Extreme cleaning (matches backend) to ensure no duplicates
                const cleanKey = (s) => (s || "").toString().toLowerCase().replace(/[^a-z0-9]/g, '');

                const uniqueMap = new Map();
                allFormattedData.forEach(item => {
                    const key = `${cleanKey(item.customerName)}_${cleanKey(item.itemName)}`;
                    // Keep the last occurrence in the file for uniqueness within the batch
                    uniqueMap.set(key, {
                        customerName: item.customerName.toString().trim(),
                        itemName: item.itemName.toString().trim(),
                        unit: item.unit.toString().trim(),
                        rate: item.rate
                    });
                });
                const finalData = Array.from(uniqueMap.values());

                setLoading(true);
                const response = await addBulkCustomerItems(finalData);
                const { added, skipped, version } = response.data;
                alert(`Sync Complete [${version || 'Legacy'}]\n- New items added: ${added}\n- Duplicates skipped: ${skipped}`);
                loadData();
            } catch (err) {
                console.error("Error parsing Excel:", err);
                const errorMsg = err.response?.data?.message || err.message;

                // Extra check: If the error is E11000, we show a special instruction
                if (errorMsg.includes("E11000")) {
                    alert("STUCK PROCESS DETECTED!\n\nYour computer is running an OLD version of the server in the background.\n\nPlease follow the 'Ghost Process' instructions I sent to restart your server correctly.");
                } else {
                    alert("Error: " + errorMsg);
                }
            } finally {
                setLoading(false);
                if (e.target) e.target.value = '';
            }
        };
        reader.readAsArrayBuffer(file);
    };

    const verifyServer = async () => {
        try {
            const res = await checkServerHealth();
            alert(`Server Status: OK\nActive Version: ${res.data.version || "v7 (Latest)"}`);
        } catch (err) {
            alert("Could not connect to the server. Please check if it is running.");
        }
    };

    const handleCleanup = async () => {
        if (!window.confirm("This will merge capitalize variants (like 'Banana' and 'banana') into one. Continue?")) return;
        setLoading(true);
        try {
            const res = await cleanupDuplicates();
            alert(`Cleanup Finished!\n- Merged: ${res.data.merged}\n- Deleted Duplicate Variants: ${res.data.deleted}`);
            loadData();
        } catch (err) {
            alert("Error during cleanup");
        } finally {
            setLoading(false);
        }
    };

    const handleReset = async () => {
        if (!window.confirm("CRITICAL: This will DELETE ALL saved customer prices permanently. Are you absolutely sure?")) return;
        if (!window.confirm("LAST WARNING: This cannot be undone. Clear everything?")) return;
        setLoading(true);
        try {
            await resetCustomerItems();
            alert("All customer records cleared successfully.");
            loadData();
        } catch (err) {
            alert("Error resetting list");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="container">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                    <h2 style={{ margin: 0 }}>Master List & Customer Pricing</h2>
                    <div style={{
                        backgroundColor: 'var(--primary-color)',
                        color: 'white',
                        padding: '4px 12px',
                        borderRadius: '20px',
                        fontSize: '0.8rem',
                        fontWeight: 'bold'
                    }}>
                        {items.length} Vegetables
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <button onClick={handleReset} className="btn-secondary" style={{ backgroundColor: '#f44336', color: 'white', border: 'none' }} title="Delete All Customer Prices">
                        Reset All
                    </button>
                    <button onClick={handleCleanup} className="btn-secondary" style={{ backgroundColor: '#ff9800', color: 'white', border: 'none' }}>
                        Remove Duplicates
                    </button>
                    <button onClick={verifyServer} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <Upload size={16} /> Check Sync
                    </button>
                    <label className="btn-upload" style={{
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '10px 15px',
                        backgroundColor: '#eee',
                        borderRadius: '4px'
                    }}>
                        <FileSpreadsheet size={16} /> Upload Excel
                        <input type="file" onChange={handleFileUpload} accept=".xlsx, .xls" hidden />
                    </label>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <button
                        onClick={startSpeech}
                        className={isListening ? 'voice-active' : ''}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', borderRadius: '25px' }}
                    >
                        {isListening ? <Mic size={20} color="red" /> : <Mic size={20} />}
                        {isListening ? 'Listening...' : 'Voice Assistant'}
                    </button>
                    {voiceFeedback && <span style={{ fontSize: '0.8rem', color: '#666' }}>{voiceFeedback}</span>}
                </div>
            </div>

            <form onSubmit={handleSubmit} className="master-form card" style={{ marginBottom: '30px', padding: '20px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '15px' }}>
                    <div>
                        <label>Vegetable Name</label>
                        <input
                            placeholder="e.g. Tomato"
                            value={newItem.name}
                            onChange={e => setNewItem({ ...newItem, name: e.target.value })}
                            required
                        />
                    </div>
                    <div>
                        <label>Customer</label>
                        <input
                            list="customer-list-master"
                            placeholder="Select Hotel/Party"
                            value={newItem.customerName}
                            onChange={e => setNewItem({ ...newItem, customerName: e.target.value })}
                            required
                        />
                        <datalist id="customer-list-master">
                            {customers.map(c => <option key={c._id} value={formatName(c.name)} />)}
                        </datalist>
                    </div>
                    <div>
                        <label>Unit</label>
                        <select value={newItem.unit} onChange={e => setNewItem({ ...newItem, unit: e.target.value })}>
                            <option>Kg</option>
                            <option>Gm</option>
                            <option>Pcs</option>
                            <option>Doz</option>
                            <option>Crate</option>
                            <option>Sack</option>
                            <option>Box</option>
                        </select>
                    </div>
                    <div>
                        <label>Rate</label>
                        <input
                            type="number"
                            placeholder="Price"
                            value={newItem.rate}
                            onChange={e => setNewItem({ ...newItem, rate: e.target.value })}
                            required
                        />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                        <button type="submit" disabled={loading} style={{ width: '100%', height: '40px' }}>
                            {loading ? 'Saving...' : 'Add/Update Price'}
                        </button>
                    </div>
                </div>
            </form>


            <div className="card" style={{ marginTop: '30px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                    <h3 style={{ margin: 0 }}>Customer Specific Prices ({customerItems.length})</h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <input
                            type="text"
                            placeholder="Search Customer or Item..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={{ width: '250px', margin: 0 }}
                        />
                        <div style={{ fontSize: '0.9rem', color: '#666' }}>
                            {searchTerm ? `Showing: ${customerItems.filter(i => i.customerName.toLowerCase().includes(searchTerm.toLowerCase()) || i.itemName.toLowerCase().includes(searchTerm.toLowerCase())).length} of ` : ""}
                            Total Records: <strong>{customerItems.length}</strong>
                        </div>
                    </div>
                </div>
                <table>
                    <thead>
                        <tr>
                            <th>Customer</th>
                            <th>Vegetable</th>
                            <th>Unit</th>
                            <th>Last Used Rate</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {customerItems.filter(i =>
                            i.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            i.itemName.toLowerCase().includes(searchTerm.toLowerCase())
                        ).length === 0 ? <tr><td colSpan="5">No prices found {searchTerm ? `matching "${searchTerm}"` : ""}</td></tr> :
                            customerItems
                                .filter(i =>
                                    i.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                    i.itemName.toLowerCase().includes(searchTerm.toLowerCase())
                                )
                                .map(item => (
                                    <tr key={item._id}>
                                        <td><strong>{formatName(item.customerName)}</strong></td>
                                        <td>{formatName(item.itemName)}</td>
                                        <td>{item.unit}</td>
                                        <td>{item.rate}</td>
                                        <td>
                                            <button className="delete-btn" onClick={() => handleDelete(item._id, true)}>
                                                <Trash2 size={16} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                    </tbody>
                </table>
            </div>
        </div >
    );
}

export default MasterList;
