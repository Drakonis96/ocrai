// frontend/src/components/ProgressBar.js
import React from 'react';

function ProgressBar({ progress, status }) {
  return (
    <div className="progress-wrapper">
      <div className="progress-header">
        <span className="progress-label">Processing Progress</span>
        <span className="progress-percentage">{progress}%</span>
      </div>
      
      <div className="progress-container">
        <div 
          className="progress-bar"
          style={{ width: `${progress}%` }}
        />
      </div>
      
      {status && (
        <div className="progress-text">
          {status}
        </div>
      )}
    </div>
  );
}

export default ProgressBar;
