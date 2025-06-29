// frontend/src/components/CompressionSettings.js
import React from 'react';

function CompressionSettings({ 
  compressionEnabled, 
  setCompressionEnabled, 
  targetDpi, 
  setTargetDpi, 
  quality, 
  setQuality, 
  format, 
  setFormat, 
  keepOriginal, 
  setKeepOriginal 
}) {
  return (
    <div className="card compression-settings">
      <div className="card-header">
        <div className="checkbox-container">
          <input
            type="checkbox"
            id="compression-enabled"
            checked={compressionEnabled}
            onChange={(e) => setCompressionEnabled(e.target.checked)}
          />
          <label htmlFor="compression-enabled" className="checkbox-custom"></label>
          <label htmlFor="compression-enabled" className="checkbox-label">
            🗜️ Enable Image Compression
          </label>
        </div>
        <p style={{ 
          fontSize: '0.875rem', 
          color: 'var(--gray-600)', 
          margin: '0.5rem 0 0 0',
          lineHeight: 1.4 
        }}>
          Optimize image size while maintaining quality
        </p>
      </div>
      
      {compressionEnabled && (
        <div className="compression-options">
          <div className="config-grid">
            <div className="form-group">
              <label className="form-label">Target DPI</label>
              <select
                value={targetDpi}
                onChange={(e) => setTargetDpi(parseInt(e.target.value))}
                className="form-select"
              >
                <option value={72}>72 DPI (Web quality)</option>
                <option value={150}>150 DPI (Good balance)</option>
                <option value={200}>200 DPI (High quality)</option>
                <option value={300}>300 DPI (Print quality)</option>
              </select>
            </div>
            
            <div className="form-group">
              <label className="form-label">Compression Format</label>
              <select
                value={format}
                onChange={(e) => setFormat(e.target.value)}
                className="form-select"
              >
                <option value="JPEG">JPEG (smaller files)</option>
                <option value="PNG">PNG (lossless)</option>
              </select>
            </div>
          </div>
          
          {format === 'JPEG' && (
            <div className="form-group">
              <label className="form-label">
                JPEG Quality: {quality}%
              </label>
              <input
                type="range"
                min="50"
                max="100"
                value={quality}
                onChange={(e) => setQuality(parseInt(e.target.value))}
                className="quality-slider"
              />
              <div className="slider-labels">
                <span>Lower size</span>
                <span>Higher quality</span>
              </div>
            </div>
          )}
          
          <div className="checkbox-container">
            <input
              type="checkbox"
              id="keep-original"
              checked={keepOriginal}
              onChange={(e) => setKeepOriginal(e.target.checked)}
            />
            <label htmlFor="keep-original" className="checkbox-custom"></label>
            <label htmlFor="keep-original" className="checkbox-label">
              Keep original file metadata
            </label>
          </div>
          
          <div className="compression-benefits">
            <h4>💡 Benefits</h4>
            <ul>
              <li>Reduced file size for faster sharing</li>
              <li>Lower storage requirements</li>
              <li>Maintains readability while optimizing size</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

export default CompressionSettings;
