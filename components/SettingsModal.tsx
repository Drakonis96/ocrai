import React, { useEffect, useMemo, useState } from 'react';
import { LabelingSettings, PromptPreset, SettingsTab } from '../types';
import {
  DEFAULT_MODELS,
  OCR_PROVIDER_LABELS,
  type OcrModel,
  type OcrProvider,
  type OcrSettings,
  getProviderModels,
} from '../utils/modelStorage';
import { CheckCircleIcon, CloseIcon, EditIcon, PlusIcon, RefreshCwIcon, SettingsIcon, TrashIcon } from './Icons';
import IconActionButton from './IconActionButton';

interface SettingsModalProps {
  isOpen: boolean;
  activeTab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
  onClose: () => void;
  models: OcrModel[];
  ocrSettings: OcrSettings;
  prompts: PromptPreset[];
  availableLabels: string[];
  labelingSettings: LabelingSettings;
  onAddModel: (model: OcrModel) => Promise<void>;
  onRemoveModel: (modelId: string, provider?: OcrProvider) => Promise<void>;
  onAutodetectProviderModels: (provider: OcrProvider, settings?: OcrSettings) => Promise<void>;
  onUpdateOcrSettings: (settings: OcrSettings) => Promise<void>;
  onCreatePrompt: (prompt: Pick<PromptPreset, 'name' | 'prompt'>) => Promise<void>;
  onUpdatePrompt: (promptId: string, prompt: Pick<PromptPreset, 'name' | 'prompt'>) => Promise<void>;
  onDeletePrompt: (promptId: string) => Promise<void>;
  onCreateLabel: (labelName: string) => Promise<void>;
  onDeleteLabel: (labelName: string) => Promise<void>;
  onUpdateLabelingSettings: (settings: LabelingSettings) => Promise<void>;
}

const OCR_PROVIDERS: OcrProvider[] = ['gemini', 'lmstudio', 'ollama'];

