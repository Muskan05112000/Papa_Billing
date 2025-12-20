import React, { useState } from 'react';
import './App.css';
import Billing from './components/Billing';
import MasterList from './components/MasterList';
import MasterSheet from './components/MasterSheet';
import History from './components/History';
import Ledger from './components/Ledger';
import Summary from './components/Summary';

function App() {
  const [view, setView] = useState('billing'); // billing, master, history, master-sheet, ledger, summary

  return (
    <div className="container">
      <header>
        <h1 style={{ color: '#00008B', fontFamily: 'Arial, sans-serif', fontWeight: 'bold' }}>RAJ TRADING CO.</h1>
        <h3 style={{ margin: '5px 0', fontSize: '1.2rem', fontWeight: 'bold' }}>FRESH FRUITS & VEGEABLES SUPPLIERS</h3>
        <div className="address">
          E-Mail:ausdelhi056@gmail.com<br />
          B-946,NEW SUBZI MANDI AZADPUR,DELHI-110033 MOB.:9650065539
        </div>
      </header>

      <div className="nav-tabs">
        <button className={view === 'billing' ? 'active' : ''} onClick={() => setView('billing')}>New Bill</button>
        <button className={view === 'master-sheet' ? 'active' : ''} onClick={() => setView('master-sheet')}>Master Sheet</button>
        <button className={view === 'ledger' ? 'active' : ''} onClick={() => setView('ledger')}>Ledger</button>
        <button className={view === 'summary' ? 'active' : ''} onClick={() => setView('summary')}>Summary</button>
        <button className={view === 'master' ? 'active' : ''} onClick={() => setView('master')}>Items (Master)</button>
        <button className={view === 'history' ? 'active' : ''} onClick={() => setView('history')}>Brief History</button>
      </div>

      {view === 'billing' && <Billing />}
      {view === 'master-sheet' && <MasterSheet setView={setView} />}
      {view === 'ledger' && <Ledger />}
      {view === 'summary' && <Summary />}
      {view === 'master' && <MasterList />}
      {view === 'history' && <History />}

    </div>
  );
}

export default App;
