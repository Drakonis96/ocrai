import React, { useState, useEffect, useRef } from 'react';
import { Login } from './components/Login';
import UploadView from './components/UploadView';
import Dashboard from './components/Dashboard';
import EditorView from './components/Editor/EditorView';
import { HomeIcon, ArchiveIcon, TrashIcon, AlertCircleIcon, LoaderIcon, SunIcon, MoonIcon, LogoutIcon, SettingsIcon, CloseIcon, PlusIcon } from './components/Icons';
import { AppView, DocumentData, ProcessingOptions, FileSystemItem, FolderData, PageData } from './types';
import { reconstructCleanText } from './utils/reconstruction';
import { getAllItems, saveItem, deleteItem, nukeDB } from './utils/storage';
import { processPageWithGemini } from './services/geminiService';
import { MOCK_ID_PREFIX } from './constants';
import { getModels, addModel, removeModel, GeminiModel, DEFAULT_MODELS } from './utils/modelStorage';
// @ts-ignore
import * as pdfjsLib from 'pdfjs-dist';
// @ts-ignore
import JSZip from 'jszip';

// Configure PDF.js worker
const PDF_WORKER_URL = 'https://aistudiocdn.com/pdfjs-dist@5.4.449/build/pdf.worker.min.mjs';
pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER_URL;

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<AppView>(AppView.DASHBOARD);
  const [items, setItems] = useState<FileSystemItem[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoadingItems, setIsLoadingItems] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  
  // Theme State
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') === 'dark' || 
        (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
    }
    return false;
  });

  // Modal State
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteIncludeFolders, setDeleteIncludeFolders] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);

  // Model Settings Modal State
  const [isModelSettingsOpen, setIsModelSettingsOpen] = useState(false);
  const [models, setModels] = useState<GeminiModel[]>([]);
  const [newModelId, setNewModelId] = useState('');
  const [newModelName, setNewModelName] = useState('');
  const [newModelDesc, setNewModelDesc] = useState('');
  const [modelError, setModelError] = useState('');

  // --- DATA LOADING ---

  const loadItems = async () => {
    try {
      setIsLoadingItems(true);
      const data = await getAllItems();
      setItems(data);
    } catch (e) {
      console.error("Failed to load items from DB", e);
    } finally {
      setIsLoadingItems(false);
    }
  };

  // --- AUTH ---
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetch('/api/check-auth');
        const data = await res.json();
        setIsAuthenticated(data.authenticated);
      } catch (e) {
        setIsAuthenticated(false);
      }
    };
    checkAuth();
  }, []);

  const handleLogout = async () => {
    try {
      await fetch('/api/logout', { method: 'POST' });
      setIsAuthenticated(false);
    } catch (e) {
      console.error("Logout failed", e);
    }
  };

  // Initial Load
  useEffect(() => {
    loadItems();
    setModels(getModels());
  }, []);

  // Theme Logic
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

  const toggleTheme = () => {
    setIsDarkMode(!isDarkMode);
  };

  // --- Model Settings ---
  const handleAddModel = () => {
    if (!newModelId.trim()) {
      setModelError('Model ID is required');
      return;
    }
    try {
      const updated = addModel({
        id: newModelId.trim(),
        name: newModelName.trim() || newModelId.trim(),
        description: newModelDesc.trim() || 'Custom',
      });
      setModels(updated);
      setNewModelId('');
      setNewModelName('');
      setNewModelDesc('');
      setModelError('');
    } catch (e: any) {
      setModelError(e.message);
    }
  };

  const handleRemoveModel = (modelId: string) => {
    try {
      const updated = removeModel(modelId);
      setModels(updated);
    } catch (e: any) {
      setModelError(e.message);
    }
  };

  // --- Helpers ---
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const convertPdfToImages = async (file: File): Promise<{data: string, mimeType: string}[]> => {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    const images: {data: string, mimeType: string}[] = [];

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1.5 }); 
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;
      await page.render({ canvasContext: ctx, viewport } as any).promise;
      
      const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
      const base64 = dataUrl.split(',')[1];
      images.push({ data: base64, mimeType: 'image/jpeg' });
    }
    return images;
  };

  // --- PROCESSING LOGIC (FRONTEND) ---

  // Polling for background processing updates
  useEffect(() => {
    const processingItems = items.filter(i => i.type === 'file' && (i as DocumentData).status === 'processing');
    
    if (processingItems.length > 0) {
      const timer = setTimeout(async () => {
        await loadItems();
      }, 3000); // Poll every 3 seconds

      return () => clearTimeout(timer);
    }
  }, [items]);

  // --- Actions ---

  const handleCreateFolder = async (name: string) => {
    const newFolder: FolderData = {
      id: `folder_${Date.now()}`,
      name: name,
      type: 'folder',
      parentId: currentFolderId,
      createdAt: Date.now()
    };
    
    await saveItem(newFolder);
    setItems(prev => [...prev, newFolder]);
  };

  const handleRequestDelete = (itemId: string) => {
    setItemToDelete(itemId);
  };

  const executeDeleteItem = async () => {
    if (!itemToDelete) return;
    const itemId = itemToDelete;

    // Use local state 'items' instead of fetching again to be faster
    // Recursive find IDs to delete (folder contents)
    const getChildrenIds = (parentId: string): string[] => {
      return items
        .filter(i => i.parentId === parentId)
        .flatMap(child => [child.id, ...getChildrenIds(child.id)]);
    };
    
    const idsToDelete = [itemId, ...getChildrenIds(itemId)];
    
    try {
      for (const id of idsToDelete) {
        await deleteItem(id);
      }
      
      // Update local state
      setItems(prev => prev.filter(i => !idsToDelete.includes(i.id)));
      
      if (activeDocId && idsToDelete.includes(activeDocId)) {
        setCurrentView(AppView.DASHBOARD);
        setActiveDocId(null);
      }
    } catch (e) {
      console.error("Failed to delete items", e);
      alert("An error occurred while deleting. Please try again.");
      loadItems(); // Re-sync with DB just in case
    } finally {
      setItemToDelete(null);
    }
  };

  const handleMoveItem = async (itemId: string, targetFolderId: string | null) => {
    if (itemId === targetFolderId) return;
    
    const item = items.find(i => i.id === itemId);
    if (item) {
      const updatedItem = { ...item, parentId: targetFolderId };
      await saveItem(updatedItem);
      setItems(prev => prev.map(i => i.id === itemId ? updatedItem : i));
    }
  };

  const handleDeleteAll = async () => {
    await nukeDB(!deleteIncludeFolders);
    await loadItems(); // Reload from DB (should be empty or only folders)
    setIsDeleteModalOpen(false);
    setDeleteIncludeFolders(false);
    if (currentView === AppView.EDITOR) {
      setCurrentView(AppView.DASHBOARD);
      setActiveDocId(null);
    }
  };

  const handleExportAll = async () => {
    const zip = new JSZip();
    const docs = items.filter(i => i.type === 'file' && (i as DocumentData).status === 'ready') as DocumentData[];
    
    if (docs.length === 0) {
      alert("No ready documents to export.");
      return;
    }

    docs.forEach(doc => {
      const content = doc.savedText || reconstructCleanText(doc.pages);
      zip.file(`${doc.name.replace(/\.[^/.]+$/, "")}.txt`, content);
    });

    const content = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(content);
    const a = document.createElement("a");
    a.href = url;
    a.download = "all_notes.zip";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleFileSelect = async (fileList: FileList, options: ProcessingOptions) => {
    const files = Array.from(fileList);
    setIsUploading(true);
    
    try {
      const newDocs: DocumentData[] = [];

      for (const file of files) {
        const docId = `${MOCK_ID_PREFIX}${Date.now()}_${Math.random().toString(36).substr(2,5)}`;
        const isPDF = file.type === 'application/pdf';
        let images: {data: string, mimeType: string}[] = [];

        if (isPDF) {
          images = await convertPdfToImages(file);
        } else {
          const base64 = await fileToBase64(file);
          images = [{ data: base64, mimeType: file.type }];
        }

        const newDoc: DocumentData = {
          id: docId,
          name: file.name,
          type: 'file',
          parentId: currentFolderId,
          createdAt: Date.now(),
          uploadDate: Date.now(),
          status: 'processing', // Start processing immediately after user clicks Start
          modelUsed: options.model,
          processingMode: options.processingMode,
          targetLanguage: options.targetLanguage,
          customPrompt: options.customPrompt,
          removeReferences: options.removeReferences,
          totalPages: images.length,
          processedPages: 0,
          pages: images.map((img, idx) => ({
            pageNumber: idx + 1,
            imageUrl: `data:${img.mimeType};base64,${img.data}`,
            blocks: [],
            status: 'pending'
          }))
        };
        
        // Save initial state to DB and start background processing
        const savedDoc = await saveItem(newDoc, true) as DocumentData;
        newDocs.push(savedDoc);
      }
      
      // Update UI with new documents immediately
      setItems(prev => [...prev, ...newDocs]);
      setCurrentView(AppView.DASHBOARD);

    } catch (error: any) {
      console.error("Processing init failed", error);
      alert(`Failed to upload: ${error.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleOpenDocument = (docId: string) => {
    setActiveDocId(docId);
    setCurrentView(AppView.EDITOR);
  };

  const handleSaveDocument = async (docId: string, newText: string) => {
    const item = items.find(i => i.id === docId);
    if (item) {
       const updatedItem = { ...item, savedText: newText };
       await saveItem(updatedItem);
       setItems(prev => prev.map(i => i.id === docId ? updatedItem : i));
    }
  };

  const goToHome = () => {
    setCurrentView(AppView.DASHBOARD);
    setCurrentFolderId(null);
  };

  const activeDoc = items.find(d => d.id === activeDocId) as DocumentData | undefined;

  if (isAuthenticated === null) {
    return <div className="flex items-center justify-center h-screen bg-slate-50 dark:bg-slate-900"><LoaderIcon className="w-12 h-12 text-blue-600 animate-spin" /></div>;
  }

  if (!isAuthenticated) {
    return <Login onLoginSuccess={() => setIsAuthenticated(true)} />;
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 transition-colors duration-200">
      {/* Global Navigation */}
      <nav className="h-16 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between px-6 shrink-0 z-20 shadow-sm transition-colors duration-200">
        <div className="flex items-center space-x-3 cursor-pointer" onClick={goToHome}>
          <img src="/logo.png" alt="ocrAI Logo" className="w-10 h-10 rounded-lg shadow-sm" />
          <span className="text-xl font-bold text-slate-800 dark:text-white tracking-tight">ocrAI</span>
        </div>
        
        <div className="flex items-center space-x-4">
          
          {/* Theme Toggle Slider */}
          <div 
            onClick={toggleTheme}
            className={`w-14 h-7 flex items-center bg-slate-200 dark:bg-slate-700 rounded-full p-1 cursor-pointer transition-colors duration-300 relative`}
            title="Toggle Dark Mode"
          >
             {/* Slider Knob */}
             <div 
               className={`bg-white dark:bg-slate-200 w-5 h-5 rounded-full shadow-md transform duration-300 ease-in-out flex items-center justify-center
               ${isDarkMode ? 'translate-x-7' : 'translate-x-0'}`}
             >
                {isDarkMode ? <MoonIcon className="w-3 h-3 text-slate-800" /> : <SunIcon className="w-3 h-3 text-orange-500" />}
             </div>
          </div>
          
          <div className="h-6 w-px bg-slate-300 dark:bg-slate-600 mx-1"></div>

          {/* Model Settings Button */}
          <button 
            onClick={() => setIsModelSettingsOpen(true)}
            className="p-2 text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-700/50 rounded-lg transition-colors flex items-center space-x-2"
            title="Model Settings"
          >
            <SettingsIcon className="w-5 h-5" />
            <span className="font-medium hidden sm:inline">Models</span>
          </button>

          <div className="h-6 w-px bg-slate-300 dark:bg-slate-600 mx-1"></div>

          <button 
            onClick={handleExportAll}
            className="p-2 text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-700/50 rounded-lg transition-colors flex items-center space-x-2"
            title="Export All Notes"
          >
            <ArchiveIcon className="w-5 h-5" />
            <span className="font-medium hidden sm:inline">Export All</span>
          </button>
          
          <div className="h-6 w-px bg-slate-300 dark:bg-slate-600 mx-1"></div>

          {/* Delete All Button */}
          <button 
            onClick={() => setIsDeleteModalOpen(true)}
            className="p-2 text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors flex items-center space-x-2"
            title="Delete All Data"
          >
            <TrashIcon className="w-5 h-5" />
            <span className="font-medium hidden sm:inline">Delete All</span>
          </button>

          <div className="h-6 w-px bg-slate-300 dark:bg-slate-600 mx-1"></div>
          
          <button 
            onClick={goToHome}
            className="p-2 text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-700/50 rounded-lg transition-colors flex items-center space-x-2"
            title="Go to Dashboard"
          >
            <HomeIcon className="w-5 h-5" />
            <span className="font-medium hidden sm:inline">Home</span>
          </button>

          <div className="h-6 w-px bg-slate-300 dark:bg-slate-600 mx-1"></div>

          <button 
            onClick={handleLogout}
            className="p-2 text-slate-600 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-slate-100 dark:hover:bg-slate-700/50 rounded-lg transition-colors flex items-center space-x-2"
            title="Logout"
          >
            <LogoutIcon className="w-5 h-5" />
            <span className="font-medium hidden sm:inline">Logout</span>
          </button>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 overflow-hidden relative flex flex-col">
        {isLoadingItems ? (
          <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-900">
            <LoaderIcon className="w-16 h-16 text-blue-600 dark:text-blue-400 animate-spin mb-4" />
            <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-2">Loading Documents...</h2>
            <p className="text-slate-500 dark:text-slate-400">Please wait while we load your data</p>
          </div>
        ) : (
          <>
            {currentView === AppView.UPLOAD && (
              <UploadView onFileSelect={handleFileSelect} />
            )}
            
            {currentView === AppView.DASHBOARD && (
              <Dashboard 
                items={items}
                currentFolderId={currentFolderId}
                onOpenDocument={handleOpenDocument}
                onNewUpload={() => setCurrentView(AppView.UPLOAD)}
                onCreateFolder={handleCreateFolder}
                onNavigateFolder={setCurrentFolderId}
                onDeleteItem={handleRequestDelete}
                onMoveItem={handleMoveItem}
              />
            )}

            {currentView === AppView.EDITOR && activeDoc && (
              <EditorView 
                doc={activeDoc} 
                onBack={() => setCurrentView(AppView.DASHBOARD)}
                onSave={handleSaveDocument}
              />
            )}
          </>
        )}
      </main>

      {/* Loading Overlay */}
      {isUploading && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm">
          <LoaderIcon className="w-12 h-12 text-blue-600 animate-spin mb-4" />
          <h2 className="text-xl font-bold text-slate-800 dark:text-white">Processing Document...</h2>
          <p className="text-slate-500 dark:text-slate-400">Preparing and uploading your file</p>
        </div>
      )}

      {/* Single Item Delete Confirmation Modal */}
      {itemToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-md w-full p-6 animate-in fade-in zoom-in duration-200 border border-slate-200 dark:border-slate-700">
            <div className="flex items-center space-x-3 mb-4 text-red-600 dark:text-red-400">
              <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-full">
                <TrashIcon className="w-6 h-6" />
              </div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">Delete Item</h2>
            </div>
            
            <p className="text-slate-600 dark:text-slate-300 mb-6">
              Are you sure you want to delete <strong>{items.find(i => i.id === itemToDelete)?.name}</strong>?
              {items.find(i => i.id === itemToDelete)?.type === 'folder' && " This will permanently delete all documents inside it."}
            </p>

            <div className="flex justify-end space-x-3">
              <button 
                onClick={() => setItemToDelete(null)}
                className="px-4 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 rounded-lg font-medium hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={executeDeleteItem}
                className="px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors shadow-sm"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete All Confirmation Modal */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-md w-full p-6 animate-in fade-in zoom-in duration-200 border border-slate-200 dark:border-slate-700">
            <div className="flex items-center space-x-3 mb-4 text-red-600 dark:text-red-400">
              <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-full">
                <AlertCircleIcon className="w-6 h-6" />
              </div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">Delete All Data</h2>
            </div>
            
            <p className="text-slate-600 dark:text-slate-300 mb-6">
              Are you sure you want to delete all documents? This action cannot be undone.
            </p>

            <div className="mb-6 flex items-center space-x-3 p-3 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer" onClick={() => setDeleteIncludeFolders(!deleteIncludeFolders)}>
              <input 
                type="checkbox" 
                id="deleteFolders" 
                checked={deleteIncludeFolders}
                onChange={(e) => setDeleteIncludeFolders(e.target.checked)}
                className="w-5 h-5 text-red-600 rounded focus:ring-red-500 border-gray-300"
              />
              <label htmlFor="deleteFolders" className="text-sm font-medium text-slate-700 dark:text-slate-300 cursor-pointer select-none">
                Also delete all folders (structure)
              </label>
            </div>

            <div className="flex justify-end space-x-3">
              <button 
                onClick={() => setIsDeleteModalOpen(false)}
                className="px-4 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 rounded-lg font-medium hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleDeleteAll}
                className="px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors shadow-sm"
              >
                Delete All
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Model Settings Modal */}
      {isModelSettingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-lg w-full max-h-[80vh] overflow-hidden border border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-full">
                  <SettingsIcon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Model Settings</h2>
              </div>
              <button
                onClick={() => {
                  setIsModelSettingsOpen(false);
                  setModelError('');
                }}
                className="p-1 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              >
                <CloseIcon className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-4 overflow-y-auto max-h-[60vh]">
              {/* Add New Model */}
              <div className="mb-6">
                <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">Add New Model</h3>
                <div className="space-y-2">
                  <input
                    type="text"
                    value={newModelId}
                    onChange={(e) => setNewModelId(e.target.value)}
                    placeholder="Model ID (e.g., gemini-2.0-pro)"
                    className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white dark:bg-slate-900 text-slate-900 dark:text-white transition-colors text-sm"
                  />
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newModelName}
                      onChange={(e) => setNewModelName(e.target.value)}
                      placeholder="Display Name (optional)"
                      className="flex-1 p-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white dark:bg-slate-900 text-slate-900 dark:text-white transition-colors text-sm"
                    />
                    <input
                      type="text"
                      value={newModelDesc}
                      onChange={(e) => setNewModelDesc(e.target.value)}
                      placeholder="Description"
                      className="flex-1 p-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white dark:bg-slate-900 text-slate-900 dark:text-white transition-colors text-sm"
                    />
                  </div>
                  {modelError && (
                    <p className="text-red-500 text-xs">{modelError}</p>
                  )}
                  <button
                    onClick={handleAddModel}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                  >
                    <PlusIcon className="w-4 h-4" />
                    Add Model
                  </button>
                </div>
              </div>

              {/* Model List */}
              <div>
                <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">Available Models ({models.length})</h3>
                <div className="space-y-2">
                  {models.map(model => {
                    const isDefault = DEFAULT_MODELS.some(dm => dm.id === model.id);
                    return (
                      <div
                        key={model.id}
                        className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg"
                      >
                        <div>
                          <p className="text-sm font-medium text-slate-900 dark:text-white">
                            {model.name}
                            {model.isCustom && <span className="ml-2 text-xs text-blue-500">★ Custom</span>}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {model.id} · {model.description}
                          </p>
                        </div>
                        {!isDefault && (
                          <button
                            onClick={() => handleRemoveModel(model.id)}
                            className="p-1.5 text-red-500 hover:text-red-700 dark:hover:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                            title="Remove model"
                          >
                            <TrashIcon className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
