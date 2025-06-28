// frontend/src/components/TxtToPdf.js
import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_URL = '/api';

function TxtToPdf() {
  const [txtFiles, setTxtFiles] = useState([]);
  const [selectedFile, setSelectedFile] = useState('');
  const [message, setMessage] = useState('');
  const [pdfFile, setPdfFile] = useState('');

  useEffect(() => {
    // Obtener la lista de archivos y filtrar solo los .txt
    axios.get(`${API_URL}/files`)
      .then(response => {
        const files = response.data.files.filter(file => file.toLowerCase().endsWith('.txt'));
        setTxtFiles(files);
      })
      .catch(err => console.error(err));
  }, []);

  const handleConversion = () => {
    if (!selectedFile) {
      setMessage("⚠️ Please select a TXT file.");
      return;
    }
    axios.post(`${API_URL}/txttopdf`, { filename: selectedFile })
      .then(response => {
        setMessage(response.data.message);
        setPdfFile(response.data.pdf_file);
      })
      .catch(err => {
        setMessage("❌ Error converting TXT to PDF.");
        console.error(err);
      });
  };

  return (
    <div className="page-container page-txttopdf">
      <h2>TXT to PDF</h2>
      <div className="form-group">
        <label>Select TXT File:</label>
        <select
          value={selectedFile}
          onChange={(e) => setSelectedFile(e.target.value)}
        >
          <option value="">-- Select TXT File --</option>
          {txtFiles.map((file, index) => (
            <option key={index} value={file}>{file}</option>
          ))}
        </select>
      </div>
      <button onClick={handleConversion} className="btn btn-primary">Convert to PDF</button>
      {message && <p>{message}</p>}
      {pdfFile && (
        <p>
          Download PDF: <a href={`${API_URL}/files/${pdfFile}`} download>{pdfFile}</a>
        </p>
      )}
    </div>
  );
}

export default TxtToPdf;
