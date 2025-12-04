import React, { useCallback, useState } from 'react';
import { UploadCloudIcon, FileIcon, TrashIcon } from './Icons';
import { ProcessingOptions } from '../types';
import ProcessingOptionsSelector from './ProcessingOptionsSelector';

interface UploadViewProps {
  onFileSelect: (files: FileList, options: ProcessingOptions) => void;
}

const UploadView: React.FC<UploadViewProps> = ({ onFileSelect }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [options, setOptions] = useState<ProcessingOptions>({
    model: 'gemini-2.5-flash',
    processingMode: 'ocr',
    targetLanguage: 'Español',
    customPrompt: '',
    removeReferences: true
  });

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const newFiles = Array.from(e.dataTransfer.files);
      setSelectedFiles(prev => [...prev, ...newFiles]);
    }
  }, []);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files);
      setSelectedFiles(prev => [...prev, ...newFiles]);
      // Reset the input so the same file can be selected again
      e.target.value = '';
    }
  }, []);

  const handleRemoveFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleClearAll = () => {
    setSelectedFiles([]);
  };

  const handleStartProcessing = () => {
    if (selectedFiles.length === 0) return;
    
    // Create a FileList-like object from the array
    const dataTransfer = new DataTransfer();
    selectedFiles.forEach(file => dataTransfer.items.add(file));
    
    onFileSelect(dataTransfer.files, { 
      ...options,
      targetLanguage: options.processingMode === 'translation' ? options.targetLanguage : undefined,
      customPrompt: options.processingMode === 'manual' ? options.customPrompt : undefined,
      removeReferences: options.processingMode !== 'manual' ? options.removeReferences : undefined
    });
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div className="flex flex-col h-full min-h-0 transition-colors duration-200">
      {/* Scrollable Content */}
      <div className="flex-1 min-h-0 overflow-y-auto p-6 pb-8 flex flex-col items-center">
        <div className="w-full max-w-2xl text-center space-y-4 mb-8">
          <h1 className="text-4xl font-bold text-slate-800 dark:text-white tracking-tight">Convert Documents to Clean Text</h1>
          <p className="text-lg text-slate-500 dark:text-slate-400">
            Upload PDFs or Images. Our AI extracts main content, ignoring headers, footers, and footnotes automatically.
          </p>
        </div>

        <div className="w-full max-w-xl space-y-4 mb-6">
          <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 transition-colors">
            <ProcessingOptionsSelector 
              options={options} 
              onChange={setOptions} 
            />
          </div>
        </div>

        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`
            w-full max-w-xl p-12 rounded-2xl border-2 border-dashed transition-all duration-200 cursor-pointer
            flex flex-col items-center justify-center space-y-4 bg-white dark:bg-slate-800
            ${isDragging ? 'border-blue-500 bg-blue-50 dark:bg-slate-700' : 'border-slate-300 dark:border-slate-600 hover:border-slate-400 dark:hover:border-slate-500'}
          `}
        >
          <input
            type="file"
            id="file-upload"
            className="hidden"
            accept=".pdf,.jpg,.jpeg,.png,.webp"
            multiple
            onChange={handleFileInput}
          />
          <div className="p-4 bg-blue-50 dark:bg-slate-700 text-blue-600 dark:text-blue-400 rounded-full transition-colors">
            <UploadCloudIcon className="w-8 h-8" />
          </div>
          <div className="text-center">
            <p className="text-lg font-medium text-slate-700 dark:text-slate-200">
              Click to upload or drag and drop
            </p>
            <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">
              PDF, JPG, PNG (Max 10MB)
            </p>
          </div>
          <label
            htmlFor="file-upload"
            className="mt-4 px-6 py-2 bg-slate-900 dark:bg-slate-700 text-white dark:text-slate-100 rounded-lg font-medium hover:bg-slate-800 dark:hover:bg-slate-600 transition-colors cursor-pointer"
          >
            Select Files
          </label>
        </div>

        {/* Selected Files List */}
        {selectedFiles.length > 0 && (
          <div className="w-full max-w-xl mt-6 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 transition-colors">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
              <h3 className="font-medium text-slate-700 dark:text-slate-200">
                Selected Files ({selectedFiles.length})
              </h3>
              <button
                onClick={handleClearAll}
                className="text-sm text-red-600 dark:text-red-400 hover:underline"
              >
                Clear All
              </button>
            </div>
            
            <ul className="w-full divide-y divide-slate-100 dark:divide-slate-700 max-h-60 overflow-y-auto">
              {selectedFiles.map((file, index) => (
                <li key={index} className="px-4 py-3 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-700/50">
                  <div className="flex items-center space-x-3 min-w-0 flex-1">
                    <div className="p-2 bg-slate-100 dark:bg-slate-700 rounded-lg text-slate-500 dark:text-slate-400 shrink-0">
                      <FileIcon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate text-left">{file.name}</p>
                      <p className="text-xs text-slate-400 dark:text-slate-500 text-left">{formatFileSize(file.size)}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleRemoveFile(index)}
                    className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition-colors shrink-0 ml-2"
                    title="Remove file"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Fixed Start Processing Button */}
      <div className="shrink-0 px-6 py-4 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
        <div className="w-full max-w-xl mx-auto">
          <button
            onClick={handleStartProcessing}
            disabled={selectedFiles.length === 0}
            className={`w-full py-3 font-semibold rounded-lg transition-colors flex items-center justify-center space-x-2 ${
              selectedFiles.length > 0
                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                : 'bg-slate-300 dark:bg-slate-600 text-slate-500 dark:text-slate-400 cursor-not-allowed'
            }`}
          >
            <span>Start Processing</span>
            {selectedFiles.length > 0 && (
              <span className="text-blue-200">({selectedFiles.length} {selectedFiles.length === 1 ? 'file' : 'files'})</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default UploadView;