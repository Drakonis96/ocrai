// frontend/src/App.js
import React, { useState } from 'react';
import FileUpload from './components/FileUpload';
import FileList from './components/FileList';
import Configurations from './components/Configurations';
import TxtToPdf from './components/TxtToPdf';
import Notifications from './components/Notifications';

function App() {
  const [activeTab, setActiveTab] = useState('ocrAI');
  const [notifications, setNotifications] = useState([]);

  const handleJobCompleted = (notification) => {
    setNotifications(prev => [...prev, notification]);
  };

  const clearNotifications = () => {
    setNotifications([]);
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo-container">
          <img src="/logo.png" alt="Logo" className="app-logo" />
          <h1 className="app-title">ocrAI</h1>
        </div>
      </header>
      <nav className="app-nav">
        <button
          onClick={() => setActiveTab('ocrAI')}
          className={activeTab === 'ocrAI' ? 'active tab-processing' : 'tab-processing'}
        >
          💡 ocrAI
        </button>
        <button
          onClick={() => setActiveTab('files')}
          className={activeTab === 'files' ? 'active tab-default' : 'tab-default'}
        >
          📁 Processed Files
        </button>
        <button
          onClick={() => setActiveTab('configurations')}
          className={activeTab === 'configurations' ? 'active tab-default' : 'tab-default'}
        >
          ⚙️ Configurations
        </button>
        <button
          onClick={() => setActiveTab('txttopdf')}
          className={activeTab === 'txttopdf' ? 'active tab-txttopdf' : 'tab-txttopdf'}
        >
          📝 TXT to PDF
        </button>
      </nav>
      <main>
        {activeTab === 'ocrAI' && <FileUpload onJobCompleted={handleJobCompleted} />}
        {activeTab === 'files' && <FileList />}
        {activeTab === 'configurations' && <Configurations />}
        {activeTab === 'txttopdf' && <TxtToPdf />}
      </main>
      <Notifications notifications={notifications} onClear={clearNotifications} />
    </div>
  );
}

export default App;
