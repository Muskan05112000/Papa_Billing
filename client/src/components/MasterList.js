import React, { useEffect, useState } from 'react';
import { fetchItems, addItem, fetchCustomers, fetchAllCustomerItems, addCustomerItem, deleteItem, deleteCustomerItem } from '../services/api';
import { Mic, MicOff, Trash2 } from 'lucide-react';

function MasterList() {
    const [items, setItems] = useState([]);
    const [customers, setCustomers] = useState([]);
    const [customerItems, setCustomerItems] = useState([]);
    const [newItem, setNewItem] = useState({ name: '', unit: 'Kg', rate: '', customerName: '' });
    const [loading, setLoading] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [voiceFeedback, setVoiceFeedback] = useState('');

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

    return (
        <div className="container">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2>Master List & Customer Pricing</h2>
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
                        <label>Customer (Optional)</label>
                        <input
                            list="customer-list-master"
                            placeholder="Leave blank for GLOBAL"
                            value={newItem.customerName}
                            onChange={e => setNewItem({ ...newItem, customerName: e.target.value })}
                        />
                        <datalist id="customer-list-master">
                            {customers.map(c => <option key={c._id} value={c.name} />)}
                        </datalist>
                        <small style={{ color: '#666' }}>Blank = Global Price</small>
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

            <div className="card">
                <h3>Global Master Prices (For New Customers)</h3>
                <table>
                    <thead>
                        <tr>
                            <th>Vegetable</th>
                            <th>Unit</th>
                            <th>Default Rate</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.length === 0 ? <tr><td colSpan="4">No items found</td></tr> :
                            items.map(item => (
                                <tr key={item._id}>
                                    <td>{item.name}</td>
                                    <td>{item.unit}</td>
                                    <td>{item.defaultRate}</td>
                                    <td>
                                        <button className="delete-btn" onClick={() => handleDelete(item._id, false)}>
                                            <Trash2 size={16} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                    </tbody>
                </table>
            </div>

            <div className="card" style={{ marginTop: '30px' }}>
                <h3>Customer Specific Prices</h3>
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
                        {customerItems.length === 0 ? <tr><td colSpan="5">No customer-specific prices yet</td></tr> :
                            customerItems.map(item => (
                                <tr key={item._id}>
                                    <td><strong>{item.customerName}</strong></td>
                                    <td>{item.itemName}</td>
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
        </div>
    );
}

export default MasterList;
