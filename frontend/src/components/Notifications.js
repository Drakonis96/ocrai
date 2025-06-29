// frontend/src/components/Notifications.js
import React, { useState } from 'react';

function Notifications({ notifications, onClear }) {
  const [isOpen, setIsOpen] = useState(false);
  const toggleOpen = () => setIsOpen(!isOpen);
  const unseenCount = notifications.length;

  return (
    <div className="notifications-container">
      {isOpen && notifications.length > 0 && (
        <div className="notifications-panel">
          <div className="notifications-header">
            <h3 className="notifications-title">
              Recent Activities
            </h3>
            <div className="notifications-actions">
              <button 
                onClick={onClear} 
                className="btn btn-sm btn-secondary"
              >
                Clear All
              </button>
              <button 
                onClick={toggleOpen} 
                className="notification-close"
              >
                ✕
              </button>
            </div>
          </div>
          
          <div className="notifications-list">
            {notifications.map((note, index) => (
              <div key={index} className="notification">
                <div className="notification-content">
                  <div className="notification-icon">
                    {note.includes('❌') ? '❌' : 
                     note.includes('✅') ? '✅' : 
                     note.includes('⚠️') ? '⚠️' : '📄'}
                  </div>
                  <div className="notification-message">
                    {note}
                  </div>
                </div>
                <div className="notification-time">
                  {new Date().toLocaleTimeString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* Floating notification button */}
      <button
        onClick={toggleOpen}
        className={`notification-toggle ${unseenCount > 0 ? 'has-notifications' : ''}`}
        title="View notifications"
      >
        🔔
        {unseenCount > 0 && (
          <span className="notification-badge">
            {unseenCount > 99 ? '99+' : unseenCount}
          </span>
        )}
      </button>
    </div>
  );
}

export default Notifications;
