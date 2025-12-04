import React, { useState, useEffect } from 'react';
import { ProcessingOptions } from '../types';
import { getSavedPrompts, savePrompt } from '../services/geminiService';

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

  useEffect(() => {
    getSavedPrompts().then(setSavedPrompts);
  }, []);

  const handleSavePrompt = async () => {
    if (!promptName || !options.customPrompt) return;
    await savePrompt(promptName, options.customPrompt);
    const prompts = await getSavedPrompts();
    setSavedPrompts(prompts);
    setPromptName('');
  };

  const updateOption = (key: keyof ProcessingOptions, value: any) => {
    onChange({ ...options, [key]: value });
  };

  return (
    <div className="space-y-4">
      {/* Model Selection */}
      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Select AI Model</label>
        <select 
          value={options.model}
          onChange={(e) => updateOption('model', e.target.value)}
          className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white dark:bg-slate-900 text-slate-900 dark:text-white transition-colors"
        >
          <option value="gemini-2.5-flash">Gemini 2.5 Flash (Balanced)</option>
          <option value="gemini-2.5-flash-lite">Gemini 2.5 Flash Lite (Faster)</option>
        </select>
      </div>

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
