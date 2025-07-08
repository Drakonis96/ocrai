// frontend/src/components/ProgressBar.js
import React from 'react';

function ProgressBar({ progress, status, currentPage, totalPages }) {
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

      {totalPages > 0 && (
        <div className="progress-pages">
          Page {currentPage} of {totalPages}
        </div>
      )}

      {status && (
        <div className="progress-text">
          {status}
        </div>
      )}
    </div>
  );
}

export default ProgressBar;
