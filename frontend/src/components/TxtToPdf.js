// frontend/src/components/TxtToPdf.js
import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_URL = '/api';

function TxtToPdf() {
  const [txtFiles, setTxtFiles] = useState([]);
  const [selectedFile, setSelectedFile] = useState('');
  const [message, setMessage] = useState('');
  const [pdfFile, setPdfFile] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchTxtFiles();
  }, []);

  const fetchTxtFiles = async () => {
    try {
      const response = await axios.get(`${API_URL}/files`);
      const files = response.data.files
        .filter(fileObj => fileObj.name.toLowerCase().endsWith('.txt') || fileObj.name.toLowerCase().endsWith('.md'))
        .map(fileObj => fileObj.name);
      setTxtFiles(files);
    } catch (err) {
      console.error(err);
      setMessage("❌ Error loading text files.");
    }
  };

  const handleConversion = async () => {
    if (!selectedFile) {
      setMessage("⚠️ Please select a text file (.txt or .md).");
      return;
    }
    
    setLoading(true);
    setMessage("🔄 Converting text file to PDF...");
    
    try {
      const response = await axios.post(`${API_URL}/txttopdf`, { filename: selectedFile });
      setMessage(response.data.message);
      setPdfFile(response.data.pdf_file);
    } catch (err) {
      setMessage("❌ Error converting text file to PDF.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    if (pdfFile) {
      window.location.href = `${API_URL}/files/${pdfFile}`;
    }
  };

  return (
    <div className="txt-to-pdf-container">
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Text to PDF Converter</h3>
          <p style={{ color: 'var(--gray-600)', fontSize: '0.875rem', margin: 0 }}>
            Convert your text files to PDF format
          </p>
        </div>

        <div className="form-group">
          <label className="form-label">Select Text File</label>
          <select
            value={selectedFile}
            onChange={(e) => setSelectedFile(e.target.value)}
            className="form-select"
            disabled={loading}
          >
            <option value="">-- Choose a text file --</option>
            {txtFiles.map((file, index) => (
              <option key={index} value={file}>{file}</option>
            ))}
          </select>
          {txtFiles.length === 0 && (
            <p style={{ 
              fontSize: '0.875rem', 
              color: 'var(--gray-500)', 
              margin: '0.5rem 0 0 0',
              fontStyle: 'italic' 
            }}>
              No text files found. Process some documents first.
            </p>
          )}
        </div>

        <div className="form-actions">
          <button 
            onClick={handleConversion} 
            className="btn btn-primary"
            disabled={!selectedFile || loading}
          >
            {loading ? (
              <>
                <div className="spinner"></div>
                Converting...
              </>
            ) : (
              <>📄 Convert to PDF</>
            )}
          </button>
          
          <button 
            onClick={fetchTxtFiles} 
            className="btn btn-secondary"
            disabled={loading}
          >
            🔄 Refresh Files
          </button>
        </div>
      </div>

      {message && (
        <div className={`alert ${message.includes('❌') ? 'alert-error' : 
                                message.includes('⚠️') ? 'alert-warning' : 'alert-info'}`}>
          {message}
        </div>
      )}

      {pdfFile && (
        <div className="card success-card">
          <div className="card-header">
            <h4 className="card-title">✅ Conversion Complete</h4>
          </div>
          <div className="conversion-result">
            <div className="file-info">
              <div className="file-icon">📄</div>
              <div className="file-details">
                <p className="file-name">{pdfFile}</p>
                <p className="file-description">Your PDF is ready for download</p>
              </div>
            </div>
            <button 
              onClick={handleDownload}
              className="btn btn-success"
            >
              📥 Download PDF
            </button>
          </div>
        </div>
      )}

      {txtFiles.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon">📝</div>
          <h3 className="empty-state-title">No text files available</h3>
          <p className="empty-state-description">
            Process some documents first to generate text files that can be converted to PDF
          </p>
        </div>
      )}
    </div>
  );
}

export default TxtToPdf;
