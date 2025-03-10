// frontend/src/components/Notifications.js
import React, { useState } from 'react';

function Notifications({ notifications, onClear }) {
  const [isOpen, setIsOpen] = useState(false);
  const toggleOpen = () => setIsOpen(!isOpen);
  const unseenCount = notifications.length;

  return (
    <div style={{ position: 'fixed', bottom: '10px', right: '10px' }}>
      <div style={{ position: 'relative', display: 'inline-block' }}>
        <button
          onClick={toggleOpen}
          style={{ fontSize: '24px', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          🔔
          {unseenCount > 0 && (
            <span style={{
              position: 'absolute',
              top: '-5px',
              right: '-5px',
              background: 'red',
              color: 'white',
              borderRadius: '50%',
              padding: '2px 6px',
              fontSize: '12px'
            }}>
              {unseenCount}
            </span>
          )}
        </button>
      </div>
      {isOpen && (
        <div style={{
          position: 'absolute',
          right: 0,
          bottom: '40px',
          width: '300px',
          maxHeight: '400px',
          overflowY: 'auto',
          border: '1px solid #ccc',
          borderRadius: '8px',
          padding: '10px',
          backgroundColor: '#fff',
          boxShadow: '0 2px 5px rgba(0,0,0,0.3)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h4 style={{ margin: 0 }}>Notifications</h4>
            <button onClick={onClear} style={{ fontSize: '12px', padding: '2px 5px' }}>Clear</button>
          </div>
          {notifications.length === 0 ? (
            <p>No notifications.</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0 }}>
              {notifications.map((note, index) => (
                <li key={index} style={{ marginBottom: '5px' }}>{note}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export default Notifications;
