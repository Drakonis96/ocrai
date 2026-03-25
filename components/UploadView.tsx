import React, { useCallback, useEffect, useState } from 'react';
import { ProcessingOptions, PromptPreset, SettingsTab } from '../types';
import { DEFAULT_MODELS, GeminiModel } from '../utils/modelStorage';
import { FileIcon, TrashIcon, UploadCloudIcon } from './Icons';
import ProcessingOptionsSelector from './ProcessingOptionsSelector';

interface UploadViewProps {
  onFileSelect: (files: FileList, options: ProcessingOptions) => void;
  models: GeminiModel[];
  prompts: PromptPreset[];
  onOpenSettings: (tab?: SettingsTab) => void;
}

const DEFAULT_MODEL_ID = DEFAULT_MODELS[0]?.id ?? 'gemini-flash-latest';

const UploadView: React.FC<UploadViewProps> = ({
  onFileSelect,
  models,
  prompts,
  onOpenSettings,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [options, setOptions] = useState<ProcessingOptions>({
    model: DEFAULT_MODEL_ID,
    processingMode: 'ocr',
    targetLanguage: 'Español',
    customPrompt: '',
    removeReferences: true,
    pagesPerBatch: 1,
  });

  useEffect(() => {
    if (models.length === 0) {
      return;
    }

    setOptions((current) => {
      const modelStillAvailable = models.some((model) => model.id === current.model);
      if (modelStillAvailable) {
        return current;
      }

      return {
        ...current,
        model: models[0]?.id ?? DEFAULT_MODEL_ID,
      };
    });
  }, [models]);

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(false);
    if (event.dataTransfer.files && event.dataTransfer.files.length > 0) {
      const newFiles = Array.from(event.dataTransfer.files);
      setSelectedFiles((current) => [...current, ...newFiles]);
    }
  }, []);

  const handleFileInput = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      const newFiles = Array.from(event.target.files);
      setSelectedFiles((current) => [...current, ...newFiles]);
      event.target.value = '';
    }
  }, []);

  const handleRemoveFile = (index: number) => {
    setSelectedFiles((current) => current.filter((_, fileIndex) => fileIndex !== index));
  };

  const handleClearAll = () => {
    setSelectedFiles([]);
  };

  const handleStartProcessing = () => {
    if (selectedFiles.length === 0) {
      return;
    }

    const dataTransfer = new DataTransfer();
    selectedFiles.forEach((file) => dataTransfer.items.add(file));

    onFileSelect(dataTransfer.files, {
      ...options,
      targetLanguage: options.processingMode === 'translation' ? options.targetLanguage : undefined,
      customPrompt: options.processingMode === 'manual' ? options.customPrompt : undefined,
      removeReferences: options.processingMode !== 'manual' ? options.removeReferences : undefined,
    });
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="flex h-full min-h-0 flex-col transition-colors duration-200">
      <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-24 pt-5 sm:px-6 sm:pb-8 sm:pt-6">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.9fr)] lg:items-stretch">
          <section className="h-full rounded-[2rem] bg-gradient-to-br from-blue-600 via-sky-600 to-cyan-500 px-6 py-8 text-white shadow-xl sm:px-8 sm:py-10">
            <span className="inline-flex rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-white/90">
              OCR Workspace
            </span>
            <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
              Convert documents into clean, editable text.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-blue-50 sm:text-base">
              Upload PDFs or images, choose the model and processing mode, and keep your reusable prompts available from Settings.
            </p>

            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`mt-8 rounded-[1.75rem] border-2 border-dashed px-5 py-8 transition-all sm:px-6 ${
                isDragging
                  ? 'border-white bg-white/20'
                  : 'border-white/40 bg-white/10 hover:border-white/70 hover:bg-white/15'
              }`}
            >
              <input
                type="file"
                id="file-upload"
                className="hidden"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                multiple
                onChange={handleFileInput}
              />
              <div className="flex flex-col items-center text-center">
                <div className="rounded-full bg-white/15 p-4">
                  <UploadCloudIcon className="h-8 w-8" />
                </div>
                <p className="mt-4 text-lg font-semibold">Click to upload or drag and drop</p>
                <p className="mt-1 text-sm text-blue-100">PDF, JPG, PNG, WEBP</p>
                <label
                  htmlFor="file-upload"
                  className="mt-5 inline-flex cursor-pointer items-center rounded-full bg-white px-5 py-3 text-sm font-semibold text-slate-900 transition-colors hover:bg-slate-100"
                >
                  Select files
                </label>
              </div>
            </div>

            {selectedFiles.length > 0 && (
              <div className="mt-6 rounded-[1.5rem] bg-white/10 p-4 backdrop-blur-sm">
                <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3">
                  <h3 className="text-sm font-semibold text-white">
                    Selected Files ({selectedFiles.length})
                  </h3>
                  <button
                    type="button"
                    onClick={handleClearAll}
                    className="text-sm font-medium text-blue-100 transition-colors hover:text-white"
                  >
                    Clear all
                  </button>
                </div>

                <ul className="mt-3 space-y-2">
                  {selectedFiles.map((file, index) => (
                    <li
                      key={`${file.name}-${index}`}
                      className="flex items-center gap-3 rounded-2xl bg-white/10 px-3 py-3"
                    >
                      <div className="rounded-xl bg-white/15 p-2 text-white">
                        <FileIcon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-white">{file.name}</p>
                        <p className="text-xs text-blue-100">{formatFileSize(file.size)}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveFile(index)}
                        className="rounded-full p-2 text-blue-100 transition-colors hover:bg-white/10 hover:text-white"
                        title="Remove file"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          <section className="h-full rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800 sm:p-6">
            <div>
              <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Processing settings</h2>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                Choose a model, switch mode, and reuse prompts stored in Settings.
              </p>
            </div>

            <div className="mt-6">
              <ProcessingOptionsSelector
                options={options}
                onChange={setOptions}
                models={models}
                prompts={prompts}
                onOpenSettings={onOpenSettings}
                showBatchSizeOption
              />
            </div>
          </section>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 px-4 py-4 backdrop-blur dark:border-slate-700 dark:bg-slate-800/95 sm:static sm:bg-white sm:px-6 dark:sm:bg-slate-800">
        <div className="mx-auto w-full max-w-6xl">
          <button
            onClick={handleStartProcessing}
            disabled={selectedFiles.length === 0}
            className={`flex w-full items-center justify-center gap-2 rounded-full px-5 py-3.5 text-sm font-semibold transition-colors sm:text-base ${
              selectedFiles.length > 0
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'cursor-not-allowed bg-slate-300 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
            }`}
          >
            <span>Start processing</span>
            {selectedFiles.length > 0 && (
              <span className="text-blue-200">
                ({selectedFiles.length} {selectedFiles.length === 1 ? 'file' : 'files'})
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default UploadView;
