import React, { useEffect, useRef, useState } from 'react';
import { DocumentData, BlockLabel, ProcessingOptions, PromptPreset, SettingsTab } from '../../types';
import ImageViewer from './ImageViewer';
import TextEditor from './TextEditor';
import { reconstructCleanText, generateMarkdown, generateHTML, generateEPUB } from '../../utils/reconstruction';
import {
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
import { reprocessPage } from '../../services/geminiService';
import ProcessingOptionsSelector from '../ProcessingOptionsSelector';
import IconActionButton from '../IconActionButton';
import { DEFAULT_MODELS, GeminiModel } from '../../utils/modelStorage';

interface EditorViewProps {
  doc: DocumentData;
  onBack: () => void;
  onSave: (docId: string, newText: string, pageSavedTexts?: Record<number, string>) => void;
  models: GeminiModel[];
  prompts: PromptPreset[];
  onOpenSettings: (tab?: SettingsTab) => void;
}

type MobilePanel = 'preview' | 'editor';

const MIN_EDITOR_WIDTH = 30;
const MAX_EDITOR_WIDTH = 70;
const DEFAULT_MODEL_ID = DEFAULT_MODELS[0]?.id ?? 'gemini-flash-latest';

const EditorView: React.FC<EditorViewProps> = ({
  doc,
  onBack,
  onSave,
  models,
  prompts,
  onOpenSettings,
}) => {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [activePage, setActivePage] = useState(0);
  const [cleanText, setCleanText] = useState('');
  const [isSaved, setIsSaved] = useState(true);
  const [showCopyFeedback, setShowCopyFeedback] = useState(false);
  const [isReprocessing, setIsReprocessing] = useState(false);
  const [showReprocessModal, setShowReprocessModal] = useState(false);
  const [showFullDocument, setShowFullDocument] = useState(true);
  const [showEditor, setShowEditor] = useState(true);
  const [editorWidth, setEditorWidth] = useState(50);
  const [isResizing, setIsResizing] = useState(false);
  const [pageTextOverrides, setPageTextOverrides] = useState<Record<number, string>>({});
  const [selectedLabels, setSelectedLabels] = useState<BlockLabel[]>([BlockLabel.TITLE, BlockLabel.MAIN_TEXT]);
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>('preview');
  const [isMobileLayout, setIsMobileLayout] = useState(false);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [reprocessOptions, setReprocessOptions] = useState<ProcessingOptions>({
    model: DEFAULT_MODEL_ID,
    processingMode: 'ocr',
    targetLanguage: 'Español',
    customPrompt: '',
    removeReferences: true,
  });

  const getPageText = (pageIndex: number, labels: BlockLabel[], overrides: Record<number, string>) => {
    return overrides[pageIndex] ?? reconstructCleanText([doc.pages[pageIndex]], labels);
  };

  const buildFullDocumentText = (labels: BlockLabel[], overrides: Record<number, string>) => {
    const joinedText = doc.pages
      .map((_, pageIndex) => getPageText(pageIndex, labels, overrides))
      .filter(Boolean)
      .join('\n\n');

    return joinedText.replace(/\n{3,}/g, '\n\n').trim();
  };

  const getDisplayedText = (
    fullDoc: boolean,
    pageIndex: number,
    labels: BlockLabel[],
    overrides: Record<number, string>,
    preferSavedDocument: boolean = false
  ) => {
    if (fullDoc) {
      if (preferSavedDocument && doc.savedText && Object.keys(overrides).length === 0) {
        return doc.savedText;
      }

      return buildFullDocumentText(labels, overrides);
    }

    return getPageText(pageIndex, labels, overrides);
  };

  useEffect(() => {
    const initialPageOverrides = doc.pageSavedTexts ?? {};
    setPageTextOverrides(initialPageOverrides);
    setCleanText(getDisplayedText(showFullDocument, activePage, selectedLabels, initialPageOverrides, true));
    setIsSaved(true);
    setShowEditor(true);
    setMobilePanel('preview');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id]);

  useEffect(() => {
    const nextText = getDisplayedText(showFullDocument, activePage, selectedLabels, pageTextOverrides);
    setCleanText(nextText);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showFullDocument, activePage]);

  useEffect(() => {
    if (models.length === 0) {
      return;
    }

    setReprocessOptions((current) => {
      const modelStillAvailable = models.some((model) => model.id === current.model);
      if (modelStillAvailable) {
        return current;
      }

      return {
        ...current,
        model: models[0]?.id ?? DEFAULT_MODEL_ID,
      };
    });
  }, [models]);

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

    const mediaQuery = window.matchMedia('(max-width: 1023px)');
    const syncMobileLayout = () => {
      setIsMobileLayout(mediaQuery.matches);
      if (mediaQuery.matches) {
        setShowEditor(true);
        setIsResizing(false);
      }
    };

    syncMobileLayout();
    mediaQuery.addEventListener('change', syncMobileLayout);

    return () => mediaQuery.removeEventListener('change', syncMobileLayout);
  }, []);

  useEffect(() => {
    if (!isExportMenuOpen) {
      return;
    }

    const handleDocumentClick = () => setIsExportMenuOpen(false);
    document.addEventListener('click', handleDocumentClick);

    return () => document.removeEventListener('click', handleDocumentClick);
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

      const nextText = getDisplayedText(showFullDocument, activePage, nextLabels, pageTextOverrides);
      setCleanText(nextText);
      setIsSaved(false);

      return nextLabels;
    });
  };

  const handleSave = () => {
    const nextPageTextOverrides = showFullDocument
      ? pageTextOverrides
      : { ...pageTextOverrides, [activePage]: cleanText };
    const textToSave = showFullDocument
      ? cleanText
      : buildFullDocumentText(selectedLabels, nextPageTextOverrides);

    if (!showFullDocument) {
      setPageTextOverrides(nextPageTextOverrides);
    }

    onSave(doc.id, textToSave, nextPageTextOverrides);
    setIsSaved(true);
  };

  const handleCopyTitle = () => {
    navigator.clipboard.writeText(doc.name);
    setShowCopyFeedback(true);
    setTimeout(() => setShowCopyFeedback(false), 1000);
  };

  const handleReprocessDocumentPage = async () => {
    setIsReprocessing(true);
    try {
      const newBlocks = await reprocessPage(
        doc.id,
        activePage,
        reprocessOptions.model,
        reprocessOptions.processingMode,
        reprocessOptions.targetLanguage,
        reprocessOptions.customPrompt,
        reprocessOptions.removeReferences
      );

      doc.pages[activePage].blocks = newBlocks;
      const updatedOverrides = { ...pageTextOverrides };
      delete updatedOverrides[activePage];
      setPageTextOverrides(updatedOverrides);

      const nextText = getDisplayedText(showFullDocument, activePage, selectedLabels, updatedOverrides);
      setCleanText(nextText);
      setIsSaved(false);
      setShowReprocessModal(false);
    } catch (error: any) {
      console.error('Reprocess failed', error);
      alert(`Failed to reprocess page: ${error.message || 'Unknown error'}`);
    } finally {
      setIsReprocessing(false);
    }
  };

  const handleDownload = async (format: 'md' | 'txt' | 'html' | 'epub') => {
    let blob: Blob;
    let extension = format;

    const fullText = showFullDocument
      ? cleanText
      : (Object.keys(pageTextOverrides).length > 0
          ? buildFullDocumentText(selectedLabels, pageTextOverrides)
          : (doc.savedText || reconstructCleanText(doc.pages, selectedLabels)));

    if (format === 'html') {
      blob = generateHTML(fullText, doc.name);
    } else if (format === 'epub') {
      blob = await generateEPUB(fullText, doc.name);
      extension = 'epub';
    } else {
      blob = generateMarkdown(fullText);
    }

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${doc.name.replace(/\.[^/.]+$/, '')}_clean.${extension}`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
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

        <div className="flex items-center gap-2 rounded-full bg-slate-100 px-3 py-2 text-sm dark:bg-slate-700">
          <span className="font-medium text-slate-600 dark:text-slate-300">Page</span>
          <input
            type="number"
            min={1}
            max={doc.pages.length}
            value={activePage + 1}
            onChange={(event) => {
              const value = parseInt(event.target.value, 10);
              if (!Number.isNaN(value) && value >= 1 && value <= doc.pages.length) {
                setActivePage(value - 1);
              }
            }}
            className="w-12 rounded-full border border-slate-300 bg-white px-2 py-1 text-center text-sm text-slate-900 outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
          />
          <span className="font-medium text-slate-600 dark:text-slate-300">of {doc.pages.length}</span>
        </div>

        <button
          disabled={activePage === doc.pages.length - 1}
          onClick={() => setActivePage((page) => page + 1)}
          className="rounded-full bg-slate-100 p-2 text-slate-700 transition-colors hover:bg-slate-200 disabled:opacity-50 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
          title="Next page"
        >
          <ChevronRightIcon className="h-4 w-4" />
        </button>
        <button
          disabled={activePage === doc.pages.length - 1}
          onClick={() => setActivePage(doc.pages.length - 1)}
          className="rounded-full bg-slate-100 p-2 text-slate-700 transition-colors hover:bg-slate-200 disabled:opacity-50 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
          title="Last page"
        >
          <ChevronsRightIcon className="h-4 w-4" />
        </button>
      </div>

      <IconActionButton
        icon={<RefreshCwIcon className="h-4 w-4" />}
        label="Reprocess"
        isActive={showReprocessModal}
        variant="primary"
        onClick={() => setShowReprocessModal(true)}
      />
    </div>
  );

  const renderPreviewPanel = () => (
    <div
      className={`flex min-h-0 flex-col ${isMobileLayout ? 'h-full' : 'transition-all duration-300'}`}
      style={isMobileLayout ? undefined : { width: showEditor ? `${100 - editorWidth}%` : '100%' }}
    >
      <div className="flex-1 overflow-hidden bg-slate-100 dark:bg-slate-900">
        {doc.pages[activePage] && <ImageViewer page={doc.pages[activePage]} />}
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
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <IconActionButton
              icon={<ArrowLeftIcon className="h-4 w-4" />}
              label="Back"
              isActive
              onClick={onBack}
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-lg font-semibold text-slate-900 dark:text-white" title={doc.name}>
                  {doc.name}
                </h1>
                <div className="relative flex items-center">
                  <button
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
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                  {doc.pages.length} pages
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <IconActionButton
              icon={<CheckCircleIcon className="h-4 w-4" />}
              label={isSaved ? 'Saved' : 'Save'}
              isActive={!isSaved}
              variant={isSaved ? 'success' : 'primary'}
              onClick={handleSave}
            />

            <div className="relative">
              <IconActionButton
                icon={<DownloadIcon className="h-4 w-4" />}
                label="Export"
                isActive={isExportMenuOpen}
                onClick={(event) => {
                  event.stopPropagation();
                  setIsExportMenuOpen((open) => !open);
                }}
              />

              {isExportMenuOpen && (
                <div
                  className="absolute right-0 top-full z-50 mt-2 w-48 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-800"
                  onClick={(event) => event.stopPropagation()}
                >
                  <button onClick={() => handleDownload('md')} className="block w-full px-4 py-3 text-left text-sm text-slate-700 transition-colors hover:bg-slate-50 hover:text-blue-600 dark:text-slate-200 dark:hover:bg-slate-700 dark:hover:text-blue-400">Markdown (.md)</button>
                  <button onClick={() => handleDownload('epub')} className="block w-full px-4 py-3 text-left text-sm text-slate-700 transition-colors hover:bg-slate-50 hover:text-blue-600 dark:text-slate-200 dark:hover:bg-slate-700 dark:hover:text-blue-400">EPUB (.epub)</button>
                  <button onClick={() => handleDownload('html')} className="block w-full px-4 py-3 text-left text-sm text-slate-700 transition-colors hover:bg-slate-50 hover:text-blue-600 dark:text-slate-200 dark:hover:bg-slate-700 dark:hover:text-blue-400">HTML (.html)</button>
                  <button onClick={() => handleDownload('txt')} className="block w-full px-4 py-3 text-left text-sm text-slate-700 transition-colors hover:bg-slate-50 hover:text-blue-600 dark:text-slate-200 dark:hover:bg-slate-700 dark:hover:text-blue-400">Plain text (.txt)</button>
                </div>
              )}
            </div>

            <IconActionButton
              icon={<RefreshCwIcon className="h-4 w-4" />}
              label="Reprocess"
              isActive={showReprocessModal}
              onClick={() => setShowReprocessModal(true)}
            />
          </div>
        </div>

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
                <h3 className="text-lg font-bold text-slate-800 dark:text-white">Reprocess Page {activePage + 1}</h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Use a different model or a saved prompt without leaving the editor.
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
            </div>

            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/50">
              <IconActionButton
                icon={<CloseIcon className="h-4 w-4" />}
                label="Cancel"
                onClick={() => setShowReprocessModal(false)}
              />
              <IconActionButton
                icon={<RefreshCwIcon className="h-4 w-4" />}
                label={isReprocessing ? 'Processing' : 'Reprocess page'}
                isActive
                variant="primary"
                disabled={isReprocessing}
                onClick={handleReprocessDocumentPage}
              />
            </div>
          </div>
        </div>
      )}

      {isReprocessing && (
        <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="flex flex-col items-center rounded-3xl bg-white p-8 shadow-2xl dark:bg-slate-800">
            <LoaderIcon className="mb-4 h-16 w-16 animate-spin text-blue-600 dark:text-blue-400" />
            <h3 className="mb-2 text-xl font-bold text-slate-800 dark:text-white">Reprocessing Page...</h3>
            <p className="max-w-xs text-center text-slate-500 dark:text-slate-400">
              Please wait while we analyze the document with Gemini AI.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default EditorView;
