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
    <div style={{ textAlign: 'left', maxWidth: '600px', margin: '0 auto' }}>
      <h2>Configurations ⚙️</h2>

      {/* Sección: Prompts */}
      <div style={{ border: '1px solid #ccc', padding: '15px', borderRadius: '8px', marginBottom: '20px' }}>
        <h3>Add / Edit Prompt</h3>
        <form onSubmit={handleAddPrompt}>
          <div style={{ marginBottom: '10px' }}>
            <label>
              Prompt Key:
              <input 
                type="text" 
                value={newPromptKey} 
                onChange={(e) => setNewPromptKey(e.target.value)} 
                placeholder="e.g., custom_prompt" 
                style={{ marginLeft: '10px', width: '100%' }} 
              />
            </label>
          </div>
          <div style={{ marginBottom: '10px' }}>
            <label>
              Prompt Text:
              <textarea 
                value={newPromptText} 
                onChange={(e) => setNewPromptText(e.target.value)} 
                placeholder="Enter the prompt text" 
                style={{ marginLeft: '10px', width: '100%' }} 
                rows="4"
              />
            </label>
          </div>
          <button type="submit">Save Prompt</button>
        </form>
      </div>

      <div style={{ border: '1px solid #ccc', padding: '15px', borderRadius: '8px', marginBottom: '20px' }}>
        <h3>Current Prompts</h3>
        {Object.keys(prompts).length === 0 ? (
          <p>No prompts available.</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {Object.entries(prompts).map(([key, text]) => (
              <li key={key} style={{ marginBottom: '5px', display: 'flex', justifyContent: 'space-between' }}>
                <span><strong>{key}:</strong> {text}</span>
                <button onClick={() => handleDeletePrompt(key)} style={{ fontSize: '12px', padding: '2px 5px' }}>
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Sección: Modelos Gemini */}
      <div style={{ border: '1px solid #ccc', padding: '15px', borderRadius: '8px', marginBottom: '20px' }}>
        <h3>Gemini Models</h3>
        {models.length === 0 ? (
          <p>No Gemini models found.</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {models.map((model, i) => (
              <li key={i} style={{ marginBottom: '5px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{model}</span>
                <button onClick={() => handleDeleteModel(model)} style={{ fontSize: '12px', padding: '2px 5px' }}>
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={handleAddModel} style={{ marginTop: '10px' }}>
          <label>
            New model name:
            <input
              type="text"
              value={newModel}
              onChange={(e) => setNewModel(e.target.value)}
              placeholder="Enter new model name"
              style={{ marginLeft: '10px', width: '60%' }}
            />
          </label>
          <button type="submit" style={{ marginLeft: '10px' }}>Add Model</button>
        </form>
      </div>

      {/* Sección: Download / Upload Config */}
      <div style={{ marginBottom: '20px', border: '1px solid #ccc', padding: '15px', borderRadius: '8px' }}>
        <h3>Download / Upload Configuration</h3>
        <button onClick={handleDownloadConfig}>Download Config</button>
        <div style={{ marginTop: '10px' }}>
          <input type="file" onChange={handleConfigFileChange} />
          <button onClick={handleUploadConfig} style={{ marginLeft: '10px' }}>Upload Config</button>
        </div>
      </div>

      {message && <p>{message}</p>}
    </div>
  );
}

export default Configurations;
