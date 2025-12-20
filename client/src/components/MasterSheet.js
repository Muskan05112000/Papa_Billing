import React, { useState, useEffect } from 'react';
import { fetchMasterSheets, createMasterSheet, fetchNextMasterSheetNo, fetchItems } from '../services/api';
import { Plus, Trash2, Download, Save, RotateCw } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';

function MasterSheet({ setView }) {
    const [sheetNo, setSheetNo] = useState(1);
    const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [vehicleNo, setVehicleNo] = useState('');
    const [headers, setHeaders] = useState(() => {
        const saved = localStorage.getItem('master_headers');
        return saved ? JSON.parse(saved) : ['OM', 'JP', 'LAT'];
    });
    const [rows, setRows] = useState(() => {
        const saved = localStorage.getItem('master_rows');
        if (saved) {
            const parsedRows = JSON.parse(saved);
            // Keep names but reset all quantities to 0
            return parsedRows.map(row => ({
                ...row,
                values: row.values.map(() => 0),
                total: 0
            }));
        }
        return [{ name: '', values: new Array(headers.length || 3).fill(0), total: 0 }];
    });
    const [masterItems, setMasterItems] = useState([]);
    const [loading, setLoading] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [voiceFeedback, setVoiceFeedback] = useState('');

    // Persistence for Headers and Item Names (but not quantities)
    useEffect(() => {
        localStorage.setItem('master_headers', JSON.stringify(headers));
        localStorage.setItem('master_rows', JSON.stringify(rows));
    }, [headers, rows]);

    useEffect(() => {
        loadInitialData();
    }, []);

    const loadInitialData = async () => {
        try {
            const [sheetRes, itemsRes] = await Promise.all([
                fetchNextMasterSheetNo(),
                fetchItems()
            ]);
            setSheetNo(sheetRes.data.nextSheetNo);
            setMasterItems(itemsRes.data);
        } catch (err) {
            console.error(err);
        }
    };

    const addColumn = () => {
        const name = prompt("Enter Hotel/Party Name:");
        if (name) {
            setHeaders([...headers, name]);
            setRows(rows.map(row => ({
                ...row,
                values: [...row.values, 0]
            })));
        }
    };

    const removeColumn = (index) => {
        if (!window.confirm(`Remove column "${headers[index]}"?`)) return;
        const newHeaders = headers.filter((_, i) => i !== index);
        setHeaders(newHeaders);
        setRows(rows.map(row => ({
            ...row,
            values: row.values.filter((_, i) => i !== index)
        })));
    };

    const renameColumn = (index) => {
        const oldName = headers[index];
        const newName = prompt("Rename Hotel/Party:", oldName);
        if (newName && newName !== oldName) {
            const newHeaders = [...headers];
            newHeaders[index] = newName;
            setHeaders(newHeaders);
        }
    };

    const addRow = () => {
        setRows([...rows, { name: '', values: new Array(headers.length).fill(0), total: 0 }]);
    };

    const removeRow = (index) => {
        setRows(rows.filter((_, i) => i !== index));
    };

    const handleValueChange = (rowIndex, colIndex, value) => {
        const newRows = [...rows];
        const val = parseFloat(value) || 0;
        newRows[rowIndex].values[colIndex] = val;
        newRows[rowIndex].total = newRows[rowIndex].values.reduce((a, b) => a + b, 0);
        setRows(newRows);
    };

    const handleItemChange = (rowIndex, name) => {
        const newRows = [...rows];
        newRows[rowIndex].name = name;
        setRows(newRows);
    };

    const getTotalQty = () => rows.reduce((acc, row) => acc + row.total, 0);

    const processMasterCommand = async (cmd, recognitionInstance) => {
        const fullCmd = cmd.toLowerCase();

        // Stop commands
        if (fullCmd.includes('stop') || fullCmd.includes('finish') || fullCmd.includes('done') || fullCmd.includes('end')) {
            if (recognitionInstance) recognitionInstance.stop();
            setVoiceFeedback("Voice recognition stopped.");
            return;
        }

        const parts = cmd.split(/ and |, /i);

        for (let part of parts) {
            part = part.trim();
            if (!part) continue;

            // 1. Add Hotel: "Add hotel OM"
            const addHotelMatch = part.match(/(?:add|new)\s+hotel\s+(.+)/i);
            if (addHotelMatch) {
                const name = addHotelMatch[1].trim().toUpperCase();
                setHeaders(prev => {
                    if (prev.includes(name)) return prev;
                    const newHeaders = [...prev, name];
                    setRows(r => r.map(row => ({ ...row, values: [...row.values, 0] })));
                    return newHeaders;
                });
                setVoiceFeedback(`Added hotel: ${name}`);
                continue;
            }

            // 2. Rename Hotel: "Rename hotel OM to OM 1"
            const renameMatch = part.match(/rename\s+hotel\s+(.+?)\s+to\s+(.+)/i);
            if (renameMatch) {
                const oldName = renameMatch[1].trim().toUpperCase();
                const newName = renameMatch[2].trim().toUpperCase();
                setHeaders(prev => {
                    const idx = prev.findIndex(h => h.toUpperCase() === oldName);
                    if (idx !== -1) {
                        const newHeaders = [...prev];
                        newHeaders[idx] = newName;
                        return newHeaders;
                    }
                    return prev;
                });
                setVoiceFeedback(`Renamed ${oldName} to ${newName}`);
                continue;
            }

            // 3. Delete Hotel: "Delete hotel OM"
            const deleteHotelMatch = part.match(/delete\s+hotel\s+(.+)/i);
            if (deleteHotelMatch) {
                const name = deleteHotelMatch[1].trim().toUpperCase();
                setHeaders(prev => {
                    const idx = prev.findIndex(h => h.toUpperCase() === name);
                    if (idx !== -1) {
                        const newHeaders = prev.filter((_, i) => i !== idx);
                        setRows(r => r.map(row => ({
                            ...row,
                            values: row.values.filter((_, i) => i !== idx)
                        })));
                        return newHeaders;
                    }
                    return prev;
                });
                setVoiceFeedback(`Deleted hotel: ${name}`);
                continue;
            }

            // 4. Add Item: "Add item TOMATO" or "item TOMATO" or "Add items A, B, C"
            const addItemMatch = part.match(/(?:(?:add|new)\s+)?items?\s+(.+)/i);
            if (addItemMatch) {
                const itemList = addItemMatch[1].split(/, | and /i);
                setRows(prev => {
                    let newRows = [...prev];
                    itemList.forEach(itemText => {
                        const name = itemText.trim().toUpperCase();
                        if (name && !newRows.find(r => r.name.toUpperCase() === name)) {
                            newRows.push({ name: name, values: new Array(headers.length).fill(0), total: 0 });
                        }
                    });
                    return newRows;
                });
                setVoiceFeedback(`Added item(s): ${itemList.join(', ')}`);
                continue;
            }

            // 5. Update Qty/Item for Hotel: "10kg Tomato for OM" or "Tomato 10 for OM"
            const dataMatch = part.match(/(\d+(?:\.\d+)?)\s*([a-z]+)?\s+(.+?)\s+for\s+(.+)/i) ||
                part.match(/(.+?)\s+(\d+(?:\.\d+)?)\s*([a-z]+)?\s+for\s+(.+)/i);

            if (dataMatch) {
                let qty, item, hotel;
                if (dataMatch[1].match(/^\d/)) { // Qty first
                    qty = parseFloat(dataMatch[1]);
                    item = dataMatch[3].trim().toLowerCase();
                    hotel = dataMatch[4].trim().toUpperCase();
                } else { // Item first
                    item = dataMatch[1].trim().toLowerCase();
                    qty = parseFloat(dataMatch[2]);
                    hotel = dataMatch[4].trim().toUpperCase();
                }

                const hotelIdx = headers.findIndex(h => h.toUpperCase() === hotel);
                if (hotelIdx !== -1) {
                    setRows(prevRows => {
                        const newRows = [...prevRows];
                        let itemIdx = newRows.findIndex(r => r.name.toLowerCase() === item);

                        if (itemIdx === -1) {
                            // Add new row if not found
                            newRows.push({ name: item, values: new Array(headers.length).fill(0), total: 0 });
                            itemIdx = newRows.length - 1;
                        }

                        newRows[itemIdx].values[hotelIdx] = qty;
                        newRows[itemIdx].total = newRows[itemIdx].values.reduce((a, b) => a + b, 0);
                        return newRows;
                    });
                    setVoiceFeedback(`Updated ${item} for ${hotel}: ${qty}`);
                } else {
                    setVoiceFeedback(`Hotel ${hotel} not found.`);
                }
                continue;
            }
        }
    };

    const handleSave = async () => {
        setLoading(true);
        try {
            const data = {
                sheetNo,
                date,
                vehicleNo,
                headerColumns: headers,
                dataRows: rows,
                totalQty: getTotalQty()
            };
            await createMasterSheet(data);
            alert("Master Sheet Saved Successfully!");
            generatePDF(data);
            // Navigate to New Bill tab
            if (setView) setView('billing');
        } catch (err) {
            alert("Error saving sheet: " + (err.response?.data?.message || err.message));
        } finally {
            setLoading(false);
        }
    };

    const startSpeech = () => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            alert("Speech recognition is not supported in this browser. Please use Chrome.");
            return;
        }

        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = false;
        recognition.lang = 'en-IN';

        recognition.onstart = () => {
            setIsListening(true);
            setVoiceFeedback("Listening... (Say 'Stop' to end)");
        };

        recognition.onresult = (event) => {
            const transcript = event.results[event.results.length - 1][0].transcript;
            processMasterCommand(transcript, recognition);
        };

        recognition.onerror = (event) => {
            console.error(event.error);
            setIsListening(false);
            setVoiceFeedback("Error: " + event.error);
        };

        recognition.onend = () => {
            setIsListening(false);
            setVoiceFeedback("");
        };

        recognition.start();
    };

    const generatePDF = (data) => {
        const doc = new jsPDF('l', 'mm', 'a4'); // Landscape
        const rowsPerPage = 25;
        const totalRows = data.dataRows.length;
        const totalPages = Math.ceil(totalRows / rowsPerPage) || 1;

        const drawHeader = (doc, pageNum) => {
            // --- Header Section ---
            doc.setFont("helvetica", "bold");
            doc.setFontSize(18);
            doc.setTextColor(0, 0, 139); // Dark Blue
            doc.text("RAJ TRADING CO.", 148.5, 10, { align: "center" });

            doc.setFontSize(9);
            doc.setTextColor(0, 0, 0);
            doc.text("B-946, NEW SUBZI MANDI, AZADPUR, DELHI-110033", 148.5, 14, { align: "center" });

            // 1. MASTER SHEET Header Row (Boxed)
            doc.setLineWidth(0.2);
            doc.rect(10, 16, 277, 6);
            doc.setFontSize(12);
            doc.text("M  A  S  T  E  R      S  H  E  E  T", 148.5, 20.5, { align: "center" });

            // 2 & 3. Combined SHEET No., DATE & VEHICLE NO Box
            doc.rect(10, 22, 277, 12); // Single box for two logical rows
            doc.setFontSize(10);
            doc.text(`SHEET No.  :    ${data.sheetNo}`, 12, 27);
            const dateStr = `DATE : ${format(new Date(data.date), 'EEEE, dd MM, yyyy')}`;
            doc.text(dateStr, 285, 27, { align: 'right' });

            doc.setFont("helvetica", "bold");
            doc.text(`VEHICLE NO : ${data.vehicleNo}`, 12, 33);

            if (totalPages > 1) {
                doc.setFontSize(8);
                doc.text(`Page ${pageNum} of ${totalPages}`, 285, 10, { align: 'right' });
            }
        };

        for (let i = 0; i < totalPages; i++) {
            if (i > 0) doc.addPage();
            drawHeader(doc, i + 1);

            const startIdx = i * rowsPerPage;
            const endIdx = Math.min(startIdx + rowsPerPage, totalRows);
            const chunk = data.dataRows.slice(startIdx, endIdx);

            const tableHeaders = ['S.N.', 'HOTELS / AREA', ...data.headerColumns, 'TOT QTY.'];
            const tableBody = chunk.map((row, idx) => [
                startIdx + idx + 1,
                row.name.toUpperCase(),
                ...row.values.map(v => v > 0 ? v.toFixed(2) : ''),
                row.total.toFixed(2)
            ]);

            const isLastPage = (i === totalPages - 1);
            const tableFoot = isLastPage ? [
                [
                    '',
                    'TOTAL',
                    ...data.headerColumns.map((_, colIndex) => {
                        const colTotal = data.dataRows.reduce((sum, row) => sum + (row.values[colIndex] || 0), 0);
                        return colTotal > 0 ? colTotal.toFixed(2) : '';
                    }),
                    data.totalQty.toFixed(2)
                ],
                [
                    '',
                    'NO. OF ITEMS',
                    ...data.headerColumns.map((_, colIndex) => {
                        const itemCount = data.dataRows.filter(row => (row.values[colIndex] || 0) > 0).length;
                        return itemCount > 0 ? itemCount : '';
                    }),
                    ''
                ]
            ] : null;

            autoTable(doc, {
                startY: 34,
                head: [tableHeaders],
                body: tableBody,
                foot: tableFoot,
                theme: 'grid',
                styles: {
                    fontSize: 8,
                    cellPadding: 1.5,
                    halign: 'center',
                    lineWidth: 0.1,
                    lineColor: [0, 0, 0],
                    textColor: [0, 0, 0]
                },
                columnStyles: {
                    0: { cellWidth: 10 },
                    1: { halign: 'left', fontStyle: 'bold', cellWidth: 45 }
                },
                headStyles: {
                    fillColor: [220, 220, 220],
                    textColor: 0,
                    lineWidth: 0.2,
                    fontStyle: 'bold'
                },
                footStyles: {
                    fillColor: [240, 240, 240],
                    textColor: 0,
                    fontStyle: 'bold',
                    lineWidth: 0.2
                },
                margin: { left: 10, right: 10 }
            });
        }

        doc.save(`Master-Sheet-${data.sheetNo}.pdf`);
    };

    return (
        <div className="master-sheet">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h2>Create Master Sheet</h2>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={addColumn} className="secondary" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <Plus size={16} /> Add Hotel
                    </button>
                    <button onClick={addRow} className="secondary" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <Plus size={16} /> Add Item
                    </button>
                    <button
                        onClick={startSpeech}
                        className={`voice-btn ${isListening ? 'listening' : ''}`}
                        style={{ display: 'flex', alignItems: 'center', gap: '5px' }}
                    >
                        <Plus size={16} /> {isListening ? 'Listening...' : 'Voice Entry'}
                    </button>
                    <button onClick={() => {
                        if (window.confirm("Clear all items and reset numbers? (Hotels will stay)")) {
                            setRows([{ name: '', values: new Array(headers.length).fill(0), total: 0 }]);
                        }
                    }} style={{ background: '#ff4d4f' }}>
                        Reset Quantities
                    </button>
                </div>
            </div>

            {voiceFeedback && (
                <div style={{
                    padding: '10px',
                    marginBottom: '10px',
                    backgroundColor: isListening ? '#fff2f0' : '#f6ffed',
                    border: '1px solid',
                    borderColor: isListening ? '#ffccc7' : '#b7eb8f',
                    borderRadius: '5px',
                    textAlign: 'center',
                    fontWeight: 'bold'
                }}>
                    📢 {voiceFeedback}
                </div>
            )}

            <div className="bill-header" style={{ marginBottom: '20px' }}>
                <div style={{ position: 'relative', width: '120px' }}>
                    <label>Sheet No</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <input value={sheetNo} disabled style={{ backgroundColor: '#f9f9f9' }} />
                        <button onClick={async () => {
                            const res = await fetchNextMasterSheetNo();
                            setSheetNo(res.data.nextSheetNo);
                        }} style={{ padding: '8px', background: 'transparent', color: '#333', border: 'none' }}>
                            <RotateCw size={16} />
                        </button>
                    </div>
                </div>
                <div>
                    <label>Date</label>
                    <input type="date" value={date} onChange={e => setDate(e.target.value)} />
                </div>
                <div>
                    <label>Vehicle No</label>
                    <input value={vehicleNo} onChange={e => setVehicleNo(e.target.value)} placeholder="e.g. DL 1LC 1234" />
                </div>
            </div>

            <div style={{ overflowX: 'auto', border: '1px solid #ddd', borderRadius: '8px' }}>
                <table className="master-grid">
                    <thead>
                        <tr>
                            <th style={{ width: '40px' }}>S.N.</th>
                            <th style={{ width: '400px', minWidth: '400px' }}>HOTELS / AREA</th>
                            {headers.map((h, i) => (
                                <th key={i} style={{ position: 'relative', minWidth: '70px' }}>
                                    <span
                                        onClick={() => renameColumn(i)}
                                        style={{ cursor: 'pointer', display: 'block' }}
                                        title="Click to rename"
                                    >
                                        {h}
                                    </span>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); removeColumn(i); }}
                                        style={{
                                            position: 'absolute',
                                            top: -2,
                                            right: -2,
                                            padding: '2px 5px',
                                            fontSize: '10px',
                                            background: '#ff4d4f',
                                            borderRadius: '50%',
                                            lineHeight: 1
                                        }}
                                        title="Remove Hotel"
                                    >
                                        ×
                                    </button>
                                </th>
                            ))}
                            <th style={{ width: '100px' }}>TOT QTY.</th>
                            <th style={{ width: '50px' }}></th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row, rowIndex) => (
                            <tr key={rowIndex}>
                                <td>{rowIndex + 1}</td>
                                <td>
                                    <input
                                        list="master-item-list"
                                        value={row.name}
                                        onChange={e => handleItemChange(rowIndex, e.target.value)}
                                        placeholder="Item Name"
                                        style={{
                                            width: '100%',
                                            padding: '10px',
                                            fontSize: '1.2rem',
                                            fontWeight: 'bold',
                                            textTransform: 'uppercase',
                                            border: '1px solid #ccc',
                                            boxSizing: 'border-box'
                                        }}
                                    />
                                    <datalist id="master-item-list">
                                        {masterItems.map(m => <option key={m._id} value={m.name} />)}
                                    </datalist>
                                </td>
                                {row.values.map((val, colIndex) => (
                                    <td key={colIndex} style={{ minWidth: '70px', padding: '5px' }}>
                                        <input
                                            type="number"
                                            value={val || ''}
                                            onChange={e => handleValueChange(rowIndex, colIndex, e.target.value)}
                                            style={{
                                                textAlign: 'center',
                                                padding: '8px 2px',
                                                fontSize: '1.1rem',
                                                border: '1px solid #ddd',
                                                outline: 'none',
                                                width: '100%',
                                                fontWeight: '500'
                                            }}
                                        />
                                    </td>
                                ))}
                                <td style={{ fontWeight: 'bold' }}>{row.total.toFixed(2)}</td>
                                <td>
                                    <button onClick={() => removeRow(rowIndex)} style={{ color: 'red', background: 'none' }}>
                                        <Trash2 size={16} />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot>
                        <tr>
                            <td colSpan={2} style={{ textAlign: 'right', fontWeight: 'bold' }}>TOTAL:</td>
                            {headers.map((_, colIndex) => {
                                const colTotal = rows.reduce((sum, row) => sum + (parseFloat(row.values[colIndex]) || 0), 0);
                                return (
                                    <td key={colIndex} style={{ fontWeight: 'bold', textAlign: 'center', fontSize: '1rem' }}>
                                        {colTotal > 0 ? colTotal.toFixed(2) : ''}
                                    </td>
                                );
                            })}
                            <td style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{getTotalQty().toFixed(2)}</td>
                            <td></td>
                        </tr>
                        <tr>
                            <td colSpan={2} style={{ textAlign: 'right', fontWeight: 'bold' }}>NO. OF ITEMS:</td>
                            {headers.map((_, colIndex) => {
                                const itemCount = rows.filter(row => (parseFloat(row.values[colIndex]) || 0) > 0).length;
                                return (
                                    <td key={colIndex} style={{ fontWeight: 'bold', textAlign: 'center' }}>
                                        {itemCount > 0 ? itemCount : ''}
                                    </td>
                                );
                            })}
                            <td></td>
                            <td></td>
                        </tr>
                    </tfoot>
                </table>
            </div>

            <div className="actions" style={{ marginTop: '20px' }}>
                <button onClick={handleSave} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 25px' }}>
                    {loading ? 'Saving...' : <><Save size={20} /> Save & Download PDF</>}
                </button>
            </div>
        </div>
    );
}

export default MasterSheet;