const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  activeTab,
  onTabChange,
  onClose,
  models,
  ocrSettings,
  prompts,
  availableLabels,
  labelingSettings,
  onAddModel,
  onRemoveModel,
  onAutodetectProviderModels,
  onUpdateOcrSettings,
  onCreatePrompt,
  onUpdatePrompt,
  onDeletePrompt,
  onCreateLabel,
  onDeleteLabel,
  onUpdateLabelingSettings,
}) => {
  const [ocrSettingsDraft, setOcrSettingsDraft] = useState<OcrSettings>(ocrSettings);
  const [ocrSettingsError, setOcrSettingsError] = useState('');
  const [isSavingOcrSettings, setIsSavingOcrSettings] = useState(false);
  const [detectingProvider, setDetectingProvider] = useState<OcrProvider | null>(null);

  const [newModelId, setNewModelId] = useState('');
  const [newModelName, setNewModelName] = useState('');
  const [newModelDesc, setNewModelDesc] = useState('');
  const [newModelProvider, setNewModelProvider] = useState<OcrProvider>(ocrSettings.provider);
  const [modelError, setModelError] = useState('');
  const [isSavingModel, setIsSavingModel] = useState(false);

  const [editingPromptId, setEditingPromptId] = useState<string | null>(null);
  const [promptName, setPromptName] = useState('');
  const [promptContent, setPromptContent] = useState('');
  const [promptError, setPromptError] = useState('');
  const [isSavingPrompt, setIsSavingPrompt] = useState(false);

  const [newLabelName, setNewLabelName] = useState('');
  const [labelError, setLabelError] = useState('');
  const [isSavingLabel, setIsSavingLabel] = useState(false);
  const [isUpdatingLabelingSettings, setIsUpdatingLabelingSettings] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setNewModelId('');
      setNewModelName('');
      setNewModelDesc('');
      setNewModelProvider(ocrSettings.provider);
      setModelError('');
      setEditingPromptId(null);
      setPromptName('');
      setPromptContent('');
      setPromptError('');
      setNewLabelName('');
      setLabelError('');
      setOcrSettingsError('');
      return;
    }

    setOcrSettingsDraft(ocrSettings);
    setNewModelProvider(ocrSettings.provider);
    if (!editingPromptId && prompts.length === 0) {
      setPromptName('');
      setPromptContent('');
    }
  }, [editingPromptId, isOpen, ocrSettings, prompts.length]);

  const promptBeingEdited = useMemo(
    () => prompts.find((prompt) => prompt.id === editingPromptId) ?? null,
    [editingPromptId, prompts]
  );

  const providerModels = useMemo(
    () => getProviderModels(models, ocrSettingsDraft.provider),
    [models, ocrSettingsDraft.provider]
  );

  useEffect(() => {
    setOcrSettingsDraft((current) => {
      const selectedModelStillAvailable = providerModels.some((model) => model.id === current.selectedModelId);
      if (selectedModelStillAvailable || current.selectedModelId === '') {
        return current;
      }

      return {
        ...current,
        selectedModelId: providerModels[0]?.id ?? '',
      };
    });
  }, [providerModels]);

  const resetPromptForm = () => {
    setEditingPromptId(null);
    setPromptName('');
    setPromptContent('');
    setPromptError('');
  };

  const startPromptEdition = (prompt: PromptPreset) => {
    setEditingPromptId(prompt.id);
    setPromptName(prompt.name);
    setPromptContent(prompt.prompt);
    setPromptError('');
    onTabChange('prompts');
  };

  const handleAddModel = async () => {
    if (!newModelId.trim()) {
      setModelError('Model ID is required');
      return;
    }

    setIsSavingModel(true);
    try {
      await onAddModel({
        id: newModelId.trim(),
        name: newModelName.trim() || newModelId.trim(),
        description: newModelDesc.trim() || 'Custom',
        provider: newModelProvider,
        isCustom: true,
      });
      setNewModelId('');
      setNewModelName('');
      setNewModelDesc('');
      setModelError('');
    } catch (error: any) {
      setModelError(error.message || 'Failed to add model');
    } finally {
      setIsSavingModel(false);
    }
  };

  const handleRemoveModel = async (modelId: string, provider: OcrProvider) => {
    try {
      await onRemoveModel(modelId, provider);
      setModelError('');
    } catch (error: any) {
      setModelError(error.message || 'Failed to remove model');
    }
  };

  const handleSaveOcrSettings = async () => {
    const lmStudioPort = Number(ocrSettingsDraft.lmStudio.port);
    const ollamaPort = Number(ocrSettingsDraft.ollama.port);
    const portsAreValid = [lmStudioPort, ollamaPort].every((port) => Number.isInteger(port) && port >= 1 && port <= 65535);
    if (!portsAreValid) {
      setOcrSettingsError('Ports must be valid integers between 1 and 65535.');
      return;
    }

    if (providerModels.length > 0 && !ocrSettingsDraft.selectedModelId) {
      setOcrSettingsError('Select a default model for the active provider.');
      return;
    }

    setIsSavingOcrSettings(true);
    try {
      await onUpdateOcrSettings({
        ...ocrSettingsDraft,
        lmStudio: {
          host: ocrSettingsDraft.lmStudio.host.trim(),
          port: lmStudioPort,
        },
        ollama: {
          host: ocrSettingsDraft.ollama.host.trim(),
          port: ollamaPort,
        },
      });
      setOcrSettingsError('');
    } catch (error: any) {
      setOcrSettingsError(error.message || 'Failed to save OCR settings');
    } finally {
      setIsSavingOcrSettings(false);
    }
  };

  const handleAutodetectModels = async (provider: OcrProvider) => {
    setDetectingProvider(provider);
    try {
      await onAutodetectProviderModels(provider, ocrSettingsDraft);
      setOcrSettingsError('');
      setModelError('');
    } catch (error: any) {
      setOcrSettingsError(error.message || 'Failed to autodetect models');
    } finally {
      setDetectingProvider(null);
    }
  };

  const handleSavePrompt = async () => {
    if (!promptName.trim() || !promptContent.trim()) {
      setPromptError('Title and content are required');
      return;
    }

    setIsSavingPrompt(true);
    try {
      if (editingPromptId) {
        await onUpdatePrompt(editingPromptId, {
          name: promptName.trim(),
          prompt: promptContent.trim(),
        });
      } else {
        await onCreatePrompt({
          name: promptName.trim(),
          prompt: promptContent.trim(),
        });
      }

      resetPromptForm();
    } catch (error: any) {
      setPromptError(error.message || 'Failed to save prompt');
    } finally {
      setIsSavingPrompt(false);
    }
  };

  const handleDeletePrompt = async (promptId: string) => {
    try {
      await onDeletePrompt(promptId);
      if (editingPromptId === promptId) {
        resetPromptForm();
      }
    } catch (error: any) {
      setPromptError(error.message || 'Failed to delete prompt');
    }
  };

  const handleCreateLabel = async () => {
    if (!newLabelName.trim()) {
      setLabelError('Label name is required');
      return;
    }

    setIsSavingLabel(true);
    try {
      await onCreateLabel(newLabelName.trim());
      setNewLabelName('');
      setLabelError('');
    } catch (error: any) {
      setLabelError(error.message || 'Failed to create label');
    } finally {
      setIsSavingLabel(false);
    }
  };

  const handleDeleteLabel = async (labelName: string) => {
    try {
      await onDeleteLabel(labelName);
      setLabelError('');
    } catch (error: any) {
      setLabelError(error.message || 'Failed to delete label');
    }
  };

  const handleToggleAutomaticLabeling = async (enabled: boolean) => {
    setIsUpdatingLabelingSettings(true);
    try {
      await onUpdateLabelingSettings({
        autoLabelDocuments: enabled,
      });
      setLabelError('');
    } catch (error: any) {
      setLabelError(error.message || 'Failed to update labeling settings');
    } finally {
      setIsUpdatingLabelingSettings(false);
    }
  };

  if (!isOpen) {
    return null;
  }

  const isAiTab = activeTab !== 'labeling';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 backdrop-blur-sm sm:p-4">
      <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-800">
        <div className="flex flex-col gap-4 border-b border-slate-200 p-4 dark:border-slate-700 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-blue-100 p-2.5 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
              <SettingsIcon className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Settings</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Manage OCR providers, reusable prompts, and document labeling.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 sm:justify-end">
            <div className="flex items-center gap-2 rounded-full bg-slate-100 p-1 dark:bg-slate-900/70">
              <button
                type="button"
                onClick={() => onTabChange(activeTab === 'prompts' ? 'prompts' : 'models')}
                className={`rounded-full px-3 py-2 text-sm font-medium transition-colors ${
                  isAiTab
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
                    : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                }`}
              >
                AI
              </button>
              <button
                type="button"
                onClick={() => onTabChange('labeling')}
                className={`rounded-full px-3 py-2 text-sm font-medium transition-colors ${
                  activeTab === 'labeling'
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
                    : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                }`}
              >
                Labeling
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-white"
              aria-label="Close settings"
            >
              <CloseIcon className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          {isAiTab ? (
            <div className="space-y-5">
              <div className="flex items-center gap-2 rounded-full bg-slate-100 p-1 dark:bg-slate-900/70">
                <button
                  type="button"
                  onClick={() => onTabChange('models')}
                  className={`rounded-full px-3 py-2 text-sm font-medium transition-colors ${
                    activeTab === 'models'
                      ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
                      : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                  }`}
                >
                  Models
                </button>
                <button
                  type="button"
                  onClick={() => onTabChange('prompts')}
                  className={`rounded-full px-3 py-2 text-sm font-medium transition-colors ${
                    activeTab === 'prompts'
                      ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
                      : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                  }`}
                >
                  Prompts
                </button>
              </div>

              {activeTab === 'models' ? (
                <div className="space-y-5">
                  <div className="grid gap-5 xl:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
                    <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/40">
                      <div>
                        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          OCR Provider
                        </h3>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                          Choose the active OCR engine and the default model used across uploads and reprocessing.
                        </p>
                      </div>

                      <div className="mt-4 space-y-3">
                        <label className="block">
                          <span className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">Provider</span>
                          <select
                            aria-label="OCR provider"
                            value={ocrSettingsDraft.provider}
                            onChange={(event) => {
                              const nextProvider = event.target.value as OcrProvider;
                              const nextProviderModels = getProviderModels(models, nextProvider);
                              setOcrSettingsDraft((current) => ({
                                ...current,
                                provider: nextProvider,
                                selectedModelId: nextProviderModels.some((model) => model.id === current.selectedModelId)
                                  ? current.selectedModelId
                                  : (nextProviderModels[0]?.id ?? ''),
                              }));
                            }}
                            className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                          >
                            {OCR_PROVIDERS.map((provider) => (
                              <option key={provider} value={provider}>
                                {OCR_PROVIDER_LABELS[provider]}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="block">
                          <span className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">Default OCR model</span>
                          <select
                            aria-label="Default OCR model"
                            value={ocrSettingsDraft.selectedModelId}
                            onChange={(event) => setOcrSettingsDraft((current) => ({ ...current, selectedModelId: event.target.value }))}
                            disabled={providerModels.length === 0}
                            className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                          >
                            {providerModels.length === 0 ? (
                              <option value="">No models available for this provider</option>
                            ) : (
                              providerModels.map((model) => (
                                <option key={`${model.provider ?? 'gemini'}:${model.id}`} value={model.id}>
                                  {model.name} ({model.description})
                                </option>
                              ))
                            )}
                          </select>
                        </label>

                        {ocrSettingsError && (
                          <p className="text-sm text-red-600 dark:text-red-400">{ocrSettingsError}</p>
                        )}

                        <IconActionButton
                          icon={<CheckCircleIcon className="h-4 w-4" />}
                          label={isSavingOcrSettings ? 'Saving OCR settings' : 'Save OCR settings'}
                          isActive
                          variant="primary"
                          disabled={isSavingOcrSettings}
                          onClick={handleSaveOcrSettings}
                          className="w-full justify-center rounded-2xl"
                        />
                      </div>
                    </section>

                    <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900/20">
                      <div>
                        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          Local Providers
                        </h3>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                          Configure host and port for LM Studio and Ollama, then autodetect installed models.
                        </p>
                      </div>

                      <div className="mt-4 grid gap-4 lg:grid-cols-2">
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/60">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <h4 className="text-sm font-semibold text-slate-900 dark:text-white">LM Studio</h4>
                              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                                OpenAI-compatible local server for vision and structured outputs.
                              </p>
                            </div>
                            <IconActionButton
                              icon={<RefreshCwIcon className={`h-4 w-4 ${detectingProvider === 'lmstudio' ? 'animate-spin' : ''}`} />}
                              label={detectingProvider === 'lmstudio' ? 'Detecting' : 'Autodetect'}
                              variant="primary"
                              disabled={detectingProvider !== null}
                              onClick={() => handleAutodetectModels('lmstudio')}
                              aria-label="Autodetect LM Studio models"
                            />
                          </div>

                          <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_9rem]">
                            <input
                              type="text"
                              aria-label="LM Studio host"
                              value={ocrSettingsDraft.lmStudio.host}
                              onChange={(event) => setOcrSettingsDraft((current) => ({
                                ...current,
                                lmStudio: { ...current.lmStudio, host: event.target.value },
                              }))}
                              placeholder="127.0.0.1"
                              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                            />
                            <input
                              type="number"
                              min={1}
                              max={65535}
                              aria-label="LM Studio port"
                              value={ocrSettingsDraft.lmStudio.port}
                              onChange={(event) => setOcrSettingsDraft((current) => ({
                                ...current,
                                lmStudio: { ...current.lmStudio, port: Number(event.target.value) || current.lmStudio.port },
                              }))}
                              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                            />
                          </div>
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/60">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <h4 className="text-sm font-semibold text-slate-900 dark:text-white">Ollama</h4>
                              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                                Local chat API with vision-capable models when available.
                              </p>
                            </div>
                            <IconActionButton
                              icon={<RefreshCwIcon className={`h-4 w-4 ${detectingProvider === 'ollama' ? 'animate-spin' : ''}`} />}
                              label={detectingProvider === 'ollama' ? 'Detecting' : 'Autodetect'}
                              variant="primary"
                              disabled={detectingProvider !== null}
                              onClick={() => handleAutodetectModels('ollama')}
                              aria-label="Autodetect Ollama models"
                            />
                          </div>

                          <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_9rem]">
                            <input
                              type="text"
                              aria-label="Ollama host"
                              value={ocrSettingsDraft.ollama.host}
                              onChange={(event) => setOcrSettingsDraft((current) => ({
                                ...current,
                                ollama: { ...current.ollama, host: event.target.value },
                              }))}
                              placeholder="127.0.0.1"
                              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                            />
                            <input
                              type="number"
                              min={1}
                              max={65535}
                              aria-label="Ollama port"
                              value={ocrSettingsDraft.ollama.port}
                              onChange={(event) => setOcrSettingsDraft((current) => ({
                                ...current,
                                ollama: { ...current.ollama, port: Number(event.target.value) || current.ollama.port },
                              }))}
                              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                            />
                          </div>
                        </div>
                      </div>
                    </section>
                  </div>

                  <div className="grid gap-5 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
                    <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/40">
                      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Add Model
                      </h3>
                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                        Add a model manually when you know its identifier and autodetection is not enough.
                      </p>

                      <div className="mt-4 space-y-3">
                        <select
                          aria-label="Manual model provider"
                          value={newModelProvider}
                          onChange={(event) => setNewModelProvider(event.target.value as OcrProvider)}
                          className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                        >
                          {OCR_PROVIDERS.map((provider) => (
                            <option key={provider} value={provider}>
                              {OCR_PROVIDER_LABELS[provider]}
                            </option>
                          ))}
                        </select>
                        <input
                          type="text"
                          value={newModelId}
                          onChange={(event) => setNewModelId(event.target.value)}
                          placeholder="Model ID"
                          className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                        />
                        <input
                          type="text"
                          value={newModelName}
                          onChange={(event) => setNewModelName(event.target.value)}
                          placeholder="Display name"
                          className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                        />
                        <input
                          type="text"
                          value={newModelDesc}
                          onChange={(event) => setNewModelDesc(event.target.value)}
                          placeholder="Description"
                          className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                        />
                        {modelError && (
                          <p className="text-sm text-red-600 dark:text-red-400">{modelError}</p>
                        )}
                        <IconActionButton
                          icon={<PlusIcon className="h-4 w-4" />}
                          label={isSavingModel ? 'Saving model' : 'Add model'}
                          isActive
                          variant="primary"
                          disabled={isSavingModel}
                          onClick={handleAddModel}
                          className="w-full justify-center rounded-2xl"
                        />
                      </div>
                    </section>

                    <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900/20">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            Available Models
                          </h3>
                          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                            Gemini models are bundled, while local models can be autodetected or added manually.
                          </p>
                        </div>
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                          {models.length}
                        </span>
                      </div>

                      <div className="mt-4 space-y-3">
                        {models.map((model) => {
                          const modelProvider = model.provider ?? 'gemini';
                          const isDefault = DEFAULT_MODELS.some((defaultModel) => (
                            defaultModel.id === model.id && defaultModel.provider === modelProvider
                          ));

                          return (
                            <div
                              key={`${modelProvider}:${model.id}`}
                              className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/60 sm:flex-row sm:items-start sm:justify-between"
                            >
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                                    {model.name}
                                  </p>
                                  <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                                    {OCR_PROVIDER_LABELS[modelProvider]}
                                  </span>
                                  {model.isAutodetected && (
                                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                                      Auto
                                    </span>
                                  )}
                                  {model.isCustom && (
                                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                                      Custom
                                    </span>
                                  )}
                                </div>
                                <p className="mt-1 break-all text-xs text-slate-500 dark:text-slate-400">{model.id}</p>
                                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{model.description}</p>
                              </div>

                              {!isDefault && (
                                <IconActionButton
                                  icon={<TrashIcon className="h-4 w-4" />}
                                  label="Remove"
                                  variant="danger"
                                  onClick={() => handleRemoveModel(model.id, modelProvider)}
                                  className="self-start"
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  </div>
                </div>
              ) : (
                <div className="grid gap-5 xl:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
                  <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/40">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          {promptBeingEdited ? 'Edit Prompt' : 'Add Prompt'}
                        </h3>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                          Prompt bodies add extra instructions on top of the built-in OCR rules.
                        </p>
                      </div>
                      {promptBeingEdited && (
                        <IconActionButton
                          icon={<CloseIcon className="h-4 w-4" />}
                          label="Cancel"
                          onClick={resetPromptForm}
                        />
                      )}
                    </div>

                    <div className="mt-4 space-y-3">
                      <input
                        type="text"
                        value={promptName}
                        onChange={(event) => setPromptName(event.target.value)}
                        placeholder="Prompt title"
                        className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                      />
                      <textarea
                        value={promptContent}
                        onChange={(event) => setPromptContent(event.target.value)}
                        placeholder="Prompt content"
                        rows={10}
                        className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                      />
                      {promptError && (
                        <p className="text-sm text-red-600 dark:text-red-400">{promptError}</p>
                      )}
                      <div className="flex flex-wrap gap-2">
                        <IconActionButton
                          icon={promptBeingEdited ? <CheckCircleIcon className="h-4 w-4" /> : <PlusIcon className="h-4 w-4" />}
                          label={isSavingPrompt ? 'Saving prompt' : promptBeingEdited ? 'Save changes' : 'Add prompt'}
                          isActive
                          variant="primary"
                          disabled={isSavingPrompt}
                          onClick={handleSavePrompt}
                          className="justify-center rounded-2xl"
                        />
                        {!promptBeingEdited && (
                          <IconActionButton
                            icon={<PlusIcon className="h-4 w-4" />}
                            label="New draft"
                            onClick={resetPromptForm}
                          />
                        )}
                      </div>
                    </div>
                  </section>

                  <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900/20">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          Saved Prompts
                        </h3>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                          Prompt titles and contents are persisted on disk.
                        </p>
                      </div>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                        {prompts.length}
                      </span>
                    </div>

                    <div className="mt-4 space-y-3">
                      {prompts.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                          No prompts saved yet.
                        </div>
                      ) : (
                        prompts.map((prompt) => (
                          <div
                            key={prompt.id}
                            className={`rounded-2xl border p-4 transition-colors ${
                              editingPromptId === prompt.id
                                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                : 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60'
                            }`}
                          >
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                                  {prompt.name}
                                </p>
                                <p className="mt-2 max-h-24 overflow-hidden whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-300">
                                  {prompt.prompt}
                                </p>
                              </div>

                              <div className="flex flex-wrap gap-2 sm:justify-end">
                                <IconActionButton
                                  icon={<EditIcon className="h-4 w-4" />}
                                  label="Edit"
                                  isActive={editingPromptId === prompt.id}
                                  variant="primary"
                                  onClick={() => startPromptEdition(prompt)}
                                />
                                <IconActionButton
                                  icon={<TrashIcon className="h-4 w-4" />}
                                  label="Delete"
                                  variant="danger"
                                  onClick={() => handleDeletePrompt(prompt.id)}
                                />
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </section>
                </div>
              )}
            </div>
          ) : (
            <div className="grid gap-5 xl:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
              <section className="space-y-5">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/40">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Automatic Labeling
                      </h3>
                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                        When enabled, new documents are labeled automatically by AI using the document name and your available labels.
                      </p>
                    </div>
                  </div>

                  <label className="mt-4 flex cursor-pointer items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800">
                    <input
                      type="checkbox"
                      checked={labelingSettings.autoLabelDocuments}
                      disabled={isUpdatingLabelingSettings}
                      onChange={(event) => handleToggleAutomaticLabeling(event.target.checked)}
                      className="h-5 w-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-700"
                    />
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      Enable automatic AI labeling for new documents
                    </span>
                  </label>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/40">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Create Label
                  </h3>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    Add labels that can be assigned manually or selected automatically.
                  </p>

                  <div className="mt-4 space-y-3">
                    <input
                      type="text"
                      value={newLabelName}
                      onChange={(event) => setNewLabelName(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          void handleCreateLabel();
                        }
                      }}
                      placeholder="Label name"
                      className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                    />
                    {labelError && (
                      <p className="text-sm text-red-600 dark:text-red-400">{labelError}</p>
                    )}
                    <IconActionButton
                      icon={<PlusIcon className="h-4 w-4" />}
                      label={isSavingLabel ? 'Saving label' : 'Add label'}
                      isActive
                      variant="primary"
                      disabled={isSavingLabel || !newLabelName.trim()}
                      onClick={handleCreateLabel}
                      className="w-full justify-center rounded-2xl"
                    />
                  </div>
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900/20">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Available Labels
                    </h3>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      Manage the labels that appear in the dashboard and automatic labeling.
                    </p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                    {availableLabels.length}
                  </span>
                </div>

                <div className="mt-4 space-y-3">
                  {availableLabels.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                      No labels created yet.
                    </div>
                  ) : (
                    availableLabels.map((label) => (
                      <div
                        key={label}
                        className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/60 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{label}</p>
                        </div>

                        <IconActionButton
                          icon={<TrashIcon className="h-4 w-4" />}
                          label="Delete"
                          variant="danger"
                          onClick={() => handleDeleteLabel(label)}
                          className="self-start"
                        />
                      </div>
                    ))
                  )}
                </div>
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
