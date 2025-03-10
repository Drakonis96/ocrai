// frontend/src/components/ModelSelector.js
import React from 'react';

function ModelSelector({ models, selectedModel, setSelectedModel }) {
  return (
    <label style={{ marginLeft: '10px' }}>
      Model:
      <select value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)} style={{ marginLeft: '10px' }}>
        {models.map((model, index) => (
          <option key={index} value={model}>{model}</option>
        ))}
      </select>
    </label>
  );
}

export default ModelSelector;
