import React, { useEffect, useState } from 'react';
import type { GeminiModel } from '../utils/modelStorage';
import IconActionButton from './IconActionButton';
import { CloseIcon, RefreshCwIcon } from './Icons';

const BATCH_SIZE_PRESETS = [1, 2, 5, 10, 15];

interface ReprocessDocumentDialogProps {
  isOpen: boolean;
  documentName: string;
  pageCount: number;
  models: GeminiModel[];
  title?: string;
  submitLabel?: string;
  submitBusyLabel?: string;
  selectedModelId: string;
  selectedPagesPerBatch: number;
  selectedSplitColumns: boolean;
  error: string;
  isSubmitting: boolean;
  onChangeModel: (modelId: string) => void;
  onChangePagesPerBatch: (pagesPerBatch: number) => void;
  onChangeSplitColumns: (splitColumns: boolean) => void;
  onClose: () => void;
  onSubmit: () => void;
}

const ReprocessDocumentDialog: React.FC<ReprocessDocumentDialogProps> = ({
  isOpen,
  documentName,
  pageCount,
  models,
  title,
  submitLabel,
  submitBusyLabel,
  selectedModelId,
  selectedPagesPerBatch,
  selectedSplitColumns,
  error,
  isSubmitting,
  onChangeModel,
  onChangePagesPerBatch,
  onChangeSplitColumns,
  onClose,
  onSubmit,
}) => {
  const [batchSizeChoice, setBatchSizeChoice] = useState('1');

  useEffect(() => {
    const normalizedBatchSize = Number.isInteger(selectedPagesPerBatch) && selectedPagesPerBatch > 0
      ? selectedPagesPerBatch
      : 1;
    setBatchSizeChoice(BATCH_SIZE_PRESETS.includes(normalizedBatchSize) ? String(normalizedBatchSize) : 'custom');
  }, [selectedPagesPerBatch]);

  if (!isOpen) {
    return null;
  }

  const normalizedBatchSize = Number.isInteger(selectedPagesPerBatch) && selectedPagesPerBatch > 0
    ? selectedPagesPerBatch
    : 1;

  return (
    <div
      data-testid="reprocess-document-dialog"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-800">
        <div className="mb-4 flex items-center gap-3 text-blue-600 dark:text-blue-400">
          <div className="rounded-full bg-blue-100 p-2 dark:bg-blue-900/30">
            <RefreshCwIcon className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">{title ?? 'Reprocess document'}</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Reprocess all {pageCount} page{pageCount === 1 ? '' : 's'} in <span className="font-medium text-slate-700 dark:text-slate-200">{documentName}</span>.
            </p>
          </div>
        </div>

        <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:bg-slate-900/60 dark:text-slate-300">
          This keeps the current OCR mode/settings, replaces the full processed output, and clears saved document edits before the new run starts.
        </p>

        <label className="mt-4 block">
          <span className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">AI model</span>
          <select
            value={selectedModelId}
            onChange={(event) => onChangeModel(event.target.value)}
            disabled={models.length === 0}
            className="w-full rounded-2xl border border-slate-300 bg-white p-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
          >
            {models.length === 0 ? (
              <option value="">No models available</option>
            ) : (
              models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name} ({model.description}){model.isCustom ? ' ★' : ''}{model.isAutodetected ? ' • Auto' : ''}
                </option>
              ))
            )}
          </select>
          {models.length === 0 && (
            <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
              No models are available for the active OCR provider.
            </p>
          )}
        </label>

        <label className="mt-4 block">
          <span className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">Pages Processed At Once</span>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,0.7fr)]">
            <select
              value={batchSizeChoice}
              onChange={(event) => {
                const value = event.target.value;
                setBatchSizeChoice(value);
                if (value !== 'custom') {
                  onChangePagesPerBatch(Number(value));
                }
              }}
              className="w-full rounded-2xl border border-slate-300 bg-white p-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
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
                onChange={(event) => onChangePagesPerBatch(Math.max(1, Math.trunc(Number(event.target.value) || 1)))}
                className="w-full rounded-2xl border border-slate-300 bg-white p-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                placeholder="Pages"
              />
            )}
          </div>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            Full-document reprocessing will process this many pages in parallel.
          </p>
        </label>

        <label className="group mt-4 flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={selectedSplitColumns}
            onChange={(event) => onChangeSplitColumns(event.target.checked)}
            className="h-4 w-4 rounded border-slate-300 bg-white text-blue-600 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-700"
          />
          <span className="ml-2 text-sm text-slate-600 transition-colors group-hover:text-blue-600 dark:text-slate-400 dark:group-hover:text-blue-400">
            Split columns before OCR <span className="text-xs text-slate-400">(detects and processes each column separately)</span>
          </span>
        </label>

        {error && (
          <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>
        )}

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <IconActionButton
            icon={<CloseIcon className="h-4 w-4" />}
            label="Cancel"
            onClick={onClose}
          />
          <IconActionButton
            icon={<RefreshCwIcon className={`h-4 w-4 ${isSubmitting ? 'animate-spin' : ''}`} />}
            label={isSubmitting ? (submitBusyLabel ?? 'Reprocessing document') : (submitLabel ?? 'Reprocess document')}
            isActive
            variant="primary"
            disabled={isSubmitting || models.length === 0}
            onClick={onSubmit}
          />
        </div>
      </div>
    </div>
  );
};

export default ReprocessDocumentDialog;
