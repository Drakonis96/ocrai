import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { DocumentData, FileSystemItem, FolderData, SettingsTab } from '../types';
import { DEFAULT_MODEL_ID, getPreferredDefaultModelId, type GeminiModel } from '../utils/modelStorage';
import {
  CheckCircleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  CloseIcon,
  CopyIcon,
  EditIcon,
  FileIcon,
  FolderIcon,
  HomeIcon,
  TrashIcon,
  AlertCircleIcon,
  ArrowUpIcon,
  MoveIcon,
  PlusIcon,
  RefreshCwIcon,
} from './Icons';
import IconActionButton from './IconActionButton';
import DocumentNameDialog from './DocumentNameDialog';
import DocumentLabelsDialog from './DocumentLabelsDialog';
import MoveItemDialog, { MoveDestinationOption } from './MoveItemDialog';
import ReprocessDocumentDialog from './ReprocessDocumentDialog';

interface DashboardProps {
  items: FileSystemItem[];
  models: GeminiModel[];
  availableLabels?: string[];
  currentFolderId: string | null;
  onOpenDocument: (docId: string) => void;
  onNewUpload: () => void;
  onCreateFolder: (name: string) => void;
  onNavigateFolder: (folderId: string | null) => void;
  onDeleteItem: (itemId: string) => void;
  onDeleteDocuments?: (docIds: string[]) => Promise<void>;
  onMoveItem: (itemId: string, targetFolderId: string | null) => Promise<void>;
  onRenameDocument: (docId: string, nextName: string) => Promise<void>;
  onToggleDocumentRead: (docId: string, isRead: boolean) => Promise<void>;
  onUpdateDocumentLabels?: (docId: string, nextLabels: string[]) => Promise<void>;
  onReprocessDocument: (docId: string, modelId: string, pagesPerBatch: number, splitColumns: boolean) => Promise<void>;
  onOpenSettings?: (tab?: SettingsTab) => void;
}

type SortKey = 'name' | 'date' | 'status';
type SortDirection = 'asc' | 'desc';
type DashboardStatusFilter = 'all' | DocumentData['status'];

const DOCUMENTS_PER_PAGE_OPTIONS = [10, 15, 25, 50, 100, 150];
const DEFAULT_DOCUMENTS_PER_PAGE = 15;
const SCROLL_TOP_VISIBILITY_OFFSET = 320;
const ROOT_FOLDER_LABEL = 'Main / Root';
const EMPTY_LABELS: string[] = [];
const FOLDER_FILTER_CURRENT = '__current__';
const FOLDER_FILTER_ALL = '__all__';
const FOLDER_FILTER_ROOT = '__root__';
const MULTIPLE_CURRENT_DESTINATION_ID = '__multiple__';

const STATUS_ORDER: Record<DocumentData['status'], number> = {
  uploading: 0,
  processing: 1,
  ready: 2,
  error: 3,
};

const canOpenDocument = (doc: DocumentData) => doc.status === 'ready' || doc.status === 'error';
const canReprocessDocument = (doc: DocumentData) => doc.status === 'ready' || doc.status === 'error';

const getFailedPagesLabel = (failedPages: number) =>
  failedPages === 1 ? '1 failed page' : `${failedPages} failed pages`;

