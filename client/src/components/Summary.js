import React, { useState, useEffect } from 'react';
import { fetchCustomers, fetchLedger } from '../services/api';
import { format, eachDayOfInterval, startOfMonth, endOfMonth, getDate } from 'date-fns';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Layout, Download, Search, Table as TableIcon } from 'lucide-react';

function Summary() {
    const [customers, setCustomers] = useState([]);
    const [selectedCustomer, setSelectedCustomer] = useState('');
    const [month, setMonth] = useState(new Date().getMonth() + 1);
    const [year, setYear] = useState(new Date().getFullYear());
    const [bills, setBills] = useState([]);
    const [loading, setLoading] = useState(false);

    // Aggregated data
    const [itemsGrid, setItemsGrid] = useState([]);
    const [daysInMonth, setDaysInMonth] = useState([]);
    const [dateAmounts, setDateAmounts] = useState({});
    const [grandTotal, setGrandTotal] = useState(0);

    useEffect(() => {
        loadCustomers();
    }, []);

    const loadCustomers = async () => {
        try {
            const res = await fetchCustomers();
            setCustomers(res.data);
        } catch (err) {
            console.error('Error loading customers:', err);
        }
    };

    const handleSearch = async () => {
        if (!selectedCustomer) {
            alert('Please select a hotel/party');
            return;
        }
        setLoading(true);
        try {
            const res = await fetchLedger(selectedCustomer, month, year);
            processBills(res.data);
            setBills(res.data);
        } catch (err) {
            console.error('Error fetching summary:', err);
            alert('Failed to fetch records');
        } finally {
            setLoading(false);
        }
    };

    const processBills = (billData) => {
        const start = startOfMonth(new Date(year, month - 1));
        const end = endOfMonth(start);
        const days = eachDayOfInterval({ start, end });
        setDaysInMonth(days);

        const grid = {}; // key: itemName|unit|rate
        const amounts = {}; // key: date (1-31)

        billData.forEach(bill => {
            const date = getDate(new Date(bill.date));
            if (!amounts[date]) amounts[date] = 0;

            bill.items.forEach(item => {
                const key = `${item.name}|${item.unit}|${item.rate}`;
                if (!grid[key]) {
                    grid[key] = {
                        name: item.name,
                        unit: item.unit,
                        rate: item.rate,
                        quantities: {},
                        totalQty: 0
                    };
                }
                const qty = parseFloat(item.qty) || 0;
                grid[key].quantities[date] = (grid[key].quantities[date] || 0) + qty;
                grid[key].totalQty += qty;

                // Calculate amount for the date
                amounts[date] += (qty * parseFloat(item.rate));
            });
        });

        const gridArray = Object.values(grid).sort((a, b) => a.name.localeCompare(b.name));
        setItemsGrid(gridArray);
        setDateAmounts(amounts);

        const total = Object.values(amounts).reduce((sum, val) => sum + val, 0);
        setGrandTotal(total);
    };

    const generatePDF = () => {
        const doc = new jsPDF('l', 'mm', 'a3'); // Using A3 Landscape for more width
        const width = doc.internal.pageSize.getWidth();

        // --- Header Section ---
        doc.setFont("helvetica", "bold");
        doc.setFontSize(24);
        doc.text("RAJ TRADING CO.", width / 2, 15, { align: "center" });

        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.text("B-946, New Sabji Mandi Azadpur, Delhi 110033", width / 2, 21, { align: "center" });
        doc.text("Email: ausdelhi056@gmail.com", width / 2, 25, { align: "center" });
        doc.text("GST/Unique ID: 07AYXES8124N1ZB", width / 2, 29, { align: "center" });
        doc.text("Contact No. : 9650065539", width / 2, 33, { align: "center" });

        const dateRange = `${format(daysInMonth[0], 'dd/MM/yy')} - ${format(daysInMonth[daysInMonth.length - 1], 'dd/MM/yy')}`;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(14);
        doc.text(`${selectedCustomer.toUpperCase()} (${dateRange})`, width / 2, 40, { align: "center" });

        // Table Headers
        const tableHeaders = [
            ['Items Description', 'UOM', 'Rate', ...daysInMonth.map(d => getDate(d)), 'Total Qty']
        ];

        // Table Body
        const tableBody = itemsGrid.map(item => [
            item.name.toUpperCase(),
            item.unit,
            item.rate.toFixed(2),
            ...daysInMonth.map(d => {
                const day = getDate(d);
                return item.quantities[day] ? item.quantities[day].toFixed(2) : '';
            }),
            item.totalQty.toFixed(2)
        ]);

        // Footer Rows
        const footerRows = [
            [
                { content: 'Amount', colSpan: 3, styles: { halign: 'center', fontStyle: 'bold' } },
                ...daysInMonth.map(d => {
                    const day = getDate(d);
                    return dateAmounts[day] ? dateAmounts[day].toFixed(2) : '';
                }),
                grandTotal.toFixed(2)
            ],
            [
                { content: 'Total', colSpan: 3, styles: { halign: 'center', fontStyle: 'bold' } },
                { content: grandTotal.toFixed(2), colSpan: daysInMonth.length + 1, styles: { halign: 'center', fontStyle: 'bold' } }
            ]
        ];

        autoTable(doc, {
            startY: 45,
            head: tableHeaders,
            body: tableBody,
            foot: footerRows,
            theme: 'grid',
            styles: {
                fontSize: 7, // Small font to fit 31 columns
                cellPadding: 1,
                halign: 'center',
                lineWidth: 0.1,
                lineColor: [0, 0, 0],
                textColor: [0, 0, 0]
            },
            headStyles: {
                fillColor: [240, 240, 240],
                textColor: 0,
                fontStyle: 'bold'
            },
            footStyles: {
                fillColor: [245, 245, 245],
                textColor: 0
            },
            columnStyles: {
                0: { halign: 'left', cellWidth: 35 },
                1: { cellWidth: 10 },
                2: { cellWidth: 12 },
                // Total Qty column (last)
                [daysInMonth.length + 3]: { fontStyle: 'bold', cellWidth: 15 }
            }
        });

        doc.save(`Summary-${selectedCustomer}-${format(new Date(year, month - 1), 'MMM-yyyy')}.pdf`);
    };

    return (
        <div className="ledger-container">
            <div className="filter-card">
                <div className="filter-row">
                    <div className="filter-group">
                        <label>Select Hotel / Party</label>
                        <select value={selectedCustomer} onChange={(e) => setSelectedCustomer(e.target.value)}>
                            <option value="">-- Select Party --</option>
                            {customers.map(c => <option key={c._id} value={c.name}>{c.name}</option>)}
                        </select>
                    </div>
                    <div className="filter-group">
                        <label>Month</label>
                        <select value={month} onChange={(e) => setMonth(parseInt(e.target.value))}>
                            {Array.from({ length: 12 }, (_, i) => (
                                <option key={i + 1} value={i + 1}>{format(new Date(2000, i, 1), 'MMMM')}</option>
                            ))}
                        </select>
                    </div>
                    <div className="filter-group">
                        <label>Year</label>
                        <select value={year} onChange={(e) => setYear(parseInt(e.target.value))}>
                            {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                    </div>
                    <button className="search-btn" onClick={handleSearch} disabled={loading}>
                        {loading ? 'Generating...' : <><TableIcon size={18} /> Generate Summary</>}
                    </button>
                </div>
            </div>

            {itemsGrid.length > 0 && (
                <div className="ledger-content" style={{ overflowX: 'auto' }}>
                    <div className="ledger-header-info">
                        <h2>{selectedCustomer.toUpperCase()} SUMMARY</h2>
                        <p>{format(new Date(year, month - 1, 1), 'MMMM yyyy')}</p>
                    </div>

                    <table className="ledger-table summary-table" style={{ fontSize: '0.9rem' }}>
                        <thead>
                            <tr>
                                <th style={{ minWidth: '150px' }}>Items Description</th>
                                <th>UOM</th>
                                <th>Rate</th>
                                {daysInMonth.map(d => (
                                    <th key={d.toString()}>{getDate(d)}</th>
                                ))}
                                <th>Total Qty</th>
                            </tr>
                        </thead>
                        <tbody>
                            {itemsGrid.map((item, index) => (
                                <tr key={index}>
                                    <td style={{ textAlign: 'left', fontWeight: 'bold' }}>{item.name.toUpperCase()}</td>
                                    <td>{item.unit}</td>
                                    <td>{item.rate.toFixed(2)}</td>
                                    {daysInMonth.map(d => {
                                        const day = getDate(d);
                                        return (
                                            <td key={day}>
                                                {item.quantities[day] || ''}
                                            </td>
                                        );
                                    })}
                                    <td style={{ fontWeight: 'bold' }}>{item.totalQty.toFixed(2)}</td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr>
                                <td colSpan="3" className="label-cell">Amount</td>
                                {daysInMonth.map(d => {
                                    const day = getDate(d);
                                    return (
                                        <td key={day} className="amount-cell" style={{ fontSize: '0.8rem' }}>
                                            {dateAmounts[day] ? dateAmounts[day].toFixed(2) : ''}
                                        </td>
                                    );
                                })}
                                <td className="bold">{grandTotal.toFixed(2)}</td>
                            </tr>
                            <tr className="grand-total-row">
                                <td colSpan="3" className="label-cell">Total</td>
                                <td colSpan={daysInMonth.length + 1} style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '1.2rem' }}>
                                    {grandTotal.toFixed(2)}
                                </td>
                            </tr>
                        </tfoot>
                    </table>

                    <div className="actions" style={{ marginTop: '20px' }}>
                        <button className="download-btn" onClick={generatePDF}>
                            <Download size={20} /> Download Summary PDF
                        </button>
                    </div>
                </div>
            )}

            {itemsGrid.length === 0 && !loading && selectedCustomer && (
                <div className="no-records">
                    <Layout size={48} />
                    <p>No transactions found for this period.</p>
                </div>
            )}
        </div>
    );
}

export default Summary;
