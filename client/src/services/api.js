import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
const API = axios.create({ baseURL: API_BASE_URL });

export const fetchItems = () => API.get('/items');
export const addItem = (item) => API.post('/items', item);
export const deleteItem = (id) => API.delete(`/items/${id}`);

export const fetchCustomers = () => API.get('/customers');
export const addCustomer = (customer) => API.post('/customers', customer);
export const fetchCustomerItems = (name) => API.get(`/customers/${encodeURIComponent(name)}/items`);
export const fetchAllCustomerItems = () => API.get('/customers/all-items');
export const addCustomerItem = (data) => API.post('/customers/items', data);
export const deleteCustomerItem = (id) => API.delete(`/customers/items/${id}`);

export const fetchBills = () => API.get('/bills');
export const createBill = (bill) => API.post('/bills', bill);
export const deleteBill = (id) => API.delete(`/bills/${id}`);
export const fetchNextBillNo = () => API.get('/bills/next-number');
export const fetchLedger = (customer, month, year) => API.get('/bills/ledger', { params: { customer, month, year } });

export const fetchMasterSheets = () => API.get('/master-sheets');
export const createMasterSheet = (sheet) => API.post('/master-sheets', sheet);
export const fetchNextMasterSheetNo = () => API.get('/master-sheets/next-no');
export const fetchMasterSheetByDate = (date) => API.get('/master-sheets/by-date', { params: { date } });