const parseDateFilterTimestamp = (value: string, endOfDay: boolean = false) => {
  if (!value) {
    return null;
  }

  const parsedDate = new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}`);
  const timestamp = parsedDate.getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
};

const getDocumentSearchText = (doc: DocumentData) => {
  const savedDocumentText = typeof doc.savedText === 'string' ? doc.savedText.trim() : '';
  if (savedDocumentText) {
    return savedDocumentText;
  }

  const savedPageText = Object.entries(doc.pageSavedTexts ?? {})
    .sort(([leftPage], [rightPage]) => Number(leftPage) - Number(rightPage))
    .map(([, text]) => text.trim())
    .filter(Boolean)
    .join('\n\n');

  if (savedPageText) {
    return savedPageText;
  }

  return doc.pages
    .flatMap((page) => page.blocks.map((block) => block.text.trim()))
    .filter(Boolean)
    .join('\n\n');
};

const getPaginationTokens = (currentPage: number, totalPages: number): Array<number | 'ellipsis'> => {
  if (totalPages <= 1) {
    return [1];
  }

  const tokens: Array<number | 'ellipsis'> = [];

  for (let page = 1; page <= totalPages; page += 1) {
    const shouldShowPage = (
      page === 1
      || page === totalPages
      || Math.abs(page - currentPage) <= 1
    );

    if (shouldShowPage) {
      tokens.push(page);
      continue;
    }

    if (tokens[tokens.length - 1] !== 'ellipsis') {
      tokens.push('ellipsis');
    }
  }

  return tokens;
};

const Dashboard: React.FC<DashboardProps> = ({
  items,
  models,
  availableLabels = EMPTY_LABELS,
  currentFolderId,
  onOpenDocument,
  onNewUpload,
  onCreateFolder,
  onNavigateFolder,
  onDeleteItem,
  onDeleteDocuments,
  onMoveItem,
  onRenameDocument,
  onToggleDocumentRead,
  onUpdateDocumentLabels,
  onReprocessDocument,
  onOpenSettings,
}) => {
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [copyFeedbackId, setCopyFeedbackId] = useState<string | null>(null);
  const [renameDocumentId, setRenameDocumentId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [renameError, setRenameError] = useState('');
  const [isRenamingDocument, setIsRenamingDocument] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [searchQuery, setSearchQuery] = useState('');
  const [isFullTextSearchEnabled, setIsFullTextSearchEnabled] = useState(false);
  const [selectedLabelFilter, setSelectedLabelFilter] = useState('');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<DashboardStatusFilter>('all');
  const [selectedFolderFilter, setSelectedFolderFilter] = useState(FOLDER_FILTER_CURRENT);
  const [dateFromFilter, setDateFromFilter] = useState('');
  const [dateToFilter, setDateToFilter] = useState('');
  const [documentsPerPage, setDocumentsPerPage] = useState(DEFAULT_DOCUMENTS_PER_PAGE);
  const [currentPage, setCurrentPage] = useState(1);
  const [showScrollToTop, setShowScrollToTop] = useState(false);
  const [pendingReadDocumentIds, setPendingReadDocumentIds] = useState<string[]>([]);
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);
  const [isBulkDeleteDialogOpen, setIsBulkDeleteDialogOpen] = useState(false);
  const [bulkDeleteError, setBulkDeleteError] = useState('');
  const [isDeletingSelectedDocuments, setIsDeletingSelectedDocuments] = useState(false);
  const [moveItemId, setMoveItemId] = useState<string | null>(null);
  const [moveTargetFolderId, setMoveTargetFolderId] = useState<string | null>(null);
  const [moveError, setMoveError] = useState('');
  const [isMovingItem, setIsMovingItem] = useState(false);
  const [isBulkMoveDialogOpen, setIsBulkMoveDialogOpen] = useState(false);
  const [bulkMoveTargetFolderId, setBulkMoveTargetFolderId] = useState<string | null>(null);
  const [bulkMoveError, setBulkMoveError] = useState('');
  const [isBulkMovingDocuments, setIsBulkMovingDocuments] = useState(false);
  const [reprocessDocumentId, setReprocessDocumentId] = useState<string | null>(null);
  const [reprocessModelId, setReprocessModelId] = useState(getPreferredDefaultModelId(models));
  const [reprocessPagesPerBatch, setReprocessPagesPerBatch] = useState(1);
  const [reprocessSplitColumns, setReprocessSplitColumns] = useState(false);
  const [reprocessError, setReprocessError] = useState('');
  const [isReprocessingDocument, setIsReprocessingDocument] = useState(false);
  const [isBulkReprocessDialogOpen, setIsBulkReprocessDialogOpen] = useState(false);
  const [bulkReprocessModelId, setBulkReprocessModelId] = useState(getPreferredDefaultModelId(models));
  const [bulkReprocessPagesPerBatch, setBulkReprocessPagesPerBatch] = useState(1);
  const [bulkReprocessSplitColumns, setBulkReprocessSplitColumns] = useState(false);
  const [bulkReprocessError, setBulkReprocessError] = useState('');
  const [isBulkReprocessingDocuments, setIsBulkReprocessingDocuments] = useState(false);
  const [labelDocumentId, setLabelDocumentId] = useState<string | null>(null);
  const [labelDraft, setLabelDraft] = useState<string[]>([]);
  const [labelError, setLabelError] = useState('');
  const [isSavingLabels, setIsSavingLabels] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const selectAllVisibleCheckboxRef = useRef<HTMLInputElement | null>(null);

  const compareText = (left: string, right: string) =>
    left.localeCompare(right, undefined, { sensitivity: 'base', numeric: true });

  const allFolders = items.filter((item): item is FolderData => item.type === 'folder');
  const foldersById = new Map(allFolders.map((folder) => [folder.id, folder]));
  const allDocuments = items.filter((item): item is DocumentData => item.type === 'file');
  const selectedDocumentIdSet = new Set(selectedDocumentIds);
  const selectedDocuments = allDocuments.filter((doc) => selectedDocumentIdSet.has(doc.id));
  const availableFilterLabels = Array.from(new Set(
    [...availableLabels, ...allDocuments.flatMap((doc) => doc.labels ?? [])]
      .map((label) => label.trim())
      .filter(Boolean)
  )).sort(compareText);

  const getFolderPathLabel = (folderId: string) => {
    const names: string[] = [];
    let currentId: string | null = folderId;

    while (currentId) {
      const folder = foldersById.get(currentId);
      if (!folder) {
        break;
      }

      names.unshift(folder.name);
      currentId = folder.parentId;
    }

    return names.join(' / ');
  };

  const folderFilterOptions = (() => {
    const options = [
      {
        value: FOLDER_FILTER_CURRENT,
        label: currentFolderId ? `Current folder: ${getFolderPathLabel(currentFolderId)}` : `Current folder: ${ROOT_FOLDER_LABEL}`,
      },
      {
        value: FOLDER_FILTER_ALL,
        label: 'All folders',
      },
    ];

    if (currentFolderId !== null) {
      options.push({
        value: FOLDER_FILTER_ROOT,
        label: ROOT_FOLDER_LABEL,
      });
    }

    allFolders
      .filter((folder) => folder.id !== currentFolderId)
      .sort((left, right) => compareText(getFolderPathLabel(left.id), getFolderPathLabel(right.id)))
      .forEach((folder) => {
        options.push({
          value: folder.id,
          label: getFolderPathLabel(folder.id),
        });
      });

    return options;
  })();

  const getItemDate = (item: FileSystemItem) =>
    item.type === 'folder' ? item.createdAt : (item as DocumentData).uploadDate || item.createdAt;

  const getStatusValue = (item: FileSystemItem) =>
    item.type === 'folder' ? -1 : STATUS_ORDER[(item as DocumentData).status];

  const getProgressValue = (item: FileSystemItem) => {
    if (item.type === 'folder') {
      return -1;
    }

    const document = item as DocumentData;
    const totalPages = Math.max(document.totalPages ?? 0, Array.isArray(document.pages) ? document.pages.length : 0);
    if (totalPages === 0) {
      return 0;
    }

    const activeProcessingPages = Array.isArray(document.pages)
      ? document.pages.filter((page) => page?.status === 'processing').length
      : 0;
    const completedPages = Math.min(
      Math.max(document.processedPages ?? 0, 0) + Math.max(document.failedPages ?? 0, 0),
      totalPages
    );
    const displayedProgress = document.status === 'uploading'
      ? Math.min(Math.max(document.sourceRenderCompletedPages ?? 0, 0), totalPages)
      : Math.min(completedPages + activeProcessingPages, totalPages);

    return displayedProgress / totalPages;
  };

  const normalizedSearchQuery = searchQuery.trim().toLocaleLowerCase();
  const dateFromTimestamp = parseDateFilterTimestamp(dateFromFilter);
  const dateToTimestamp = parseDateFilterTimestamp(dateToFilter, true);
  const hasDocumentOnlyFilters = (
    selectedLabelFilter.length > 0
    || selectedStatusFilter !== 'all'
    || dateFromTimestamp !== null
    || dateToTimestamp !== null
  );
  const hasFullTextQuery = isFullTextSearchEnabled && normalizedSearchQuery.length > 0;
  const hasActiveSearchOrFilters = (
    normalizedSearchQuery.length > 0
    || hasDocumentOnlyFilters
    || selectedFolderFilter !== FOLDER_FILTER_CURRENT
  );

  const visibleItems = (() => {
    if (selectedFolderFilter === FOLDER_FILTER_ALL) {
      return items;
    }

    const targetParentId = selectedFolderFilter === FOLDER_FILTER_CURRENT
      ? currentFolderId
      : selectedFolderFilter === FOLDER_FILTER_ROOT
        ? null
        : selectedFolderFilter;

    return items.filter((item) => item.parentId === targetParentId);
  })();

  const filteredVisibleItems = visibleItems.filter((item) => {
    const nameMatches = normalizedSearchQuery.length === 0
      || item.name.toLocaleLowerCase().includes(normalizedSearchQuery);

    if (item.type === 'folder') {
      if (hasDocumentOnlyFilters || hasFullTextQuery) {
        return false;
      }

      return nameMatches;
    }

    const doc = item as DocumentData;

    if (selectedLabelFilter) {
      const matchesLabel = (doc.labels ?? []).some(
        (label) => label.toLocaleLowerCase() === selectedLabelFilter.toLocaleLowerCase()
      );
      if (!matchesLabel) {
        return false;
      }
    }

    if (selectedStatusFilter !== 'all' && doc.status !== selectedStatusFilter) {
      return false;
    }

    const documentTimestamp = getItemDate(doc);
    if (dateFromTimestamp !== null && documentTimestamp < dateFromTimestamp) {
      return false;
    }

    if (dateToTimestamp !== null && documentTimestamp > dateToTimestamp) {
      return false;
    }

    if (normalizedSearchQuery.length === 0) {
      return true;
    }

    if (!isFullTextSearchEnabled) {
      return nameMatches;
    }

    return nameMatches || getDocumentSearchText(doc).toLocaleLowerCase().includes(normalizedSearchQuery);
  });
  const filteredVisibleDocumentIds = filteredVisibleItems
    .filter((item): item is DocumentData => item.type === 'file')
    .map((doc) => doc.id);

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

  const totalResults = sortedVisibleItems.length;
  const totalPages = Math.max(1, Math.ceil(totalResults / documentsPerPage));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * documentsPerPage;
  const paginatedVisibleItems = sortedVisibleItems.slice(startIndex, startIndex + documentsPerPage);
  const paginatedVisibleDocumentIds = paginatedVisibleItems
    .filter((item): item is DocumentData => item.type === 'file')
    .map((doc) => doc.id);
  const visibleRangeStart = totalResults === 0 ? 0 : startIndex + 1;
  const visibleRangeEnd = totalResults === 0 ? 0 : Math.min(totalResults, startIndex + documentsPerPage);
  const paginationTokens = getPaginationTokens(safeCurrentPage, totalPages);
  const allVisibleDocumentsSelected = paginatedVisibleDocumentIds.length > 0
    && paginatedVisibleDocumentIds.every((docId) => selectedDocumentIdSet.has(docId));
  const someVisibleDocumentsSelected = paginatedVisibleDocumentIds.some((docId) => selectedDocumentIdSet.has(docId));
  const selectedDocumentsLabel = `${selectedDocuments.length} document${selectedDocuments.length === 1 ? '' : 's'} selected`;
  const selectedDocumentsPageCount = selectedDocuments.reduce((total, doc) => total + doc.pages.length, 0);
  const canBulkReprocessSelectedDocuments = selectedDocuments.length > 0 && selectedDocuments.every(canReprocessDocument);

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
  const moveItem = moveItemId ? (items.find((item) => item.id === moveItemId) ?? null) : null;
  const reprocessDocumentItem = reprocessDocumentId
    ? (items.find((item) => item.type === 'file' && item.id === reprocessDocumentId) as DocumentData | undefined) ?? null
    : null;
  const labelDocumentItem = labelDocumentId
    ? (items.find((item) => item.type === 'file' && item.id === labelDocumentId) as DocumentData | undefined) ?? null
    : null;
  const bulkMoveCurrentDestinationId = selectedDocuments.length <= 1
    ? (selectedDocuments[0]?.parentId ?? null)
    : selectedDocuments.some((doc) => doc.parentId !== selectedDocuments[0].parentId)
      ? MULTIPLE_CURRENT_DESTINATION_ID
      : (selectedDocuments[0]?.parentId ?? null);

  const isFolderWithinMovedTree = (folderId: string, movedFolderId: string) => {
    let currentId: string | null = folderId;

    while (currentId) {
      if (currentId === movedFolderId) {
        return true;
      }

      const folder = foldersById.get(currentId);
      currentId = folder?.parentId ?? null;
    }

    return false;
  };

  const moveDestinationOptions: MoveDestinationOption[] = (() => {
    const options: MoveDestinationOption[] = [
      { id: null, label: ROOT_FOLDER_LABEL, depth: 0 },
    ];
    const movedFolderId = moveItem?.type === 'folder' ? moveItem.id : null;

    const collectChildren = (parentId: string | null, depth: number) => {
      allFolders
        .filter((folder) => folder.parentId === parentId)
        .sort((left, right) => compareText(left.name, right.name))
        .forEach((folder) => {
          if (movedFolderId && isFolderWithinMovedTree(folder.id, movedFolderId)) {
            return;
          }

          options.push({
            id: folder.id,
            label: getFolderPathLabel(folder.id),
            depth,
          });
          collectChildren(folder.id, depth + 1);
        });
    };

    collectChildren(null, 1);
    return options;
  })();

  const handleCreateFolder = () => {
    if (!newFolderName.trim()) {
      return;
    }

    onCreateFolder(newFolderName.trim());
    setNewFolderName('');
    setIsCreatingFolder(false);
  };

  const handleCopyTitle = useCallback((event: React.MouseEvent, id: string, name: string) => {
    event.stopPropagation();
    navigator.clipboard.writeText(name);
    setCopyFeedbackId(id);
    setTimeout(() => setCopyFeedbackId(null), 1000);
  }, []);

  const handleOpenRenameDialog = useCallback((event: React.MouseEvent, doc: DocumentData) => {
    event.stopPropagation();
    setRenameDocumentId(doc.id);
    setRenameDraft(doc.name);
    setRenameError('');
  }, []);

  const handleCloseRenameDialog = useCallback(() => {
    if (isRenamingDocument) {
      return;
    }

    setRenameDocumentId(null);
    setRenameDraft('');
    setRenameError('');
  }, [isRenamingDocument]);

  const handleSubmitRenameDocument = useCallback(async () => {
    const nextName = renameDraft.trim();
    if (!renameDocumentId) {
      return;
    }

    if (!nextName) {
      setRenameError('Document name is required.');
      return;
    }

    setIsRenamingDocument(true);

    try {
      await onRenameDocument(renameDocumentId, nextName);
      setRenameDocumentId(null);
      setRenameDraft('');
      setRenameError('');
    } catch (error: any) {
      setRenameError(error.message || 'Failed to rename document.');
    } finally {
      setIsRenamingDocument(false);
    }
  }, [onRenameDocument, renameDocumentId, renameDraft]);

  const reportActionError = useCallback((error: unknown, fallbackMessage: string) => {
    const message = error instanceof Error ? error.message : fallbackMessage;
    alert(message || fallbackMessage);
  }, []);

  const handleToggleRead = useCallback(async (docId: string, isRead: boolean) => {
    setPendingReadDocumentIds((currentIds) => [...currentIds, docId]);

    try {
      await onToggleDocumentRead(docId, isRead);
    } catch (error) {
      reportActionError(error, 'Failed to update document status.');
    } finally {
      setPendingReadDocumentIds((currentIds) => currentIds.filter((currentId) => currentId !== docId));
    }
  }, [onToggleDocumentRead, reportActionError]);

  const handleToggleDocumentSelection = useCallback((docId: string, isSelected: boolean) => {
    setSelectedDocumentIds((currentIds) => {
      if (isSelected) {
        return currentIds.includes(docId) ? currentIds : [...currentIds, docId];
      }

      return currentIds.filter((currentId) => currentId !== docId);
    });
  }, []);

  const handleToggleSelectAllVisibleDocuments = useCallback((isSelected: boolean) => {
    setSelectedDocumentIds((currentIds) => {
      const nextIds = new Set(currentIds);

      paginatedVisibleDocumentIds.forEach((docId) => {
        if (isSelected) {
          nextIds.add(docId);
        } else {
          nextIds.delete(docId);
        }
      });

      return Array.from(nextIds);
    });
  }, [paginatedVisibleDocumentIds]);

  const handleClearSelectedDocuments = useCallback(() => {
    setSelectedDocumentIds([]);
  }, []);

  const handleOpenBulkDeleteDialog = useCallback(() => {
    if (selectedDocuments.length === 0 || !onDeleteDocuments) {
      return;
    }

    setBulkDeleteError('');
    setIsBulkDeleteDialogOpen(true);
  }, [onDeleteDocuments, selectedDocuments.length]);

  const handleCloseBulkDeleteDialog = useCallback(() => {
    if (isDeletingSelectedDocuments) {
      return;
    }

    setIsBulkDeleteDialogOpen(false);
    setBulkDeleteError('');
  }, [isDeletingSelectedDocuments]);

  const handleSubmitBulkDeleteDocuments = useCallback(async () => {
    if (!onDeleteDocuments || selectedDocumentIds.length === 0) {
      return;
    }

    setIsDeletingSelectedDocuments(true);

    try {
      await onDeleteDocuments(selectedDocumentIds);
      setSelectedDocumentIds([]);
      setIsBulkDeleteDialogOpen(false);
      setBulkDeleteError('');
    } catch (error: any) {
      setBulkDeleteError(error.message || 'Failed to delete selected documents.');
    } finally {
      setIsDeletingSelectedDocuments(false);
    }
  }, [onDeleteDocuments, selectedDocumentIds]);

  const handleOpenLabelsDialog = useCallback((event: React.MouseEvent, doc: DocumentData) => {
    event.stopPropagation();
    setLabelDocumentId(doc.id);
    setLabelDraft(doc.labels ?? []);
    setLabelError('');
  }, []);

  const handleCloseLabelsDialog = useCallback(() => {
    if (isSavingLabels) {
      return;
    }

    setLabelDocumentId(null);
    setLabelDraft([]);
    setLabelError('');
  }, [isSavingLabels]);

  const handleToggleDraftLabel = useCallback((labelName: string) => {
    setLabelDraft((currentLabels) => (
      currentLabels.includes(labelName)
        ? currentLabels.filter((label) => label !== labelName)
        : [...currentLabels, labelName]
    ));
  }, []);

  const handleSubmitDocumentLabels = useCallback(async () => {
    if (!labelDocumentItem || !onUpdateDocumentLabels) {
      return;
    }

    setIsSavingLabels(true);

    try {
      await onUpdateDocumentLabels(labelDocumentItem.id, labelDraft);
      setLabelDocumentId(null);
      setLabelDraft([]);
      setLabelError('');
    } catch (error: any) {
      setLabelError(error.message || 'Failed to update labels.');
    } finally {
      setIsSavingLabels(false);
    }
  }, [labelDocumentItem, labelDraft, onUpdateDocumentLabels]);

  const handleOpenLabelingSettings = useCallback(() => {
    if (!onOpenSettings) {
      return;
    }

    setLabelDocumentId(null);
    setLabelDraft([]);
    setLabelError('');
    onOpenSettings('labeling');
  }, [onOpenSettings]);

  const handleOpenMoveDialog = useCallback((event: React.MouseEvent, item: FileSystemItem) => {
    event.stopPropagation();
    setMoveItemId(item.id);
    setMoveTargetFolderId(item.parentId);
    setMoveError('');
  }, []);

  const handleCloseMoveDialog = useCallback(() => {
    if (isMovingItem) {
      return;
    }

    setMoveItemId(null);
    setMoveTargetFolderId(null);
    setMoveError('');
  }, [isMovingItem]);

  const handleSubmitMoveItem = useCallback(async () => {
    if (!moveItem) {
      return;
    }

    setIsMovingItem(true);

    try {
      await onMoveItem(moveItem.id, moveTargetFolderId);
      setMoveItemId(null);
      setMoveTargetFolderId(null);
      setMoveError('');
    } catch (error: any) {
      setMoveError(error.message || 'Failed to move item.');
    } finally {
      setIsMovingItem(false);
    }
  }, [moveItem, moveTargetFolderId, onMoveItem]);

  const handleOpenBulkMoveDialog = useCallback(() => {
    if (selectedDocuments.length === 0) {
      return;
    }

    setBulkMoveTargetFolderId(bulkMoveCurrentDestinationId === MULTIPLE_CURRENT_DESTINATION_ID
      ? currentFolderId
      : bulkMoveCurrentDestinationId);
    setBulkMoveError('');
    setIsBulkMoveDialogOpen(true);
  }, [bulkMoveCurrentDestinationId, currentFolderId, selectedDocuments.length]);

  const handleCloseBulkMoveDialog = useCallback(() => {
    if (isBulkMovingDocuments) {
      return;
    }

    setIsBulkMoveDialogOpen(false);
    setBulkMoveError('');
  }, [isBulkMovingDocuments]);

  const handleSubmitBulkMoveDocuments = useCallback(async () => {
    if (selectedDocumentIds.length === 0) {
      return;
    }

    setIsBulkMovingDocuments(true);

    try {
      const moveResults = await Promise.allSettled(
        selectedDocumentIds.map((docId) => onMoveItem(docId, bulkMoveTargetFolderId))
      );
      const failedMoves = moveResults.filter((result) => result.status === 'rejected');

      if (failedMoves.length > 0) {
        const firstError = failedMoves[0].status === 'rejected' ? failedMoves[0].reason : null;
        throw new Error(
          failedMoves.length === 1
            ? (firstError instanceof Error ? firstError.message : 'Failed to move a selected document.')
            : `${failedMoves.length} of ${selectedDocumentIds.length} selected documents could not be moved.`
        );
      }

      setSelectedDocumentIds([]);
      setIsBulkMoveDialogOpen(false);
      setBulkMoveError('');
    } catch (error: any) {
      setBulkMoveError(error.message || 'Failed to move selected documents.');
    } finally {
      setIsBulkMovingDocuments(false);
    }
  }, [bulkMoveTargetFolderId, onMoveItem, selectedDocumentIds]);

  const handleOpenReprocessDialog = useCallback((event: React.MouseEvent, doc: DocumentData) => {
    event.stopPropagation();
    setReprocessDocumentId(doc.id);
    setReprocessModelId(getPreferredDefaultModelId(models) || doc.modelUsed || DEFAULT_MODEL_ID);
    setReprocessPagesPerBatch(Number.isInteger(doc.pagesPerBatch) && (doc.pagesPerBatch ?? 0) > 0 ? doc.pagesPerBatch ?? 1 : 1);
    setReprocessSplitColumns(doc.splitColumns === true);
    setReprocessError('');
  }, [models]);

  const handleCloseReprocessDialog = useCallback(() => {
    if (isReprocessingDocument) {
      return;
    }

    setReprocessDocumentId(null);
    setReprocessError('');
  }, [isReprocessingDocument]);

  const handleSubmitReprocessDocument = useCallback(async () => {
    if (!reprocessDocumentItem || !reprocessModelId) {
      return;
    }

    setIsReprocessingDocument(true);

    try {
      await onReprocessDocument(reprocessDocumentItem.id, reprocessModelId, reprocessPagesPerBatch, reprocessSplitColumns);
      setReprocessDocumentId(null);
      setReprocessError('');
    } catch (error: any) {
      setReprocessError(error.message || 'Failed to reprocess document.');
    } finally {
      setIsReprocessingDocument(false);
    }
  }, [onReprocessDocument, reprocessDocumentItem, reprocessModelId, reprocessPagesPerBatch, reprocessSplitColumns]);

  const handleOpenBulkReprocessDialog = useCallback(() => {
    if (selectedDocuments.length === 0) {
      return;
    }

    const firstDocument = selectedDocuments[0];
    const selectedBatchSizes = Array.from(new Set(
      selectedDocuments.map((doc) => (
        Number.isInteger(doc.pagesPerBatch) && (doc.pagesPerBatch ?? 0) > 0 ? doc.pagesPerBatch ?? 1 : 1
      ))
    ));

    setBulkReprocessModelId(getPreferredDefaultModelId(models) || firstDocument?.modelUsed || DEFAULT_MODEL_ID);
    setBulkReprocessPagesPerBatch(selectedBatchSizes.length === 1 ? selectedBatchSizes[0] : 1);
    setBulkReprocessSplitColumns(selectedDocuments.every((doc) => doc.splitColumns === true));
    setBulkReprocessError('');
    setIsBulkReprocessDialogOpen(true);
  }, [models, selectedDocuments]);

  const handleCloseBulkReprocessDialog = useCallback(() => {
    if (isBulkReprocessingDocuments) {
      return;
    }

    setIsBulkReprocessDialogOpen(false);
    setBulkReprocessError('');
  }, [isBulkReprocessingDocuments]);

  const handleSubmitBulkReprocessDocuments = useCallback(async () => {
    if (selectedDocuments.length === 0 || !bulkReprocessModelId) {
      return;
    }

    setIsBulkReprocessingDocuments(true);

    try {
      const reprocessResults = await Promise.allSettled(
        selectedDocuments.map((doc) => onReprocessDocument(doc.id, bulkReprocessModelId, bulkReprocessPagesPerBatch, bulkReprocessSplitColumns))
      );
      const failedReprocesses = reprocessResults.filter((result) => result.status === 'rejected');

      if (failedReprocesses.length > 0) {
        const firstError = failedReprocesses[0].status === 'rejected' ? failedReprocesses[0].reason : null;
        throw new Error(
          failedReprocesses.length === 1
            ? (firstError instanceof Error ? firstError.message : 'Failed to reprocess a selected document.')
            : `${failedReprocesses.length} of ${selectedDocuments.length} selected documents could not be reprocessed.`
        );
      }

      setSelectedDocumentIds([]);
      setIsBulkReprocessDialogOpen(false);
      setBulkReprocessError('');
    } catch (error: any) {
      setBulkReprocessError(error.message || 'Failed to reprocess selected documents.');
    } finally {
      setIsBulkReprocessingDocuments(false);
    }
  }, [bulkReprocessModelId, bulkReprocessPagesPerBatch, bulkReprocessSplitColumns, onReprocessDocument, selectedDocuments]);

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

  const scrollDashboardToTop = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }

    if (typeof container.scrollTo === 'function') {
      container.scrollTo({ top: 0, behavior });
    } else {
      container.scrollTop = 0;
    }
  }, []);

  const handlePageChange = useCallback((nextPage: number) => {
    setCurrentPage(nextPage);
    scrollDashboardToTop();
  }, [scrollDashboardToTop]);

  const handleDragStart = useCallback((event: React.DragEvent, id: string) => {
    event.dataTransfer.setData('text/plain', id);
  }, []);

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
  }, []);

  const handleDropOnFolder = useCallback((event: React.DragEvent, targetFolderId: string) => {
    event.preventDefault();
    const id = event.dataTransfer.getData('text/plain');
    if (id && id !== targetFolderId) {
      void onMoveItem(id, targetFolderId).catch((error) => {
        reportActionError(error, 'Failed to move item.');
      });
    }
  }, [onMoveItem, reportActionError]);

  const handleDropOnBreadcrumb = (event: React.DragEvent, targetFolderId: string | null) => {
    event.preventDefault();
    const id = event.dataTransfer.getData('text/plain');
    if (id && id !== targetFolderId) {
      void onMoveItem(id, targetFolderId).catch((error) => {
        reportActionError(error, 'Failed to move item.');
      });
    }
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [
    currentFolderId,
    normalizedSearchQuery,
    isFullTextSearchEnabled,
    selectedLabelFilter,
    selectedStatusFilter,
    selectedFolderFilter,
    dateFromFilter,
    dateToFilter,
    sortKey,
    sortDirection,
    documentsPerPage,
  ]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  useEffect(() => {
    const visibleDocumentIdSet = new Set(filteredVisibleDocumentIds);
    setSelectedDocumentIds((currentIds) => {
      const nextIds = currentIds.filter((docId) => visibleDocumentIdSet.has(docId));
      return nextIds.length === currentIds.length ? currentIds : nextIds;
    });
  }, [
    filteredVisibleDocumentIds,
  ]);

  useEffect(() => {
    setLabelDraft((currentLabels) => currentLabels.filter((label) => availableLabels.includes(label)));
  }, [availableLabels]);

  useEffect(() => {
    if (!selectAllVisibleCheckboxRef.current) {
      return;
    }

    selectAllVisibleCheckboxRef.current.indeterminate = someVisibleDocumentsSelected && !allVisibleDocumentsSelected;
  }, [allVisibleDocumentsSelected, someVisibleDocumentsSelected]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }

    const handleScroll = () => {
      setShowScrollToTop(container.scrollTop > SCROLL_TOP_VISIBILITY_OFFSET);
    };

    handleScroll();
    container.addEventListener('scroll', handleScroll, { passive: true });

    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  const breadcrumbs = getBreadcrumbs();
  const resetFilters = useCallback(() => {
    setSearchQuery('');
    setIsFullTextSearchEnabled(false);
    setSelectedLabelFilter('');
    setSelectedStatusFilter('all');
    setSelectedFolderFilter(FOLDER_FILTER_CURRENT);
    setDateFromFilter('');
    setDateToFilter('');
  }, []);

  return (
    <div
      ref={scrollContainerRef}
      data-testid="dashboard-scroll-container"
      className="relative min-h-0 flex-1 overflow-x-hidden overflow-y-auto"
    >
      <div className="mx-auto max-w-7xl px-4 py-5 pb-24 sm:px-6 sm:py-8 sm:pb-28">
        <div className="mb-6 flex flex-col gap-3">
          <div
            data-testid="dashboard-primary-toolbar"
            className="flex flex-wrap items-center gap-3 lg:flex-nowrap"
          >
            <div className="flex shrink-0 items-center gap-2 text-sm text-slate-600 dark:text-slate-400 sm:text-base">
              <button
                type="button"
                aria-label="Home"
                onClick={() => onNavigateFolder(null)}
                onDragOver={handleDragOver}
                onDrop={(event) => handleDropOnBreadcrumb(event, null)}
                className={`inline-flex h-11 items-center rounded-full px-3 py-2 transition-colors ${
                  currentFolderId === null
                    ? 'bg-slate-200 text-slate-900 dark:bg-slate-700 dark:text-white'
                    : 'hover:text-blue-600 dark:hover:text-blue-400'
                }`}
              >
                <HomeIcon className="h-4 w-4" />
              </button>
            </div>

            <div className="min-w-[15rem] flex-1">
              <div className="relative w-full">
                <input
                  type="search"
                  aria-label="Search documents"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder={isFullTextSearchEnabled ? 'Search document names and content' : 'Search documents by name'}
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
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2">
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
          </div>

          {breadcrumbs.length > 0 && (
            <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm text-slate-600 dark:text-slate-400 sm:text-base">
              {breadcrumbs.map((folder, index) => (
                <React.Fragment key={folder.id}>
                  {index > 0 && (
                    <ChevronRightIcon className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-600" />
                  )}
                  <button
                    type="button"
                    onClick={() => onNavigateFolder(folder.id)}
                    onDragOver={handleDragOver}
                    onDrop={(event) => handleDropOnBreadcrumb(event, folder.id)}
                    title={folder.name}
                    className={`inline-flex h-10 items-center whitespace-nowrap rounded-full px-3 py-2 transition-colors ${
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
          )}

          <div className="grid gap-3 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,0.9fr)] xl:items-start">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex min-h-11 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-2 shadow-sm transition-colors dark:border-slate-700 dark:bg-slate-800">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Full text</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isFullTextSearchEnabled}
                    aria-label="Enable full text search"
                    onClick={() => setIsFullTextSearchEnabled((currentValue) => !currentValue)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      isFullTextSearchEnabled ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'
                    }`}
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                        isFullTextSearchEnabled ? 'translate-x-5' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    Search inside OCR text and saved edits
                  </span>
                </label>

                {hasActiveSearchOrFilters && (
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="inline-flex min-h-11 items-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-600 shadow-sm transition-colors hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white"
                  >
                    Reset filters
                  </button>
                )}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <select
                aria-label="Filter by label"
                value={selectedLabelFilter}
                onChange={(event) => setSelectedLabelFilter(event.target.value)}
                className="h-11 rounded-2xl border border-slate-300 bg-white px-4 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                <option value="">All labels</option>
                {availableFilterLabels.map((label) => (
                  <option key={label} value={label}>
                    {label}
                  </option>
                ))}
              </select>

              <select
                aria-label="Filter by status"
                value={selectedStatusFilter}
                onChange={(event) => setSelectedStatusFilter(event.target.value as DashboardStatusFilter)}
                className="h-11 rounded-2xl border border-slate-300 bg-white px-4 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                <option value="all">All statuses</option>
                <option value="uploading">Uploading</option>
                <option value="processing">Processing</option>
                <option value="ready">Ready</option>
                <option value="error">Error</option>
              </select>

              <select
                aria-label="Filter by folder"
                value={selectedFolderFilter}
                onChange={(event) => setSelectedFolderFilter(event.target.value)}
                className="h-11 rounded-2xl border border-slate-300 bg-white px-4 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white sm:col-span-2 xl:col-span-1"
              >
                {folderFilterOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>

              <input
                type="date"
                aria-label="Filter from date"
                value={dateFromFilter}
                onChange={(event) => setDateFromFilter(event.target.value)}
                className="h-11 rounded-2xl border border-slate-300 bg-white px-4 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />

              <input
                type="date"
                aria-label="Filter to date"
                value={dateToFilter}
                onChange={(event) => setDateToFilter(event.target.value)}
                className="h-11 rounded-2xl border border-slate-300 bg-white px-4 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {sortedVisibleItems.length} result{sortedVisibleItems.length === 1 ? '' : 's'}
            </p>

            {isFullTextSearchEnabled && normalizedSearchQuery.length > 0 && (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Full-text search is active.
              </p>
            )}
          </div>
        </div>

        {sortedVisibleItems.length > 0 && (
          <div className="mb-6 flex flex-col gap-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm transition-colors dark:border-slate-700 dark:bg-slate-800 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <label
                htmlFor="documentsPerPage"
                className="text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                Per page
              </label>
              <select
                id="documentsPerPage"
                aria-label="Documents per page"
                value={documentsPerPage}
                onChange={(event) => setDocumentsPerPage(Number(event.target.value))}
                className="h-11 rounded-2xl border border-slate-300 bg-white px-4 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              >
                {DOCUMENTS_PER_PAGE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            <p className="text-sm text-slate-500 dark:text-slate-400">
              Showing {visibleRangeStart}-{visibleRangeEnd} of {totalResults} result{totalResults === 1 ? '' : 's'}
            </p>
          </div>
        )}

        {selectedDocuments.length > 0 && (
          <div
            data-testid="dashboard-selection-toolbar"
            className="mb-6 flex flex-col gap-3 rounded-3xl border border-blue-200 bg-blue-50/80 p-4 shadow-sm transition-colors dark:border-blue-900/50 dark:bg-blue-950/20 lg:flex-row lg:items-center lg:justify-between"
          >
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                {selectedDocumentsLabel}
              </p>
              <p className="text-sm text-blue-700/80 dark:text-blue-200/80">
                Bulk actions apply to all selected documents.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <IconActionButton
                icon={<MoveIcon className="h-4 w-4" />}
                label="Move selected"
                isActive
                onClick={handleOpenBulkMoveDialog}
              />
              <IconActionButton
                icon={<RefreshCwIcon className="h-4 w-4" />}
                label="Reprocess selected"
                isActive
                disabled={!canBulkReprocessSelectedDocuments}
                onClick={handleOpenBulkReprocessDialog}
              />
              <IconActionButton
                icon={<TrashIcon className="h-4 w-4" />}
                label="Delete selected"
                isActive
                variant="danger"
                disabled={!onDeleteDocuments}
                onClick={handleOpenBulkDeleteDialog}
              />
              <IconActionButton
                icon={<CloseIcon className="h-4 w-4" />}
                label="Clear selection"
                isActive
                onClick={handleClearSelectedDocuments}
              />
            </div>
          </div>
        )}

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
            {hasActiveSearchOrFilters ? (
              <>
                <p className="text-slate-500 dark:text-slate-400">
                  No items match the current search or filters.
                </p>
                <button
                  onClick={resetFilters}
                  className="mt-4 text-blue-600 transition-colors hover:underline dark:text-blue-400"
                >
                  Reset filters
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
                  <col className="w-[4rem]" />
                  <col />
                  <col className="w-[6rem] lg:w-[7rem]" />
                  <col className="w-[8.5rem] lg:w-[10rem]" />
                  <col className="w-[11rem] lg:w-[14rem]" />
                  <col className="w-[15rem] lg:w-[24rem]" />
                </colgroup>
                <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/50">
                  <tr>
                    <th className="px-4 py-4 text-center text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
                      <input
                        ref={selectAllVisibleCheckboxRef}
                        type="checkbox"
                        aria-label="Select all visible documents"
                        checked={allVisibleDocumentsSelected}
                        disabled={paginatedVisibleDocumentIds.length === 0}
                        onChange={(event) => handleToggleSelectAllVisibleDocuments(event.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-700"
                      />
                    </th>
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
                    <th className="px-6 py-4 text-center text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
                      Read
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
                  {paginatedVisibleItems.map((item) => (
                    <DesktopRow
                      key={item.id}
                      item={item}
                      isSelected={selectedDocumentIdSet.has(item.id)}
                      isCopyFeedbackVisible={copyFeedbackId === item.id}
                      onCopyTitle={handleCopyTitle}
                      onDeleteItem={onDeleteItem}
                      onDragStart={handleDragStart}
                      onDropOnFolder={handleDropOnFolder}
                      onNavigateFolder={onNavigateFolder}
                      onOpenDocument={onOpenDocument}
                      onStartRenameDocument={handleOpenRenameDialog}
                      onStartMoveItem={handleOpenMoveDialog}
                      onToggleDocumentSelection={handleToggleDocumentSelection}
                      onToggleDocumentRead={handleToggleRead}
                      onStartEditDocumentLabels={handleOpenLabelsDialog}
                      onStartReprocessDocument={handleOpenReprocessDialog}
                      isReadPending={pendingReadDocumentIds.includes(item.id)}
                      handleDragOver={handleDragOver}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid min-w-0 gap-3 md:hidden">
              {paginatedVisibleItems.map((item) => (
                <MobileCard
                  key={item.id}
                  item={item}
                  isSelected={selectedDocumentIdSet.has(item.id)}
                  isCopyFeedbackVisible={copyFeedbackId === item.id}
                  onCopyTitle={handleCopyTitle}
                  onDeleteItem={onDeleteItem}
                  onDragStart={handleDragStart}
                  onDropOnFolder={handleDropOnFolder}
                  onNavigateFolder={onNavigateFolder}
                  onOpenDocument={onOpenDocument}
                  onStartRenameDocument={handleOpenRenameDialog}
                  onStartMoveItem={handleOpenMoveDialog}
                  onToggleDocumentSelection={handleToggleDocumentSelection}
                  onToggleDocumentRead={handleToggleRead}
                  onStartEditDocumentLabels={handleOpenLabelsDialog}
                  onStartReprocessDocument={handleOpenReprocessDialog}
                  isReadPending={pendingReadDocumentIds.includes(item.id)}
                  handleDragOver={handleDragOver}
                />
              ))}
            </div>

            {totalPages > 1 && (
              <div className="mt-6 flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm transition-colors dark:border-slate-700 dark:bg-slate-800 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Page {safeCurrentPage} of {totalPages}
                </p>

                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    aria-label="First page"
                    disabled={safeCurrentPage === 1}
                    onClick={() => handlePageChange(1)}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white"
                  >
                    <ChevronsLeftIcon className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="Previous page"
                    disabled={safeCurrentPage === 1}
                    onClick={() => handlePageChange(safeCurrentPage - 1)}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white"
                  >
                    <ChevronLeftIcon className="h-4 w-4" />
                  </button>

                  {paginationTokens.map((token, index) => (
                    token === 'ellipsis' ? (
                      <span
                        key={`ellipsis-${index}`}
                        className="inline-flex h-10 min-w-10 items-center justify-center px-2 text-sm font-medium text-slate-400 dark:text-slate-500"
                      >
                        ...
                      </span>
                    ) : (
                      <button
                        key={token}
                        type="button"
                        aria-label={`Page ${token}`}
                        data-testid={`pagination-page-${token}`}
                        onClick={() => handlePageChange(token)}
                        className={`inline-flex h-10 min-w-10 items-center justify-center rounded-full border px-3 text-sm font-medium shadow-sm transition-colors ${
                          token === safeCurrentPage
                            ? 'border-blue-500 bg-blue-600 text-white'
                            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white'
                        }`}
                      >
                        {token}
                      </button>
                    )
                  ))}

                  <button
                    type="button"
                    aria-label="Next page"
                    disabled={safeCurrentPage === totalPages}
                    onClick={() => handlePageChange(safeCurrentPage + 1)}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white"
                  >
                    <ChevronRightIcon className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="Last page"
                    disabled={safeCurrentPage === totalPages}
                    onClick={() => handlePageChange(totalPages)}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white"
                  >
                    <ChevronsRightIcon className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        <DocumentNameDialog
          isOpen={renameDocumentId !== null}
          value={renameDraft}
          error={renameError}
          isSaving={isRenamingDocument}
          onChange={setRenameDraft}
          onClose={handleCloseRenameDialog}
          onSubmit={handleSubmitRenameDocument}
        />
        <MoveItemDialog
          isOpen={moveItem !== null}
          itemName={moveItem?.name ?? ''}
          itemType={moveItem?.type ?? 'file'}
          destinations={moveDestinationOptions}
          selectedDestinationId={moveTargetFolderId}
          currentDestinationId={moveItem?.parentId ?? null}
          error={moveError}
          isSaving={isMovingItem}
          onChange={setMoveTargetFolderId}
          onClose={handleCloseMoveDialog}
          onSubmit={handleSubmitMoveItem}
        />
        <MoveItemDialog
          isOpen={isBulkMoveDialogOpen}
          itemName={selectedDocuments.length === 1 ? selectedDocuments[0]?.name ?? '' : `${selectedDocuments.length} selected documents`}
          itemType="file"
          title="Move selected documents"
          submitLabel="Move documents"
          submitSavingLabel="Moving documents"
          destinations={moveDestinationOptions}
          selectedDestinationId={bulkMoveTargetFolderId}
          currentDestinationId={bulkMoveCurrentDestinationId}
          error={bulkMoveError}
          isSaving={isBulkMovingDocuments}
          onChange={setBulkMoveTargetFolderId}
          onClose={handleCloseBulkMoveDialog}
          onSubmit={handleSubmitBulkMoveDocuments}
        />
        <ReprocessDocumentDialog
          isOpen={reprocessDocumentItem !== null}
          documentName={reprocessDocumentItem?.name ?? ''}
          pageCount={reprocessDocumentItem?.pages.length ?? 0}
      models={models}
      selectedModelId={reprocessModelId}
      selectedPagesPerBatch={reprocessPagesPerBatch}
      selectedSplitColumns={reprocessSplitColumns}
      error={reprocessError}
      isSubmitting={isReprocessingDocument}
      onChangeModel={setReprocessModelId}
      onChangePagesPerBatch={setReprocessPagesPerBatch}
      onChangeSplitColumns={setReprocessSplitColumns}
      onClose={handleCloseReprocessDialog}
      onSubmit={handleSubmitReprocessDocument}
    />
        <ReprocessDocumentDialog
          isOpen={isBulkReprocessDialogOpen}
          documentName={selectedDocuments.length === 1 ? selectedDocuments[0]?.name ?? '' : `${selectedDocuments.length} selected documents`}
          pageCount={selectedDocumentsPageCount}
          models={models}
          title="Reprocess selected documents"
          submitLabel="Reprocess documents"
          submitBusyLabel="Reprocessing documents"
          selectedModelId={bulkReprocessModelId}
          selectedPagesPerBatch={bulkReprocessPagesPerBatch}
          selectedSplitColumns={bulkReprocessSplitColumns}
          error={bulkReprocessError}
          isSubmitting={isBulkReprocessingDocuments}
          onChangeModel={setBulkReprocessModelId}
          onChangePagesPerBatch={setBulkReprocessPagesPerBatch}
          onChangeSplitColumns={setBulkReprocessSplitColumns}
          onClose={handleCloseBulkReprocessDialog}
          onSubmit={handleSubmitBulkReprocessDocuments}
        />
        <DocumentLabelsDialog
          isOpen={labelDocumentItem !== null}
          documentName={labelDocumentItem?.name ?? ''}
          availableLabels={availableLabels}
          selectedLabels={labelDraft}
          error={labelError}
          isSaving={isSavingLabels}
          onToggleLabel={handleToggleDraftLabel}
          onClose={handleCloseLabelsDialog}
          onSubmit={handleSubmitDocumentLabels}
          onOpenLabelingSettings={handleOpenLabelingSettings}
        />
        {isBulkDeleteDialogOpen && (
          <div
            data-testid="bulk-delete-dialog"
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          >
            <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-800">
              <div className="mb-4 flex items-center gap-3 text-red-600 dark:text-red-400">
                <div className="rounded-full bg-red-100 p-2 dark:bg-red-900/30">
                  <TrashIcon className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-900 dark:text-white">Delete selected documents</h2>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    Permanently remove {selectedDocuments.length} document{selectedDocuments.length === 1 ? '' : 's'} from the workspace.
                  </p>
                </div>
              </div>

              <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:bg-slate-900/60 dark:text-slate-300">
                This will delete the selected documents and their processed files. This action cannot be undone.
              </p>

              {bulkDeleteError && (
                <p className="mt-3 text-sm text-red-600 dark:text-red-400">{bulkDeleteError}</p>
              )}

              <div className="mt-6 flex flex-wrap justify-end gap-2">
                <IconActionButton
                  icon={<CloseIcon className="h-4 w-4" />}
                  label="Cancel"
                  onClick={handleCloseBulkDeleteDialog}
                />
                <IconActionButton
                  icon={<TrashIcon className="h-4 w-4" />}
                  label={isDeletingSelectedDocuments ? 'Deleting documents' : 'Delete documents'}
                  isActive
                  variant="danger"
                  disabled={isDeletingSelectedDocuments}
                  onClick={handleSubmitBulkDeleteDocuments}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {showScrollToTop && (
        <button
          type="button"
          aria-label="Scroll to top"
          title="Scroll to top"
          onClick={() => scrollDashboardToTop()}
          className="fixed bottom-4 right-4 z-30 inline-flex h-12 w-12 items-center justify-center rounded-full border border-blue-500 bg-blue-600 text-white shadow-xl transition-colors hover:bg-blue-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 md:bottom-8 md:right-8"
        >
          <ArrowUpIcon className="h-5 w-5" />
        </button>
      )}
    </div>
  );
};

interface SharedItemProps {
  item: FileSystemItem;
  isSelected: boolean;
  isCopyFeedbackVisible: boolean;
  isReadPending: boolean;
  onCopyTitle: (event: React.MouseEvent, id: string, name: string) => void;
  onDeleteItem: (itemId: string) => void;
  onDragStart: (event: React.DragEvent, id: string) => void;
  onDropOnFolder: (event: React.DragEvent, targetFolderId: string) => void;
  onNavigateFolder: (folderId: string | null) => void;
  onOpenDocument: (docId: string) => void;
  onStartRenameDocument: (event: React.MouseEvent, doc: DocumentData) => void;
  onStartMoveItem: (event: React.MouseEvent, item: FileSystemItem) => void;
  onToggleDocumentSelection: (docId: string, isSelected: boolean) => void;
  onToggleDocumentRead: (docId: string, isRead: boolean) => void;
  onStartEditDocumentLabels?: (event: React.MouseEvent, doc: DocumentData) => void;
  onStartReprocessDocument: (event: React.MouseEvent, doc: DocumentData) => void;
  handleDragOver: (event: React.DragEvent) => void;
}

const DocumentSelectionCheckbox = ({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) => (
  <label
    className="inline-flex items-center justify-center"
    onClick={(event) => event.stopPropagation()}
  >
    <input
      type="checkbox"
      aria-label={label}
      checked={checked}
      onChange={(event) => onChange(event.target.checked)}
      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-700"
    />
  </label>
);

const DocumentReadCheckbox = ({
  doc,
  isPending,
  onToggle,
}: {
  doc: DocumentData;
  isPending: boolean;
  onToggle: (docId: string, isRead: boolean) => void;
}) => (
  <label
    className="inline-flex items-center justify-center gap-2 text-sm text-slate-600 dark:text-slate-300"
    onClick={(event) => event.stopPropagation()}
  >
    <input
      type="checkbox"
      aria-label={`Mark ${doc.name} as read`}
      checked={doc.isRead === true}
      disabled={isPending}
      onChange={(event) => onToggle(doc.id, event.target.checked)}
      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-700"
    />
    <span>{doc.isRead === true ? 'Read' : 'Unread'}</span>
  </label>
);

const DocumentLabelChip = ({ label }: { label: string }) => (
  <span
    title={label}
    className="inline-flex max-w-[9rem] shrink-0 items-center rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-200"
  >
    <span className="truncate">{label}</span>
  </span>
);

const DocumentLabelsStrip = ({
  doc,
  onStartEditDocumentLabels,
}: {
  doc: DocumentData;
  onStartEditDocumentLabels?: (event: React.MouseEvent, doc: DocumentData) => void;
}) => {
  const labels = doc.labels ?? [];

  return (
    <div className="mt-2 flex min-w-0 items-center gap-2">
      <div
        data-testid={`document-labels-scroll-${doc.id}`}
        className="min-w-0 flex-1 overflow-x-auto"
      >
        {labels.length > 0 && (
          <div className="flex min-w-max items-center gap-2 pb-1">
            {labels.map((label) => (
              <DocumentLabelChip key={`${doc.id}-${label}`} label={label} />
            ))}
          </div>
        )}
      </div>
      <button
        type="button"
        aria-label={`Manage labels for ${doc.name}`}
        title="Manage labels"
        disabled={!onStartEditDocumentLabels}
        onClick={(event) => onStartEditDocumentLabels?.(event, doc)}
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-blue-700 dark:hover:bg-blue-900/30 dark:hover:text-blue-300"
      >
        <PlusIcon className="h-4 w-4" />
      </button>
    </div>
  );
};

const DesktopRow: React.FC<SharedItemProps> = memo(({
  item,
  isSelected,
  isCopyFeedbackVisible,
  isReadPending,
  onCopyTitle,
  onDeleteItem,
  onDragStart,
  onDropOnFolder,
  onNavigateFolder,
  onOpenDocument,
  onStartRenameDocument,
  onStartMoveItem,
  onToggleDocumentSelection,
  onToggleDocumentRead,
  onStartEditDocumentLabels,
  onStartReprocessDocument,
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
        <td className="px-4 py-4 text-center text-sm text-slate-400 dark:text-slate-500">-</td>
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
        <td className="px-6 py-4 text-center text-sm text-slate-400 dark:text-slate-500">-</td>
        <td className="px-6 py-4 text-sm text-slate-500 dark:text-slate-400">
          {new Date(folder.createdAt).toLocaleDateString()}
        </td>
        <td className="px-6 py-4 text-sm text-slate-500 dark:text-slate-400">-</td>
        <td className="px-6 py-4 text-right">
          <div className="flex flex-wrap items-center justify-end gap-2">
            <IconActionButton
              icon={<MoveIcon className="h-4 w-4" />}
              label="Move"
              size="sm"
              onClick={(event) => onStartMoveItem(event, folder)}
            />
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
        </td>
      </tr>
    );
  }

  const doc = item as DocumentData;
  const totalPages = Math.max(doc.totalPages, doc.pages.length);
  const activeProcessingPages = Array.isArray(doc.pages)
    ? doc.pages.filter((page) => page?.status === 'processing').length
    : 0;
  const completedPages = Math.min(
    Math.max(doc.processedPages ?? 0, 0) + Math.max(doc.failedPages ?? 0, 0),
    totalPages
  );
  const displayedProgress = doc.status === 'uploading'
    ? Math.min(Math.max(doc.sourceRenderCompletedPages ?? 0, 0), totalPages)
    : Math.min(completedPages + activeProcessingPages, totalPages);

  return (
    <tr
      draggable
      onDragStart={(event) => onDragStart(event, doc.id)}
      className={`group transition-colors ${isSelected ? 'bg-blue-50/70 dark:bg-blue-900/10' : 'hover:bg-slate-50 dark:hover:bg-slate-700/50'}`}
    >
      <td className="px-4 py-4 text-center">
        <DocumentSelectionCheckbox
          label={`Select ${doc.name}`}
          checked={isSelected}
          onChange={(checked) => onToggleDocumentSelection(doc.id, checked)}
        />
      </td>
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
                {isCopyFeedbackVisible && (
                  <span className="pointer-events-none absolute left-1/2 top-full z-50 mt-1 -translate-x-1/2 whitespace-nowrap rounded bg-slate-800 px-2 py-1 text-[10px] font-medium text-white shadow-lg dark:bg-slate-200 dark:text-slate-900">
                    Title copied
                  </span>
                )}
              </div>
            </div>
            <DocumentLabelsStrip
              doc={doc}
              onStartEditDocumentLabels={onStartEditDocumentLabels}
            />
          </div>
        </div>
      </td>
      <td className="px-6 py-4 text-center">
        <DocumentReadCheckbox
          doc={doc}
          isPending={isReadPending}
          onToggle={onToggleDocumentRead}
        />
      </td>
      <td className="px-6 py-4 text-sm text-slate-500 dark:text-slate-400">
        {new Date(doc.uploadDate).toLocaleDateString()}
      </td>
      <td className="px-6 py-4">
        <StatusWithProgress
          status={doc.status}
          processed={displayedProgress}
          total={totalPages}
          failedPages={doc.failedPages}
        />
      </td>
      <td className="px-6 py-4">
        <div className="flex items-center justify-end gap-2">
          {canOpenDocument(doc) && (
            <IconActionButton
              icon={<FileIcon className="h-4 w-4" />}
              label="Open"
              variant="primary"
              size="sm"
              onClick={() => onOpenDocument(doc.id)}
            />
          )}
          <IconActionButton
            icon={<MoveIcon className="h-4 w-4" />}
            label="Move"
            size="sm"
            onClick={(event) => onStartMoveItem(event, doc)}
          />
          <IconActionButton
            icon={<RefreshCwIcon className="h-4 w-4" />}
            label="Reprocess"
            size="sm"
            disabled={!canReprocessDocument(doc)}
            onClick={(event) => onStartReprocessDocument(event, doc)}
          />
          <IconActionButton
            icon={<EditIcon className="h-4 w-4" />}
            label="Rename"
            size="sm"
            onClick={(event) => onStartRenameDocument(event, doc)}
          />
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
}, (previousProps, nextProps) => (
  previousProps.item === nextProps.item
  && previousProps.isSelected === nextProps.isSelected
  && previousProps.isCopyFeedbackVisible === nextProps.isCopyFeedbackVisible
  && previousProps.isReadPending === nextProps.isReadPending
));

const MobileCard: React.FC<SharedItemProps> = memo(({
  item,
  isSelected,
  isCopyFeedbackVisible,
  isReadPending,
  onCopyTitle,
  onDeleteItem,
  onDragStart,
  onDropOnFolder,
  onNavigateFolder,
  onOpenDocument,
  onStartRenameDocument,
  onStartMoveItem,
  onToggleDocumentSelection,
  onToggleDocumentRead,
  onStartEditDocumentLabels,
  onStartReprocessDocument,
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
        data-testid={`mobile-card-${folder.id}`}
        className="w-full min-w-0 overflow-hidden rounded-3xl border border-slate-200 bg-white p-4 shadow-sm transition-colors dark:border-slate-700 dark:bg-slate-800"
      >
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-3">
              <div className="rounded-2xl bg-blue-50 p-3 text-blue-500 dark:bg-blue-900/30 dark:text-blue-400">
                <FolderIcon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p title={folder.name} className="break-all font-semibold text-slate-900 dark:text-white">
                  {folder.name}
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Created {new Date(folder.createdAt).toLocaleDateString()}
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 sm:justify-end">
            <IconActionButton
              icon={<MoveIcon className="h-4 w-4" />}
              label="Move"
              size="sm"
              onClick={(event) => onStartMoveItem(event, folder)}
            />
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
      </div>
    );
  }

  const doc = item as DocumentData;
  const totalPages = Math.max(doc.totalPages, doc.pages.length);
  const activeProcessingPages = Array.isArray(doc.pages)
    ? doc.pages.filter((page) => page?.status === 'processing').length
    : 0;
  const completedPages = Math.min(
    Math.max(doc.processedPages ?? 0, 0) + Math.max(doc.failedPages ?? 0, 0),
    totalPages
  );
  const displayedProgress = doc.status === 'uploading'
    ? Math.min(Math.max(doc.sourceRenderCompletedPages ?? 0, 0), totalPages)
    : Math.min(completedPages + activeProcessingPages, totalPages);

  return (
    <div
      draggable
      onDragStart={(event) => onDragStart(event, doc.id)}
      data-testid={`mobile-card-${doc.id}`}
      className={`w-full min-w-0 overflow-hidden rounded-3xl border bg-white p-4 shadow-sm transition-colors dark:bg-slate-800 ${isSelected ? 'border-blue-300 ring-1 ring-blue-200 dark:border-blue-700 dark:ring-blue-900/60' : 'border-slate-200 dark:border-slate-700'}`}
    >
      <div className="min-w-0">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-start gap-3">
            <DocumentSelectionCheckbox
              label={`Select ${doc.name}`}
              checked={isSelected}
              onChange={(checked) => onToggleDocumentSelection(doc.id, checked)}
            />
            <div className="rounded-2xl bg-slate-100 p-3 text-slate-500 dark:bg-slate-700 dark:text-slate-400">
              <FileIcon className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-1.5">
                <p title={doc.name} className="min-w-0 flex-1 break-all font-semibold text-slate-900 dark:text-white">
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
                  {isCopyFeedbackVisible && (
                    <span className="pointer-events-none absolute left-1/2 top-full z-50 mt-1 -translate-x-1/2 whitespace-nowrap rounded bg-slate-800 px-2 py-1 text-[10px] font-medium text-white shadow-lg dark:bg-slate-200 dark:text-slate-900">
                      Title copied
                    </span>
                  )}
                </div>
              </div>
              <DocumentLabelsStrip
                doc={doc}
                onStartEditDocumentLabels={onStartEditDocumentLabels}
              />
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Uploaded {new Date(doc.uploadDate).toLocaleDateString()}
              </p>
            </div>
          </div>

          <div className="mt-4">
            <StatusWithProgress
              status={doc.status}
              processed={displayedProgress}
              total={totalPages}
              failedPages={doc.failedPages}
            />
          </div>

          <div className="mt-4">
            <DocumentReadCheckbox
              doc={doc}
              isPending={isReadPending}
              onToggle={onToggleDocumentRead}
            />
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {canOpenDocument(doc) && (
          <IconActionButton
            icon={<FileIcon className="h-4 w-4" />}
            label="Open"
            isActive
            variant="primary"
            onClick={() => onOpenDocument(doc.id)}
          />
        )}
        <IconActionButton
          icon={<MoveIcon className="h-4 w-4" />}
          label="Move"
          onClick={(event) => onStartMoveItem(event, doc)}
        />
        <IconActionButton
          icon={<RefreshCwIcon className="h-4 w-4" />}
          label="Reprocess"
          disabled={!canReprocessDocument(doc)}
          onClick={(event) => onStartReprocessDocument(event, doc)}
        />
        <IconActionButton
          icon={<EditIcon className="h-4 w-4" />}
          label="Rename"
          onClick={(event) => onStartRenameDocument(event, doc)}
        />
        <IconActionButton
          icon={<TrashIcon className="h-4 w-4" />}
          label="Delete"
          variant="danger"
          onClick={() => onDeleteItem(doc.id)}
        />
      </div>
    </div>
  );
}, (previousProps, nextProps) => (
  previousProps.item === nextProps.item
  && previousProps.isSelected === nextProps.isSelected
  && previousProps.isCopyFeedbackVisible === nextProps.isCopyFeedbackVisible
  && previousProps.isReadPending === nextProps.isReadPending
));

const StatusWithProgress = memo(({
  status,
  processed,
  total,
  failedPages,
}: {
  status: DocumentData['status'];
  processed: number;
  total: number;
  failedPages: number;
}) => {
  const failedBadge = failedPages > 0 ? (
    <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-800 dark:bg-red-900/30 dark:text-red-300">
      <AlertCircleIcon className="mr-1 h-3 w-3" /> {getFailedPagesLabel(failedPages)}
    </span>
  ) : null;

  if (status === 'ready') {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-800 dark:bg-green-900/30 dark:text-green-300">
          <CheckCircleIcon className="mr-1 h-3 w-3" /> Ready
        </span>
        {failedBadge}
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-800 dark:bg-red-900/30 dark:text-red-300">
          <AlertCircleIcon className="mr-1 h-3 w-3" /> Error
        </span>
        {failedBadge}
      </div>
    );
  }

  const percentage = total > 0 ? Math.round((processed / total) * 100) : 0;
  const progressLabel = status === 'uploading' ? 'Uploading' : 'Processing';
  const progressBarClassName = status === 'uploading'
    ? 'h-2 rounded-full bg-amber-500 transition-all duration-300 dark:bg-amber-400'
    : 'h-2 rounded-full bg-blue-600 transition-all duration-300 dark:bg-blue-500';

  return (
    <div className="w-full max-w-[220px]">
      <div className="mb-1 flex justify-between text-xs text-slate-600 dark:text-slate-400">
        <span>{progressLabel}</span>
        <span>{processed}/{total}</span>
      </div>
      <div className="h-2 w-full rounded-full bg-slate-200 dark:bg-slate-700">
        <div
          className={progressBarClassName}
          style={{ width: `${percentage}%` }}
        />
      </div>
      {failedBadge && <div className="mt-2">{failedBadge}</div>}
    </div>
  );
});

export default Dashboard;
