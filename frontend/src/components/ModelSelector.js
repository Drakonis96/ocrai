// frontend/src/components/ModelSelector.js
import React from 'react';

function ModelSelector({ models, selectedModel, setSelectedModel }) {
  return (
    <div className="form-group">
      <label className="form-label">AI Model</label>
      <select
        value={selectedModel}
        onChange={(e) => setSelectedModel(e.target.value)}
        className="form-select"
      >
        {models.map((model, index) => (
          <option key={index} value={model}>
            {model}
          </option>
        ))}
      </select>
      <p style={{ 
        fontSize: '0.75rem', 
        color: 'var(--gray-500)', 
        margin: '0.5rem 0 0 0',
        lineHeight: 1.4 
      }}>
        Choose the AI model for processing your documents
      </p>
    </div>
  );
}

export default ModelSelector;
