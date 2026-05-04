import React from 'react';
import IconActionButton from './IconActionButton';
import { CheckCircleIcon, CloseIcon, MoveIcon } from './Icons';

const ROOT_DESTINATION_VALUE = '__root__';

export interface MoveDestinationOption {
  id: string | null;
  label: string;
  depth: number;
}

interface MoveItemDialogProps {
  isOpen: boolean;
  itemName: string;
  itemType: 'file' | 'folder';
  title?: string;
  submitLabel?: string;
  submitSavingLabel?: string;
  destinations: MoveDestinationOption[];
  selectedDestinationId: string | null;
  currentDestinationId: string | null;
  error: string;
  isSaving: boolean;
  onChange: (destinationId: string | null) => void;
  onClose: () => void;
  onSubmit: () => void;
}

const MoveItemDialog: React.FC<MoveItemDialogProps> = ({
  isOpen,
  itemName,
  itemType,
  title,
  submitLabel,
  submitSavingLabel,
  destinations,
  selectedDestinationId,
  currentDestinationId,
  error,
  isSaving,
  onChange,
  onClose,
  onSubmit,
}) => {
  if (!isOpen) {
    return null;
  }

  return (
    <div
      data-testid="move-item-dialog"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-800">
        <div className="mb-4 flex items-center gap-3 text-blue-600 dark:text-blue-400">
          <div className="rounded-full bg-blue-100 p-2 dark:bg-blue-900/30">
            <MoveIcon className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">{title ?? `Move ${itemType === 'folder' ? 'folder' : 'document'}`}</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Choose where <span className="font-medium text-slate-700 dark:text-slate-200">{itemName}</span> should live.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Destination</p>
          <div className="max-h-72 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-900/60">
            {destinations.map((destination) => {
              const value = destination.id ?? ROOT_DESTINATION_VALUE;
              const isChecked = destination.id === selectedDestinationId;
              const isCurrent = destination.id === currentDestinationId;

              return (
                <label
                  key={value}
                  className={`flex cursor-pointer items-center gap-3 rounded-2xl px-3 py-2 transition-colors ${
                    isChecked
                      ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                      : 'hover:bg-white dark:hover:bg-slate-800'
                  }`}
                  style={{ paddingLeft: `${destination.depth * 0.75 + 0.75}rem` }}
                >
                  <input
                    type="radio"
                    name="move-destination"
                    value={value}
                    checked={isChecked}
                    onChange={() => onChange(destination.id)}
                    className="h-4 w-4 border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-700"
                  />
                  <span className="min-w-0 flex-1 text-sm text-slate-700 dark:text-slate-200">
                    {destination.label}
                  </span>
                  {isCurrent && (
                    <span className="shrink-0 text-xs font-medium text-slate-400 dark:text-slate-500">Current</span>
                  )}
                </label>
              );
            })}
          </div>
        </div>

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
            label={isSaving ? (submitSavingLabel ?? 'Moving item') : (submitLabel ?? 'Move item')}
            isActive
            variant="primary"
            disabled={isSaving || selectedDestinationId === currentDestinationId}
            onClick={onSubmit}
          />
        </div>
      </div>
    </div>
  );
};

export default MoveItemDialog;
