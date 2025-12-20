import React, { useState, useEffect } from 'react';
import { fetchCustomers, fetchLedger } from '../services/api';
import { format } from 'date-fns';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { FileText, Download, Search } from 'lucide-react';

function Ledger() {
    const [customers, setCustomers] = useState([]);
    const [selectedCustomer, setSelectedCustomer] = useState('');
    const [month, setMonth] = useState(new Date().getMonth() + 1);
    const [year, setYear] = useState(new Date().getFullYear());
    const [bills, setBills] = useState([]);
    const [prevBalance, setPrevBalance] = useState(0);
    const [loading, setLoading] = useState(false);
    const [prevMonthName, setPrevMonthName] = useState('');

    useEffect(() => {
        loadCustomers();
        const prevDate = new Date(year, month - 2, 1);
        setPrevMonthName(format(prevDate, 'MMMM'));
    }, [month, year]);

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
            setBills(res.data);
        } catch (err) {
            console.error('Error fetching ledger:', err);
            alert('Failed to fetch records');
        } finally {
            setLoading(false);
        }
    };

    const getTotalAmount = () => {
        return bills.reduce((sum, b) => sum + (b.totalAmount || 0), 0);
    };

    const getGrandTotal = () => {
        return getTotalAmount() + parseFloat(prevBalance || 0);
    };

    const generatePDF = () => {
        const doc = new jsPDF('p', 'mm', 'a4'); // Portrait
        const width = doc.internal.pageSize.getWidth();

        // --- Header Section ---
        doc.setFont("helvetica", "bold");
        doc.setFontSize(22);
        doc.setTextColor(0, 0, 0);
        doc.text("RAJ TRADING CO.", width / 2, 15, { align: "center" });

        doc.setFontSize(10);
        doc.text("B-946, New Sabji Mandi Azadpur, Delhi 110033", width / 2, 20, { align: "center" });
        doc.text("Email: ausdelhi056@gmail.com", width / 2, 24, { align: "center" });
        doc.text("Contact No. : 9650065539", width / 2, 28, { align: "center" });

        // --- Main Ledger Box ---
        const startY = 32;
        const boxWidth = 170;
        const marginX = (width - boxWidth) / 2;

        // Ledger Header Row
        doc.setLineWidth(0.5);
        doc.rect(marginX, startY, boxWidth, 8);
        doc.setFontSize(12);
        doc.text("Ledger", width / 2, startY + 5.5, { align: "center" });

        // Hotel Name Row
        doc.rect(marginX, startY + 8, boxWidth, 8);
        doc.setFontSize(11);
        doc.text(selectedCustomer.toUpperCase(), marginX + 2, startY + 13.5);

        // Table Data
        const tableHeaders = [['S NO.', 'DATE', 'BILL NO.', 'AMOUNT']];
        const tableBody = bills.map((b, i) => [
            i + 1,
            format(new Date(b.date), 'dd/MM/yyyy'),
            b.billNo,
            b.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        ]);

        autoTable(doc, {
            startY: startY + 16,
            head: tableHeaders,
            body: tableBody,
            marginX: marginX,
            theme: 'grid',
            styles: {
                fontSize: 10,
                cellPadding: 2,
                halign: 'center',
                lineWidth: 0.2,
                lineColor: [0, 0, 0],
                textColor: [0, 0, 0],
                font: 'helvetica'
            },
            headStyles: {
                fillColor: [255, 255, 255],
                textColor: 0,
                fontStyle: 'bold'
            },
            columnStyles: {
                0: { cellWidth: 20 },
                1: { cellWidth: 60 },
                2: { cellWidth: 40 },
                3: { cellWidth: 50, halign: 'right' }
            },
            margin: { left: marginX, right: marginX },
            tableWidth: boxWidth,
        });

        // Footer Section
        const finalY = doc.lastAutoTable.finalY;
        doc.rect(marginX, finalY, boxWidth, 8);
        doc.text("TOTAL", width / 2, finalY + 5.5, { align: 'center' });
        doc.setFont("helvetica", "bold");
        doc.text(getTotalAmount().toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), marginX + boxWidth - 2, finalY + 5.5, { align: 'right' });

        doc.rect(marginX, finalY + 8, boxWidth, 8);
        doc.setFont("helvetica", "normal");
        doc.text(`${prevMonthName}'s Balance`, width / 2, finalY + 13.5, { align: 'center' });
        doc.setFont("helvetica", "bold");
        doc.text(parseFloat(prevBalance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), marginX + boxWidth - 2, finalY + 13.5, { align: 'right' });

        doc.rect(marginX, finalY + 16, boxWidth, 8);
        doc.text("Grand Total", width / 2, finalY + 21.5, { align: 'center' });
        doc.text(getGrandTotal().toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), marginX + boxWidth - 2, finalY + 21.5, { align: 'right' });

        doc.save(`Ledger-${selectedCustomer}-${month}-${year}.pdf`);
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
                        {loading ? 'Searching...' : <><Search size={18} /> Get Records</>}
                    </button>
                </div>
            </div>

            {bills.length > 0 && (
                <div className="ledger-content">
                    <div className="ledger-header-info">
                        <h2>{selectedCustomer.toUpperCase()}</h2>
                        <p>{format(new Date(year, month - 1, 1), 'MMMM yyyy')}</p>
                    </div>

                    <table className="ledger-table">
                        <thead>
                            <tr>
                                <th>S.NO</th>
                                <th>DATE</th>
                                <th>BILL NO</th>
                                <th>AMOUNT</th>
                            </tr>
                        </thead>
                        <tbody>
                            {bills.map((bill, index) => (
                                <tr key={bill._id}>
                                    <td>{index + 1}</td>
                                    <td>{format(new Date(bill.date), 'dd/MM/yyyy')}</td>
                                    <td>{bill.billNo}</td>
                                    <td className="amount-cell">{bill.totalAmount.toFixed(2)}</td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr>
                                <td colSpan="3" className="label-cell">TOTAL</td>
                                <td className="amount-cell bold">{getTotalAmount().toFixed(2)}</td>
                            </tr>
                            <tr>
                                <td colSpan="3" className="label-cell">{prevMonthName}'s Balance</td>
                                <td className="amount-cell">
                                    <input
                                        type="number"
                                        value={prevBalance}
                                        onChange={(e) => setPrevBalance(e.target.value)}
                                        className="balance-input"
                                    />
                                </td>
                            </tr>
                            <tr className="grand-total-row">
                                <td colSpan="3" className="label-cell">Grand Total</td>
                                <td className="amount-cell bold">{getGrandTotal().toFixed(2)}</td>
                            </tr>
                        </tfoot>
                    </table>

                    <div className="actions" style={{ marginTop: '20px' }}>
                        <button className="download-btn" onClick={generatePDF}>
                            <Download size={20} /> Download Ledger PDF
                        </button>
                    </div>
                </div>
            )}

            {bills.length === 0 && !loading && selectedCustomer && (
                <div className="no-records">
                    <FileText size={48} />
                    <p>No billing records found for this period.</p>
                </div>
            )}
        </div>
    );
}

export default Ledger;
