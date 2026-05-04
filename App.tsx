import React, { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Login } from './components/Login';
import UploadView from './components/UploadView';
import Dashboard from './components/Dashboard';
import EditorView from './components/Editor/EditorView';
import SettingsModal from './components/SettingsModal';
import IconActionButton from './components/IconActionButton';
import {
  ArchiveIcon,
  AlertCircleIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CloseIcon,
  StopCircleIcon,
  HomeIcon,
  LoaderIcon,
  LogoutIcon,
  MoonIcon,
  SettingsIcon,
  SunIcon,
  TrashIcon,
} from './components/Icons';
import { AppView, DocumentData, FileSystemItem, FolderData, LabelingSettings, ProcessingOptions, PromptPreset, SettingsTab } from './types';
import { reconstructCleanText } from './utils/reconstruction';
import { markdownToPlainText } from './utils/richText';
import { deleteItem, getAllItems, nukeDB, saveItem } from './utils/storage';
import { MOCK_ID_PREFIX } from './constants';
import {
  addModel,
  DEFAULT_MODELS,
  DEFAULT_OCR_SETTINGS,
  GeminiModel,
  OcrProvider,
  OcrSettings,
  getModels,
  getProviderModels,
  removeModel,
  sortModelsForPreferredSelection,
} from './utils/modelStorage';
import { createPrompt, deletePrompt, getPrompts, updatePrompt } from './services/promptService';
import {
  createLabel,
  deleteLabel,
  getLabelingSettings,
  getLabels,
  updateLabelingSettings,
} from './services/labelingService';
import {
  autodetectProviderModels,
  getOcrSettings,
  updateOcrSettings,
} from './services/ocrSettingsService';
import { cancelDocument, reprocessDocument } from './services/geminiService';
import { downloadBlob } from './utils/download';
import { runWithConcurrencyLimit } from './utils/asyncPool';
// @ts-ignore
import JSZip from 'jszip';

const areItemsEqual = (left: FileSystemItem, right: FileSystemItem) =>
  JSON.stringify(left) === JSON.stringify(right);

const reconcileItems = (currentItems: FileSystemItem[], nextItems: FileSystemItem[]) => {
  const currentItemsById = new Map(currentItems.map((item) => [item.id, item]));
  let hasChanges = currentItems.length !== nextItems.length;

  const reconciledItems = nextItems.map((nextItem, index) => {
    const currentItem = currentItemsById.get(nextItem.id);
    if (!currentItem) {
      hasChanges = true;
      return nextItem;
    }

    if (currentItems[index]?.id !== nextItem.id) {
      hasChanges = true;
    }

    if (areItemsEqual(currentItem, nextItem)) {
      return currentItem;
    }

    hasChanges = true;
    return nextItem;
  });

  return hasChanges ? reconciledItems : currentItems;
};

const upsertItem = (currentItems: FileSystemItem[], nextItem: FileSystemItem) => {
  const currentIndex = currentItems.findIndex((item) => item.id === nextItem.id);
  if (currentIndex === -1) {
    return [...currentItems, nextItem];
  }

  const currentItem = currentItems[currentIndex];
  if (areItemsEqual(currentItem, nextItem)) {
    return currentItems;
  }

  const nextItems = currentItems.slice();
  nextItems[currentIndex] = nextItem;
  return nextItems;
};

const collectDescendantItemIds = (sourceItems: FileSystemItem[], parentId: string): string[] => (
  sourceItems
    .filter((item) => item.parentId === parentId)
    .flatMap((child) => [child.id, ...collectDescendantItemIds(sourceItems, child.id)])
);

const getUploadFileKey = (file: File) => `${file.name}:${file.size}:${file.lastModified}`;
const PROCESSING_POLL_INTERVAL_MS = 1000;
const MAX_CONCURRENT_UPLOADS = 4;

const isDocumentInFlight = (doc: DocumentData) => doc.status === 'processing' || doc.status === 'uploading';

const getDocumentPageTotal = (doc: DocumentData) => Math.max(
  Number.isFinite(doc.totalPages) ? doc.totalPages : 0,
  Array.isArray(doc.pages) ? doc.pages.length : 0
);

const getDocumentActiveProcessingPageCount = (doc: DocumentData) => (
  Array.isArray(doc.pages)
    ? doc.pages.filter((page) => page?.status === 'processing').length
    : 0
);

const getDocumentDisplayedProgress = (doc: DocumentData) => {
  const totalPages = getDocumentPageTotal(doc);

  if (doc.status === 'uploading' && (doc.sourceRenderStatus === 'pending' || doc.sourceRenderStatus === 'processing')) {
    return {
      processed: Math.min(Math.max(doc.sourceRenderCompletedPages ?? 0, 0), totalPages),
      total: totalPages,
    };
  }

  const completedPages = Math.min(
    Math.max(doc.processedPages ?? 0, 0) + Math.max(doc.failedPages ?? 0, 0),
    totalPages
  );
  const activeProcessingPages = getDocumentActiveProcessingPageCount(doc);

  return {
    processed: Math.min(completedPages + activeProcessingPages, totalPages),
    total: totalPages,
    activeProcessingPages,
  };
};

