import React, { useState, useEffect } from 'react';
import { ProcessingOptions } from '../types';
import { getSavedPrompts, savePrompt } from '../services/geminiService';
import { getModels, addModel, removeModel, GeminiModel, DEFAULT_MODELS } from '../utils/modelStorage';
import { SettingsIcon, PlusIcon, TrashIcon, CloseIcon } from './Icons';

interface ProcessingOptionsSelectorProps {
  options: ProcessingOptions;
  onChange: (options: ProcessingOptions) => void;
  showSavePrompt?: boolean;
}

const LANGUAGES = [
  'Deutsch',
  'English',
  'Español',
  'Français',
  'Italiano',
  '中文',
  '日本語'
];

const ProcessingOptionsSelector: React.FC<ProcessingOptionsSelectorProps> = ({ 
  options, 
  onChange,
  showSavePrompt = true
}) => {
  const [promptName, setPromptName] = useState('');
  const [savedPrompts, setSavedPrompts] = useState<{name: string, prompt: string}[]>([]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [models, setModels] = useState<GeminiModel[]>([]);
  const [newModelId, setNewModelId] = useState('');
  const [newModelName, setNewModelName] = useState('');
  const [newModelDesc, setNewModelDesc] = useState('');
  const [modelError, setModelError] = useState('');

  useEffect(() => {
    getSavedPrompts().then(setSavedPrompts);
    setModels(getModels());
  }, []);

  const handleSavePrompt = async () => {
    if (!promptName || !options.customPrompt) return;
    await savePrompt(promptName, options.customPrompt);
    const prompts = await getSavedPrompts();
    setSavedPrompts(prompts);
    setPromptName('');
  };

  const handleAddModel = () => {
    if (!newModelId.trim()) {
      setModelError('Model ID is required');
      return;
    }
    try {
      const updated = addModel({
        id: newModelId.trim(),
        name: newModelName.trim() || newModelId.trim(),
        description: newModelDesc.trim() || 'Custom',
      });
      setModels(updated);
      setNewModelId('');
      setNewModelName('');
      setNewModelDesc('');
      setModelError('');
    } catch (e: any) {
      setModelError(e.message);
    }
  };

  const handleRemoveModel = (modelId: string) => {
    try {
      const updated = removeModel(modelId);
      setModels(updated);
      // If the removed model was selected, switch to default
      if (options.model === modelId) {
        updateOption('model', 'gemini-2.5-flash');
      }
    } catch (e: any) {
      setModelError(e.message);
    }
  };

  const updateOption = (key: keyof ProcessingOptions, value: any) => {
    onChange({ ...options, [key]: value });
  };

  return (
    <div className="space-y-4">
      {/* Model Selection */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Select AI Model</label>
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="p-1.5 text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            title="Model Settings"
          >
            <SettingsIcon className="w-4 h-4" />
          </button>
        </div>
        <select 
          value={options.model}
          onChange={(e) => updateOption('model', e.target.value)}
          className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white dark:bg-slate-900 text-slate-900 dark:text-white transition-colors"
        >
          {models.map(model => (
            <option key={model.id} value={model.id}>
              {model.name} ({model.description}){model.isCustom ? ' ★' : ''}
            </option>
          ))}
        </select>
      </div>

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-lg w-full max-h-[80vh] overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Model Settings</h2>
              <button
                onClick={() => {
                  setIsSettingsOpen(false);
                  setModelError('');
                }}
                className="p-1 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              >
                <CloseIcon className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-4 overflow-y-auto max-h-[60vh]">
              {/* Add New Model */}
              <div className="mb-6">
                <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">Add New Model</h3>
                <div className="space-y-2">
                  <input
                    type="text"
                    value={newModelId}
                    onChange={(e) => setNewModelId(e.target.value)}
                    placeholder="Model ID (e.g., gemini-2.0-pro)"
                    className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white dark:bg-slate-900 text-slate-900 dark:text-white transition-colors text-sm"
                  />
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newModelName}
                      onChange={(e) => setNewModelName(e.target.value)}
                      placeholder="Display Name (optional)"
                      className="flex-1 p-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white dark:bg-slate-900 text-slate-900 dark:text-white transition-colors text-sm"
                    />
                    <input
                      type="text"
                      value={newModelDesc}
                      onChange={(e) => setNewModelDesc(e.target.value)}
                      placeholder="Description"
                      className="flex-1 p-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white dark:bg-slate-900 text-slate-900 dark:text-white transition-colors text-sm"
                    />
                  </div>
                  {modelError && (
                    <p className="text-red-500 text-xs">{modelError}</p>
                  )}
                  <button
                    onClick={handleAddModel}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                  >
                    <PlusIcon className="w-4 h-4" />
                    Add Model
                  </button>
                </div>
              </div>

              {/* Model List */}
              <div>
                <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">Available Models</h3>
                <div className="space-y-2">
                  {models.map(model => {
                    const isDefault = DEFAULT_MODELS.some(dm => dm.id === model.id);
                    return (
                      <div
                        key={model.id}
                        className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg"
                      >
                        <div>
                          <p className="text-sm font-medium text-slate-900 dark:text-white">
                            {model.name}
                            {model.isCustom && <span className="ml-2 text-xs text-blue-500">★ Custom</span>}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {model.id} · {model.description}
                          </p>
                        </div>
                        {!isDefault && (
                          <button
                            onClick={() => handleRemoveModel(model.id)}
                            className="p-1.5 text-red-500 hover:text-red-700 dark:hover:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                            title="Remove model"
                          >
                            <TrashIcon className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Processing Mode Selection */}
      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Processing Mode</label>
        <select 
          value={options.processingMode || 'ocr'}
          onChange={(e) => updateOption('processingMode', e.target.value)}
          className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white dark:bg-slate-900 text-slate-900 dark:text-white transition-colors"
        >
          <option value="ocr">OCR (Original Language)</option>
          <option value="translation">Translation</option>
          <option value="manual">Manual Prompt</option>
        </select>

        {/* Remove References Toggle - show for ocr and translation modes */}
        {(options.processingMode === 'ocr' || options.processingMode === 'translation') && (
          <label className="flex items-center mt-3 cursor-pointer group">
            <input 
              type="checkbox" 
              checked={options.removeReferences !== false}
              onChange={(e) => updateOption('removeReferences', e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded border-slate-300 dark:border-slate-600 focus:ring-blue-500 bg-white dark:bg-slate-700"
            />
            <span className="ml-2 text-sm text-slate-600 dark:text-slate-400 group-hover:text-blue-600 dark:group-hover:text-blue-400">
              Remove in-text references <span className="text-xs text-slate-400">(e.g., (Author, 2020: p. 45))</span>
            </span>
          </label>
        )}

        {/* Translation Options */}
        {options.processingMode === 'translation' && (
          <div className="mt-4">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Target Language</label>
            <select 
              value={options.targetLanguage || 'Español'}
              onChange={(e) => updateOption('targetLanguage', e.target.value)}
              className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white dark:bg-slate-900 text-slate-900 dark:text-white transition-colors"
            >
              {LANGUAGES.map(lang => (
                <option key={lang} value={lang}>{lang}</option>
              ))}
            </select>
          </div>
        )}

        {/* Manual Prompt Options */}
        {options.processingMode === 'manual' && (
          <div className="mt-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Saved Prompts</label>
              <select 
                onChange={(e) => {
                  const prompt = savedPrompts.find(p => p.name === e.target.value);
                  if (prompt) updateOption('customPrompt', prompt.prompt);
                }}
                className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white dark:bg-slate-900 text-slate-900 dark:text-white transition-colors"
              >
                <option value="">Select a saved prompt...</option>
                {savedPrompts.map(p => (
                  <option key={p.name} value={p.name}>{p.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Custom Prompt</label>
              <textarea
                value={options.customPrompt || ''}
                onChange={(e) => updateOption('customPrompt', e.target.value)}
                rows={6}
                className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white dark:bg-slate-900 text-slate-900 dark:text-white transition-colors font-mono text-sm"
                placeholder="Enter your custom prompt here..."
              />
            </div>

            {showSavePrompt && (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={promptName}
                  onChange={(e) => setPromptName(e.target.value)}
                  placeholder="Prompt Name"
                  className="flex-1 p-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white dark:bg-slate-900 text-slate-900 dark:text-white transition-colors"
                />
                <button
                  onClick={handleSavePrompt}
                  disabled={!promptName || !options.customPrompt}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Save Prompt
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ProcessingOptionsSelector;
