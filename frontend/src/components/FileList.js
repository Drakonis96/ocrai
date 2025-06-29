// frontend/src/components/FileList.js
import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_URL = '/api';

// Utility function to format file size
const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// Utility function to format date
const formatDate = (timestamp) => {
  const date = new Date(timestamp * 1000);
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
};

function FileList() {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchFiles = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_URL}/files`);
      setFiles(response.data.files);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFiles();
  }, []);

  const handleDownload = (filename) => {
    window.location.href = `${API_URL}/files/${filename}`;
  };

  const handleDelete = async (filename) => {
    if (window.confirm("Are you sure you want to delete this file?")) {
      try {
        await axios.delete(`${API_URL}/files/${filename}`);
        fetchFiles();
      } catch (err) {
        console.error(err);
      }
    }
  };

  const handleDeleteAll = async () => {
    if (window.confirm("Are you sure you want to delete ALL files? This action cannot be undone.")) {
      try {
        await axios.delete(`${API_URL}/files/all`);
        fetchFiles();
      } catch (err) {
        console.error(err);
      }
    }
  };

  // Group files by base name (without extension)
  const groupedFiles = files.reduce((groups, fileObj) => {
    const filename = fileObj.name;
    const base = filename.replace(/\.[^.]+$/, '');
    if (!groups[base]) {
      groups[base] = [];
    }
    groups[base].push(fileObj);
    return groups;
  }, {});

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
        Loading files...
      </div>
    );
  }

  return (
    <div className="file-list-container">
      {Object.keys(groupedFiles).length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📁</div>
          <h3 className="empty-state-title">No files processed yet</h3>
          <p className="empty-state-description">
            Upload and process some documents to see them here
          </p>
        </div>
      ) : (
        <>
          <div className="files-grid">
            {Object.keys(groupedFiles).map(base => (
              <div key={base} className="file-group">
                <h3 className="file-group-title">{base}</h3>
                <div className="file-buttons">
                  {groupedFiles[base].map((fileObj, index) => {
                    const filename = fileObj.name;
                    const fileExtension = filename.split('.').pop().toLowerCase();
                    const isOriginal = !filename.includes('_ocr');
                    
                    return (
                      <div key={index} className="file-button-group">
                        <div className="file-info">
                          <button 
                            onClick={() => handleDownload(filename)} 
                            className="button-download"
                            title={`Download ${filename}`}
                          >
                            📥 Download
                          </button>
                          <div className="file-metadata">
                            <span className="file-size">{formatFileSize(fileObj.size)}</span>
                            <span className="file-date">Processed: {formatDate(fileObj.modified)}</span>
                          </div>
                        </div>
                        <button 
                          onClick={() => handleDelete(filename)} 
                          className="button-delete"
                          title={`Delete ${filename}`}
                        >
                          🗑️
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          
          <div className="file-actions">
            <button
              onClick={handleDeleteAll}
              className="btn btn-danger"
            >
              🗑️ Delete All Files
            </button>
            <button
              onClick={fetchFiles}
              className="btn btn-secondary"
            >
              🔄 Refresh
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default FileList;