const getUploadProgressSummary = (doc: DocumentData) => {
  const totalPages = getDocumentPageTotal(doc);

  if (doc.status === 'uploading' && totalPages === 0) {
    return {
      phase: 'Uploading file',
      detail: 'Sending the document to the server.',
      remainingLabel: 'Starting...',
      current: 0,
      total: 0,
      percent: null,
      tone: 'blue',
      indeterminate: true,
    };
  }

  if (doc.sourceRenderStatus === 'pending' || doc.sourceRenderStatus === 'processing') {
    const completedPages = totalPages > 0
      ? Math.min(Math.max(doc.sourceRenderCompletedPages ?? 0, 0), totalPages)
      : 0;
    const remainingPages = Math.max(totalPages - completedPages, 0);

    return {
      phase: totalPages > 0 ? 'Rendering page images' : 'Preparing PDF',
      detail: totalPages > 0
        ? `${completedPages} of ${totalPages} pages are ready for OCR.`
        : 'Counting pages and preparing the document for OCR.',
      remainingLabel: remainingPages > 0 ? `${remainingPages} pages left` : 'Almost ready',
      current: completedPages,
      total: totalPages,
      percent: totalPages > 0 ? Math.round((completedPages / totalPages) * 100) : null,
      tone: 'blue',
      indeterminate: totalPages === 0,
    };
  }

  const total = Math.max(totalPages, 1);
  const processedPages = Math.max(doc.processedPages ?? 0, 0);
  const failedPages = Math.max(doc.failedPages ?? 0, 0);
  const retryingPages = Math.max(doc.retryingPages ?? 0, 0);
  const displayedProgress = getDocumentDisplayedProgress(doc);
  const completedPages = Math.min(processedPages + failedPages, total);
  const activeProcessingPages = displayedProgress.activeProcessingPages ?? 0;
  const visualProgressPages = Math.min(displayedProgress.processed, total);
  const remainingPages = Math.max(total - visualProgressPages, 0);

  if (doc.status === 'ready') {
    return {
      phase: 'Completed',
      detail: `${processedPages} of ${total} pages processed successfully.`,
      remainingLabel: 'Ready',
      current: total,
      total,
      percent: 100,
      tone: 'emerald',
      indeterminate: false,
    };
  }

  if (doc.status === 'error' && remainingPages === 0) {
    return {
      phase: 'Completed with issues',
      detail: failedPages > 0
        ? `${failedPages} pages finished with errors.`
        : 'The document finished with an error.',
      remainingLabel: 'Review needed',
      current: total,
      total,
      percent: 100,
      tone: 'rose',
      indeterminate: false,
    };
  }

  return {
    phase: 'Processing pages',
    detail: activeProcessingPages > 0
      ? `${processedPages} done, ${activeProcessingPages} in progress${retryingPages > 0 ? `, ${retryingPages} queued for retry.` : '.'}`
      : retryingPages > 0
        ? `${processedPages} done, ${retryingPages} queued for retry.`
        : `${completedPages} of ${total} pages processed.`,
    remainingLabel: remainingPages > 0 ? `${remainingPages} pages left` : 'Finishing...',
    current: visualProgressPages,
    total,
    percent: Math.round((visualProgressPages / total) * 100),
    tone: doc.status === 'error' ? 'rose' : 'blue',
    indeterminate: false,
  };
};

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<AppView>(AppView.DASHBOARD);
  const [items, setItems] = useState<FileSystemItem[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSessionDocs, setUploadSessionDocs] = useState<DocumentData[]>([]);
  const [isOverlayMinimized, setIsOverlayMinimized] = useState(false);
  const [isStopConfirmOpen, setIsStopConfirmOpen] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const uploadAbortedRef = useRef(false);
  const [isLoadingItems, setIsLoadingItems] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') === 'dark'
        || (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
    }

    return false;
  });

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteIncludeFolders, setDeleteIncludeFolders] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [activeSettingsTab, setActiveSettingsTab] = useState<SettingsTab>('models');
  const [models, setModels] = useState<GeminiModel[]>(DEFAULT_MODELS);
  const [ocrSettings, setOcrSettings] = useState<OcrSettings>(DEFAULT_OCR_SETTINGS);
  const [prompts, setPrompts] = useState<PromptPreset[]>([]);
  const [availableLabels, setAvailableLabels] = useState<string[]>([]);
  const [labelingSettings, setLabelingSettings] = useState<LabelingSettings>({ autoLabelDocuments: false });
  const itemsRef = useRef<FileSystemItem[]>([]);

  const loadItems = useCallback(async (
    { showLoading = false, preserveUnchanged = false }: { showLoading?: boolean; preserveUnchanged?: boolean } = {}
  ) => {
    try {
      if (showLoading) {
        setIsLoadingItems(true);
      }

      const data = await getAllItems();
      startTransition(() => {
        setItems((currentItems) => (preserveUnchanged ? reconcileItems(currentItems, data) : data));
      });
    } catch (error) {
      console.error('Failed to load items from DB', error);
    } finally {
      if (showLoading) {
        setIsLoadingItems(false);
      }
    }
  }, []);

  const loadSettings = useCallback(async () => {
    try {
      const [availableModels, nextOcrSettings, savedPrompts, labels, nextLabelingSettings] = await Promise.all([
        getModels(),
        getOcrSettings(),
        getPrompts(),
        getLabels(),
        getLabelingSettings(),
      ]);
      setModels(availableModels);
      setOcrSettings(nextOcrSettings);
      setPrompts(savedPrompts);
      setAvailableLabels(labels);
      setLabelingSettings(nextLabelingSettings);
    } catch (error) {
      console.error('Failed to load settings', error);
      setModels(DEFAULT_MODELS);
      setOcrSettings(DEFAULT_OCR_SETTINGS);
      setPrompts([]);
      setAvailableLabels([]);
      setLabelingSettings({ autoLabelDocuments: false });
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    const checkAuth = async () => {
      try {
        const response = await fetch('/api/check-auth');
        const data = await response.json();
        if (isMounted) {
          setIsAuthenticated(data.authenticated);
        }
      } catch (error) {
        if (isMounted) {
          setIsAuthenticated(false);
        }
      }
    };

    checkAuth();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (isAuthenticated !== true) {
      return;
    }

    loadItems({ showLoading: true });
    loadSettings();
  }, [isAuthenticated]);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    const root = window.document.documentElement;
    if (isDarkMode) {
      root.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDarkMode]);

  const hasProcessingItems = items.some(
    (item) => item.type === 'file' && ((item as DocumentData).status === 'processing' || (item as DocumentData).status === 'uploading')
  );
  const uploadSessionDocuments = useMemo(() => {
    const documentsById = new Map(
      items
        .filter((item): item is DocumentData => item.type === 'file')
        .map((item) => [item.id, item])
    );

    const persistedTrackedDocs = items
      .filter((item): item is DocumentData => item.type === 'file')
      .filter((doc) => isDocumentInFlight(doc));

    if (uploadSessionDocs.length === 0) {
      return persistedTrackedDocs;
    }

    const sessionTrackedDocs = uploadSessionDocs
      .map((doc) => documentsById.get(doc.id) ?? doc);

    const sessionTrackedDocIds = new Set(sessionTrackedDocs.map((doc) => doc.id));

    return [...sessionTrackedDocs, ...persistedTrackedDocs.filter((doc) => !sessionTrackedDocIds.has(doc.id))]
      .sort((left, right) => Number(isDocumentInFlight(right)) - Number(isDocumentInFlight(left)) || left.createdAt - right.createdAt);
  }, [items, uploadSessionDocs]);
  const hasActiveUploadSessionDocs = uploadSessionDocuments.some(isDocumentInFlight);
  const showUploadProgressOverlay = isUploading || uploadSessionDocuments.length > 0;
  const uploadProgressMode = isUploading ? 'modal' : 'panel';
  const uploadOverlaySummary = uploadSessionDocuments.length === 0
    ? 'Preparing and uploading your files.'
    : hasActiveUploadSessionDocs
      ? `Tracking ${uploadSessionDocuments.length} document${uploadSessionDocuments.length === 1 ? '' : 's'} through image rendering and OCR.`
      : `${uploadSessionDocuments.length} document${uploadSessionDocuments.length === 1 ? '' : 's'} finished processing.`;

  useEffect(() => {
    if (!hasProcessingItems) {
      return;
    }

    const timer = window.setInterval(() => {
      void loadItems({ preserveUnchanged: true });
    }, PROCESSING_POLL_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [hasProcessingItems, loadItems]);

  useEffect(() => {
    if (isUploading || uploadSessionDocuments.length === 0) {
      return;
    }

    if (uploadSessionDocuments.every((doc) => !isDocumentInFlight(doc))) {
      setUploadSessionDocs([]);
    }
  }, [isUploading, uploadSessionDocuments]);

  const handleLogout = async () => {
    try {
      await fetch('/api/logout', { method: 'POST' });
      setItems([]);
      setCurrentFolderId(null);
      setActiveDocId(null);
      setCurrentView(AppView.DASHBOARD);
      setIsLoadingItems(false);
      setIsAuthenticated(false);
      setIsSettingsOpen(false);
    } catch (error) {
      console.error('Logout failed', error);
    }
  };

  const toggleTheme = () => {
    setIsDarkMode((current) => !current);
  };

  const openSettings = (tab: SettingsTab = 'models') => {
    setActiveSettingsTab(tab);
    setIsSettingsOpen(true);
  };

  const handleAddModel = async (model: GeminiModel) => {
    const updatedModels = await addModel(model);
    setModels(updatedModels);
  };

  const handleRemoveModel = async (modelId: string, provider?: OcrProvider) => {
    const updatedModels = await removeModel(modelId, provider);
    setModels(updatedModels);
  };

  const handleCreatePrompt = async (prompt: Pick<PromptPreset, 'name' | 'prompt'>) => {
    const updatedPrompts = await createPrompt(prompt);
    setPrompts(updatedPrompts);
  };

  const handleUpdatePrompt = async (promptId: string, prompt: Pick<PromptPreset, 'name' | 'prompt'>) => {
    const updatedPrompts = await updatePrompt(promptId, prompt);
    setPrompts(updatedPrompts);
  };

  const handleDeletePrompt = async (promptId: string) => {
    const updatedPrompts = await deletePrompt(promptId);
    setPrompts(updatedPrompts);
  };

  const handleCreateLabel = async (labelName: string) => {
    const updatedLabels = await createLabel(labelName);
    setAvailableLabels(updatedLabels);
  };

  const handleDeleteLabel = async (labelName: string) => {
    const updatedLabels = await deleteLabel(labelName);
    setAvailableLabels(updatedLabels);
    setItems((current) => current.map((entry) => {
      if (entry.type !== 'file') {
        return entry;
      }

      const document = entry as DocumentData;
      return {
        ...document,
        labels: (document.labels ?? []).filter((label) => label.toLowerCase() !== labelName.toLowerCase()),
      };
    }));
  };

  const handleUpdateLabelingSettings = async (nextSettings: LabelingSettings) => {
    const updatedSettings = await updateLabelingSettings(nextSettings);
    setLabelingSettings(updatedSettings);
  };

  const handleUpdateOcrSettings = async (nextSettings: OcrSettings) => {
    const updatedSettings = await updateOcrSettings(nextSettings);
    setOcrSettings(updatedSettings);
  };

  const handleAutodetectProviderModels = async (provider: OcrProvider, nextSettings: OcrSettings = ocrSettings) => {
    const response = await autodetectProviderModels(provider, nextSettings);
    setModels(response.models);
    setOcrSettings(response.settings);
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(',')[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleCreateFolder = useCallback(async (name: string) => {
    const newFolder: FolderData = {
      id: `folder_${Date.now()}`,
      name,
      type: 'folder',
      parentId: currentFolderId,
      createdAt: Date.now(),
    };

    await saveItem(newFolder);
    setItems((current) => [...current, newFolder]);
  }, [currentFolderId]);

  const handleRequestDelete = useCallback((itemId: string) => {
    setItemToDelete(itemId);
  }, []);

  const deleteItemsByIds = useCallback(async (requestedIds: string[]) => {
    const currentItems = itemsRef.current;
    const idsToDelete = Array.from(new Set(
      requestedIds.flatMap((itemId) => [itemId, ...collectDescendantItemIds(currentItems, itemId)])
    ));

    if (idsToDelete.length === 0) {
      return;
    }

    for (const id of idsToDelete) {
      await deleteItem(id);
    }

    setItems((current) => current.filter((item) => !idsToDelete.includes(item.id)));

    if (activeDocId && idsToDelete.includes(activeDocId)) {
      setCurrentView(AppView.DASHBOARD);
      setActiveDocId(null);
    }
  }, [activeDocId]);

  const executeDeleteItem = async () => {
    if (!itemToDelete) {
      return;
    }

    try {
      await deleteItemsByIds([itemToDelete]);
    } catch (error) {
      console.error('Failed to delete items', error);
      alert('An error occurred while deleting. Please try again.');
      loadItems();
    } finally {
      setItemToDelete(null);
    }
  };

  const handleDeleteDocuments = useCallback(async (docIds: string[]) => {
    const normalizedDocIds = Array.from(new Set(docIds.filter(Boolean)));
    if (normalizedDocIds.length === 0) {
      return;
    }

    try {
      await deleteItemsByIds(normalizedDocIds);
    } catch (error) {
      console.error('Failed to delete selected documents', error);
      await loadItems();
      throw error;
    }
  }, [deleteItemsByIds, loadItems]);

  const handleMoveItem = useCallback(async (itemId: string, targetFolderId: string | null) => {
    if (itemId === targetFolderId) {
      throw new Error('Cannot move an item into itself.');
    }

    const currentItems = itemsRef.current;
    const item = currentItems.find((entry) => entry.id === itemId);
    if (!item) {
      throw new Error('Item not found.');
    }

    if (item.parentId === targetFolderId) {
      return;
    }

    if (targetFolderId !== null) {
      const targetFolder = currentItems.find((entry) => entry.id === targetFolderId && entry.type === 'folder');
      if (!targetFolder) {
        throw new Error('Destination folder not found.');
      }
    }

    if (item.type === 'folder' && targetFolderId !== null) {
      let currentParentId: string | null = targetFolderId;

      while (currentParentId) {
        if (currentParentId === itemId) {
          throw new Error('Cannot move a folder into itself or one of its subfolders.');
        }

        const parentFolder = currentItems.find((entry) => entry.id === currentParentId && entry.type === 'folder');
        currentParentId = parentFolder?.parentId ?? null;
      }
    }

    const updatedItem = { ...item, parentId: targetFolderId };
    const savedItem = await saveItem(updatedItem);
    setItems((current) => current.map((entry) => (entry.id === itemId ? savedItem : entry)));
  }, []);

  const handleToggleDocumentRead = useCallback(async (docId: string, isRead: boolean) => {
    const currentDoc = itemsRef.current.find((item) => item.type === 'file' && item.id === docId) as DocumentData | undefined;
    if (!currentDoc) {
      throw new Error('Document not found.');
    }

    if ((currentDoc.isRead ?? false) === isRead) {
      return;
    }

    const optimisticDoc: DocumentData = {
      ...currentDoc,
      isRead,
    };

    setItems((current) => current.map((entry) => (entry.id === docId ? optimisticDoc : entry)));

    try {
      const savedDoc = await saveItem(optimisticDoc) as DocumentData;
      setItems((current) => current.map((entry) => (entry.id === savedDoc.id ? savedDoc : entry)));
    } catch (error) {
      setItems((current) => current.map((entry) => (entry.id === currentDoc.id ? currentDoc : entry)));
      throw error;
    }
  }, []);

  const handleUpdateDocumentLabels = useCallback(async (docId: string, nextLabels: string[]) => {
    const currentDoc = itemsRef.current.find((item) => item.type === 'file' && item.id === docId) as DocumentData | undefined;
    if (!currentDoc) {
      throw new Error('Document not found.');
    }

    const normalizedLabels = Array.from(new Set(
      nextLabels
        .map((label) => label.trim())
        .filter((label) => label.length > 0)
        .filter((label) => availableLabels.some((availableLabel) => availableLabel.toLowerCase() === label.toLowerCase()))
    ));

    const optimisticDoc: DocumentData = {
      ...currentDoc,
      labels: normalizedLabels,
    };

    setItems((current) => current.map((entry) => (entry.id === docId ? optimisticDoc : entry)));

    try {
      const savedDoc = await saveItem(optimisticDoc) as DocumentData;
      setItems((current) => current.map((entry) => (entry.id === savedDoc.id ? savedDoc : entry)));
    } catch (error) {
      setItems((current) => current.map((entry) => (entry.id === currentDoc.id ? currentDoc : entry)));
      throw error;
    }
  }, [availableLabels]);

  const handleDeleteAll = async () => {
    await nukeDB(!deleteIncludeFolders);
    await loadItems();
    setIsDeleteModalOpen(false);
    setDeleteIncludeFolders(false);

    if (currentView === AppView.EDITOR) {
      setCurrentView(AppView.DASHBOARD);
      setActiveDocId(null);
    }
  };

  const handleExportAll = async () => {
    const zip = new JSZip();
    const docs = items.filter((item) => item.type === 'file' && (item as DocumentData).status === 'ready') as DocumentData[];

    if (docs.length === 0) {
      alert('No ready documents to export.');
      return;
    }

    docs.forEach((doc) => {
      const content = doc.savedText || reconstructCleanText(doc.pages);
      zip.file(`${doc.name.replace(/\.[^/.]+$/, '')}.txt`, markdownToPlainText(content));
    });

    const content = await zip.generateAsync({ type: 'blob' });
    downloadBlob(content, 'all_notes.zip');
  };

  const handleFileSelect = async (
    fileList: FileList,
    options: ProcessingOptions,
    filePageCounts: Map<string, number | null> = new Map()
  ) => {
    const files = Array.from(fileList);
    setIsUploading(true);
    setIsOverlayMinimized(false);
    setUploadSessionDocs([]);
    uploadAbortedRef.current = false;

    try {
      let queuedDocumentCount = 0;
      const failedUploads: string[] = [];

      await runWithConcurrencyLimit(files, MAX_CONCURRENT_UPLOADS, async (file) => {
        if (uploadAbortedRef.current) {
          return;
        }

        const docId = `${MOCK_ID_PREFIX}${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        try {
          const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
          const optimisticPageCount = Math.max(filePageCounts.get(getUploadFileKey(file)) ?? 0, 0);
          const normalizedMaxRetries = Number.isInteger(options.maxRetries) && (options.maxRetries ?? -1) >= 0
            ? options.maxRetries
            : 0;
          const imageData = isPdf
            ? []
            : [{ data: await fileToBase64(file), mimeType: file.type }];

          const newDoc: DocumentData = {
            id: docId,
            name: file.name,
            type: 'file',
            parentId: currentFolderId,
            createdAt: Date.now(),
            uploadDate: Date.now(),
            status: isPdf ? 'uploading' : 'processing',
            sourceRenderStatus: isPdf ? 'pending' : undefined,
            sourceRenderCompletedPages: 0,
            modelUsed: options.model,
            ocrProvider: options.ocrProvider ?? ocrSettings.provider,
            isRead: false,
            labels: [],
            processingMode: options.processingMode,
            targetLanguage: options.targetLanguage,
            customPrompt: options.customPrompt,
            removeReferences: options.removeReferences,
            pagesPerBatch: Number.isInteger(options.pagesPerBatch) && (options.pagesPerBatch ?? 0) > 0 ? options.pagesPerBatch : 1,
            maxRetries: normalizedMaxRetries,
            splitColumns: options.splitColumns === true,
            totalPages: isPdf ? optimisticPageCount : imageData.length,
            processedPages: 0,
            failedPages: 0,
            pages: isPdf
              ? Array.from({ length: optimisticPageCount }, (_, index) => ({
                  pageNumber: index + 1,
                  imageUrl: '',
                  blocks: [],
                  status: 'pending',
                  errorDismissed: false,
                  retryCount: 0,
                  lastError: '',
                  nextRetryAt: null,
                  lastAttemptAt: null,
                }))
              : imageData.map((image, index) => ({
                  pageNumber: index + 1,
                  imageUrl: `data:${image.mimeType};base64,${image.data}`,
                  blocks: [],
                  status: 'pending',
                  errorDismissed: false,
                  retryCount: 0,
                  lastError: '',
                  nextRetryAt: null,
                  lastAttemptAt: null,
                })),
          };

          setUploadSessionDocs((current) => [...current, newDoc]);

          const uploadPayload = isPdf
            ? {
                ...newDoc,
                sourceFile: {
                  name: file.name,
                  mimeType: 'application/pdf',
                  data: await fileToBase64(file),
                },
              }
            : newDoc;

          const savedDoc = await saveItem(uploadPayload as DocumentData, true) as DocumentData;
          queuedDocumentCount += 1;
          setItems((current) => upsertItem(current, savedDoc));
          setUploadSessionDocs((current) => current.map((entry) => (entry.id === savedDoc.id ? savedDoc : entry)));
          setCurrentView(AppView.DASHBOARD);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown upload error';
          console.error('Processing init failed', error);

          try {
            const refreshedItems = await getAllItems();
            const recoveredDoc = refreshedItems.find(
              (entry): entry is DocumentData => entry.type === 'file' && entry.id === docId
            );

            startTransition(() => {
              setItems((current) => reconcileItems(current, refreshedItems));
            });

            if (recoveredDoc) {
              queuedDocumentCount += 1;
              setUploadSessionDocs((current) => current.map((entry) => (entry.id === recoveredDoc.id ? recoveredDoc : entry)));
              setCurrentView(AppView.DASHBOARD);
              return;
            }
          } catch (refreshError) {
            console.error('Failed to refresh documents after upload error', refreshError);
          }

          failedUploads.push(`${file.name}: ${errorMessage}`);
          setUploadSessionDocs((current) => current.map((entry) => (
            entry.id === docId
              ? {
                  ...entry,
                  status: 'error',
                  sourceRenderError: errorMessage,
                }
              : entry
          )));
        }
      });

      if (queuedDocumentCount > 0) {
        setCurrentView(AppView.DASHBOARD);
      }

      if (failedUploads.length > 0) {
        const intro = queuedDocumentCount > 0
          ? `Queued ${queuedDocumentCount} document${queuedDocumentCount === 1 ? '' : 's'}, but ${failedUploads.length} failed to start.`
          : 'Failed to upload the selected documents.';
        const details = failedUploads.slice(0, 3).join('\n');
        const suffix = failedUploads.length > 3 ? `\n…and ${failedUploads.length - 3} more.` : '';
        alert(`${intro}\n\n${details}${suffix}`);
      }
    } finally {
      setIsUploading(false);
    }
  };

  const handleStopProcessing = async () => {
    setIsStopping(true);
    uploadAbortedRef.current = true;

    const docsToCancel = uploadSessionDocuments.filter(
      (doc) => doc.status === 'uploading' || doc.status === 'processing'
    );

    await Promise.allSettled(
      docsToCancel.map(async (doc) => {
        try {
          const cancelled = await cancelDocument(doc.id);
          setItems((current) => current.map((entry) => (entry.id === cancelled.id ? cancelled : entry)));
          setUploadSessionDocs((current) => current.map((entry) => (entry.id === cancelled.id ? cancelled : entry)));
        } catch (err) {
          console.error(`Failed to cancel document ${doc.id}`, err);
        }
      })
    );

    setIsStopping(false);
    setIsStopConfirmOpen(false);
  };

  const handleOpenDocument = useCallback((docId: string) => {
    setActiveDocId(docId);
    setCurrentView(AppView.EDITOR);
  }, []);

  const handleNewUpload = useCallback(() => {
    setCurrentView(AppView.UPLOAD);
  }, []);

  const handlePersistDocument = useCallback(async (updatedDoc: DocumentData) => {
    const savedDoc = await saveItem(updatedDoc) as DocumentData;
    setItems((current) => current.map((entry) => (entry.id === savedDoc.id ? savedDoc : entry)));
    return savedDoc;
  }, []);

  const handleRenameDocument = useCallback(async (docId: string, nextName: string) => {
    const normalizedName = nextName.trim();
    if (!normalizedName) {
      throw new Error('Document name is required.');
    }

    const currentDoc = itemsRef.current.find((item) => item.type === 'file' && item.id === docId) as DocumentData | undefined;
    if (!currentDoc) {
      throw new Error('Document not found.');
    }

    const savedDoc = await saveItem({
      ...currentDoc,
      name: normalizedName,
    }) as DocumentData;

    setItems((current) => current.map((entry) => (entry.id === savedDoc.id ? savedDoc : entry)));
  }, []);

  const handleRefreshDocument = useCallback(async (docId: string) => {
    const data = await getAllItems();
    const refreshedDoc = data.find((item) => item.type === 'file' && item.id === docId) as DocumentData | undefined;
    startTransition(() => {
      setItems((current) => reconcileItems(current, data));
    });
    return refreshedDoc ?? null;
  }, []);

  const handleReprocessDocument = useCallback(async (docId: string, modelName: string, pagesPerBatch: number, splitColumns: boolean) => {
    const currentDoc = itemsRef.current.find((item) => item.type === 'file' && item.id === docId) as DocumentData | undefined;
    if (!currentDoc) {
      throw new Error('Document not found.');
    }

    if (currentDoc.status === 'processing' || currentDoc.status === 'uploading') {
      throw new Error('Document is already processing.');
    }

    const normalizedPagesPerBatch = Number.isInteger(pagesPerBatch) && pagesPerBatch > 0
      ? pagesPerBatch
      : (Number.isInteger(currentDoc.pagesPerBatch) && (currentDoc.pagesPerBatch ?? 0) > 0 ? currentDoc.pagesPerBatch ?? 1 : 1);

    const updatedDoc = await reprocessDocument(
      docId,
      modelName,
      normalizedPagesPerBatch,
      splitColumns,
      ocrSettings.provider
    );
    setItems((current) => current.map((entry) => (entry.id === updatedDoc.id ? updatedDoc : entry)));
  }, [ocrSettings.provider]);

  const goToHome = () => {
    setCurrentView(AppView.DASHBOARD);
    setCurrentFolderId(null);
  };

  const processingModels = useMemo(
    () => sortModelsForPreferredSelection(
      getProviderModels(models, ocrSettings.provider),
      ocrSettings.selectedModelId
    ),
    [models, ocrSettings.provider, ocrSettings.selectedModelId]
  );

  const activeDoc = items.find((item) => item.id === activeDocId) as DocumentData | undefined;

  if (isAuthenticated === null) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 dark:bg-slate-900">
        <LoaderIcon className="h-12 w-12 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Login onLoginSuccess={() => setIsAuthenticated(true)} />;
  }

  return (
    <div className="flex h-screen w-screen flex-col bg-slate-50 text-slate-900 transition-colors duration-200 dark:bg-slate-900 dark:text-slate-100">
      <nav className="shrink-0 border-b border-slate-200 bg-white shadow-sm transition-colors duration-200 dark:border-slate-700 dark:bg-slate-800">
        <div className="grid min-h-[5rem] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 sm:px-6">
          <button className="flex min-w-0 items-center gap-3 text-left" onClick={goToHome}>
            <img src="/logo.png" alt="ocrAI logo" className="h-10 w-10 rounded-2xl shadow-sm" />
            <div className="min-w-0">
              <span className="block truncate text-lg font-bold tracking-tight text-slate-800 dark:text-white sm:text-xl">ocrAI</span>
              <span className="block truncate text-[10px] uppercase tracking-[0.24em] text-slate-400 dark:text-slate-500 sm:text-xs">
                Workspace
              </span>
            </div>
          </button>

          <div className="min-w-0 justify-self-center overflow-x-auto">
            <div className="mx-auto flex min-w-max items-center justify-center gap-2">
              <IconActionButton
                icon={<SettingsIcon className="h-4 w-4" />}
                label="Settings"
                isActive={isSettingsOpen}
                onClick={() => openSettings('models')}
              />
              <IconActionButton
                icon={<ArchiveIcon className="h-4 w-4" />}
                label="Export all"
                onClick={handleExportAll}
              />
              <IconActionButton
                icon={<TrashIcon className="h-4 w-4" />}
                label="Delete all"
                isActive={isDeleteModalOpen}
                variant="danger"
                onClick={() => setIsDeleteModalOpen(true)}
              />
              <IconActionButton
                icon={<HomeIcon className="h-4 w-4" />}
                label="Home"
                isActive={currentView === AppView.DASHBOARD}
                onClick={goToHome}
              />
              <IconActionButton
                icon={<LogoutIcon className="h-4 w-4" />}
                label="Logout"
                variant="danger"
                onClick={handleLogout}
              />
            </div>
          </div>

          <button
            type="button"
            onClick={toggleTheme}
            className="relative flex h-11 w-16 shrink-0 items-center justify-self-end rounded-full bg-slate-200 p-1 transition-colors duration-300 dark:bg-slate-700"
            title="Toggle dark mode"
            aria-label="Toggle dark mode"
          >
            <div
              className={`flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-md transition-transform duration-300 dark:bg-slate-200 ${
                isDarkMode ? 'translate-x-5' : 'translate-x-0'
              }`}
            >
              {isDarkMode ? (
                <MoonIcon className="h-4 w-4 text-slate-800" />
              ) : (
                <SunIcon className="h-4 w-4 text-orange-500" />
              )}
            </div>
          </button>
        </div>
      </nav>

      <main className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        {isLoadingItems ? (
          <div className="flex flex-1 flex-col items-center justify-center bg-slate-50 dark:bg-slate-900">
            <LoaderIcon className="mb-4 h-16 w-16 animate-spin text-blue-600 dark:text-blue-400" />
            <h2 className="mb-2 text-xl font-bold text-slate-800 dark:text-white">Loading documents...</h2>
            <p className="text-slate-500 dark:text-slate-400">Please wait while we load your data</p>
          </div>
        ) : (
          <>
            {currentView === AppView.UPLOAD && (
              <UploadView
                onFileSelect={handleFileSelect}
                models={processingModels}
                activeOcrProvider={ocrSettings.provider}
                prompts={prompts}
                onOpenSettings={openSettings}
              />
            )}

            {currentView === AppView.DASHBOARD && (
              <Dashboard
                items={items}
                models={processingModels}
                availableLabels={availableLabels}
                currentFolderId={currentFolderId}
                onOpenDocument={handleOpenDocument}
                onNewUpload={handleNewUpload}
                onCreateFolder={handleCreateFolder}
                onNavigateFolder={setCurrentFolderId}
                onDeleteItem={handleRequestDelete}
                onDeleteDocuments={handleDeleteDocuments}
                onMoveItem={handleMoveItem}
                onRenameDocument={handleRenameDocument}
                onToggleDocumentRead={handleToggleDocumentRead}
                onUpdateDocumentLabels={handleUpdateDocumentLabels}
                onReprocessDocument={handleReprocessDocument}
                onOpenSettings={openSettings}
              />
            )}

            {currentView === AppView.EDITOR && activeDoc && (
              <EditorView
                doc={activeDoc}
                onBack={() => setCurrentView(AppView.DASHBOARD)}
                onPersistDocument={handlePersistDocument}
                onRefreshDocument={handleRefreshDocument}
                models={processingModels}
                activeOcrProvider={ocrSettings.provider}
                prompts={prompts}
                onOpenSettings={openSettings}
              />
            )}
          </>
        )}
      </main>

      {showUploadProgressOverlay && (
        <div
          data-testid="upload-progress-shell"
          data-mode={uploadProgressMode}
          className={isUploading
            ? 'fixed inset-0 z-50 flex items-center justify-center bg-white/80 p-4 backdrop-blur-sm dark:bg-slate-900/80'
            : 'pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4 sm:justify-end sm:px-6'}
        >
          <div className={`pointer-events-auto w-full rounded-3xl border border-slate-200 bg-white/95 shadow-2xl dark:border-slate-700 dark:bg-slate-800/95 ${isUploading ? 'max-w-3xl p-6' : 'max-w-2xl sm:max-w-lg'}`}>
            <div className={`flex items-start gap-4 ${isUploading ? 'mb-6' : (!isOverlayMinimized ? 'p-6 pb-0' : 'p-4')}`}>
              <div className="rounded-2xl bg-blue-100 p-3 dark:bg-blue-500/10">
                <LoaderIcon className={`h-8 w-8 text-blue-600 dark:text-blue-400 ${hasActiveUploadSessionDocs || isUploading ? 'animate-spin' : ''}`} />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-xl font-bold text-slate-800 dark:text-white">
                  {uploadSessionDocuments.length === 1 ? 'Processing document...' : 'Processing documents...'}
                </h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{uploadOverlaySummary}</p>
              </div>
              {!isUploading && (
                <div className="flex shrink-0 items-center gap-1">
                  {hasActiveUploadSessionDocs && (
                    <button
                      type="button"
                      onClick={() => setIsStopConfirmOpen(true)}
                      className="rounded-full p-2 text-rose-400 transition-colors hover:bg-rose-50 hover:text-rose-600 dark:text-rose-500 dark:hover:bg-rose-900/20 dark:hover:text-rose-400"
                      title="Detener procesado"
                    >
                      <StopCircleIcon className="h-5 w-5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setIsOverlayMinimized((v) => !v)}
                    className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-slate-700 dark:hover:text-slate-300"
                    title={isOverlayMinimized ? 'Expandir' : 'Minimizar'}
                  >
                    {isOverlayMinimized ? <ChevronUpIcon className="h-5 w-5" /> : <ChevronDownIcon className="h-5 w-5" />}
                  </button>
                </div>
              )}
            </div>

            {!isOverlayMinimized && (
              <div className={isUploading ? '' : 'p-6 pt-4'}>
                {uploadSessionDocuments.length > 0 ? (
                  <div className={`space-y-3 overflow-y-auto pr-1 ${isUploading ? 'max-h-[60vh]' : 'max-h-[50vh]'}`}>
                    {uploadSessionDocuments.map((doc) => {
                      const progress = getUploadProgressSummary(doc);
                      const barClassName = progress.tone === 'emerald'
                        ? 'bg-emerald-500'
                        : progress.tone === 'rose'
                          ? 'bg-rose-500'
                          : 'bg-blue-600 dark:bg-blue-400';

                      return (
                        <div
                          key={doc.id}
                          className="rounded-2xl border border-slate-200 bg-slate-50/90 p-4 dark:border-slate-700 dark:bg-slate-900/40"
                        >
                          <div className="mb-3 flex items-start justify-between gap-4">
                            <div className="min-w-0">
                              <h3 className="truncate text-sm font-semibold text-slate-800 dark:text-white">{doc.name}</h3>
                              <p className="mt-1 text-xs font-medium uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">{progress.phase}</p>
                            </div>
                            <div className="shrink-0 text-right">
                              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                                {progress.total > 0 ? `${progress.current} / ${progress.total} pages` : 'Starting...'}
                              </p>
                              <p className="text-xs text-slate-500 dark:text-slate-400">
                                {progress.percent === null ? 'Preparing' : `${progress.percent}%`}
                              </p>
                            </div>
                          </div>

                          <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                            <div
                              className={`${barClassName} h-full rounded-full ${progress.indeterminate ? 'animate-pulse' : 'transition-[width] duration-500 ease-out'}`}
                              style={{ width: progress.percent === null ? '20%' : `${progress.percent}%` }}
                            />
                          </div>

                          <div className="mt-2 flex items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
                            <span>{progress.detail}</span>
                            <span className="shrink-0">{progress.remainingLabel}</span>
                          </div>

                          {doc.sourceRenderError && doc.status === 'error' && (
                            <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">{doc.sourceRenderError}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500 dark:text-slate-400">Preparing and uploading your files.</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {isStopConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-800">
            <div className="mb-4 flex items-center gap-3 text-rose-600 dark:text-rose-400">
              <div className="rounded-full bg-rose-100 p-2 dark:bg-rose-900/30">
                <StopCircleIcon className="h-6 w-6" />
              </div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">Detener procesado</h2>
            </div>
            <p className="mb-6 text-slate-600 dark:text-slate-300">
              ¿Seguro que quieres detener el procesado de los documentos en curso? Las páginas que ya han terminado se conservarán, pero las pendientes quedarán marcadas como error.
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <IconActionButton
                icon={<CloseIcon className="h-4 w-4" />}
                label="Cancelar"
                onClick={() => setIsStopConfirmOpen(false)}
                disabled={isStopping}
              />
              <IconActionButton
                icon={<StopCircleIcon className="h-4 w-4" />}
                label={isStopping ? 'Deteniendo...' : 'Detener'}
                isActive
                variant="danger"
                onClick={handleStopProcessing}
                disabled={isStopping}
              />
            </div>
          </div>
        </div>
      )}

      {itemToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-800">
            <div className="mb-4 flex items-center gap-3 text-red-600 dark:text-red-400">
              <div className="rounded-full bg-red-100 p-2 dark:bg-red-900/30">
                <TrashIcon className="h-6 w-6" />
              </div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">Delete item</h2>
            </div>

            <p className="mb-6 text-slate-600 dark:text-slate-300">
              Are you sure you want to delete <strong>{items.find((item) => item.id === itemToDelete)?.name}</strong>?
              {items.find((item) => item.id === itemToDelete)?.type === 'folder' && ' This will permanently delete all documents inside it.'}
            </p>

            <div className="flex flex-wrap justify-end gap-2">
              <IconActionButton
                icon={<CloseIcon className="h-4 w-4" />}
                label="Cancel"
                onClick={() => setItemToDelete(null)}
              />
              <IconActionButton
                icon={<TrashIcon className="h-4 w-4" />}
                label="Delete"
                isActive
                variant="danger"
                onClick={executeDeleteItem}
              />
            </div>
          </div>
        </div>
      )}

      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-800">
            <div className="mb-4 flex items-center gap-3 text-red-600 dark:text-red-400">
              <div className="rounded-full bg-red-100 p-2 dark:bg-red-900/30">
                <AlertCircleIcon className="h-6 w-6" />
              </div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">Delete all data</h2>
            </div>

            <p className="mb-6 text-slate-600 dark:text-slate-300">
              Are you sure you want to delete all documents? This action cannot be undone.
            </p>

            <label className="mb-6 flex cursor-pointer items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900">
              <input
                type="checkbox"
                id="deleteFolders"
                checked={deleteIncludeFolders}
                onChange={(event) => setDeleteIncludeFolders(event.target.checked)}
                className="h-5 w-5 rounded border-gray-300 text-red-600 focus:ring-red-500"
              />
              <span className="select-none text-sm font-medium text-slate-700 dark:text-slate-300">
                Also delete all folders (structure)
              </span>
            </label>

            <div className="flex flex-wrap justify-end gap-2">
              <IconActionButton
                icon={<CloseIcon className="h-4 w-4" />}
                label="Cancel"
                onClick={() => setIsDeleteModalOpen(false)}
              />
              <IconActionButton
                icon={<TrashIcon className="h-4 w-4" />}
                label="Delete all"
                isActive
                variant="danger"
                onClick={handleDeleteAll}
              />
            </div>
          </div>
        </div>
      )}

      <SettingsModal
        isOpen={isSettingsOpen}
        activeTab={activeSettingsTab}
        onTabChange={setActiveSettingsTab}
        onClose={() => setIsSettingsOpen(false)}
        models={models}
        ocrSettings={ocrSettings}
        prompts={prompts}
        availableLabels={availableLabels}
        labelingSettings={labelingSettings}
        onAddModel={handleAddModel}
        onRemoveModel={handleRemoveModel}
        onAutodetectProviderModels={handleAutodetectProviderModels}
        onCreatePrompt={handleCreatePrompt}
        onUpdatePrompt={handleUpdatePrompt}
        onDeletePrompt={handleDeletePrompt}
        onCreateLabel={handleCreateLabel}
        onDeleteLabel={handleDeleteLabel}
        onUpdateLabelingSettings={handleUpdateLabelingSettings}
        onUpdateOcrSettings={handleUpdateOcrSettings}
      />
    </div>
  );
};

export default App;
