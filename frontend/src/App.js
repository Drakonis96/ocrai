// frontend/src/App.js
import React, { useState } from 'react';
import FileUpload from './components/FileUpload';
import FileList from './components/FileList';
import Configurations from './components/Configurations';
import TxtToPdf from './components/TxtToPdf';
import MdToEpub from './components/MdToEpub';
import Notifications from './components/Notifications';
import LayoutOcr from './components/LayoutOcr';

function App() {
  const [activeTab, setActiveTab] = useState('ocrAI');
  const [notifications, setNotifications] = useState([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleJobCompleted = (notification) => {
    setNotifications(prev => [...prev, notification]);
  };

  const clearNotifications = () => {
    setNotifications([]);
  };

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setSidebarOpen(false); // Close sidebar on mobile when tab is selected
  };

  const navigationItems = [
    { id: 'ocrAI', label: 'OCR AI Processing', icon: '🤖', description: 'Upload and process documents with AI' },
    { id: 'files', label: 'Processed Files', icon: '📁', description: 'View and manage processed files' },
    { id: 'configurations', label: 'Settings', icon: '⚙️', description: 'Configure application settings' },
    { id: 'layout', label: 'Layout OCR', icon: '🗺️', description: 'Detect and edit document areas' },
    { id: 'txttopdf', label: 'TXT to PDF', icon: '📝', description: 'Convert text files to PDF' },
    { id: 'mdtoepub', label: 'MD to EPUB', icon: '📚', description: 'Convert Markdown files to EPUB' }
  ];

  return (
    <div className="app">
      {/* Mobile overlay */}
      {sidebarOpen && <div className="sidebar-overlay" onClick={toggleSidebar}></div>}
      
      {/* Header */}
      <header className="header">
        <div className="header-content">
          <button className="hamburger-menu" onClick={toggleSidebar}>
            <span></span>
            <span></span>
            <span></span>
          </button>
          <div className="logo-section">
            <img src="/logo.png" alt="Logo" className="app-logo" />
            <h1 className="app-title">ocrAI</h1>
          </div>
          <div className="header-actions">
            <div className="notification-badge">
              {notifications.length > 0 && (
                <span className="badge">{notifications.length}</span>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <nav className="sidebar-nav">
          {navigationItems.map((item) => (
            <button
              key={item.id}
              onClick={() => handleTabChange(item.id)}
              className={`nav-item ${activeTab === item.id ? 'nav-item-active' : ''}`}
            >
              <span className="nav-icon">{item.icon}</span>
              <div className="nav-content">
                <span className="nav-label">{item.label}</span>
                <span className="nav-description">{item.description}</span>
              </div>
            </button>
          ))}
        </nav>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        <div className="page-container">
          <div className="page-header">
            <h2 className="page-title">
              {navigationItems.find(item => item.id === activeTab)?.label}
            </h2>
            <p className="page-description">
              {navigationItems.find(item => item.id === activeTab)?.description}
            </p>
          </div>
          
          <div className="page-content">
            {activeTab === 'ocrAI' && <FileUpload onJobCompleted={handleJobCompleted} />}
            {activeTab === 'files' && <FileList />}
            {activeTab === 'configurations' && <Configurations />}
            {activeTab === 'layout' && <LayoutOcr />}
            {activeTab === 'txttopdf' && <TxtToPdf />}
            {activeTab === 'mdtoepub' && <MdToEpub />}
          </div>
        </div>
      </main>

      <Notifications notifications={notifications} onClear={clearNotifications} />
    </div>
  );
}

export default App;
