// frontend/src/components/FileUpload.js
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import ProgressBar from './ProgressBar';
import ModelSelector from './ModelSelector';

const API_URL = '/api';

function FileUpload({ onJobCompleted }) {
  // Se establece la API por defecto en "Gemini"
  const [file, setFile] = useState(null);
  const [api, setApi] = useState('Gemini');
  const [model, setModel] = useState('');
  const [mode, setMode] = useState('OCR + AI'); // Opciones: "OCR", "OCR + AI" o "AI"
  const [promptKey, setPromptKey] = useState('');
  const [availablePrompts, setAvailablePrompts] = useState({});
  const [models, setModels] = useState([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [message, setMessage] = useState('');
  const [jobId, setJobId] = useState(null);

  // No se ofrece opción para seleccionar otra API ya que sólo se usa Gemini.
  useEffect(() => {
    axios.get(`${API_URL}/models`, { params: { api } })
      .then(response => {
        setModels(response.data.models);
        if (response.data.models.length > 0) {
          setModel(response.data.models[0]);
        }
      })
      .catch(err => console.error(err));
  }, [api]);

  useEffect(() => {
    axios.get(`${API_URL}/prompts`)
      .then(response => setAvailablePrompts(response.data.prompts))
      .catch(err => console.error(err));
  }, []);

  useEffect(() => {
    if (jobId) {
      const interval = setInterval(() => {
        axios.get(`${API_URL}/progress/${jobId}`)
          .then(response => {
            const data = response.data;
            setUploadProgress(data.progress);
            setMessage(data.status);
            if (data.progress === 100 || data.status.includes("Cancelled") || data.status.includes("Error")) {
              clearInterval(interval);
              onJobCompleted && onJobCompleted("Processing job completed");
              setJobId(null);
            }
          })
          .catch(err => console.error(err));
      }, 2000);
      return () => clearInterval(interval);
    }
  }, [jobId, onJobCompleted]);

  const handleFileChange = (e) => setFile(e.target.files[0]);

  const handleDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setFile(e.dataTransfer.files[0]);
      e.dataTransfer.clearData();
    }
  };

  const handleDragOver = (e) => e.preventDefault();

  const handleStop = () => {
    if (jobId) {
      axios.post(`${API_URL}/stop/${jobId}`)
        .then(response => {
          setMessage("⏹️ Process stopped by user");
          setJobId(null);
        })
        .catch(err => console.error(err));
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!file) {
      setMessage("⚠️ Please select a file.");
      return;
    }
    if (mode === "OCR") {
      setPromptKey('');
    } else if (!promptKey) {
      setMessage("⚠️ Please select a prompt.");
      return;
    }
    setMessage("🚀 Uploading file...");
    const formData = new FormData();
    formData.append("file", file);
    // La API siempre es "Gemini"
    formData.append("api", api);
    formData.append("model", model);
    formData.append("mode", mode);
    formData.append("prompt_key", promptKey);

    axios.post(`${API_URL}/upload`, formData, { headers: { "Content-Type": "multipart/form-data" } })
      .then(response => {
        setMessage("📤 File uploaded. Processing started.");
        setJobId(response.data.job_id);
      })
      .catch(err => {
        setMessage("❌ Error uploading file.");
        console.error(err);
      });
  };

  return (
    <div>
      <form onSubmit={handleSubmit} className="upload-form">
        <div
          className="drop-zone"
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          style={{
            border: '2px dashed #ccc',
            padding: '20px',
            borderRadius: '5px',
            marginBottom: '10px'
          }}
        >
          {file ? <p>📄 {file.name}</p> : <p>📂 Drag and drop the file here or click to select</p>}
          <input type="file" onChange={handleFileChange} style={{ display: 'none' }} id="fileInput" />
          <label htmlFor="fileInput" style={{ cursor: 'pointer', color: 'blue' }}>Select file</label>
        </div>
        <div className="selectors" style={{ marginBottom: '10px' }}>
          {/* No se muestra opción de seleccionar otra API */}
          <ModelSelector models={models} selectedModel={model} setSelectedModel={setModel} />
        </div>
        <div className="mode-selector" style={{ marginBottom: '10px' }}>
          <p>Processing mode:</p>
          <label>
            <input
              type="radio"
              value="OCR"
              checked={mode === 'OCR'}
              onChange={(e) => setMode(e.target.value)}
            /> OCR
          </label>
          <label style={{ marginLeft: '20px' }}>
            <input
              type="radio"
              value="OCR + AI"
              checked={mode === 'OCR + AI'}
              onChange={(e) => setMode(e.target.value)}
            /> OCR + AI
          </label>
          <label style={{ marginLeft: '20px' }}>
            <input
              type="radio"
              value="AI"
              checked={mode === 'AI'}
              onChange={(e) => setMode(e.target.value)}
            /> AI
          </label>
        </div>
        <div className="prompt-selector" style={{ marginBottom: '10px' }}>
          <label>
            {mode === "OCR" ? "Prompt not required for OCR mode" : "Select Prompt:"}
            <select
              value={promptKey}
              onChange={(e) => setPromptKey(e.target.value)}
              style={{ marginLeft: '10px' }}
              disabled={mode === "OCR"}
            >
              <option value="">-- Select Prompt --</option>
              {Object.keys(availablePrompts).map(key => (
                <option key={key} value={key}>{key}</option>
              ))}
            </select>
          </label>
        </div>
        <button type="submit">Upload and process</button>
        {jobId && (
          <button type="button" onClick={handleStop} style={{ marginLeft: '10px' }}>
            Stop Process
          </button>
        )}
      </form>
      {jobId && (
        <div>
          <ProgressBar progress={uploadProgress} />
          <p>{message}</p>
        </div>
      )}
      {!jobId && <p>{message}</p>}
    </div>
  );
}

export default FileUpload;
