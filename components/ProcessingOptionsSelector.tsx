import React, { useEffect, useState } from 'react';
import { ProcessingOptions, PromptPreset, SettingsTab } from '../types';
import { DEFAULT_MODEL_ID, GeminiModel, getPreferredDefaultModelId } from '../utils/modelStorage';
import { SettingsIcon } from './Icons';

interface ProcessingOptionsSelectorProps {
  options: ProcessingOptions;
  onChange: (options: ProcessingOptions) => void;
  models: GeminiModel[];
  prompts: PromptPreset[];
  onOpenSettings?: (tab?: SettingsTab) => void;
  showBatchSizeOption?: boolean;
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

const BATCH_SIZE_PRESETS = [1, 2, 5, 10, 15];

const ProcessingOptionsSelector: React.FC<ProcessingOptionsSelectorProps> = ({
  options,
  onChange,
  models,
  prompts,
  onOpenSettings,
  showBatchSizeOption = false,
}) => {
  const [selectedPromptId, setSelectedPromptId] = useState('');
  const [batchSizeChoice, setBatchSizeChoice] = useState('1');

  useEffect(() => {
    if (models.length === 0) {
      return;
    }

    const modelStillAvailable = models.some((model) => model.id === options.model);
    if (!modelStillAvailable) {
      onChange({ ...options, model: getPreferredDefaultModelId(models) });
    }
  }, [models, onChange, options]);

  useEffect(() => {
    const matchedPrompt = prompts.find((prompt) => prompt.prompt === (options.customPrompt || ''));
    setSelectedPromptId(matchedPrompt?.id ?? '');
  }, [options.customPrompt, prompts]);

  useEffect(() => {
    const batchSize = Number.isInteger(options.pagesPerBatch) && (options.pagesPerBatch ?? 0) > 0
      ? options.pagesPerBatch
      : 1;
    setBatchSizeChoice(BATCH_SIZE_PRESETS.includes(batchSize) ? String(batchSize) : 'custom');
  }, [options.pagesPerBatch]);

  const updateOption = (key: keyof ProcessingOptions, value: string | boolean | number | undefined) => {
    onChange({ ...options, [key]: value });
  };

  const normalizedBatchSize = Number.isInteger(options.pagesPerBatch) && (options.pagesPerBatch ?? 0) > 0
    ? options.pagesPerBatch
    : 1;

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-2 flex items-center justify-between gap-3">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Select AI Model</label>
          {onOpenSettings && (
            <button
              type="button"
              onClick={() => onOpenSettings('models')}
              className="rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-blue-600 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-blue-400"
              title="Open settings"
            >
              <SettingsIcon className="h-4 w-4" />
            </button>
          )}
        </div>
        <select
          value={options.model}
          onChange={(event) => updateOption('model', event.target.value)}
          className="w-full rounded-2xl border border-slate-300 bg-white p-3 text-sm text-slate-900 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
        >
          {models.map((model) => (
            <option key={model.id} value={model.id}>
              {model.name} ({model.description}){model.isCustom ? ' ★' : ''}
            </option>
          ))}
        </select>
      </div>

      {showBatchSizeOption && (
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">Pages Processed At Once</label>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,0.7fr)]">
            <select
              value={batchSizeChoice}
              onChange={(event) => {
                const value = event.target.value;
                setBatchSizeChoice(value);
                if (value !== 'custom') {
                  updateOption('pagesPerBatch', Number(value));
                }
              }}
              className="w-full rounded-2xl border border-slate-300 bg-white p-3 text-sm text-slate-900 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
            >
              {BATCH_SIZE_PRESETS.map((preset) => (
                <option key={preset} value={preset}>
                  {preset}
                </option>
              ))}
              <option value="custom">Custom</option>
            </select>

            {batchSizeChoice === 'custom' && (
              <input
                type="number"
                min={1}
                step={1}
                value={normalizedBatchSize}
                onChange={(event) => updateOption('pagesPerBatch', Math.max(1, Math.trunc(Number(event.target.value) || 1)))}
                className="w-full rounded-2xl border border-slate-300 bg-white p-3 text-sm text-slate-900 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                placeholder="Pages"
              />
            )}
          </div>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            New uploads will process this many pages in parallel.
          </p>
        </div>
      )}

      <div>
        <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">Processing Mode</label>
        <select
          value={options.processingMode || 'ocr'}
          onChange={(event) => updateOption('processingMode', event.target.value)}
          className="w-full rounded-2xl border border-slate-300 bg-white p-3 text-sm text-slate-900 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
        >
          <option value="ocr">OCR (Original Language)</option>
          <option value="translation">Translation</option>
          <option value="manual">Manual Prompt</option>
        </select>

        {(options.processingMode === 'ocr' || options.processingMode === 'translation') && (
          <label className="group mt-3 flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={options.removeReferences !== false}
              onChange={(event) => updateOption('removeReferences', event.target.checked)}
              className="h-4 w-4 rounded border-slate-300 bg-white text-blue-600 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-700"
            />
            <span className="ml-2 text-sm text-slate-600 transition-colors group-hover:text-blue-600 dark:text-slate-400 dark:group-hover:text-blue-400">
              Remove in-text references <span className="text-xs text-slate-400">(e.g., (Author, 2020: p. 45))</span>
            </span>
          </label>
        )}

        {options.processingMode === 'translation' && (
          <div className="mt-4">
            <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">Target Language</label>
            <select
              value={options.targetLanguage || 'Español'}
              onChange={(event) => updateOption('targetLanguage', event.target.value)}
              className="w-full rounded-2xl border border-slate-300 bg-white p-3 text-sm text-slate-900 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
            >
              {LANGUAGES.map((language) => (
                <option key={language} value={language}>
                  {language}
                </option>
              ))}
            </select>
          </div>
        )}

        {options.processingMode === 'manual' && (
          <div className="mt-4 space-y-4">
            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Saved Prompts</label>
                {onOpenSettings && (
                  <button
                    type="button"
                    onClick={() => onOpenSettings('prompts')}
                    className="rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-blue-600 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-blue-400"
                    title="Manage prompts"
                  >
                    <SettingsIcon className="h-4 w-4" />
                  </button>
                )}
              </div>

              <select
                value={selectedPromptId}
                onChange={(event) => {
                  setSelectedPromptId(event.target.value);
                  const prompt = prompts.find((item) => item.id === event.target.value);
                  if (prompt) {
                    updateOption('customPrompt', prompt.prompt);
                  }
                }}
                className="w-full rounded-2xl border border-slate-300 bg-white p-3 text-sm text-slate-900 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
              >
                <option value="">Select a saved prompt...</option>
                {prompts.map((prompt) => (
                  <option key={prompt.id} value={prompt.id}>
                    {prompt.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">Custom Prompt</label>
              <textarea
                value={options.customPrompt || ''}
                onChange={(event) => updateOption('customPrompt', event.target.value)}
                rows={7}
                className="w-full rounded-2xl border border-slate-300 bg-white p-3 font-mono text-sm text-slate-900 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                placeholder="Enter your custom prompt here..."
              />
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                Custom prompts are appended to the built-in OCR rules. Paragraph reconstruction, hyphen handling, and column reading order always stay enforced.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProcessingOptionsSelector;
