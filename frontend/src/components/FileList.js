// frontend/src/components/FileList.js
import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_URL = '/api';

function FileList() {
  const [files, setFiles] = useState([]);

  const fetchFiles = () => {
    axios.get(`${API_URL}/files`)
      .then(response => setFiles(response.data.files))
      .catch(err => console.error(err));
  };

  useEffect(() => {
    fetchFiles();
  }, []);

  const handleDownload = (filename) => {
    window.location.href = `${API_URL}/files/${filename}`;
  };

  const handleDelete = (filename) => {
    if (window.confirm("Are you sure you want to delete this file?")) {
      axios.delete(`${API_URL}/files/${filename}`)
        .then(response => fetchFiles())
        .catch(err => console.error(err));
    }
  };

  const handleDeleteAll = () => {
    if (window.confirm("Are you sure you want to delete ALL files? This action cannot be undone.")) {
      axios.delete(`${API_URL}/files/all`)
        .then(response => fetchFiles())
        .catch(err => console.error(err));
    }
  };

  // Group files by base name (without extension)
  const groupedFiles = files.reduce((groups, file) => {
    const base = file.replace(/\.[^.]+$/, '');
    if (!groups[base]) {
      groups[base] = [];
    }
    groups[base].push(file);
    return groups;
  }, {});

  return (
    <div style={{ textAlign: 'left', maxWidth: '600px', margin: '0 auto' }}>
      <h2>Processed Files</h2>
      {Object.keys(groupedFiles).length === 0 ? (
        <p>No files available.</p>
      ) : (
        <>
          {Object.keys(groupedFiles).map(base => (
            <div key={base} className="file-group">
              <h3 className="file-group-title">{base}</h3>
              <div className="file-buttons">
                {groupedFiles[base].map((file, index) => (
                  <div key={index}>
                    <button onClick={() => handleDownload(file)} className="button-download">
                      📥
                    </button>
                    <button onClick={() => handleDelete(file)} className="button-delete">
                      🗑️
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <button
            onClick={handleDeleteAll}
            style={{
              marginTop: '20px',
              backgroundColor: 'red',
              color: 'white',
              padding: '10px',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer'
            }}
          >
            Delete All Files
          </button>
        </>
      )}
    </div>
  );
}

export default FileList;
