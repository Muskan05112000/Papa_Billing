import React, { useState, useEffect } from 'react';
import { fetchItems, fetchNextBillNo, createBill, fetchCustomers, addCustomer, fetchCustomerItems, fetchMasterSheetByDate } from '../services/api';
import { Mic, MicOff, Trash2, RotateCw } from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';

const HOTEL_CODE_MAP = {
    'Omex': 'OMX',
    'Latango': 'LAT',
    'Latango Bar': 'LAT_B',
    'Japanico': 'JAP',
    'Japanico Bar': 'JAP_B',
    'Perch': 'PER',
    'Perch Bar': 'PER_B',
    'Carnatic Cafe': 'CC',
    'Refuge': 'REF',
    'Korner 27': 'TRE',
    'Manam': 'MAN',
    'Cellar and Cup': 'C&C',
    'KaliGhata': 'KAG',
    'KaliGhata 2': 'KAG2',
    'Behind the Bar': 'BTB'
};

function Billing() {
    const [billNo, setBillNo] = useState(1);
    const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [customer, setCustomer] = useState({ name: '', address: '' });
    const [rows, setRows] = useState([{ name: '', unit: '', qty: '', rate: '', amount: 0 }]);
    const [masterItems, setMasterItems] = useState([]);
    const [customers, setCustomers] = useState([]);
    const [customerItems, setCustomerItems] = useState([]);
    const [loading, setLoading] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [voiceFeedback, setVoiceFeedback] = useState('');

    const saveAndExport = async (type) => {
        if (loading) return;
        setLoading(true);

        const billData = {
            billNo,
            date,
            customer,
            items: rows,
            totalAmount: getTotal()
        };

        try {
            await createBill(billData);
            if (type === 'excel') generateExcel(billData);
            else if (type === 'pdf') generatePDF(billData);

            alert('Bill Saved & Exported!');
            setRows([{ name: '', unit: '', qty: '', rate: '', amount: 0 }]);
            setCustomer({ name: '', address: '' });
            loadInitialData();
        } catch (err) {
            console.error(err);
            if (err.response && err.response.status === 409) {
                alert("Duplicate Bill Number! Fetching the correct next number... Please try saving again.");
                const billRes = await fetchNextBillNo();
                setBillNo(billRes.data.nextBillNo);
            } else {
                alert(`Error: ${err.message}`);
            }
        } finally {
            setLoading(false);
        }
    };

    const calculateRowAmount = (qty, rate, unit) => {
        const q = parseFloat(qty) || 0;
        const r = parseFloat(rate) || 0;
        const u = unit?.toLowerCase().trim();
        if (u === 'gm' || u === 'gms' || u === 'gram' || u === 'grams') {
            return (q * r) / 1000;
        }
        return q * r;
    };

    useEffect(() => {
        loadInitialData();
    }, []);

    useEffect(() => {
        if (customer && customer.name) {
            handleCustomerChange(customer.name);
        }
    }, [date]);

    const loadInitialData = async () => {
        try {
            const [itemsRes, billRes, custRes] = await Promise.all([
                fetchItems(),
                fetchNextBillNo(),
                fetchCustomers()
            ]);
            setMasterItems(itemsRes.data);
            setBillNo(billRes.data.nextBillNo);
            setCustomers(custRes.data);
        } catch (err) {
            console.error(err);
        }
    };

    const handleCustomerChange = async (name) => {
        // Resolve abbreviation to full name if applicable
        let resolvedName = name;
        const entry = Object.entries(HOTEL_CODE_MAP).find(([fullName, abbr]) =>
            abbr.toUpperCase() === name.trim().toUpperCase()
        );
        if (entry) {
            resolvedName = entry[0];
        }

        setCustomer(prev => ({ ...(prev || { name: '', address: '' }), name: resolvedName }));
        if (resolvedName.trim()) {
            try {
                const res = await fetchCustomerItems(resolvedName);
                setCustomerItems(res.data);

                // If the selected name matches an existing customer, auto-fill address
                const existing = customers.find(c => c.name.toLowerCase() === resolvedName.toLowerCase());
                if (existing) {
                    setCustomer({ name: existing.name, address: existing.address });
                }

                // Fetch data from Master Sheet for the selected date
                const sheetRes = await fetchMasterSheetByDate(date);
                if (sheetRes.data) {
                    const sheet = sheetRes.data;
                    const code = HOTEL_CODE_MAP[resolvedName] || resolvedName.toUpperCase();
                    const colIndex = sheet.headerColumns.findIndex(h => h.trim().toUpperCase() === code.trim().toUpperCase());

                    if (colIndex !== -1) {
                        const newRows = sheet.dataRows
                            .filter(row => (parseFloat(row.values[colIndex]) || 0) > 0)
                            .map(row => {
                                const qty = parseFloat(row.values[colIndex]) || 0;
                                const itemName = row.name.trim();

                                // Auto-fill rate and unit
                                let rate = 0;
                                let unit = 'Kg';

                                // Find Item in Master List for baseline
                                const mi = masterItems.find(i => i.name.trim().toLowerCase() === itemName.toLowerCase());
                                if (mi) {
                                    rate = mi.defaultRate;
                                    unit = mi.unit;
                                }

                                // Override with Customer Price if exists and is > 0
                                const cp = res.data.find(i => i.itemName.trim().toLowerCase() === itemName.toLowerCase());
                                if (cp && cp.rate > 0) {
                                    rate = cp.rate;
                                    unit = cp.unit;
                                }

                                return {
                                    name: itemName,
                                    unit: unit,
                                    qty: qty,
                                    rate: rate,
                                    amount: calculateRowAmount(qty, rate, unit)
                                };
                            });

                        setRows(newRows.length > 0 ? newRows : [{ name: '', unit: '', qty: '', rate: '', amount: 0 }]);
                    } else {
                        setRows([{ name: '', unit: '', qty: '', rate: '', amount: 0 }]);
                    }
                } else {
                    setRows([{ name: '', unit: '', qty: '', rate: '', amount: 0 }]);
                }
            } catch (err) {
                console.error("Error fetching data:", err);
            }
        } else {
            setCustomerItems([]);
            setRows([{ name: '', unit: '', qty: '', rate: '', amount: 0 }]);
        }
    };

    const handleItemChange = (index, value) => {
        const newRows = [...rows];
        newRows[index].name = value;

        // Autosuggest logic
        if (value.length > 0) {
            const searchVal = value.trim().toLowerCase();
            let rate = 0;
            let unit = 'Kg';

            // 1. Check Master List for baseline
            const mi = masterItems.find(i => i.name.trim().toLowerCase() === searchVal);
            if (mi) {
                rate = mi.defaultRate;
                unit = mi.unit;
            }

            // 2. Override with Customer Specific Prices if exists and is > 0
            const cp = customerItems.find(i => i.itemName.trim().toLowerCase() === searchVal);
            if (cp && cp.rate > 0) {
                rate = cp.rate;
                unit = cp.unit;
            }

            newRows[index].unit = unit;
            newRows[index].rate = rate;
            newRows[index].amount = calculateRowAmount(newRows[index].qty, rate, unit);
        }
        setRows(newRows);
    };

    const handleCalc = (index, field, value) => {
        const newRows = [...rows];
        newRows[index][field] = value;

        // Auto Calculate Amount using helper
        newRows[index].amount = calculateRowAmount(newRows[index].qty, newRows[index].rate, newRows[index].unit);

        setRows(newRows);
    };

    const addRow = () => {
        setRows([...rows, { name: '', unit: '', qty: '', rate: '', amount: 0 }]);
    };

    const removeRow = (index) => {
        const newRows = rows.filter((_, i) => i !== index);
        setRows(newRows);
    };

    const getTotal = () => rows.reduce((acc, row) => acc + row.amount, 0);

    // --- Voice Logic for Billing ---
    const startSpeech = () => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            alert("Your browser does not support Speech Recognition. Please use Chrome.");
            return;
        }

        const recognition = new SpeechRecognition();
        recognition.lang = 'en-IN';
        recognition.interimResults = false;
        recognition.continuous = true; // Stay active to hear multiple items

        recognition.onstart = () => {
            setIsListening(true);
            setVoiceFeedback('Listening... Say vegetables or "Stop" to finish.');
        };

        recognition.onresult = async (event) => {
            // In continuous mode, results are in an array
            const lastIndex = event.results.length - 1;
            const transcript = event.results[lastIndex][0].transcript.toLowerCase();
            setVoiceFeedback(`Heard: "${transcript}"`);
            await processCommand(transcript, recognition);
        };

        recognition.onerror = (event) => {
            if (event.error === 'no-speech') return; // Ignore silent pauses in continuous mode
            setIsListening(false);
            setVoiceFeedback(`Error: ${event.error}`);
        };

        recognition.onend = () => {
            setIsListening(false);
        };

        recognition.start();
    };

    const processCommand = async (cmd, recognitionInstance) => {
        // Stop/End Command
        if (cmd.includes('stop') || cmd.includes('finish') || cmd.includes('end') || cmd.includes('done')) {
            if (recognitionInstance) recognitionInstance.stop();
            setVoiceFeedback("Voice recognition stopped.");
            return;
        }

        // Split by "and" or commas to handle multiple items in one go
        const parts = cmd.split(/ and |, /);

        for (let part of parts) {
            part = part.trim();
            if (!part) continue;

            // 1. Set Customer: "Customer John" or "Customer name is John"
            const custMatch = part.match(/(?:customer|customer name is)\s+(.+)/i);
            if (custMatch) {
                const name = custMatch[1].trim();
                handleCustomerChange(name);
                setVoiceFeedback(`Set Customer to: ${name}`);
                continue;
            }

            // 2. Add Item: "Add 10kg Tomato" or "Add Tomato 5kg" or "Tomato quantity is 10"
            const addPattern1 = /(?:add\s+)?(\d+(?:\.\d+)?)\s*([a-z]+)?\s+(.+)/i;
            const addPattern2 = /(?:add\s+)?(.+)\s+(\d+(?:\.\d+)?)\s*([a-z]+)?/i;
            const addPattern3 = /(.+)\s+quantity\s+is\s+(\d+(?:\.\d+)?)\s*([a-z]+)?/i;

            let match;
            let qty, unit, itemName;

            if ((match = part.match(addPattern3))) {
                const [_, iVal, qVal, uVal] = match;
                itemName = iVal; qty = qVal; unit = uVal;
            } else if ((match = part.match(addPattern1)) && !isNaN(parseFloat(match[1]))) {
                const [_, qVal, uVal, iVal] = match;
                qty = qVal; unit = uVal; itemName = iVal;
            } else if ((match = part.match(addPattern2))) {
                const [_, iVal, qVal, uVal] = match;
                itemName = iVal; qty = qVal; unit = uVal;
            }

            if (qty && itemName) {
                const q = parseFloat(qty);
                const u = unit ? unit.charAt(0).toUpperCase() + unit.slice(1) : 'Kg';
                const item = itemName.trim();

                setRows(currentRows => {
                    const newRows = (currentRows && currentRows.length > 0) ? [...currentRows] : [{ name: '', unit: '', qty: '', rate: '', amount: 0 }];
                    let lastRow = newRows[newRows.length - 1];

                    if (lastRow && lastRow.name && lastRow.name !== item) {
                        newRows.push({ name: '', unit: '', qty: '', rate: '', amount: 0 });
                        lastRow = newRows[newRows.length - 1];
                    }

                    if (lastRow) {
                        lastRow.name = item;
                        lastRow.qty = q;
                        lastRow.unit = u;

                        const custPriceMatch = (customerItems || []).find(i => i.itemName && i.itemName.toLowerCase() === item.toLowerCase());
                        if (custPriceMatch) {
                            lastRow.rate = custPriceMatch.rate;
                            lastRow.amount = calculateRowAmount(q, custPriceMatch.rate, u);
                        } else {
                            const masterMatch = (masterItems || []).find(i => i.name && i.name.toLowerCase() === item.toLowerCase());
                            if (masterMatch) {
                                lastRow.rate = masterMatch.defaultRate;
                                lastRow.amount = calculateRowAmount(q, masterMatch.defaultRate, u);
                            }
                        }
                    }
                    return newRows;
                });

                setVoiceFeedback(`Added ${q} ${u} ${item}`);
                continue;
            }

            // 3. Save: "Save as PDF", "Download PDF", "Save Bill"
            if (part.includes('save') || part.includes('pdf') || part.includes('download')) {
                setVoiceFeedback("Saving and downloading PDF...");
                saveAndExport('pdf');
                continue;
            }

            // 4. Reset: "Clear bill", "New bill"
            if (part.includes('new bill') || part.includes('clear')) {
                setRows([{ name: '', unit: '', qty: '', rate: '', amount: 0 }]);
                setCustomer({ name: '', address: '' });
                setVoiceFeedback("Bill Cleared");
                continue;
            }
        }
    };



    const generateExcel = (data) => {
        const ws = XLSX.utils.json_to_sheet(data.items.map((item, i) => ({
            'Sr No': i + 1,
            'Item Name': item.name,
            'Unit': item.unit,
            'Quantity': item.qty,
            'Rate': item.rate,
            'Amount': item.amount
        })));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Bill");
        XLSX.writeFile(wb, `Bill-${data.billNo}.xlsx`);
    };

    const generatePDF = (data) => {
        const doc = new jsPDF();

        // --- 1. Outer Box ---
        doc.rect(5, 5, 200, 287); // Main border

        // --- 2. Header Section ---
        doc.setFont("helvetica", "bold");
        doc.setFontSize(22);
        doc.setTextColor(0, 0, 139); // Dark Blue
        doc.text("RAJ TRADING CO.", 105, 18, { align: "center" });

        doc.setFontSize(11);
        doc.setTextColor(0, 0, 0); // Black
        doc.text("FRESH FRUITS & VEGEABLES SUPPLIERS", 105, 24, { align: "center" });

        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.text("E-Mail:ausdelhi056@gmail.com", 105, 29, { align: "center" });
        doc.text("B-946,NEW SUBZI MANDI AZADPUR,DELHI-110033 MOB.:9650065539", 105, 34, { align: "center" });

        // --- 3. Bill / Original Strip ---
        doc.rect(5, 36, 200, 7); // Row box
        doc.setFillColor(200, 200, 200); // Grey background
        doc.rect(5, 36, 200, 7, 'F'); // Fill
        doc.rect(5, 36, 200, 7); // Border again to be sure

        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.text("BILL", 105, 41, { align: "center" });
        doc.text("Original", 195, 41, { align: "right" });

        // --- 4. Party & Bill Details ---
        doc.rect(5, 43, 200, 20); // Info box

        // Left Side: Party
        doc.setFontSize(9);
        doc.text("PARTY NAME & ADDRESS :", 7, 48);
        doc.setFontSize(12);
        doc.text(data.customer.name.toUpperCase(), 7, 55);
        // doc.text(data.customer.address, 7, 60); // Optional if needed

        // Vertical Divider
        doc.line(130, 43, 130, 63);

        // Right Side: Bill Info
        doc.setFontSize(10);
        doc.text("BILL NO", 132, 48);
        doc.setFontSize(11);
        doc.text(`: ${data.billNo}`, 160, 48);

        doc.setFontSize(10);
        doc.text("DATE", 132, 55);
        doc.setFontSize(11);
        doc.text(`: ${format(new Date(data.date), 'dd-MMM-yyyy')}`, 160, 55);

        // --- 5. Table ---
        autoTable(doc, {
            startY: 63,
            margin: { left: 5 },
            tableWidth: 200, // Force width to match outer box
            theme: 'grid',
            headStyles: {
                fillColor: [220, 220, 220],
                textColor: 0,
                fontStyle: 'bold',
                lineWidth: 0.1,
                lineColor: 0,
                halign: 'center' // Default header alignment
            },
            bodyStyles: {
                lineWidth: 0.1,
                lineColor: 0,
                textColor: 0
            },
            styles: {
                font: "helvetica",
                fontSize: 10,
                cellPadding: 1.5, // Increased padding
                overflow: 'linebreak'
            },
            columnStyles: {
                0: { cellWidth: 10, halign: 'center' }, // SNo
                1: { cellWidth: 20, halign: 'center' }, // HSN
                2: { cellWidth: 60, halign: 'left' },   // Description (Adjusted)
                3: { cellWidth: 20, halign: 'right' },  // Kg 
                4: { cellWidth: 15, halign: 'left' },   // Unit -> Ends at 10+20+60+20+15 = 125
                5: { cellWidth: 35, halign: 'right' },  // Rate (Wider)
                6: { cellWidth: 40, halign: 'right' }   // Amount (Wider)
            },
            head: [['SNo', 'HSN Code', 'ITEM DESCRIPTION', 'Kg.', 'Unit', 'RATE', 'AMOUNT']],
            body: data.items.map((item, i) => [
                i + 1,
                '', // HSN Code placeholder
                item.name.toUpperCase(),
                Number(item.qty).toFixed(2),
                item.unit,
                Number(item.rate).toFixed(2),
                Number(item.amount).toFixed(2)
            ]),
            foot: [[
                '',
                { content: 'TOTAL :', colSpan: 2, styles: { halign: 'right' } },
                { content: Number(data.items.reduce((sum, i) => sum + Number(i.qty), 0)).toFixed(2), colSpan: 2, styles: { halign: 'right' } },
                '',
                Number(data.totalAmount).toFixed(2)
            ]],
            footStyles: {
                fillColor: [220, 220, 220],
                textColor: 0,
                fontStyle: 'bold',
                lineWidth: 0.1,
                lineColor: 0
            }
        });

        // --- 6. Footer (Remarks & Legal) ---
        let finalY = doc.lastAutoTable.finalY;

        // Ensure footer doesn't overflow page
        if (finalY > 240) {
            doc.addPage();
            finalY = 20;
            doc.rect(5, 5, 200, 287); // Border for new page
        }

        // Remarks & Discount Section
        // Split at x=130 (Left: 5+125=130, Right: 130+75=205)
        doc.rect(5, finalY, 125, 15); // Remarks box left
        doc.rect(130, finalY, 75, 15); // Discount/Net box right

        // Remarks
        doc.setFontSize(9);
        doc.text("Remarks :", 7, finalY + 5);

        // Nett Amount Calculation
        doc.text("Discount", 132, finalY + 5);
        doc.line(130, finalY + 7, 205, finalY + 7);

        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(0, 0, 139);
        doc.text(`Nett :${Number(data.totalAmount).toFixed(2)}`, 167.5, finalY + 13, { align: "center" });
        doc.setTextColor(0, 0, 0);

        // --- 7. Terms & Signature ---
        const termsY = finalY + 15;
        doc.rect(5, termsY, 200, 30); // Main bottom box

        // Vertical split at 130 aligned with above
        doc.line(130, termsY, 130, termsY + 30);

        // Left: Terms
        doc.setFontSize(8);
        doc.setFont("times", "bold");
        doc.text("NOTE:", 7, termsY + 5);
        doc.setFont("times", "normal");
        doc.text("E & O.E.", 40, termsY + 5);

        doc.setFont("times", "italic");
        doc.text("In case of any quantity or rate difference please provide photocopy of bills", 7, termsY + 9);
        doc.text("with payment advice. All Transaction Are Subject to Delhi Jurisdiction.", 7, termsY + 13);

        doc.setFont("times", "bolditalic");
        doc.text("Your Satisfaction is our Concern.", 7, termsY + 18);

        doc.line(5, termsY + 22, 130, termsY + 22); // Divider
        doc.setFont("helvetica", "normal"); // Reset to helvetica for signatures
        doc.text("Giver's Signature", 7, termsY + 28);

        // Right: Receiver/Signature
        doc.text("Signature", 190, termsY + 28, { align: "right" });

        doc.save(`Bill-${data.billNo}.pdf`);
    };

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                <h2 style={{ margin: 0 }}>New Billing</h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <button
                        onClick={startSpeech}
                        className={isListening ? 'voice-active' : ''}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', borderRadius: '25px', padding: '8px 15px' }}
                    >
                        {isListening ? <Mic size={18} color="red" /> : <Mic size={18} />}
                        {isListening ? 'Listening...' : 'Voice Entry'}
                    </button>
                    {voiceFeedback && <span style={{ fontSize: '0.8rem', color: '#666' }}>{voiceFeedback}</span>}
                </div>
            </div>

            <div className="bill-header">
                <div style={{ position: 'relative', width: '120px' }}>
                    <label>Bill No</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <input value={billNo} disabled style={{ backgroundColor: '#f9f9f9' }} />
                        <button
                            type="button"
                            title="Refresh Bill Number"
                            className="print-hidden"
                            onClick={async () => {
                                const res = await fetchNextBillNo();
                                setBillNo(res.data.nextBillNo);
                            }}
                            style={{ padding: '8px', background: 'transparent', color: '#333', border: 'none' }}
                        >
                            <RotateCw size={16} />
                        </button>
                    </div>
                </div>
                <div>
                    <label>Date</label>
                    <input type="date" value={date} onChange={e => setDate(e.target.value)} />
                </div>
            </div>

            <div className="form-group">
                <label>Customer Name</label>
                <input
                    list="customer-list"
                    value={customer.name}
                    onChange={e => handleCustomerChange(e.target.value)}
                    placeholder="Enter/Select Name"
                />
                <datalist id="customer-list">
                    {customers.map(c => <option key={c._id} value={c.name} />)}
                </datalist>

                <label>Address</label>
                <input value={customer.address} onChange={e => setCustomer({ ...customer, address: e.target.value })} placeholder="Enter Address" />
            </div>

            <table>
                <thead>
                    <tr>
                        <th>Sr</th>
                        <th>Item Name</th>
                        <th>Unit</th>
                        <th>Qty</th>
                        <th>Rate</th>
                        <th>Amount</th>
                        <th className="print-hidden">Action</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row, index) => (
                        <tr key={index}>
                            <td>{index + 1}</td>
                            <td>
                                <input
                                    list={`items-${index}`}
                                    value={row.name}
                                    onChange={e => handleItemChange(index, e.target.value)}
                                    placeholder="Select Item"
                                />
                                <datalist id={`items-${index}`}>
                                    {customerItems.length > 0 && (
                                        <optgroup label="Frequently Bought">
                                            {customerItems.map(item => <option key={`cust-${item._id}`} value={item.itemName} />)}
                                        </optgroup>
                                    )}
                                    <optgroup label="Master List">
                                        {masterItems.map(m => <option key={m._id} value={m.name} />)}
                                    </optgroup>
                                </datalist>
                            </td>
                            <td>
                                <input
                                    list="unit-options"
                                    value={row.unit}
                                    onChange={e => handleCalc(index, 'unit', e.target.value)}
                                    placeholder="Unit"
                                    style={{ width: '70px' }}
                                />
                                <datalist id="unit-options">
                                    <option value="Kg" />
                                    <option value="Gm" />
                                    <option value="Pcs" />
                                    <option value="Doz" />
                                    <option value="Crate" />
                                    <option value="Sack" />
                                    <option value="Bunch" />
                                    <option value="Box" />
                                    <option value="Ton" />
                                </datalist>
                            </td>
                            <td><input type="number" value={row.qty} onChange={e => handleCalc(index, 'qty', e.target.value)} /></td>
                            <td><input type="number" value={row.rate} onChange={e => handleCalc(index, 'rate', e.target.value)} /></td>
                            <td>{Number(row.amount).toFixed(2)}</td>
                            <td className="print-hidden">
                                <button className="secondary" onClick={() => removeRow(index)}>X</button>
                            </td>
                        </tr>
                    ))}
                </tbody>
                <tfoot>
                    <tr>
                        <td colSpan="5" style={{ textAlign: 'right' }}>Total:</td>
                        <td>{Number(getTotal()).toFixed(2)}</td>
                        <td></td>
                    </tr>
                </tfoot>
            </table>

            <button className="print-hidden" onClick={addRow}>+ Add Item</button>

            <div className="actions">
                <button
                    onClick={() => saveAndExport('excel')}
                    disabled={loading}
                    style={{ opacity: loading ? 0.5 : 1 }}
                >
                    {loading ? 'Saving...' : 'Save & Download Excel'}
                </button>
                <button
                    onClick={() => saveAndExport('pdf')}
                    disabled={loading}
                    style={{ opacity: loading ? 0.5 : 1 }}
                >
                    {loading ? 'Saving...' : 'Save & Download PDF'}
                </button>
            </div>
        </div>
    );
}

export default Billing;
