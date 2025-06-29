// frontend/src/components/Configurations.js
import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_URL = '/api';

function Configurations() {
  // ----- ESTADOS PARA PROMPTS -----
  const [newPromptKey, setNewPromptKey] = useState('');
  const [newPromptText, setNewPromptText] = useState('');
  const [message, setMessage] = useState('');
  const [prompts, setPrompts] = useState({});

  // ----- ESTADOS PARA MODELOS GEMINI -----
  const [models, setModels] = useState([]);       // lista de modelos actuales
  const [newModel, setNewModel] = useState('');   // nombre del modelo que vamos a añadir

  // ----- ESTADOS PARA SUBIR/DESCARGAR CONFIG -----
  const [configFile, setConfigFile] = useState(null);

  // ----- FUNCIONALIDAD DE PROMPTS -----
  const fetchPrompts = () => {
    axios.get(`${API_URL}/prompts`)
      .then(response => setPrompts(response.data.prompts))
      .catch(err => console.error(err));
  };

  const handleAddPrompt = (e) => {
    e.preventDefault();
    if (!newPromptKey || !newPromptText) {
      setMessage("⚠️ Please fill in both key and prompt text.");
      return;
    }
    axios.post(`${API_URL}/prompts`, { key: newPromptKey, prompt: newPromptText })
      .then(response => {
        setMessage(response.data.message);
        setNewPromptKey('');
        setNewPromptText('');
        fetchPrompts();
      })
      .catch(err => {
        setMessage("❌ Error adding prompt.");
        console.error(err);
      });
  };

  const handleDeletePrompt = (key) => {
    if (window.confirm("Are you sure you want to delete this prompt?")) {
      axios.delete(`${API_URL}/prompts/${key}`)
        .then(response => {
          setMessage(response.data.message);
          fetchPrompts();
        })
        .catch(err => {
          setMessage("❌ Error deleting prompt.");
          console.error(err);
        });
    }
  };

  // ----- FUNCIONALIDAD DE MODELOS GEMINI -----
  const fetchModels = () => {
    axios.get(`${API_URL}/models?api=Gemini`)
      .then(response => {
        setModels(response.data.models || []);
      })
      .catch(err => {
        console.error("❌ Error fetching models:", err);
      });
  };

  const handleAddModel = (e) => {
    e.preventDefault();
    if (!newModel.trim()) {
      setMessage("⚠️ Please enter a model name.");
      return;
    }
    axios.post(`${API_URL}/add-model`, { api: "Gemini", model: newModel.trim() })
      .then(response => {
        setMessage(response.data.message);
        setNewModel('');
        fetchModels();
      })
      .catch(err => {
        setMessage("❌ Error adding model.");
        console.error(err);
      });
  };

  const handleDeleteModel = (modelName) => {
    if (window.confirm(`Are you sure you want to delete model ${modelName}?`)) {
      axios.delete(`${API_URL}/delete-model`, { data: { api: "Gemini", model: modelName } })
        .then(response => {
          setMessage(response.data.message);
          fetchModels();
        })
        .catch(err => {
          setMessage("❌ Error deleting model.");
          console.error(err);
        });
    }
  };

  // ----- FUNCIONALIDAD DE CONFIGURACIÓN (DOWNLOAD / UPLOAD) -----
  const handleDownloadConfig = () => {
    axios.get(`${API_URL}/config`)
      .then(response => {
        const data = response.data;
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'config.json';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      })
      .catch(err => {
        setMessage("❌ Error downloading config.");
        console.error(err);
      });
  };

  const handleConfigFileChange = (e) => {
    setConfigFile(e.target.files[0]);
  };

  const handleUploadConfig = () => {
    if (!configFile) {
      setMessage("⚠️ Please select a config file to upload.");
      return;
    }
    const formData = new FormData();
    formData.append("config", configFile);
    axios.post(`${API_URL}/config`, formData, { headers: { "Content-Type": "multipart/form-data" } })
      .then(response => {
        setMessage(response.data.message);
        fetchPrompts();
        fetchModels();
      })
      .catch(err => {
        setMessage("❌ Error uploading config.");
        console.error(err);
      });
  };

  // ----- useEffect -----
  useEffect(() => {
    fetchPrompts();
    fetchModels();
  }, []);

  // ----- RENDER -----
  return (
    <div className="configurations-container">
      {/* Prompts Section */}
      <div className="config-section">
        <h3 className="config-section-title">📝 Manage Prompts</h3>
        
        <div className="card">
          <div className="card-header">
            <h4 className="card-title">Add New Prompt</h4>
          </div>
          <form onSubmit={handleAddPrompt}>
            <div className="form-group">
              <label className="form-label">Prompt Key</label>
              <input 
                type="text" 
                value={newPromptKey} 
                onChange={(e) => setNewPromptKey(e.target.value)} 
                placeholder="e.g., custom_prompt" 
                className="form-input"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Prompt Text</label>
              <textarea 
                value={newPromptText} 
                onChange={(e) => setNewPromptText(e.target.value)} 
                placeholder="Enter the prompt text" 
                className="form-textarea"
                rows="4"
              />
            </div>
            <button type="submit" className="btn btn-primary">
              💾 Save Prompt
            </button>
          </form>
        </div>

        <div className="card">
          <div className="card-header">
            <h4 className="card-title">Current Prompts</h4>
          </div>
          {Object.keys(prompts).length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📄</div>
              <h4 className="empty-state-title">No prompts configured</h4>
              <p className="empty-state-description">
                Add custom prompts to enhance AI processing
              </p>
            </div>
          ) : (
            <div className="prompts-list">
              {Object.entries(prompts).map(([key, text]) => (
                <div key={key} className="prompt-item">
                  <div className="prompt-content">
                    <div className="prompt-key">{key}</div>
                    <div className="prompt-text">{text}</div>
                  </div>
                  <button 
                    onClick={() => handleDeletePrompt(key)} 
                    className="btn btn-sm btn-danger"
                    title="Delete prompt"
                  >
                    🗑️
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Models Section */}
      <div className="config-section">
        <h3 className="config-section-title">🤖 Gemini Models</h3>
        
        <div className="card">
          <div className="card-header">
            <h4 className="card-title">Available Models</h4>
          </div>
          {models.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">🤖</div>
              <h4 className="empty-state-title">No models configured</h4>
              <p className="empty-state-description">
                Add Gemini models for AI processing
              </p>
            </div>
          ) : (
            <div className="models-list">
              {models.map((model, i) => (
                <div key={i} className="model-item">
                  <div className="model-info">
                    <span className="model-name">{model}</span>
                  </div>
                  <button 
                    onClick={() => handleDeleteModel(model)} 
                    className="btn btn-sm btn-danger"
                    title="Delete model"
                  >
                    🗑️
                  </button>
                </div>
              ))}
            </div>
          )}
          
          <form onSubmit={handleAddModel} className="add-model-form">
            <div className="form-group">
              <label className="form-label">Add New Model</label>
              <div className="input-group">
                <input
                  type="text"
                  value={newModel}
                  onChange={(e) => setNewModel(e.target.value)}
                  placeholder="Enter new model name"
                  className="form-input"
                />
                <button type="submit" className="btn btn-primary">
                  ➕ Add
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* Configuration Import/Export */}
      <div className="config-section">
        <h3 className="config-section-title">⚙️ Configuration Management</h3>
        
        <div className="card">
          <div className="card-header">
            <h4 className="card-title">Backup & Restore</h4>
            <p style={{ color: 'var(--gray-600)', fontSize: '0.875rem', margin: 0 }}>
              Export your settings or import a configuration file
            </p>
          </div>
          
          <div className="config-actions">
            <div className="action-group">
              <h5>📥 Export Configuration</h5>
              <p>Download current settings as a JSON file</p>
              <button onClick={handleDownloadConfig} className="btn btn-success">
                📥 Download Config
              </button>
            </div>
            
            <div className="action-group">
              <h5>📤 Import Configuration</h5>
              <p>Upload a configuration file to restore settings</p>
              <div className="upload-config">
                <input 
                  type="file" 
                  onChange={handleConfigFileChange}
                  accept=".json"
                  className="file-input"
                  id="config-file"
                />
                <label htmlFor="config-file" className="file-label">
                  📁 Choose File
                </label>
                {configFile && (
                  <span className="file-selected">{configFile.name}</span>
                )}
              </div>
              <button 
                onClick={handleUploadConfig} 
                className="btn btn-primary"
                disabled={!configFile}
              >
                📤 Upload Config
              </button>
            </div>
          </div>
        </div>
      </div>

      {message && (
        <div className={`alert ${message.includes('❌') ? 'alert-error' : 
                                message.includes('⚠️') ? 'alert-warning' : 'alert-info'}`}>
          {message}
        </div>
      )}
    </div>
  );
}

export default Configurations;
