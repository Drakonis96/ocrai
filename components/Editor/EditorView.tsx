import React, { useEffect, useRef, useState } from 'react';
import { DocumentData, BlockLabel, ProcessingOptions, PromptPreset, SettingsTab, TextBlock } from '../../types';
import ImageViewer from './ImageViewer';
import TextEditor from './TextEditor';
import { reconstructCleanText, downloadPDF, generateEPUB, generateHTML, generateMarkdown, generatePlainText } from '../../utils/reconstruction';
import {
  AlertCircleIcon,
  ArrowLeftIcon,
  CheckCircleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  CloseIcon,
  CopyIcon,
  DownloadIcon,
  EditIcon,
  ImageIcon,
  LoaderIcon,
  RefreshCwIcon,
} from '../Icons';
import { reprocessPage, type ReprocessPageRequestError } from '../../services/geminiService';
import ProcessingOptionsSelector from '../ProcessingOptionsSelector';
import IconActionButton from '../IconActionButton';
import DocumentNameDialog from '../DocumentNameDialog';
import { DEFAULT_MODEL_ID, GeminiModel, OcrProvider, getPreferredDefaultModelId } from '../../utils/modelStorage';
import { getIssuePageIndexes, getPageIssueType } from '../../utils/pageReview';
import { downloadBlob } from '../../utils/download';

interface EditorViewProps {
  doc: DocumentData;
  onBack: () => void;
  onPersistDocument: (doc: DocumentData) => Promise<DocumentData>;
  onRefreshDocument: (docId: string) => Promise<DocumentData | null>;
  models: GeminiModel[];
  activeOcrProvider: OcrProvider;
  prompts: PromptPreset[];
  onOpenSettings: (tab?: SettingsTab) => void;
}

type MobilePanel = 'preview' | 'editor';
type ReprocessScope = 'current' | 'issues';

const MIN_EDITOR_WIDTH = 30;
const MAX_EDITOR_WIDTH = 70;
const DEFAULT_REPROCESS_RETRIES = 0;
const REPROCESS_POLL_INTERVAL_MS = 1_000;
const REPROCESS_POLL_TIMEOUT_MS = 5 * 60 * 1_000;

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, Math.max(0, ms)));

interface ReprocessFailureDetail {
  pageNumber: number;
  message: string;
  responseBody?: string;
  responseStatus?: number;
  responseFormat?: string;
}

interface ReprocessErrorDialogState {
  title: string;
  summary: string;
  details: string;
}

const createReprocessOptions = (
  sourceDoc: DocumentData,
  activeOcrProvider: OcrProvider,
  models: GeminiModel[]
): ProcessingOptions => {
  const requestedModel = sourceDoc.modelUsed || DEFAULT_MODEL_ID;
  const nextModel = models.length > 0 && !models.some((model) => model.id === requestedModel)
    ? getPreferredDefaultModelId(models)
    : requestedModel;

  return {
    model: nextModel,
    ocrProvider: activeOcrProvider,
    processingMode: sourceDoc.processingMode ?? 'ocr',
    targetLanguage: sourceDoc.targetLanguage || 'Español',
    customPrompt: sourceDoc.customPrompt || '',
    removeReferences: sourceDoc.removeReferences !== false,
    splitColumns: sourceDoc.splitColumns === true,
  };
};

const toReprocessFailureDetail = (pageNumber: number, error: ReprocessPageRequestError | Error): ReprocessFailureDetail => ({
  pageNumber,
  message: error.message || 'Unknown error',
  responseBody: typeof (error as ReprocessPageRequestError).responseBody === 'string'
    ? (error as ReprocessPageRequestError).responseBody
    : undefined,
  responseStatus: Number.isInteger((error as ReprocessPageRequestError).responseStatus)
    ? (error as ReprocessPageRequestError).responseStatus
    : undefined,
  responseFormat: typeof (error as ReprocessPageRequestError).responseFormat === 'string'
    ? (error as ReprocessPageRequestError).responseFormat
    : undefined,
});

