import React, { useState } from 'react';
import { DocumentData, FileSystemItem, FolderData } from '../types';
import { FileIcon, FolderIcon, LoaderIcon, CheckCircleIcon, AlertCircleIcon, TrashIcon, PlusIcon, ChevronRightIcon, HomeIcon, CopyIcon } from './Icons';

interface DashboardProps {
  items: FileSystemItem[]; // All items (files and folders)
  currentFolderId: string | null;
  onOpenDocument: (docId: string) => void;
  onNewUpload: () => void;
  onCreateFolder: (name: string) => void;
  onNavigateFolder: (folderId: string | null) => void;
  onDeleteItem: (itemId: string) => void;
  onMoveItem: (itemId: string, targetFolderId: string | null) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ 
  items, 
  currentFolderId, 
  onOpenDocument, 
  onNewUpload, 
  onCreateFolder,
  onNavigateFolder,
  onDeleteItem,
  onMoveItem
}) => {
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [copyFeedbackId, setCopyFeedbackId] = useState<string | null>(null);

  // Filter items for current view
  const visibleItems = items.filter(item => item.parentId === currentFolderId);
  const folders = visibleItems.filter(item => item.type === 'folder') as FolderData[];
  const documents = visibleItems.filter(item => item.type === 'file') as DocumentData[];

  // Get current path for breadcrumbs
  const getBreadcrumbs = () => {
    const path = [];
    let curr = currentFolderId;
    while (curr) {
      const folder = items.find(i => i.id === curr);
      if (folder) {
        path.unshift(folder);
        curr = folder.parentId;
      } else {
        break;
      }
    }
    return path;
  };

  const handleCreateFolder = () => {
    if (newFolderName.trim()) {
      onCreateFolder(newFolderName.trim());
      setNewFolderName("");
      setIsCreatingFolder(false);
    }
  };

  const handleCopyTitle = (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(name);
    setCopyFeedbackId(id);
    setTimeout(() => setCopyFeedbackId(null), 1000);
  };

  // Drag and Drop Handlers
  const handleDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData("text/plain", id);
    setDraggedItemId(id);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault(); // Allow dropping
  };

  const handleDropOnFolder = (e: React.DragEvent, targetFolderId: string) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain");
    if (id && id !== targetFolderId) {
       onMoveItem(id, targetFolderId);
    }
    setDraggedItemId(null);
  };
  
  const handleDropOnBreadcrumb = (e: React.DragEvent, targetFolderId: string | null) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain");
    if (id && id !== targetFolderId) {
        onMoveItem(id, targetFolderId);
    }
    setDraggedItemId(null);
  };

  return (
    <div className="container mx-auto px-6 py-8">
      {/* Header & Breadcrumbs */}
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center space-x-2 text-lg text-slate-600 dark:text-slate-400 overflow-hidden">
          <button 
            onClick={() => onNavigateFolder(null)}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDropOnBreadcrumb(e, null)}
            className={`flex items-center hover:text-blue-600 dark:hover:text-blue-400 transition-colors ${currentFolderId === null ? 'font-bold text-slate-800 dark:text-slate-200' : ''}`}
          >
            <HomeIcon className="w-5 h-5" />
          </button>
          
          {getBreadcrumbs().map((folder) => (
            <React.Fragment key={folder.id}>
              <ChevronRightIcon className="w-4 h-4 text-slate-400 dark:text-slate-600" />
              <button 
                onClick={() => onNavigateFolder(folder.id)}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDropOnBreadcrumb(e, folder.id)}
                className={`hover:text-blue-600 dark:hover:text-blue-400 transition-colors whitespace-nowrap ${currentFolderId === folder.id ? 'font-bold text-slate-800 dark:text-slate-200' : ''}`}
              >
                {folder.name}
              </button>
            </React.Fragment>
          ))}
        </div>

        <div className="flex space-x-3">
          <button
            onClick={() => setIsCreatingFolder(true)}
            className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors flex items-center shadow-sm"
          >
            <PlusIcon className="w-4 h-4 mr-2" /> New Folder
          </button>
          <button
            onClick={onNewUpload}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors shadow-sm flex items-center"
          >
            <PlusIcon className="w-4 h-4 mr-2" /> New Document
          </button>
        </div>
      </div>

      {/* Inline Folder Creation */}
      {isCreatingFolder && (
        <div className="mb-6 p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center space-x-4 transition-colors">
          <FolderIcon className="w-6 h-6 text-blue-500" />
          <input
            autoFocus
            type="text"
            placeholder="Folder Name"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
            className="flex-1 p-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
          />
          <button onClick={handleCreateFolder} className="text-blue-600 dark:text-blue-400 font-medium hover:underline">Create</button>
          <button onClick={() => setIsCreatingFolder(false)} className="text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200">Cancel</button>
        </div>
      )}

      {visibleItems.length === 0 && !isCreatingFolder ? (
        <div className="text-center py-20 bg-white dark:bg-slate-800 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 transition-colors">
          <p className="text-slate-500 dark:text-slate-400">This folder is empty.</p>
          <div className="mt-4 space-x-4">
             <button onClick={onNewUpload} className="text-blue-600 dark:text-blue-400 font-medium hover:underline">Upload Document</button>
             <span className="text-slate-300 dark:text-slate-600">|</span>
             <button onClick={() => setIsCreatingFolder(true)} className="text-blue-600 dark:text-blue-400 font-medium hover:underline">Create Folder</button>
          </div>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden transition-colors">
          <table className="w-full text-left">
            <thead className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Name</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Date</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Status / Progress</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {/* Folders */}
              {folders.map((folder) => (
                <tr 
                  key={folder.id} 
                  draggable
                  onDragStart={(e) => handleDragStart(e, folder.id)}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDropOnFolder(e, folder.id)}
                  className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors group cursor-pointer"
                  onClick={() => onNavigateFolder(folder.id)}
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center space-x-3">
                      <div className="p-2 bg-blue-50 dark:bg-blue-900/30 rounded-lg text-blue-500 dark:text-blue-400">
                        <FolderIcon className="w-5 h-5" />
                      </div>
                      <span className="font-medium text-slate-700 dark:text-slate-200">{folder.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-slate-500 dark:text-slate-400 text-sm">
                    {new Date(folder.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 text-slate-500 dark:text-slate-400 text-sm">-</td>
                  <td className="px-6 py-4 text-right relative">
                    <button 
                      type="button"
                      onClick={(e) => { 
                        e.stopPropagation(); 
                        onDeleteItem(folder.id); 
                      }}
                      className="text-slate-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400 p-2 relative z-10"
                      title="Delete Folder"
                    >
                      <TrashIcon className="w-4 h-4 pointer-events-none" />
                    </button>
                  </td>
                </tr>
              ))}

              {/* Documents */}
              {documents.map((doc) => (
                <tr 
                  key={doc.id} 
                  draggable
                  onDragStart={(e) => handleDragStart(e, doc.id)}
                  className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors group"
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center space-x-3">
                      <div className="p-2 bg-slate-100 dark:bg-slate-700 rounded-lg text-slate-500 dark:text-slate-400">
                        <FileIcon className="w-5 h-5" />
                      </div>
                      <span className="font-medium text-slate-700 dark:text-slate-200">{doc.name}</span>
                      <div className="relative flex items-center">
                        <button 
                          onClick={(e) => handleCopyTitle(e, doc.id, doc.name)}
                          className="p-1.5 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-md transition-colors opacity-0 group-hover:opacity-100"
                          title="Copy Title"
                        >
                          <CopyIcon className="w-3.5 h-3.5" />
                        </button>
                        {copyFeedbackId === doc.id && (
                          <span className="absolute top-full mt-1 left-1/2 -translate-x-1/2 px-2 py-1 bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900 text-[10px] font-medium rounded shadow-lg whitespace-nowrap animate-fade-in-out z-50 pointer-events-none">
                            Title copied
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-slate-500 dark:text-slate-400 text-sm">
                    {new Date(doc.uploadDate).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 w-1/4">
                    <StatusWithProgress 
                      status={doc.status} 
                      processed={doc.processedPages} 
                      total={doc.totalPages} 
                    />
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end space-x-2">
                      {doc.status === 'ready' && (
                        <button
                          onClick={() => onOpenDocument(doc.id)}
                          className="text-blue-600 dark:text-blue-400 font-medium text-sm hover:underline px-2 relative z-10"
                        >
                          Open
                        </button>
                      )}
                      <button 
                        type="button"
                        onClick={(e) => { 
                          e.stopPropagation(); 
                          onDeleteItem(doc.id); 
                        }}
                        className="text-slate-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400 p-2 relative z-10"
                        title="Delete Document"
                      >
                        <TrashIcon className="w-4 h-4 pointer-events-none" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

const StatusWithProgress = ({ status, processed, total }: { status: DocumentData['status'], processed: number, total: number }) => {
  if (status === 'ready') {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300">
        <CheckCircleIcon className="w-3 h-3 mr-1" /> Ready
      </span>
    );
  }

  if (status === 'error') {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300">
        <AlertCircleIcon className="w-3 h-3 mr-1" /> Error
      </span>
    );
  }

  // Processing state with bar
  const percentage = total > 0 ? Math.round((processed / total) * 100) : 0;
  
  return (
    <div className="w-full max-w-[140px]">
      <div className="flex justify-between text-xs mb-1 text-slate-600 dark:text-slate-400">
        <span>Processing</span>
        <span>{processed}/{total}</span>
      </div>
      <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
        <div 
          className="bg-blue-600 dark:bg-blue-500 h-2 rounded-full transition-all duration-300" 
          style={{ width: `${percentage}%` }}
        ></div>
      </div>
    </div>
  );
};

export default Dashboard;