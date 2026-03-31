import React from 'react';
import type { GeminiModel } from '../utils/modelStorage';
import IconActionButton from './IconActionButton';
import { CloseIcon, RefreshCwIcon } from './Icons';

interface ReprocessDocumentDialogProps {
  isOpen: boolean;
  documentName: string;
  pageCount: number;
  models: GeminiModel[];
  selectedModelId: string;
  error: string;
  isSubmitting: boolean;
  onChangeModel: (modelId: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}

const ReprocessDocumentDialog: React.FC<ReprocessDocumentDialogProps> = ({
  isOpen,
  documentName,
  pageCount,
  models,
  selectedModelId,
  error,
  isSubmitting,
  onChangeModel,
  onClose,
  onSubmit,
}) => {
  if (!isOpen) {
    return null;
  }

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
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">Reprocess document</h2>
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
            className="w-full rounded-2xl border border-slate-300 bg-white p-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
          >
            {models.map((model) => (
              <option key={model.id} value={model.id}>
                {model.name} ({model.description}){model.isCustom ? ' ★' : ''}
              </option>
            ))}
          </select>
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
            label={isSubmitting ? 'Reprocessing document' : 'Reprocess document'}
            isActive
            variant="primary"
            disabled={isSubmitting}
            onClick={onSubmit}
          />
        </div>
      </div>
    </div>
  );
};

export default ReprocessDocumentDialog;
