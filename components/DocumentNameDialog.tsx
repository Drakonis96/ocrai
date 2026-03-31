import React from 'react';
import IconActionButton from './IconActionButton';
import { CheckCircleIcon, CloseIcon, EditIcon } from './Icons';

interface DocumentNameDialogProps {
  isOpen: boolean;
  value: string;
  error: string;
  isSaving: boolean;
  title?: string;
  description?: string;
  onChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}

const DocumentNameDialog: React.FC<DocumentNameDialogProps> = ({
  isOpen,
  value,
  error,
  isSaving,
  title = 'Rename document',
  description = 'Update the document name everywhere it appears.',
  onChange,
  onClose,
  onSubmit,
}) => {
  if (!isOpen) {
    return null;
  }

  return (
    <div
      data-testid="rename-document-dialog"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-800">
        <div className="mb-4 flex items-center gap-3 text-blue-600 dark:text-blue-400">
          <div className="rounded-full bg-blue-100 p-2 dark:bg-blue-900/30">
            <EditIcon className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">{title}</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</p>
          </div>
        </div>

        <label className="block">
          <span className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">Document name</span>
          <input
            autoFocus
            data-testid="rename-document-input"
            type="text"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                onSubmit();
              } else if (event.key === 'Escape') {
                onClose();
              }
            }}
            placeholder="Document name"
            className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
          />
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
            icon={<CheckCircleIcon className="h-4 w-4" />}
            label={isSaving ? 'Saving name' : 'Save name'}
            isActive
            variant="primary"
            disabled={isSaving}
            onClick={onSubmit}
          />
        </div>
      </div>
    </div>
  );
};

export default DocumentNameDialog;
