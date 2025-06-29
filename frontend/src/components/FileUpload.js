// frontend/src/components/FileUpload.js
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import ProgressBar from './ProgressBar';
import ModelSelector from './ModelSelector';
import CompressionSettings from './CompressionSettings';

const API_URL = '/api';

const DEFAULT_LANGUAGES = [
  'Spanish',
  'English',
  'French',
  'Italian',
  'German',
  'Portuguese'
];

function FileUpload({ onJobCompleted }) {
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
  const [targetLanguage, setTargetLanguage] = useState(DEFAULT_LANGUAGES[0]);
  const [availableLanguages, setAvailableLanguages] = useState(DEFAULT_LANGUAGES);
  
  // Compression settings
  const [compressionEnabled, setCompressionEnabled] = useState(false);
  const [targetDpi, setTargetDpi] = useState(150);
  const [quality, setQuality] = useState(85);
  const [format, setFormat] = useState('JPEG');
  const [keepOriginal, setKeepOriginal] = useState(false);

  const apis = ['Gemini'];

  useEffect(() => {
    axios.get(`${API_URL}/models`, { params: { api } })
      .then(response => {
        setModels(response.data.models);
        if (response.data.models.length > 0) {
          setModel(response.data.models[0]);
        }
      })
      .catch(err => console.error(err));
    // Fetch available languages from backend
    axios.get(`${API_URL}/languages`).then(res => {
      if (res.data.languages && res.data.languages.length > 0) {
        setAvailableLanguages(res.data.languages);
        setTargetLanguage(res.data.languages[0]);
      }
    }).catch(() => {});
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
    // Si el modo es OCR + AI, forzar el prompt a 'ocr_correction'
    let promptToSend = promptKey;
    if (mode === "OCR + AI") {
      promptToSend = "ocr_correction";
    } else if (mode !== "OCR" && !promptKey) {
      setMessage("⚠️ Please select a prompt.");
      return;
    }
    setMessage("🚀 Uploading file...");
    const formData = new FormData();
    formData.append("file", file);
    formData.append("api", api);
    formData.append("model", model);
    formData.append("mode", mode);
    formData.append("prompt_key", promptToSend);
    
    // Add compression settings
    formData.append("compression_enabled", compressionEnabled.toString());
    if (compressionEnabled) {
      formData.append("target_dpi", targetDpi.toString());
      formData.append("quality", quality.toString());
      formData.append("format", format);
      formData.append("keep_original", keepOriginal.toString());
    }
    
    if (mode === 'translation' || mode === 'TRANSLATION' || promptKey === 'translation') {
      formData.append("target_language", targetLanguage);
    }

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
    <div className="upload-container">
      {/* Upload Form Card */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Upload Document</h3>
          <p style={{ color: 'var(--gray-600)', fontSize: '0.875rem', margin: 0 }}>
            Select a file and configure processing options
          </p>
        </div>

        <form onSubmit={handleSubmit} className="upload-form">
          {/* API Selector */}
          <div className="form-group">
            <label className="form-label">API Provider</label>
            <select 
              value={api} 
              onChange={e => setApi(e.target.value)} 
              className="form-select"
            >
              {apis.map(a => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>

          {/* File Drop Zone */}
          <div className="form-group">
            <label className="form-label">Document</label>
            <div
              className={`drop-zone ${file ? 'drop-zone-active' : ''}`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onClick={() => document.getElementById('fileInput').click()}
            >
              <div className="drop-zone-content">
                {file ? (
                  <>
                    <div className="file-icon">📄</div>
                    <div className="file-info">
                      <p className="file-name">{file.name}</p>
                      <p className="file-size">{(file.size / (1024 * 1024)).toFixed(2)} MB</p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="upload-icon">📁</div>
                    <p className="drop-text">Drop your file here or click to browse</p>
                    <p className="drop-subtext">Supports PDF, images, and text files</p>
                  </>
                )}
              </div>
              <input 
                type="file" 
                onChange={handleFileChange} 
                style={{ display: 'none' }} 
                id="fileInput" 
              />
            </div>
          </div>

          {/* Model Selector */}
          <div className="form-group">
            <ModelSelector 
              models={models} 
              selectedModel={model} 
              setSelectedModel={setModel} 
              selectedApi={api} 
            />
          </div>

          {/* Compression Settings */}
          <div className="form-group">
            <CompressionSettings
              compressionEnabled={compressionEnabled}
              setCompressionEnabled={setCompressionEnabled}
              targetDpi={targetDpi}
              setTargetDpi={setTargetDpi}
              quality={quality}
              setQuality={setQuality}
              format={format}
              setFormat={setFormat}
              keepOriginal={keepOriginal}
              setKeepOriginal={setKeepOriginal}
            />
          </div>

          {/* Processing Mode */}
          <div className="form-group">
            <label className="form-label">Processing Mode</label>
            <div className="mode-selector">
              <label className="radio-option">
                <input
                  type="radio"
                  value="OCR"
                  checked={mode === 'OCR'}
                  onChange={(e) => setMode(e.target.value)}
                />
                <span className="radio-custom"></span>
                <div className="radio-content">
                  <span className="radio-title">OCR Only</span>
                  <span className="radio-description">Extract text from document</span>
                </div>
              </label>
              
              <label className="radio-option">
                <input
                  type="radio"
                  value="OCR + AI"
                  checked={mode === 'OCR + AI'}
                  onChange={(e) => setMode(e.target.value)}
                />
                <span className="radio-custom"></span>
                <div className="radio-content">
                  <span className="radio-title">OCR + AI</span>
                  <span className="radio-description">Extract and enhance text with AI</span>
                </div>
              </label>
              
              <label className="radio-option">
                <input
                  type="radio"
                  value="AI"
                  checked={mode === 'AI'}
                  onChange={(e) => setMode(e.target.value)}
                />
                <span className="radio-custom"></span>
                <div className="radio-content">
                  <span className="radio-title">AI Only</span>
                  <span className="radio-description">Process with AI directly</span>
                </div>
              </label>
            </div>
          </div>

          {/* Prompt Selector */}
          <div className="form-group">
            <label className="form-label">
              {mode === "OCR" ? "Prompt (Not Required)" : 
               mode === "OCR + AI" ? "Prompt (Auto-selected)" : "Select Prompt"}
            </label>
            <select
              value={promptKey}
              onChange={(e) => setPromptKey(e.target.value)}
              className="form-select"
              disabled={mode === "OCR" || mode === "OCR + AI"}
            >
              <option value="">-- Select Prompt --</option>
              {Object.keys(availablePrompts).map(key => (
                <option key={key} value={key}>{key}</option>
              ))}
            </select>
          </div>

          {/* Target Language Selector */}
          {(mode === 'translation' || mode === 'TRANSLATION' || promptKey === 'translation') && (
            <div className="form-group">
              <label className="form-label">Target Language</label>
              <select
                value={targetLanguage}
                onChange={e => setTargetLanguage(e.target.value)}
                className="form-select"
              >
                {availableLanguages.map(lang => (
                  <option key={lang} value={lang}>{lang}</option>
                ))}
              </select>
            </div>
          )}

          {/* Submit Buttons */}
          <div className="form-actions">
            <button type="submit" className="btn btn-primary">
              🚀 Upload and Process
            </button>
            {jobId && (
              <button 
                type="button" 
                onClick={handleStop} 
                className="btn btn-danger"
              >
                ⏹️ Stop Process
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Progress and Status */}
      {jobId && (
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Processing Status</h3>
          </div>
          <ProgressBar progress={uploadProgress} status={message} />
        </div>
      )}

      {!jobId && message && (
        <div className={`alert ${message.includes('❌') ? 'alert-error' : 
                                message.includes('⚠️') ? 'alert-warning' : 'alert-info'}`}>
          {message}
        </div>
      )}
    </div>
  );
}

export default FileUpload;
