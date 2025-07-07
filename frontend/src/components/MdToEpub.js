// frontend/src/components/MdToEpub.js
import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_URL = '/api';

function MdToEpub() {
  const [mdFiles, setMdFiles] = useState([]);
  const [selectedFile, setSelectedFile] = useState('');
  const [message, setMessage] = useState('');
  const [epubFile, setEpubFile] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchMdFiles();
  }, []);

  const fetchMdFiles = async () => {
    try {
      const res = await axios.get(`${API_URL}/files`);
      const files = res.data.files
        .filter(f => f.name.toLowerCase().endsWith('.md'))
        .map(f => f.name);
      setMdFiles(files);
    } catch (err) {
      console.error(err);
      setMessage('❌ Error loading Markdown files.');
    }
  };

  const handleConversion = async () => {
    if (!selectedFile) {
      setMessage('⚠️ Please select a Markdown file.');
      return;
    }

    setLoading(true);
    setMessage('🔄 Converting Markdown to EPUB...');

    try {
      const res = await axios.post(`${API_URL}/mdtoepub`, { filename: selectedFile });
      setMessage(res.data.message);
      setEpubFile(res.data.epub_file);
    } catch (err) {
      console.error(err);
      setMessage('❌ Error converting Markdown to EPUB.');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    if (epubFile) {
      window.location.href = `${API_URL}/files/${epubFile}`;
    }
  };

  return (
    <div className="txt-to-pdf-container">
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Markdown to EPUB Converter</h3>
          <p style={{ color: 'var(--gray-600)', fontSize: '0.875rem', margin: 0 }}>
            Convert your Markdown files to EPUB format
          </p>
        </div>

        <div className="form-group">
          <label className="form-label">Select Markdown File</label>
          <select
            value={selectedFile}
            onChange={(e) => setSelectedFile(e.target.value)}
            className="form-select"
            disabled={loading}
          >
            <option value="">-- Choose a .md file --</option>
            {mdFiles.map((file, idx) => (
              <option key={idx} value={file}>{file}</option>
            ))}
          </select>
          {mdFiles.length === 0 && (
            <p style={{
              fontSize: '0.875rem',
              color: 'var(--gray-500)',
              margin: '0.5rem 0 0 0',
              fontStyle: 'italic'
            }}>
              No Markdown files found. Process some documents first.
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
              <>📚 Convert to EPUB</>
            )}
          </button>

          <button
            onClick={fetchMdFiles}
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

      {epubFile && (
        <div className="card success-card">
          <div className="card-header">
            <h4 className="card-title">✅ Conversion Complete</h4>
          </div>
          <div className="conversion-result">
            <div className="file-info">
              <div className="file-icon">📚</div>
              <div className="file-details">
                <p className="file-name">{epubFile}</p>
                <p className="file-description">Your EPUB is ready for download</p>
              </div>
            </div>
            <button
              onClick={handleDownload}
              className="btn btn-success"
            >
              📥 Download EPUB
            </button>
          </div>
        </div>
      )}

      {mdFiles.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon">📄</div>
          <h3 className="empty-state-title">No Markdown files available</h3>
          <p className="empty-state-description">
            Process some documents first to generate Markdown files that can be converted to EPUB
          </p>
        </div>
      )}
    </div>
  );
}

export default MdToEpub;
