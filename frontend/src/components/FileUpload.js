// frontend/src/components/FileUpload.js
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import ProgressBar from './ProgressBar';
import ModelSelector from './ModelSelector';

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

  // Compression options
  const [compress, setCompress] = useState(false);
  const [targetDPI, setTargetDPI] = useState(150);
  const [imgFormat, setImgFormat] = useState('jpeg');
  const [quality, setQuality] = useState(85);
  const [keepOriginalImages, setKeepOriginalImages] = useState(false);
  const [preserveMetadata, setPreserveMetadata] = useState(false);

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
    if (mode === 'translation' || mode === 'TRANSLATION' || promptKey === 'translation') {
      formData.append("target_language", targetLanguage);
    }
    if (compress) {
      formData.append('compress', 'true');
      formData.append('target_dpi', targetDPI);
      formData.append('format', imgFormat);
      formData.append('quality', quality);
      formData.append('keep_original', keepOriginalImages);
      formData.append('preserve_metadata', preserveMetadata);
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
    <div>
      <form onSubmit={handleSubmit} className="upload-form">
        {/* API Selector */}
        <div style={{ marginBottom: '10px' }}>
          <label>
            API:
            <select value={api} onChange={e => setApi(e.target.value)} style={{ marginLeft: '10px' }}>
              {apis.map(a => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </label>
        </div>
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
          <ModelSelector models={models} selectedModel={model} setSelectedModel={setModel} selectedApi={api} />
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
            {mode === "OCR" ? "Prompt not required for OCR mode" : mode === "OCR + AI" ? "Prompt is fixed for OCR + AI" : "Select Prompt:"}
            <select
              value={promptKey}
              onChange={(e) => setPromptKey(e.target.value)}
              style={{ marginLeft: '10px' }}
              disabled={mode === "OCR" || mode === "OCR + AI"}
            >
              <option value="">-- Select Prompt --</option>
              {Object.keys(availablePrompts).map(key => (
                <option key={key} value={key}>{key}</option>
              ))}
            </select>
          </label>
        </div>
        {/* Target language selector for translation */}
        {(mode === 'translation' || mode === 'TRANSLATION' || promptKey === 'translation') && (
          <div className="target-language-selector" style={{ marginBottom: '10px' }}>
            <label>
              Target language:
              <select
                value={targetLanguage}
                onChange={e => setTargetLanguage(e.target.value)}
                style={{ marginLeft: '10px' }}
              >
                {availableLanguages.map(lang => (
                  <option key={lang} value={lang}>{lang}</option>
                ))}
              </select>
            </label>
          </div>
        )}
        {/* Image compression options */}
        <div className="compression" style={{ marginBottom: '10px' }}>
          <label>
            <input
              type="checkbox"
              checked={compress}
              onChange={e => setCompress(e.target.checked)}
            />{' '}
            Enable image compression
          </label>
          {compress && (
            <div style={{ marginTop: '10px' }}>
              <label>
                targetDPI:
                <input
                  type="number"
                  min="72"
                  max="300"
                  value={targetDPI}
                  onChange={e => setTargetDPI(e.target.value)}
                  style={{ marginLeft: '10px', width: '80px' }}
                />
              </label>
              <label style={{ marginLeft: '10px' }}>
                format:
                <select
                  value={imgFormat}
                  onChange={e => setImgFormat(e.target.value)}
                  style={{ marginLeft: '10px' }}
                >
                  <option value="jpeg">jpeg</option>
                  <option value="png">png</option>
                </select>
              </label>
              <label style={{ marginLeft: '10px' }}>
                quality:
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={quality}
                  onChange={e => setQuality(e.target.value)}
                  style={{ marginLeft: '10px', width: '60px' }}
                />
              </label>
              <label style={{ marginLeft: '10px' }}>
                <input
                  type="checkbox"
                  checked={keepOriginalImages}
                  onChange={e => setKeepOriginalImages(e.target.checked)}
                />{' '}
                keepOriginalImages
              </label>
              <label style={{ marginLeft: '10px' }}>
                <input
                  type="checkbox"
                  checked={preserveMetadata}
                  onChange={e => setPreserveMetadata(e.target.checked)}
                />{' '}
                preserveMetadata
              </label>
            </div>
          )}
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
          <ProgressBar progress={uploadProgress} status={message} />
        </div>
      )}
      {!jobId && <p>{message}</p>}
    </div>
  );
}

export default FileUpload;
