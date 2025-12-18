import React, { useEffect, useState } from 'react';
import { fetchBills, deleteBill } from '../services/api';
import { format } from 'date-fns';
import { Trash2 } from 'lucide-react';

function History() {
    const [bills, setBills] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        loadBills();
    }, []);

    const loadBills = async () => {
        setLoading(true);
        try {
            const res = await fetchBills();
            setBills(res.data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure you want to delete this bill? This cannot be undone.')) return;
        try {
            await deleteBill(id);
            loadBills();
        } catch (err) {
            alert('Error deleting bill');
        }
    };

    return (
        <div className="card">
            <h2 style={{ marginBottom: '20px' }}>Daily Bill History</h2>
            <table>
                <thead>
                    <tr>
                        <th style={{ width: '80px' }}>Bill No</th>
                        <th style={{ width: '120px' }}>Date</th>
                        <th>Customer</th>
                        <th>Vegetables Added</th>
                        <th style={{ width: '120px' }}>Total Amount</th>
                        <th style={{ width: '80px' }}>Action</th>
                    </tr>
                </thead>
                <tbody>
                    {bills.length === 0 ? (
                        <tr><td colSpan="6" style={{ textAlign: 'center' }}>No bills found</td></tr>
                    ) : (
                        bills.map(bill => (
                            <tr key={bill._id}>
                                <td>{bill.billNo}</td>
                                <td>{format(new Date(bill.date), 'dd/MM/yyyy')}</td>
                                <td>{bill.customer.name}</td>
                                <td>
                                    <div style={{ fontSize: '0.9rem', color: '#555' }}>
                                        {bill.items.map(i => i.name).join(', ')}
                                        <br />
                                        <small style={{ color: '#888' }}>({bill.items.length} items)</small>
                                    </div>
                                </td>
                                <td style={{ fontWeight: 'bold' }}>₹{bill.totalAmount.toFixed(2)}</td>
                                <td>
                                    <button className="delete-btn" onClick={() => handleDelete(bill._id)}>
                                        <Trash2 size={18} />
                                    </button>
                                </td>
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
        </div>
    );
}

export default History;