const createReprocessErrorDialogState = (failures: ReprocessFailureDetail[]): ReprocessErrorDialogState => {
  const title = failures.length === 1
    ? `Failed to reprocess page ${failures[0].pageNumber}`
    : `${failures.length} pages failed to reprocess`;
  const summary = failures.map((failure) => `Page ${failure.pageNumber}: ${failure.message}`).join('\n');
  const details = failures.map((failure) => {
    const lines = [
      `Page ${failure.pageNumber}`,
      `Message: ${failure.message}`,
    ];

    if (failure.responseStatus !== undefined) {
      lines.push(`HTTP status: ${failure.responseStatus}`);
    }

    if (failure.responseFormat) {
      lines.push(`Response format: ${failure.responseFormat}`);
    }

    if (failure.responseBody) {
      lines.push('Raw response:');
      lines.push(failure.responseBody);
    }

    return lines.join('\n');
  }).join('\n\n--------------------\n\n');

  return { title, summary, details };
};
const EditorView: React.FC<EditorViewProps> = ({
  doc,
  onBack,
  onPersistDocument,
  onRefreshDocument,
  models,
  activeOcrProvider,
  prompts,
  onOpenSettings,
}) => {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const exportMenuRef = useRef<HTMLDivElement | null>(null);
  const [workingDoc, setWorkingDoc] = useState(doc);
  const [activePage, setActivePage] = useState(0);
  const [cleanText, setCleanText] = useState('');
  const [isSaved, setIsSaved] = useState(true);
  const [isSavingDocument, setIsSavingDocument] = useState(false);
  const [showCopyFeedback, setShowCopyFeedback] = useState(false);
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [renameDraft, setRenameDraft] = useState(doc.name);
  const [renameError, setRenameError] = useState('');
  const [isRenamingDocument, setIsRenamingDocument] = useState(false);
  const [isReprocessing, setIsReprocessing] = useState(false);
  const [isUpdatingErrorDismissal, setIsUpdatingErrorDismissal] = useState(false);
  const [showReprocessModal, setShowReprocessModal] = useState(false);
  const [reprocessErrorDialog, setReprocessErrorDialog] = useState<ReprocessErrorDialogState | null>(null);
  const [reprocessScope, setReprocessScope] = useState<ReprocessScope>('current');
  const [reprocessRetries, setReprocessRetries] = useState(DEFAULT_REPROCESS_RETRIES);
  const [reprocessProgress, setReprocessProgress] = useState<{
    current: number;
    total: number;
    pageNumber: number;
    attempt: number;
    totalAttempts: number;
  } | null>(null);
  const [showFullDocument, setShowFullDocument] = useState(true);
  const [showEditor, setShowEditor] = useState(true);
  const [editorWidth, setEditorWidth] = useState(50);
  const [isResizing, setIsResizing] = useState(false);
  const [pageTextOverrides, setPageTextOverrides] = useState<Record<number, string>>({});
  const [selectedLabels, setSelectedLabels] = useState<BlockLabel[]>([BlockLabel.TITLE, BlockLabel.MAIN_TEXT]);
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>('preview');
  const [isMobileLayout, setIsMobileLayout] = useState(false);
  const [isCompactHeaderLayout, setIsCompactHeaderLayout] = useState(false);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [reprocessOptions, setReprocessOptions] = useState<ProcessingOptions>(() => (
    createReprocessOptions(doc, activeOcrProvider, models)
  ));

  const getPageText = (
    sourceDoc: DocumentData,
    pageIndex: number,
    labels: BlockLabel[],
    overrides: Record<number, string>
  ) => {
    return overrides[pageIndex] ?? reconstructCleanText([sourceDoc.pages[pageIndex]], labels);
  };

  const buildFullDocumentText = (
    sourceDoc: DocumentData,
    labels: BlockLabel[],
    overrides: Record<number, string>
  ) => {
    const joinedText = sourceDoc.pages
      .map((_, pageIndex) => getPageText(sourceDoc, pageIndex, labels, overrides))
      .filter(Boolean)
      .join('\n\n');

    return joinedText.replace(/\n{3,}/g, '\n\n').trim();
  };

  const getDisplayedText = (
    sourceDoc: DocumentData,
    fullDoc: boolean,
    pageIndex: number,
    labels: BlockLabel[],
    overrides: Record<number, string>,
    preferSavedDocument: boolean = false
  ) => {
    if (fullDoc) {
      if (preferSavedDocument && sourceDoc.savedText && Object.keys(overrides).length === 0) {
        return sourceDoc.savedText;
      }

      return buildFullDocumentText(sourceDoc, labels, overrides);
    }

    return getPageText(sourceDoc, pageIndex, labels, overrides);
  };

  useEffect(() => {
    setWorkingDoc(doc);
    setRenameDraft(doc.name);
  }, [doc]);

  useEffect(() => {
    const initialPageOverrides = doc.pageSavedTexts ?? {};
    setActivePage(0);
    setPageTextOverrides(initialPageOverrides);
    setCleanText(getDisplayedText(doc, showFullDocument, 0, selectedLabels, initialPageOverrides, true));
    setIsSaved(true);
    setShowEditor(true);
    setMobilePanel('preview');
    setReprocessRetries(DEFAULT_REPROCESS_RETRIES);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id]);

  useEffect(() => {
    const nextText = getDisplayedText(workingDoc, showFullDocument, activePage, selectedLabels, pageTextOverrides);
    setCleanText(nextText);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showFullDocument, activePage]);

  useEffect(() => {
    if (models.length === 0) {
      setReprocessOptions((current) => ({ ...current, ocrProvider: activeOcrProvider }));
      return;
    }

    setReprocessOptions((current) => {
      const modelStillAvailable = models.some((model) => model.id === current.model);
      if (modelStillAvailable) {
        return { ...current, ocrProvider: activeOcrProvider };
      }

      return {
        ...current,
        ocrProvider: activeOcrProvider,
        model: getPreferredDefaultModelId(models),
      };
    });
  }, [activeOcrProvider, models]);

  useEffect(() => {
    if (!isResizing || isMobileLayout) {
      return;
    }

    const handleMouseMove = (event: MouseEvent) => {
      if (!contentRef.current) {
        return;
      }

      const bounds = contentRef.current.getBoundingClientRect();
      const nextWidth = ((bounds.right - event.clientX) / bounds.width) * 100;
      const clampedWidth = Math.min(MAX_EDITOR_WIDTH, Math.max(MIN_EDITOR_WIDTH, nextWidth));
      setEditorWidth(clampedWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isMobileLayout, isResizing]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const mobileMediaQuery = window.matchMedia('(max-width: 1023px)');
    const compactHeaderMediaQuery = window.matchMedia('(max-width: 1279px)');
    const syncResponsiveLayout = () => {
      setIsMobileLayout(mobileMediaQuery.matches);
      setIsCompactHeaderLayout(compactHeaderMediaQuery.matches);

      if (mobileMediaQuery.matches) {
        setShowEditor(true);
        setIsResizing(false);
      }
    };

    syncResponsiveLayout();
    mobileMediaQuery.addEventListener('change', syncResponsiveLayout);
    compactHeaderMediaQuery.addEventListener('change', syncResponsiveLayout);

    return () => {
      mobileMediaQuery.removeEventListener('change', syncResponsiveLayout);
      compactHeaderMediaQuery.removeEventListener('change', syncResponsiveLayout);
    };
  }, []);

  useEffect(() => {
    if (!isExportMenuOpen || isCompactHeaderLayout) {
      return;
    }

    const handleDocumentPointerDown = (event: PointerEvent) => {
      if (
        exportMenuRef.current
        && event.target instanceof Node
        && !exportMenuRef.current.contains(event.target)
      ) {
        setIsExportMenuOpen(false);
      }
    };

    document.addEventListener('pointerdown', handleDocumentPointerDown);

    return () => document.removeEventListener('pointerdown', handleDocumentPointerDown);
  }, [isCompactHeaderLayout, isExportMenuOpen]);

  useEffect(() => {
    if (!isExportMenuOpen) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsExportMenuOpen(false);
      }
    };

    document.addEventListener('keydown', handleEscape);

    return () => document.removeEventListener('keydown', handleEscape);
  }, [isExportMenuOpen]);

  const handleTextChange = (newText: string) => {
    setCleanText(newText);
    if (!showFullDocument) {
      setPageTextOverrides((current) => ({ ...current, [activePage]: newText }));
    }
    setIsSaved(false);
  };

  const toggleLabel = (label: BlockLabel) => {
    setSelectedLabels((current) => {
      const nextLabels = current.includes(label)
        ? current.filter((entry) => entry !== label)
        : [...current, label];

      const nextText = getDisplayedText(workingDoc, showFullDocument, activePage, nextLabels, pageTextOverrides);
      setCleanText(nextText);
      setIsSaved(false);

      return nextLabels;
    });
  };

  const handleSave = async () => {
    const nextPageTextOverrides = showFullDocument
      ? pageTextOverrides
      : { ...pageTextOverrides, [activePage]: cleanText };
    const textToSave = showFullDocument
      ? cleanText
      : buildFullDocumentText(workingDoc, selectedLabels, nextPageTextOverrides);

    if (!showFullDocument) {
      setPageTextOverrides(nextPageTextOverrides);
    }

    setIsSavingDocument(true);

    try {
      const savedDoc = await onPersistDocument({
        ...workingDoc,
        savedText: textToSave,
        pageSavedTexts: nextPageTextOverrides,
      });
      setWorkingDoc(savedDoc);
      setPageTextOverrides(savedDoc.pageSavedTexts ?? nextPageTextOverrides);
      setIsSaved(true);
    } catch (error: any) {
      console.error('Save failed', error);
      alert(`Failed to save document: ${error.message || 'Unknown error'}`);
    } finally {
      setIsSavingDocument(false);
    }
  };

  const handleCopyTitle = () => {
    navigator.clipboard.writeText(workingDoc.name);
    setShowCopyFeedback(true);
    setTimeout(() => setShowCopyFeedback(false), 1000);
  };

  const handleOpenRenameDialog = () => {
    setRenameDraft(workingDoc.name);
    setRenameError('');
    setShowRenameDialog(true);
  };

  const handleCloseRenameDialog = () => {
    if (isRenamingDocument) {
      return;
    }

    setShowRenameDialog(false);
    setRenameError('');
    setRenameDraft(workingDoc.name);
  };

  const handleRenameDocument = async () => {
    const nextName = renameDraft.trim();
    if (!nextName) {
      setRenameError('Document name is required.');
      return;
    }

    setIsRenamingDocument(true);

    try {
      const savedDoc = await onPersistDocument({
        ...workingDoc,
        name: nextName,
      });
      setWorkingDoc(savedDoc);
      setRenameDraft(savedDoc.name);
      setRenameError('');
      setShowRenameDialog(false);
    } catch (error: any) {
      console.error('Rename failed', error);
      setRenameError(error.message || 'Failed to rename document.');
    } finally {
      setIsRenamingDocument(false);
    }
  };

  const applyRefreshedDocument = (nextDoc: DocumentData, overrides: Record<number, string> = pageTextOverrides) => {
    setWorkingDoc(nextDoc);
    setCleanText(getDisplayedText(nextDoc, showFullDocument, activePage, selectedLabels, overrides));
  };

  const applyRefreshedDocumentState = (
    nextDoc: DocumentData,
    overrides: Record<number, string> = pageTextOverrides,
    nextActivePage: number = activePage
  ) => {
    setWorkingDoc(nextDoc);
    setActivePage(nextActivePage);
    setCleanText(getDisplayedText(nextDoc, showFullDocument, nextActivePage, selectedLabels, overrides));
  };

  const waitForReprocessedPageCompletion = async (docId: string, pageIndex: number) => {
    const startedAt = Date.now();

    while (Date.now() - startedAt <= REPROCESS_POLL_TIMEOUT_MS) {
      const refreshedDoc = await onRefreshDocument(docId);
      const refreshedPage = refreshedDoc?.pages?.[pageIndex];

      if (refreshedDoc && refreshedPage) {
        if (refreshedPage.status === 'completed') {
          return refreshedDoc;
        }

        if (refreshedPage.status === 'error') {
          throw new Error(refreshedPage.lastError?.trim() || `Failed to reprocess page ${pageIndex + 1}`);
        }
      }

      await sleep(REPROCESS_POLL_INTERVAL_MS);
    }

    throw new Error(`Timed out waiting for page ${pageIndex + 1} to finish reprocessing.`);
  };

  const handleToggleErrorDismissed = async (dismissed: boolean) => {
    const activeDocPage = workingDoc.pages[activePage];
    if (!activeDocPage || activeDocPage.status !== 'error') {
      return;
    }

    const nextPages = workingDoc.pages.map((page, pageIndex) => (
      pageIndex === activePage
        ? { ...page, errorDismissed: dismissed }
        : page
    ));
    const updatedDoc = { ...workingDoc, pages: nextPages };
    const previousDoc = workingDoc;

    setWorkingDoc(updatedDoc);
    setIsUpdatingErrorDismissal(true);

    try {
      const savedDoc = await onPersistDocument(updatedDoc);
      setWorkingDoc(savedDoc);
    } catch (error: any) {
      console.error('Failed to update page error visibility', error);
      setWorkingDoc(previousDoc);
      alert(`Failed to update page status: ${error.message || 'Unknown error'}`);
    } finally {
      setIsUpdatingErrorDismissal(false);
    }
  };

  const handleOpenCurrentPageReprocess = () => {
    setReprocessErrorDialog(null);
    setReprocessOptions(createReprocessOptions(workingDoc, activeOcrProvider, models));
    setReprocessRetries(DEFAULT_REPROCESS_RETRIES);
    setReprocessScope('current');
    setShowReprocessModal(true);
  };

  const handleOpenIssuePagesReprocess = () => {
    if (issuePageIndexes.length === 0) {
      return;
    }

    setReprocessErrorDialog(null);
    setReprocessOptions(createReprocessOptions(workingDoc, activeOcrProvider, models));
    setReprocessRetries(DEFAULT_REPROCESS_RETRIES);
    setReprocessScope('issues');
    setShowReprocessModal(true);
  };

  const handleReprocessPages = async (pageIndexes: number[]) => {
    if (pageIndexes.length === 0) {
      return;
    }

    const docId = workingDoc.id;
    const multiplePages = pageIndexes.length > 1;
    let nextDoc = workingDoc;
    let nextOverrides = pageTextOverrides;
    let successfulPages = 0;
    let failedPages = 0;
    let firstFailedPageIndex: number | null = null;
    const failureDetails: ReprocessFailureDetail[] = [];
    const totalAttempts = reprocessRetries + 1;

    setReprocessErrorDialog(null);
    setIsReprocessing(true);
    setShowReprocessModal(false);

    try {
      for (let index = 0; index < pageIndexes.length; index += 1) {
        const pageIndex = pageIndexes[index];
        let pageCompleted = false;

        for (let attemptIndex = 0; attemptIndex < totalAttempts; attemptIndex += 1) {
          setReprocessProgress({
            current: index + 1,
            total: pageIndexes.length,
            pageNumber: pageIndex + 1,
            attempt: attemptIndex + 1,
            totalAttempts,
          });

          try {
            await reprocessPage(
              docId,
              pageIndex,
              reprocessOptions.model,
              activeOcrProvider,
              reprocessOptions.processingMode,
              reprocessOptions.targetLanguage,
              reprocessOptions.customPrompt,
              reprocessOptions.removeReferences,
              reprocessOptions.splitColumns
            );

            const refreshedDoc = await waitForReprocessedPageCompletion(docId, pageIndex);
            nextDoc = refreshedDoc;
            nextOverrides = { ...nextOverrides };
            delete nextOverrides[pageIndex];
            successfulPages += 1;
            pageCompleted = true;
            setPageTextOverrides(nextOverrides);
            applyRefreshedDocumentState(refreshedDoc, nextOverrides, pageIndex);
            break;
          } catch (error: any) {
            console.error(
              `Reprocess failed for page ${pageIndex + 1} on attempt ${attemptIndex + 1}/${totalAttempts}`,
              error
            );

            if (attemptIndex < totalAttempts - 1) {
              continue;
            }

            failedPages += 1;
            if (firstFailedPageIndex === null) {
              firstFailedPageIndex = pageIndex;
            }
            failureDetails.push(toReprocessFailureDetail(pageIndex + 1, error));
          }
        }

        if (!pageCompleted) {
          continue;
        }
      }

      const refreshedDoc = await onRefreshDocument(docId);
      if (refreshedDoc) {
        applyRefreshedDocumentState(
          refreshedDoc,
          nextOverrides,
          firstFailedPageIndex ?? pageIndexes[pageIndexes.length - 1]
        );
      }

      setPageTextOverrides(nextOverrides);
      if (successfulPages > 0) {
        setIsSaved(false);
      }

      if (failedPages > 0) {
        setReprocessErrorDialog(createReprocessErrorDialogState(failureDetails));
      }
    } catch (error: any) {
      const refreshedDoc = await onRefreshDocument(docId);
      if (refreshedDoc) {
        applyRefreshedDocument(refreshedDoc, nextOverrides);
      }

      console.error('Reprocess failed', error);
      setReprocessErrorDialog(createReprocessErrorDialogState([
        toReprocessFailureDetail(multiplePages ? pageIndexes[0] + 1 : activePage + 1, error),
      ]));
    } finally {
      setReprocessProgress(null);
      setIsReprocessing(false);
    }
  };

  const handleSubmitReprocess = async () => {
    if (reprocessScope === 'issues') {
      await handleReprocessPages(issuePageIndexes);
      return;
    }

    await handleReprocessPages([activePage]);
  };

  const handleDownload = async (format: 'md' | 'txt' | 'html' | 'epub' | 'pdf') => {
    let blob: Blob | null = null;
    let extension = format;

    const fullText = showFullDocument
      ? cleanText
      : (Object.keys(pageTextOverrides).length > 0
          ? buildFullDocumentText(workingDoc, selectedLabels, pageTextOverrides)
          : (workingDoc.savedText || reconstructCleanText(workingDoc.pages, selectedLabels)));

    if (format === 'html') {
      blob = generateHTML(fullText, workingDoc.name);
    } else if (format === 'epub') {
      blob = await generateEPUB(fullText, workingDoc.name);
      extension = 'epub';
    } else if (format === 'txt') {
      blob = generatePlainText(fullText);
    } else if (format === 'pdf') {
      await downloadPDF(
        fullText,
        workingDoc.name,
        `${workingDoc.name.replace(/\.[^/.]+$/, '')}_clean.pdf`
      );
      setIsExportMenuOpen(false);
      return;
    } else {
      blob = generateMarkdown(fullText);
    }

    downloadBlob(blob, `${workingDoc.name.replace(/\.[^/.]+$/, '')}_clean.${extension}`);
    setIsExportMenuOpen(false);
  };

  const availableLabels = [
    BlockLabel.TITLE,
    BlockLabel.MAIN_TEXT,
    BlockLabel.HEADER,
    BlockLabel.FOOTER,
    BlockLabel.FOOTNOTE,
    BlockLabel.CAPTION,
  ];

  const issuePageIndexes = getIssuePageIndexes(workingDoc, pageTextOverrides);
  const currentPageData = workingDoc.pages[activePage];
  const currentPageIssueType = currentPageData ? getPageIssueType(currentPageData, pageTextOverrides[activePage]) : null;
  const currentPageHasError = currentPageIssueType === 'error';
  const currentPageIsBlank = currentPageIssueType === 'blank';
  const currentPageErrorDismissed = currentPageData?.errorDismissed === true;
  const nextIssuePageIndex = issuePageIndexes.length === 0
    ? null
    : (issuePageIndexes.find((pageIndex) => pageIndex > activePage) ?? issuePageIndexes[0]);
  const errorSummaryLabel = issuePageIndexes.length === 1
    ? '1 page still needs review'
    : `${issuePageIndexes.length} pages still need review`;
  const jumpToIssueLabel = nextIssuePageIndex === null
    ? 'No issues pending'
    : (nextIssuePageIndex === activePage
        ? 'Current issue'
        : `Jump to Page ${nextIssuePageIndex + 1}`);
  const showErrorBanner = issuePageIndexes.length > 0;
  const pageInputWidthCh = Math.max(3, String(workingDoc.pages.length).length + 1);
  const batchReprocessLabel = issuePageIndexes.length === 1
    ? 'Reprocess issue'
    : `Reprocess ${issuePageIndexes.length} issues`;
  const headerActionButtonClassName = 'w-full justify-center xl:w-auto';
  const reprocessModalTitle = reprocessScope === 'issues'
    ? (issuePageIndexes.length === 1 ? 'Reprocess 1 issue page' : `Reprocess ${issuePageIndexes.length} issue pages`)
    : `Reprocess Page ${activePage + 1}`;
  const reprocessModalDescription = reprocessScope === 'issues'
    ? 'Pages with OCR errors or blank transcription will be reprocessed one by one with these options.'
    : 'Use a different model or a saved prompt without leaving the editor.';
  const reprocessActionLabel = reprocessScope === 'issues'
    ? (isReprocessing ? 'Processing pages' : (issuePageIndexes.length === 1 ? 'Reprocess issue page' : `Reprocess ${issuePageIndexes.length} pages`))
    : (isReprocessing ? 'Processing' : 'Reprocess page');
  const reprocessOverlayTitle = reprocessProgress?.total && reprocessProgress.total > 1
    ? `Reprocessing pages (${reprocessProgress.current}/${reprocessProgress.total})`
    : `Reprocessing Page ${reprocessProgress?.pageNumber ?? activePage + 1}...`;
  const reprocessOverlayDescription = reprocessProgress?.total && reprocessProgress.total > 1
    ? `Working through issue pages one by one. Current page: ${reprocessProgress.pageNumber}. Attempt ${reprocessProgress.attempt}/${reprocessProgress.totalAttempts}.`
    : `Please wait while we analyze the document with Gemini AI. Attempt ${reprocessProgress?.attempt ?? 1}/${reprocessProgress?.totalAttempts ?? 1}.`;

  const renderExportOptions = (className: string) => (
    <div className={className} onClick={(event) => event.stopPropagation()}>
      <button type="button" onClick={() => handleDownload('md')} className="block w-full px-4 py-3 text-left text-sm text-slate-700 transition-colors hover:bg-slate-50 hover:text-blue-600 dark:text-slate-200 dark:hover:bg-slate-700 dark:hover:text-blue-400">Markdown (.md)</button>
      <button type="button" onClick={() => handleDownload('pdf')} className="block w-full px-4 py-3 text-left text-sm text-slate-700 transition-colors hover:bg-slate-50 hover:text-blue-600 dark:text-slate-200 dark:hover:bg-slate-700 dark:hover:text-blue-400">PDF (.pdf)</button>
      <button type="button" onClick={() => handleDownload('epub')} className="block w-full px-4 py-3 text-left text-sm text-slate-700 transition-colors hover:bg-slate-50 hover:text-blue-600 dark:text-slate-200 dark:hover:bg-slate-700 dark:hover:text-blue-400">EPUB (.epub)</button>
      <button type="button" onClick={() => handleDownload('html')} className="block w-full px-4 py-3 text-left text-sm text-slate-700 transition-colors hover:bg-slate-50 hover:text-blue-600 dark:text-slate-200 dark:hover:bg-slate-700 dark:hover:text-blue-400">HTML (.html)</button>
      <button type="button" onClick={() => handleDownload('txt')} className="block w-full px-4 py-3 text-left text-sm text-slate-700 transition-colors hover:bg-slate-50 hover:text-blue-600 dark:text-slate-200 dark:hover:bg-slate-700 dark:hover:text-blue-400">Plain text (.txt)</button>
    </div>
  );

  const filterControls = (
    <div className="flex flex-wrap items-center gap-3 py-1">
      <div className="flex items-center rounded-full bg-slate-100 p-1 dark:bg-slate-700">
        <button
          onClick={() => setShowFullDocument(true)}
          className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
            showFullDocument
              ? 'bg-blue-600 text-white'
              : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
          }`}
          title="Show full document transcription"
        >
          Full doc
        </button>
        <button
          onClick={() => setShowFullDocument(false)}
          className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
            !showFullDocument
              ? 'bg-blue-600 text-white'
              : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
          }`}
          title="Show only current page transcription"
        >
          Page {activePage + 1}
        </button>
      </div>

      <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Include</span>

      <div className="flex flex-wrap items-center gap-3">
        {availableLabels.map((label) => (
          <label key={label} className="group flex cursor-pointer items-center gap-1.5 select-none">
            <input
              type="checkbox"
              checked={selectedLabels.includes(label)}
              onChange={() => toggleLabel(label)}
              className="h-4 w-4 rounded border-slate-300 bg-white text-blue-600 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-700"
            />
            <span className="whitespace-nowrap text-xs text-slate-600 transition-colors group-hover:text-blue-600 dark:text-slate-400 dark:group-hover:text-blue-400">
              {label.toLowerCase().replace('_', ' ')}
            </span>
          </label>
        ))}
      </div>
    </div>
  );

  const renderPagination = () => (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-3 py-3 transition-colors dark:border-slate-700 dark:bg-slate-800 sm:px-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          disabled={activePage === 0}
          onClick={() => setActivePage(0)}
          className="rounded-full bg-slate-100 p-2 text-slate-700 transition-colors hover:bg-slate-200 disabled:opacity-50 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
          title="First page"
        >
          <ChevronsLeftIcon className="h-4 w-4" />
        </button>
        <button
          disabled={activePage === 0}
          onClick={() => setActivePage((page) => page - 1)}
          className="rounded-full bg-slate-100 p-2 text-slate-700 transition-colors hover:bg-slate-200 disabled:opacity-50 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
          title="Previous page"
        >
          <ChevronLeftIcon className="h-4 w-4" />
        </button>

        <div className="flex shrink-0 items-center gap-2 rounded-full bg-slate-100 px-3 py-2 text-sm dark:bg-slate-700">
          <span className="font-medium text-slate-600 dark:text-slate-300">Page</span>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={String(activePage + 1)}
            onChange={(event) => {
              const rawValue = event.target.value.replace(/\D/g, '');
              if (!rawValue) {
                return;
              }

              const value = parseInt(rawValue, 10);
              if (!Number.isNaN(value) && value >= 1 && value <= workingDoc.pages.length) {
                setActivePage(value - 1);
              }
            }}
            style={{ width: `${pageInputWidthCh}ch` }}
            className="shrink-0 rounded-full border border-slate-300 bg-white px-3 py-1 text-center text-sm tabular-nums text-slate-900 outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
            aria-label="Current page number"
          />
          <span className="font-medium text-slate-600 dark:text-slate-300">of {workingDoc.pages.length}</span>
        </div>

        <button
          disabled={activePage === workingDoc.pages.length - 1}
          onClick={() => setActivePage((page) => page + 1)}
          className="rounded-full bg-slate-100 p-2 text-slate-700 transition-colors hover:bg-slate-200 disabled:opacity-50 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
          title="Next page"
        >
          <ChevronRightIcon className="h-4 w-4" />
        </button>
        <button
          disabled={activePage === workingDoc.pages.length - 1}
          onClick={() => setActivePage(workingDoc.pages.length - 1)}
          className="rounded-full bg-slate-100 p-2 text-slate-700 transition-colors hover:bg-slate-200 disabled:opacity-50 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
          title="Last page"
        >
          <ChevronsRightIcon className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        {nextIssuePageIndex !== null && (
          <IconActionButton
            icon={<AlertCircleIcon className="h-4 w-4" />}
            label={jumpToIssueLabel}
            variant="danger"
            isActive={currentPageIssueType !== null}
            onClick={() => setActivePage(nextIssuePageIndex)}
          />
        )}
        <IconActionButton
          icon={<RefreshCwIcon className="h-4 w-4" />}
          label="Reprocess"
          isActive={showReprocessModal}
          variant="primary"
          onClick={handleOpenCurrentPageReprocess}
        />
      </div>
    </div>
  );

  const renderPreviewPanel = () => (
    <div
      className={`flex min-h-0 flex-col ${isMobileLayout ? 'h-full' : 'transition-all duration-300'}`}
      style={isMobileLayout ? undefined : { width: showEditor ? `${100 - editorWidth}%` : '100%' }}
    >
      <div className="flex-1 overflow-hidden bg-slate-100 dark:bg-slate-900">
        {workingDoc.pages[activePage] && <ImageViewer page={workingDoc.pages[activePage]} />}
      </div>
      {renderPagination()}
    </div>
  );

  const renderEditorPanel = (mobile: boolean) => (
    <div
      className={`relative flex h-full min-h-0 flex-col ${mobile ? '' : 'border-l border-slate-200 transition-all duration-300 dark:border-slate-700'}`}
      style={mobile ? undefined : { width: `${editorWidth}%` }}
    >
      {!mobile && (
        <>
          <button
            type="button"
            onMouseDown={(event) => {
              event.preventDefault();
              setIsResizing(true);
            }}
            className="absolute inset-y-0 left-0 z-20 w-3 -translate-x-1/2 cursor-col-resize"
            title="Resize editor panel"
          >
            <span
              className={`absolute left-1/2 top-0 h-full w-px -translate-x-1/2 transition-colors ${
                isResizing ? 'bg-blue-500' : 'bg-slate-300 dark:bg-slate-600'
              }`}
            />
          </button>
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-100 px-3 py-1.5 dark:border-slate-700 dark:bg-slate-900">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Drag the left edge to resize
            </span>
            <button
              onClick={() => setShowEditor(false)}
              className="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-300"
              title="Hide editor panel"
            >
              <EditIcon className="h-4 w-4" />
            </button>
          </div>
        </>
      )}

      <div className="min-h-0 flex-1 overflow-hidden">
        <TextEditor
          text={cleanText}
          onChange={handleTextChange}
          headerControls={filterControls}
        />
      </div>
    </div>
  );

  return (
    <div className="flex h-full flex-col bg-slate-100 transition-colors dark:bg-slate-900">
      <header className="z-10 border-b border-slate-200 bg-white px-4 py-4 transition-colors dark:border-slate-700 dark:bg-slate-800 sm:px-6">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
          <div className="grid min-w-0 gap-3 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-start">
            <IconActionButton
              icon={<ArrowLeftIcon className="h-4 w-4" />}
              label="Back"
              isActive
              className="w-full justify-center sm:w-auto"
              onClick={onBack}
            />
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-start gap-2">
                <h1
                  data-testid="editor-document-title"
                  className="min-w-0 flex-1 truncate text-lg font-semibold text-slate-900 dark:text-white"
                  title={workingDoc.name}
                >
                  {workingDoc.name}
                </h1>
                <div className="relative flex shrink-0 items-center">
                  <button
                    type="button"
                    onClick={handleCopyTitle}
                    className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-blue-600 dark:hover:bg-slate-700 dark:hover:text-blue-400"
                    title="Copy title"
                  >
                    <CopyIcon className="h-4 w-4" />
                  </button>
                  {showCopyFeedback && (
                    <span className="pointer-events-none absolute left-1/2 top-full z-50 mt-1 -translate-x-1/2 whitespace-nowrap rounded bg-slate-800 px-2 py-1 text-[10px] font-medium text-white shadow-lg dark:bg-slate-200 dark:text-slate-900">
                      Title copied
                    </span>
                  )}
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                  {workingDoc.pages.length} pages
                </span>
              </div>
            </div>
          </div>

          <div
            data-testid="editor-header-actions"
            className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:flex xl:flex-nowrap xl:items-center xl:justify-end"
          >
            <IconActionButton
              icon={<EditIcon className="h-4 w-4" />}
              label="Rename"
              isActive={showRenameDialog}
              className={headerActionButtonClassName}
              onClick={handleOpenRenameDialog}
            />

            <IconActionButton
              icon={<CheckCircleIcon className="h-4 w-4" />}
              label={isSavingDocument ? 'Saving' : (isSaved ? 'Saved' : 'Save')}
              isActive={isSavingDocument || !isSaved}
              variant={isSaved && !isSavingDocument ? 'success' : 'primary'}
              disabled={isSavingDocument}
              className={headerActionButtonClassName}
              onClick={handleSave}
            />

            <div ref={exportMenuRef} className="relative min-w-0 xl:min-w-fit">
              <IconActionButton
                icon={<DownloadIcon className="h-4 w-4" />}
                label="Export"
                isActive={isExportMenuOpen}
                className={headerActionButtonClassName}
                onClick={(event) => {
                  event.stopPropagation();
                  setIsExportMenuOpen((open) => !open);
                }}
              />

              {!isCompactHeaderLayout && isExportMenuOpen && renderExportOptions(
                'absolute right-0 top-full z-50 mt-2 w-48 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-800'
              )}
            </div>

            <IconActionButton
              icon={<RefreshCwIcon className="h-4 w-4" />}
              label="Reprocess"
              isActive={showReprocessModal}
              className={headerActionButtonClassName}
              onClick={handleOpenCurrentPageReprocess}
            />
            {issuePageIndexes.length > 0 && (
              <IconActionButton
                icon={<AlertCircleIcon className="h-4 w-4" />}
                label={batchReprocessLabel}
                variant="danger"
                className={headerActionButtonClassName}
                onClick={handleOpenIssuePagesReprocess}
              />
            )}
          </div>
        </div>

        {isCompactHeaderLayout && isExportMenuOpen && (
          <div
            data-testid="editor-export-sheet"
            className="fixed inset-0 z-[55] bg-black/40 p-4 backdrop-blur-sm"
            onClick={() => setIsExportMenuOpen(false)}
          >
            <div
              className="absolute inset-x-4 bottom-4 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-800"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4 dark:border-slate-700">
                <div>
                  <h3 className="text-base font-semibold text-slate-900 dark:text-white">Export document</h3>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Choose a download format without leaving the editor.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsExportMenuOpen(false)}
                  className="rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-700 dark:hover:text-white"
                >
                  <CloseIcon className="h-5 w-5" />
                </button>
              </div>
              {renderExportOptions('max-h-[min(70vh,26rem)] overflow-y-auto py-2')}
            </div>
          </div>
        )}

        {showErrorBanner && (
          <div className={`mt-4 rounded-3xl border px-4 py-3 ${
            currentPageHasError && currentPageErrorDismissed !== true
              ? 'border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-900/10'
              : 'border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-900/10'
          }`}>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                {issuePageIndexes.length > 0 && (
                  <p className="text-sm font-medium text-slate-900 dark:text-white">
                    {errorSummaryLabel}
                  </p>
                )}
                {currentPageHasError ? (
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                    Page {activePage + 1}: {currentPageErrorDismissed
                      ? 'This page error is hidden from the dashboard.'
                      : (currentPageData?.lastError || 'This page needs review before it is considered resolved.')}
                  </p>
                ) : currentPageIsBlank ? (
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                    Page {activePage + 1}: this page has no transcription yet. You can reprocess just this page or launch the batch action for all issue pages.
                  </p>
                ) : (
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                    Use the shortcuts to jump directly to pages with OCR errors or blank transcription, or reprocess all of them one by one.
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {nextIssuePageIndex !== null && (
                  <IconActionButton
                    icon={<AlertCircleIcon className="h-4 w-4" />}
                    label={jumpToIssueLabel}
                    variant="danger"
                    isActive={currentPageIssueType !== null}
                    onClick={() => setActivePage(nextIssuePageIndex)}
                  />
                )}
                {issuePageIndexes.length > 0 && (
                  <IconActionButton
                    icon={<RefreshCwIcon className="h-4 w-4" />}
                    label={batchReprocessLabel}
                    variant="primary"
                    onClick={handleOpenIssuePagesReprocess}
                  />
                )}
                {currentPageHasError && (
                  <label className="flex items-center gap-2 rounded-full bg-white/80 px-3 py-2 text-sm text-slate-700 shadow-sm dark:bg-slate-800/80 dark:text-slate-200">
                    <input
                      type="checkbox"
                      checked={currentPageErrorDismissed}
                      disabled={isUpdatingErrorDismissal}
                      onChange={(event) => handleToggleErrorDismissed(event.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-900"
                    />
                    <span>{isUpdatingErrorDismissal ? 'Updating...' : 'Hide this error from dashboard'}</span>
                  </label>
                )}
              </div>
            </div>
          </div>
        )}

        {isMobileLayout && (
          <div className="mt-4 flex flex-wrap gap-2">
            <IconActionButton
              icon={<ImageIcon className="h-4 w-4" />}
              label="Preview"
              isActive={mobilePanel === 'preview'}
              onClick={() => setMobilePanel('preview')}
            />
            <IconActionButton
              icon={<EditIcon className="h-4 w-4" />}
              label="Text"
              isActive={mobilePanel === 'editor'}
              onClick={() => setMobilePanel('editor')}
            />
          </div>
        )}
      </header>

      <DocumentNameDialog
        isOpen={showRenameDialog}
        value={renameDraft}
        error={renameError}
        isSaving={isRenamingDocument}
        onChange={setRenameDraft}
        onClose={handleCloseRenameDialog}
        onSubmit={handleRenameDocument}
      />

      {reprocessErrorDialog && (
        <div className="fixed inset-0 z-[65] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl dark:bg-slate-800">
            <div className="flex items-center justify-between border-b border-slate-200 p-4 dark:border-slate-700">
              <div>
                <h3 className="text-lg font-bold text-slate-800 dark:text-white">{reprocessErrorDialog.title}</h3>
                <p className="mt-1 whitespace-pre-line text-sm text-slate-500 dark:text-slate-400">
                  {reprocessErrorDialog.summary}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReprocessErrorDialog(null)}
                className="rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-700 dark:hover:text-white"
              >
                <CloseIcon className="h-5 w-5" />
              </button>
            </div>

            <div className="overflow-y-auto p-4 sm:p-6">
              <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">
                This is the raw response captured by the client. If it contains HTML, the page was likely generated by the app server, a reverse proxy, or the hosting platform rather than by the OCR model itself.
              </p>
              <pre
                data-testid="reprocess-error-details"
                className="overflow-x-auto rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs leading-6 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                {reprocessErrorDialog.details}
              </pre>
            </div>

            <div className="flex justify-end border-t border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/50">
              <IconActionButton
                icon={<CloseIcon className="h-4 w-4" />}
                label="Close"
                onClick={() => setReprocessErrorDialog(null)}
              />
            </div>
          </div>
        </div>
      )}

      <div ref={contentRef} className={`relative flex-1 overflow-hidden ${isMobileLayout ? '' : 'flex'}`}>
        {isMobileLayout ? (
          mobilePanel === 'preview' ? renderPreviewPanel() : renderEditorPanel(true)
        ) : (
          <>
            {renderPreviewPanel()}
            {showEditor && renderEditorPanel(false)}

            {!showEditor && (
              <div className="absolute right-4 top-1/2 z-20 -translate-y-1/2">
                <IconActionButton
                  icon={<EditIcon className="h-4 w-4" />}
                  label="Show editor"
                  isActive
                  variant="primary"
                  onClick={() => setShowEditor(true)}
                />
              </div>
            )}
          </>
        )}
      </div>

      {showReprocessModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-white shadow-xl dark:bg-slate-800">
            <div className="flex items-center justify-between border-b border-slate-200 p-4 dark:border-slate-700">
              <div>
                <h3 className="text-lg font-bold text-slate-800 dark:text-white">{reprocessModalTitle}</h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  {reprocessModalDescription}
                </p>
              </div>
              <button
                onClick={() => setShowReprocessModal(false)}
                className="rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-700 dark:hover:text-white"
              >
                <CloseIcon className="h-5 w-5" />
              </button>
            </div>

            <div className="overflow-y-auto p-4 sm:p-6">
              <ProcessingOptionsSelector
                options={reprocessOptions}
                onChange={setReprocessOptions}
                models={models}
                prompts={prompts}
                onOpenSettings={onOpenSettings}
              />

              <div className="mt-4 rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/60">
                <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Retry Failed Reprocess Attempts
                </label>
                <input
                  data-testid="reprocess-retries-input"
                  type="number"
                  min={0}
                  step={1}
                  value={reprocessRetries}
                  onChange={(event) => setReprocessRetries(Math.max(0, Math.trunc(Number(event.target.value) || 0)))}
                  className="w-full rounded-2xl border border-slate-300 bg-white p-3 text-sm text-slate-900 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                />
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  Number of extra attempts per page if OCR fails or returns no text. Default: 0.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/50">
              <IconActionButton
                icon={<CloseIcon className="h-4 w-4" />}
                label="Cancel"
                onClick={() => setShowReprocessModal(false)}
              />
              <IconActionButton
                icon={<RefreshCwIcon className="h-4 w-4" />}
                label={reprocessActionLabel}
                isActive
                variant="primary"
                disabled={isReprocessing || (reprocessScope === 'issues' && issuePageIndexes.length === 0)}
                onClick={handleSubmitReprocess}
              />
            </div>
          </div>
        </div>
      )}

      {isReprocessing && (
        <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="flex flex-col items-center rounded-3xl bg-white p-8 shadow-2xl dark:bg-slate-800">
            <LoaderIcon className="mb-4 h-16 w-16 animate-spin text-blue-600 dark:text-blue-400" />
            <h3 className="mb-2 text-xl font-bold text-slate-800 dark:text-white">{reprocessOverlayTitle}</h3>
            <p className="max-w-xs text-center text-slate-500 dark:text-slate-400">
              {reprocessOverlayDescription}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default EditorView;
