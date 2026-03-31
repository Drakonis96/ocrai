import React from 'react';
import IconActionButton from './IconActionButton';
import { CheckCircleIcon, CloseIcon, PlusIcon, SettingsIcon } from './Icons';

interface DocumentLabelsDialogProps {
  isOpen: boolean;
  documentName: string;
  availableLabels: string[];
  selectedLabels: string[];
  error: string;
  isSaving: boolean;
  onToggleLabel: (labelName: string) => void;
  onClose: () => void;
  onSubmit: () => void;
  onOpenLabelingSettings?: () => void;
}

const DocumentLabelsDialog: React.FC<DocumentLabelsDialogProps> = ({
  isOpen,
  documentName,
  availableLabels,
  selectedLabels,
  error,
  isSaving,
  onToggleLabel,
  onClose,
  onSubmit,
  onOpenLabelingSettings,
}) => {
  if (!isOpen) {
    return null;
  }

  const hasAvailableLabels = availableLabels.length > 0;

  return (
    <div
      data-testid="document-labels-dialog"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-800">
        <div className="mb-4 flex items-center gap-3 text-blue-600 dark:text-blue-400">
          <div className="rounded-full bg-blue-100 p-2 dark:bg-blue-900/30">
            <PlusIcon className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">Manage labels</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Choose the labels that should appear under <span className="font-medium text-slate-700 dark:text-slate-200">{documentName}</span>.
            </p>
          </div>
        </div>

        {hasAvailableLabels ? (
          <>
            <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:bg-slate-900/60 dark:text-slate-300">
              <span>Available labels</span>
              <span className="rounded-full bg-white px-2.5 py-1 font-medium text-slate-700 shadow-sm dark:bg-slate-800 dark:text-slate-200">
                {selectedLabels.length} selected
              </span>
            </div>

            <div className="max-h-72 space-y-2 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-900/60">
              {availableLabels.map((label) => {
                const isSelected = selectedLabels.includes(label);

                return (
                  <label
                    key={label}
                    className={`flex cursor-pointer items-center gap-3 rounded-2xl px-3 py-2 transition-colors ${
                      isSelected
                        ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                        : 'hover:bg-white dark:hover:bg-slate-800'
                    }`}
                  >
                    <input
                      type="checkbox"
                      aria-label={`Toggle ${label} label`}
                      checked={isSelected}
                      onChange={() => onToggleLabel(label)}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-700"
                    />
                    <span className="min-w-0 flex-1 text-sm font-medium text-slate-700 dark:text-slate-200">
                      {label}
                    </span>
                  </label>
                );
              })}
            </div>
          </>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center dark:border-slate-700 dark:bg-slate-900/60">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No labels are available yet. Create them in Settings &gt; Labeling first.
            </p>
            {onOpenLabelingSettings && (
              <IconActionButton
                icon={<SettingsIcon className="h-4 w-4" />}
                label="Open Labeling settings"
                className="mt-4 justify-center rounded-2xl"
                onClick={onOpenLabelingSettings}
              />
            )}
          </div>
        )}

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
            icon={hasAvailableLabels ? <CheckCircleIcon className="h-4 w-4" /> : <SettingsIcon className="h-4 w-4" />}
            label={hasAvailableLabels ? (isSaving ? 'Saving labels' : 'Save labels') : 'Close'}
            isActive
            variant="primary"
            disabled={hasAvailableLabels ? isSaving : false}
            onClick={hasAvailableLabels ? onSubmit : onClose}
          />
        </div>
      </div>
    </div>
  );
};

export default DocumentLabelsDialog;
