import React, { startTransition, useCallback, useEffect, useRef, useState } from 'react';
import { Login } from './components/Login';
import UploadView from './components/UploadView';
import Dashboard from './components/Dashboard';
import EditorView from './components/Editor/EditorView';
import SettingsModal from './components/SettingsModal';
import IconActionButton from './components/IconActionButton';
import {
  ArchiveIcon,
  AlertCircleIcon,
  CloseIcon,
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
import { addModel, DEFAULT_MODELS, GeminiModel, getModels, removeModel } from './utils/modelStorage';
import { createPrompt, deletePrompt, getPrompts, updatePrompt } from './services/promptService';
import {
  createLabel,
  deleteLabel,
  getLabelingSettings,
  getLabels,
  updateLabelingSettings,
} from './services/labelingService';
import { reprocessDocument } from './services/geminiService';
import { getPdfRenderConcurrency } from './utils/pdfProcessing';
import { downloadBlob } from './utils/download';
// @ts-ignore
import * as pdfjsLib from 'pdfjs-dist';
// @ts-ignore
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
// @ts-ignore
import JSZip from 'jszip';

const hasRealPdfWorkerSupport = typeof window !== 'undefined' && 'Worker' in window;

if (hasRealPdfWorkerSupport) {
  pdfjsLib.GlobalWorkerOptions.workerPort = new Worker(pdfWorkerUrl, { type: 'module' });
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
}

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

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<AppView>(AppView.DASHBOARD);
  const [items, setItems] = useState<FileSystemItem[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
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
      const [availableModels, savedPrompts, labels, nextLabelingSettings] = await Promise.all([
        getModels(),
        getPrompts(),
        getLabels(),
        getLabelingSettings(),
      ]);
      setModels(availableModels);
      setPrompts(savedPrompts);
      setAvailableLabels(labels);
      setLabelingSettings(nextLabelingSettings);
    } catch (error) {
      console.error('Failed to load settings', error);
      setModels(DEFAULT_MODELS);
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
    (item) => item.type === 'file' && (item as DocumentData).status === 'processing'
  );

  useEffect(() => {
    if (!hasProcessingItems) {
      return;
    }

    const timer = window.setInterval(() => {
      void loadItems({ preserveUnchanged: true });
    }, 3000);

    return () => window.clearInterval(timer);
  }, [hasProcessingItems, loadItems]);

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

  const handleRemoveModel = async (modelId: string) => {
    const updatedModels = await removeModel(modelId);
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

  const convertPdfToImages = async (
    file: File,
    requestedConcurrency?: number
  ): Promise<{ data: string; mimeType: string }[]> => {
    if (!hasRealPdfWorkerSupport) {
      throw new Error('This browser does not support Web Workers. PDF processing requires a real worker.');
    }

    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    const images: { data: string; mimeType: string }[] = new Array(pdf.numPages);
    const renderConcurrency = Math.min(getPdfRenderConcurrency(requestedConcurrency), pdf.numPages);

    const renderPage = async (pageNum: number) => {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1.5 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const context = canvas.getContext('2d');
      if (!context) {
        throw new Error(`Failed to create a canvas context for page ${pageNum}`);
      }

      await page.render({ canvasContext: context, viewport } as any).promise;
      const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
      images[pageNum - 1] = { data: dataUrl.split(',')[1], mimeType: 'image/jpeg' };
    };

    let nextPageNumber = 1;
    await Promise.all(Array.from({ length: renderConcurrency }, async () => {
      while (true) {
        const pageNum = nextPageNumber;
        nextPageNumber += 1;

        if (pageNum > pdf.numPages) {
          return;
        }

        await renderPage(pageNum);
      }
    }));

    return images;
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

  const executeDeleteItem = async () => {
    if (!itemToDelete) {
      return;
    }

    const getChildrenIds = (parentId: string): string[] => {
      return items
        .filter((item) => item.parentId === parentId)
        .flatMap((child) => [child.id, ...getChildrenIds(child.id)]);
    };

    const idsToDelete = [itemToDelete, ...getChildrenIds(itemToDelete)];

    try {
      for (const id of idsToDelete) {
        await deleteItem(id);
      }

      setItems((current) => current.filter((item) => !idsToDelete.includes(item.id)));

      if (activeDocId && idsToDelete.includes(activeDocId)) {
        setCurrentView(AppView.DASHBOARD);
        setActiveDocId(null);
      }
    } catch (error) {
      console.error('Failed to delete items', error);
      alert('An error occurred while deleting. Please try again.');
      loadItems();
    } finally {
      setItemToDelete(null);
    }
  };

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

  const handleFileSelect = async (fileList: FileList, options: ProcessingOptions) => {
    const files = Array.from(fileList);
    setIsUploading(true);

    try {
      const newDocs: DocumentData[] = [];

      for (const file of files) {
        const docId = `${MOCK_ID_PREFIX}${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const isPdf = file.type === 'application/pdf';
        const images = isPdf
          ? await convertPdfToImages(file, options.pagesPerBatch)
          : [{ data: await fileToBase64(file), mimeType: file.type }];

        const newDoc: DocumentData = {
          id: docId,
          name: file.name,
          type: 'file',
          parentId: currentFolderId,
          createdAt: Date.now(),
          uploadDate: Date.now(),
          status: 'processing',
          modelUsed: options.model,
          isRead: false,
          labels: [],
          processingMode: options.processingMode,
          targetLanguage: options.targetLanguage,
          customPrompt: options.customPrompt,
          removeReferences: options.removeReferences,
          pagesPerBatch: Number.isInteger(options.pagesPerBatch) && (options.pagesPerBatch ?? 0) > 0 ? options.pagesPerBatch : 1,
          totalPages: images.length,
          processedPages: 0,
          failedPages: 0,
          pages: images.map((image, index) => ({
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

        const savedDoc = await saveItem(newDoc, true) as DocumentData;
        newDocs.push(savedDoc);
      }

      setItems((current) => [...current, ...newDocs]);
      setCurrentView(AppView.DASHBOARD);
    } catch (error: any) {
      console.error('Processing init failed', error);
      alert(`Failed to upload: ${error.message}`);
    } finally {
      setIsUploading(false);
    }
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

  const handleReprocessDocument = useCallback(async (docId: string, modelName: string, pagesPerBatch: number) => {
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

    const updatedDoc = await reprocessDocument(docId, modelName, normalizedPagesPerBatch);
    setItems((current) => current.map((entry) => (entry.id === updatedDoc.id ? updatedDoc : entry)));
  }, []);

  const goToHome = () => {
    setCurrentView(AppView.DASHBOARD);
    setCurrentFolderId(null);
  };

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
                models={models}
                prompts={prompts}
                onOpenSettings={openSettings}
              />
            )}

            {currentView === AppView.DASHBOARD && (
              <Dashboard
                items={items}
                models={models}
                availableLabels={availableLabels}
                currentFolderId={currentFolderId}
                onOpenDocument={handleOpenDocument}
                onNewUpload={handleNewUpload}
                onCreateFolder={handleCreateFolder}
                onNavigateFolder={setCurrentFolderId}
                onDeleteItem={handleRequestDelete}
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
                models={models}
                prompts={prompts}
                onOpenSettings={openSettings}
              />
            )}
          </>
        )}
      </main>

      {isUploading && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm dark:bg-slate-900/80">
          <LoaderIcon className="mb-4 h-12 w-12 animate-spin text-blue-600" />
          <h2 className="text-xl font-bold text-slate-800 dark:text-white">Processing document...</h2>
          <p className="text-slate-500 dark:text-slate-400">Preparing and uploading your file</p>
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
        prompts={prompts}
        availableLabels={availableLabels}
        labelingSettings={labelingSettings}
        onAddModel={handleAddModel}
        onRemoveModel={handleRemoveModel}
        onCreatePrompt={handleCreatePrompt}
        onUpdatePrompt={handleUpdatePrompt}
        onDeletePrompt={handleDeletePrompt}
        onCreateLabel={handleCreateLabel}
        onDeleteLabel={handleDeleteLabel}
        onUpdateLabelingSettings={handleUpdateLabelingSettings}
      />
    </div>
  );
};

export default App;
