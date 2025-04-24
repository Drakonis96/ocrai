// frontend/src/components/ProgressBar.js
import React from 'react';

function ProgressBar({ progress, status }) {
  const containerStyle = {
    height: '20px',
    width: '100%',
    backgroundColor: '#e0e0de',
    borderRadius: '50px',
    margin: '10px 0'
  };

  const fillerStyle = {
    height: '100%',
    width: `${progress}%`,
    backgroundColor: progress === 100 ? 'green' : '#76c7c0',
    borderRadius: 'inherit',
    textAlign: 'right',
    transition: 'width 0.5s ease-in-out'
  };

  const labelStyle = {
    padding: '5px',
    color: 'white',
    fontWeight: 'bold'
  };

  return (
    <div>
      <div style={containerStyle}>
        <div style={fillerStyle}>
          <span style={labelStyle}>{`${progress}%`}</span>
        </div>
      </div>
      {status && (
        <div style={{ marginTop: '5px', textAlign: 'center', fontWeight: 'bold', color: '#333' }}>
          {status}
        </div>
      )}
    </div>
  );
}

export default ProgressBar;
