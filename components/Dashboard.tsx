import React, { useState } from 'react';
import { DocumentData, FileSystemItem, FolderData } from '../types';
import {
  CheckCircleIcon,
  ChevronRightIcon,
  CloseIcon,
  CopyIcon,
  FileIcon,
  FolderIcon,
  HomeIcon,
  TrashIcon,
  AlertCircleIcon,
} from './Icons';
import IconActionButton from './IconActionButton';

interface DashboardProps {
  items: FileSystemItem[];
  currentFolderId: string | null;
  onOpenDocument: (docId: string) => void;
  onNewUpload: () => void;
  onCreateFolder: (name: string) => void;
  onNavigateFolder: (folderId: string | null) => void;
  onDeleteItem: (itemId: string) => void;
  onMoveItem: (itemId: string, targetFolderId: string | null) => void;
}

type SortKey = 'name' | 'date' | 'status';
type SortDirection = 'asc' | 'desc';

const STATUS_ORDER: Record<DocumentData['status'], number> = {
  uploading: 0,
  processing: 1,
  ready: 2,
  error: 3,
};

const Dashboard: React.FC<DashboardProps> = ({
  items,
  currentFolderId,
  onOpenDocument,
  onNewUpload,
  onCreateFolder,
  onNavigateFolder,
  onDeleteItem,
  onMoveItem,
}) => {
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [copyFeedbackId, setCopyFeedbackId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [searchQuery, setSearchQuery] = useState('');

  const visibleItems = items.filter((item) => item.parentId === currentFolderId);
  const normalizedSearchQuery = searchQuery.trim().toLocaleLowerCase();
  const filteredVisibleItems = visibleItems.filter((item) => (
    normalizedSearchQuery.length === 0
      ? true
      : item.name.toLocaleLowerCase().includes(normalizedSearchQuery)
  ));

  const compareText = (left: string, right: string) =>
    left.localeCompare(right, undefined, { sensitivity: 'base', numeric: true });

  const getItemDate = (item: FileSystemItem) =>
    item.type === 'folder' ? item.createdAt : (item as DocumentData).uploadDate || item.createdAt;

  const getStatusValue = (item: FileSystemItem) =>
    item.type === 'folder' ? -1 : STATUS_ORDER[(item as DocumentData).status];

  const getProgressValue = (item: FileSystemItem) => {
    if (item.type === 'folder') {
      return -1;
    }

    const document = item as DocumentData;
    if (document.totalPages === 0) {
      return 0;
    }

    return document.processedPages / document.totalPages;
  };

  const sortedVisibleItems = [...filteredVisibleItems].sort((left, right) => {
    let comparison = 0;

    if (sortKey === 'name') {
      comparison = compareText(left.name, right.name);
    } else if (sortKey === 'date') {
      comparison = getItemDate(left) - getItemDate(right);
    } else {
      comparison = getStatusValue(left) - getStatusValue(right);
      if (comparison === 0) {
        comparison = getProgressValue(left) - getProgressValue(right);
      }
    }

    if (comparison === 0) {
      comparison = (left.type === 'folder' ? 0 : 1) - (right.type === 'folder' ? 0 : 1);
    }

    if (comparison === 0) {
      comparison = compareText(left.name, right.name);
    }

    return sortDirection === 'asc' ? comparison : comparison * -1;
  });

  const getBreadcrumbs = () => {
    const path = [];
    let currentId = currentFolderId;

    while (currentId) {
      const folder = items.find((item) => item.id === currentId);
      if (!folder) {
        break;
      }

      path.unshift(folder);
      currentId = folder.parentId;
    }

    return path;
  };

  const handleCreateFolder = () => {
    if (!newFolderName.trim()) {
      return;
    }

    onCreateFolder(newFolderName.trim());
    setNewFolderName('');
    setIsCreatingFolder(false);
  };

  const handleCopyTitle = (event: React.MouseEvent, id: string, name: string) => {
    event.stopPropagation();
    navigator.clipboard.writeText(name);
    setCopyFeedbackId(id);
    setTimeout(() => setCopyFeedbackId(null), 1000);
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((direction) => (direction === 'asc' ? 'desc' : 'asc'));
      return;
    }

    setSortKey(key);
    setSortDirection(key === 'date' ? 'desc' : 'asc');
  };

  const getSortIndicator = (key: SortKey) => {
    if (sortKey !== key) {
      return '-';
    }

    return sortDirection === 'asc' ? '^' : 'v';
  };

  const handleDragStart = (event: React.DragEvent, id: string) => {
    event.dataTransfer.setData('text/plain', id);
  };

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
  };

  const handleDropOnFolder = (event: React.DragEvent, targetFolderId: string) => {
    event.preventDefault();
    const id = event.dataTransfer.getData('text/plain');
    if (id && id !== targetFolderId) {
      onMoveItem(id, targetFolderId);
    }
  };

  const handleDropOnBreadcrumb = (event: React.DragEvent, targetFolderId: string | null) => {
    event.preventDefault();
    const id = event.dataTransfer.getData('text/plain');
    if (id && id !== targetFolderId) {
      onMoveItem(id, targetFolderId);
    }
  };

  const breadcrumbs = getBreadcrumbs();

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-8">
        <div className="mb-6 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_minmax(18rem,26rem)_auto] lg:items-center">
          <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm text-slate-600 dark:text-slate-400 sm:text-base">
            <button
              onClick={() => onNavigateFolder(null)}
              onDragOver={handleDragOver}
              onDrop={(event) => handleDropOnBreadcrumb(event, null)}
              className={`inline-flex items-center rounded-full px-3 py-2 transition-colors ${
                currentFolderId === null
                  ? 'bg-slate-200 text-slate-900 dark:bg-slate-700 dark:text-white'
                  : 'hover:text-blue-600 dark:hover:text-blue-400'
              }`}
            >
              <HomeIcon className="h-4 w-4" />
            </button>

            {breadcrumbs.map((folder) => (
              <React.Fragment key={folder.id}>
                <ChevronRightIcon className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-600" />
                <button
                  onClick={() => onNavigateFolder(folder.id)}
                  onDragOver={handleDragOver}
                  onDrop={(event) => handleDropOnBreadcrumb(event, folder.id)}
                  title={folder.name}
                  className={`whitespace-nowrap rounded-full px-3 py-2 transition-colors ${
                    currentFolderId === folder.id
                      ? 'bg-slate-200 font-semibold text-slate-900 dark:bg-slate-700 dark:text-white'
                      : 'hover:text-blue-600 dark:hover:text-blue-400'
                  }`}
                >
                  {folder.name}
                </button>
              </React.Fragment>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 lg:justify-self-center">
            <IconActionButton
              icon={<FolderIcon className="h-4 w-4" />}
              label="New folder"
              isActive={isCreatingFolder}
              onClick={() => setIsCreatingFolder(true)}
            />
            <IconActionButton
              icon={<FileIcon className="h-4 w-4" />}
              label="New document"
              isActive={false}
              variant="primary"
              onClick={onNewUpload}
            />
          </div>

          <div className="relative w-full lg:min-w-[18rem] lg:max-w-[26rem]">
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search documents by name"
              className="h-11 w-full rounded-2xl border border-slate-300 bg-white px-4 pr-24 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full px-2.5 py-1 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200"
              >
                Clear
              </button>
            )}
          </div>

          <p className="text-sm text-slate-500 dark:text-slate-400 lg:justify-self-end">
            {sortedVisibleItems.length} result{sortedVisibleItems.length === 1 ? '' : 's'}
          </p>
        </div>

        {isCreatingFolder && (
          <div className="mb-6 flex flex-col gap-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm transition-colors dark:border-slate-700 dark:bg-slate-800 sm:flex-row sm:items-center">
            <div className="rounded-2xl bg-blue-50 p-3 text-blue-500 dark:bg-blue-900/30 dark:text-blue-400">
              <FolderIcon className="h-6 w-6" />
            </div>
            <input
              autoFocus
              type="text"
              placeholder="Folder name"
              value={newFolderName}
              onChange={(event) => setNewFolderName(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && handleCreateFolder()}
              className="flex-1 rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
            />
            <div className="flex flex-wrap gap-2">
              <IconActionButton
                icon={<FolderIcon className="h-4 w-4" />}
                label="Create"
                isActive
                variant="primary"
                onClick={handleCreateFolder}
              />
              <IconActionButton
                icon={<CloseIcon className="h-4 w-4" />}
                label="Cancel"
                onClick={() => setIsCreatingFolder(false)}
              />
            </div>
          </div>
        )}

        {sortedVisibleItems.length === 0 && !isCreatingFolder ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white py-20 text-center transition-colors dark:border-slate-700 dark:bg-slate-800">
            {normalizedSearchQuery ? (
              <>
                <p className="text-slate-500 dark:text-slate-400">No documents match "{searchQuery}".</p>
                <button
                  onClick={() => setSearchQuery('')}
                  className="mt-4 text-blue-600 transition-colors hover:underline dark:text-blue-400"
                >
                  Clear search
                </button>
              </>
            ) : (
              <>
                <p className="text-slate-500 dark:text-slate-400">This folder is empty.</p>
                <div className="mt-4 flex items-center justify-center gap-4">
                  <button onClick={onNewUpload} className="text-blue-600 hover:underline dark:text-blue-400">
                    Upload document
                  </button>
                  <span className="text-slate-300 dark:text-slate-600">|</span>
                  <button onClick={() => setIsCreatingFolder(true)} className="text-blue-600 hover:underline dark:text-blue-400">
                    Create folder
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
          <>
            <div className="hidden overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm transition-colors dark:border-slate-700 dark:bg-slate-800 md:block">
              <table className="w-full table-fixed text-left">
                <colgroup>
                  <col />
                  <col className="w-[8.5rem] lg:w-[10rem]" />
                  <col className="w-[11rem] lg:w-[14rem]" />
                  <col className="w-[9rem] lg:w-[10rem]" />
                </colgroup>
                <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/50">
                  <tr>
                    <th className="px-6 py-4 text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
                      <button
                        type="button"
                        onClick={() => handleSort('name')}
                        className="inline-flex items-center gap-2 transition-colors hover:text-blue-600 dark:hover:text-blue-400"
                      >
                        <span>Name</span>
                        <span className="text-[10px] font-bold">{getSortIndicator('name')}</span>
                      </button>
                    </th>
                    <th className="px-6 py-4 text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
                      <button
                        type="button"
                        onClick={() => handleSort('date')}
                        className="inline-flex items-center gap-2 transition-colors hover:text-blue-600 dark:hover:text-blue-400"
                      >
                        <span>Date</span>
                        <span className="text-[10px] font-bold">{getSortIndicator('date')}</span>
                      </button>
                    </th>
                    <th className="px-6 py-4 text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
                      <button
                        type="button"
                        onClick={() => handleSort('status')}
                        className="inline-flex items-center gap-2 transition-colors hover:text-blue-600 dark:hover:text-blue-400"
                      >
                        <span>Status / Progress</span>
                        <span className="text-[10px] font-bold">{getSortIndicator('status')}</span>
                      </button>
                    </th>
                    <th className="px-6 py-4 text-right text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {sortedVisibleItems.map((item) => (
                    <DesktopRow
                      key={item.id}
                      item={item}
                      copyFeedbackId={copyFeedbackId}
                      onCopyTitle={handleCopyTitle}
                      onDeleteItem={onDeleteItem}
                      onDragStart={handleDragStart}
                      onDropOnFolder={handleDropOnFolder}
                      onNavigateFolder={onNavigateFolder}
                      onOpenDocument={onOpenDocument}
                      handleDragOver={handleDragOver}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid gap-3 md:hidden">
              {sortedVisibleItems.map((item) => (
                <MobileCard
                  key={item.id}
                  item={item}
                  copyFeedbackId={copyFeedbackId}
                  onCopyTitle={handleCopyTitle}
                  onDeleteItem={onDeleteItem}
                  onDragStart={handleDragStart}
                  onDropOnFolder={handleDropOnFolder}
                  onNavigateFolder={onNavigateFolder}
                  onOpenDocument={onOpenDocument}
                  handleDragOver={handleDragOver}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

interface SharedItemProps {
  item: FileSystemItem;
  copyFeedbackId: string | null;
  onCopyTitle: (event: React.MouseEvent, id: string, name: string) => void;
  onDeleteItem: (itemId: string) => void;
  onDragStart: (event: React.DragEvent, id: string) => void;
  onDropOnFolder: (event: React.DragEvent, targetFolderId: string) => void;
  onNavigateFolder: (folderId: string | null) => void;
  onOpenDocument: (docId: string) => void;
  handleDragOver: (event: React.DragEvent) => void;
}

const DesktopRow: React.FC<SharedItemProps> = ({
  item,
  copyFeedbackId,
  onCopyTitle,
  onDeleteItem,
  onDragStart,
  onDropOnFolder,
  onNavigateFolder,
  onOpenDocument,
  handleDragOver,
}) => {
  if (item.type === 'folder') {
    const folder = item as FolderData;

    return (
      <tr
        draggable
        onDragStart={(event) => onDragStart(event, folder.id)}
        onDragOver={handleDragOver}
        onDrop={(event) => onDropOnFolder(event, folder.id)}
        className="group cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/50"
        onClick={() => onNavigateFolder(folder.id)}
      >
        <td className="px-6 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="rounded-2xl bg-blue-50 p-2 text-blue-500 dark:bg-blue-900/30 dark:text-blue-400">
              <FolderIcon className="h-5 w-5" />
            </div>
            <span title={folder.name} className="truncate font-medium text-slate-700 dark:text-slate-200">
              {folder.name}
            </span>
          </div>
        </td>
        <td className="px-6 py-4 text-sm text-slate-500 dark:text-slate-400">
          {new Date(folder.createdAt).toLocaleDateString()}
        </td>
        <td className="px-6 py-4 text-sm text-slate-500 dark:text-slate-400">-</td>
        <td className="px-6 py-4 text-right">
          <IconActionButton
            icon={<TrashIcon className="h-4 w-4" />}
            label="Delete"
            variant="danger"
            size="sm"
            onClick={(event) => {
              event.stopPropagation();
              onDeleteItem(folder.id);
            }}
          />
        </td>
      </tr>
    );
  }

  const doc = item as DocumentData;

  return (
    <tr
      draggable
      onDragStart={(event) => onDragStart(event, doc.id)}
      className="group transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/50"
    >
      <td className="px-6 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="rounded-2xl bg-slate-100 p-2 text-slate-500 dark:bg-slate-700 dark:text-slate-400">
            <FileIcon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-1.5">
              <span title={doc.name} className="min-w-0 flex-1 truncate font-medium text-slate-700 dark:text-slate-200">
                {doc.name}
              </span>
              <div className="relative flex shrink-0 items-center">
                <button
                  onClick={(event) => onCopyTitle(event, doc.id, doc.name)}
                  className="rounded-md p-1.5 text-slate-400 opacity-0 transition-colors group-hover:opacity-100 hover:bg-slate-100 hover:text-blue-600 dark:hover:bg-slate-700 dark:hover:text-blue-400"
                  title="Copy title"
                >
                  <CopyIcon className="h-3.5 w-3.5" />
                </button>
                {copyFeedbackId === doc.id && (
                  <span className="pointer-events-none absolute left-1/2 top-full z-50 mt-1 -translate-x-1/2 whitespace-nowrap rounded bg-slate-800 px-2 py-1 text-[10px] font-medium text-white shadow-lg dark:bg-slate-200 dark:text-slate-900">
                    Title copied
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </td>
      <td className="px-6 py-4 text-sm text-slate-500 dark:text-slate-400">
        {new Date(doc.uploadDate).toLocaleDateString()}
      </td>
      <td className="px-6 py-4">
        <StatusWithProgress status={doc.status} processed={doc.processedPages} total={doc.totalPages} />
      </td>
      <td className="px-6 py-4">
        <div className="flex items-center justify-end gap-2">
          {doc.status === 'ready' && (
            <IconActionButton
              icon={<FileIcon className="h-4 w-4" />}
              label="Open"
              variant="primary"
              size="sm"
              onClick={() => onOpenDocument(doc.id)}
            />
          )}
          <IconActionButton
            icon={<TrashIcon className="h-4 w-4" />}
            label="Delete"
            variant="danger"
            size="sm"
            onClick={(event) => {
              event.stopPropagation();
              onDeleteItem(doc.id);
            }}
          />
        </div>
      </td>
    </tr>
  );
};

const MobileCard: React.FC<SharedItemProps> = ({
  item,
  copyFeedbackId,
  onCopyTitle,
  onDeleteItem,
  onDragStart,
  onDropOnFolder,
  onNavigateFolder,
  onOpenDocument,
  handleDragOver,
}) => {
  if (item.type === 'folder') {
    const folder = item as FolderData;

    return (
      <div
        draggable
        onDragStart={(event) => onDragStart(event, folder.id)}
        onDragOver={handleDragOver}
        onDrop={(event) => onDropOnFolder(event, folder.id)}
        onClick={() => onNavigateFolder(folder.id)}
        className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm transition-colors dark:border-slate-700 dark:bg-slate-800"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-blue-50 p-3 text-blue-500 dark:bg-blue-900/30 dark:text-blue-400">
                <FolderIcon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p title={folder.name} className="truncate font-semibold text-slate-900 dark:text-white">
                  {folder.name}
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Created {new Date(folder.createdAt).toLocaleDateString()}
                </p>
              </div>
            </div>
          </div>

          <IconActionButton
            icon={<TrashIcon className="h-4 w-4" />}
            label="Delete"
            variant="danger"
            size="sm"
            onClick={(event) => {
              event.stopPropagation();
              onDeleteItem(folder.id);
            }}
          />
        </div>
      </div>
    );
  }

  const doc = item as DocumentData;

  return (
    <div
      draggable
      onDragStart={(event) => onDragStart(event, doc.id)}
      className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm transition-colors dark:border-slate-700 dark:bg-slate-800"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-slate-100 p-3 text-slate-500 dark:bg-slate-700 dark:text-slate-400">
              <FileIcon className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-1.5">
                <p title={doc.name} className="min-w-0 flex-1 truncate font-semibold text-slate-900 dark:text-white">
                  {doc.name}
                </p>
                <div className="relative shrink-0">
                  <button
                    onClick={(event) => onCopyTitle(event, doc.id, doc.name)}
                    className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-blue-600 dark:hover:bg-slate-700 dark:hover:text-blue-400"
                    title="Copy title"
                  >
                    <CopyIcon className="h-3.5 w-3.5" />
                  </button>
                  {copyFeedbackId === doc.id && (
                    <span className="pointer-events-none absolute left-1/2 top-full z-50 mt-1 -translate-x-1/2 whitespace-nowrap rounded bg-slate-800 px-2 py-1 text-[10px] font-medium text-white shadow-lg dark:bg-slate-200 dark:text-slate-900">
                      Title copied
                    </span>
                  )}
                </div>
              </div>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Uploaded {new Date(doc.uploadDate).toLocaleDateString()}
              </p>
            </div>
          </div>

          <div className="mt-4">
            <StatusWithProgress status={doc.status} processed={doc.processedPages} total={doc.totalPages} />
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {doc.status === 'ready' && (
          <IconActionButton
            icon={<FileIcon className="h-4 w-4" />}
            label="Open"
            isActive
            variant="primary"
            onClick={() => onOpenDocument(doc.id)}
          />
        )}
        <IconActionButton
          icon={<TrashIcon className="h-4 w-4" />}
          label="Delete"
          variant="danger"
          onClick={() => onDeleteItem(doc.id)}
        />
      </div>
    </div>
  );
};

const StatusWithProgress = ({
  status,
  processed,
  total,
}: {
  status: DocumentData['status'];
  processed: number;
  total: number;
}) => {
  if (status === 'ready') {
    return (
      <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-800 dark:bg-green-900/30 dark:text-green-300">
        <CheckCircleIcon className="mr-1 h-3 w-3" /> Ready
      </span>
    );
  }

  if (status === 'error') {
    return (
      <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-800 dark:bg-red-900/30 dark:text-red-300">
        <AlertCircleIcon className="mr-1 h-3 w-3" /> Error
      </span>
    );
  }

  const percentage = total > 0 ? Math.round((processed / total) * 100) : 0;

  return (
    <div className="w-full max-w-[180px]">
      <div className="mb-1 flex justify-between text-xs text-slate-600 dark:text-slate-400">
        <span>Processing</span>
        <span>{processed}/{total}</span>
      </div>
      <div className="h-2 w-full rounded-full bg-slate-200 dark:bg-slate-700">
        <div
          className="h-2 rounded-full bg-blue-600 transition-all duration-300 dark:bg-blue-500"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};

export default Dashboard;
