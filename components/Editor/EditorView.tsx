import React, { useState, useEffect } from 'react';
import { DocumentData, BlockLabel, ProcessingOptions } from '../../types';
import ImageViewer from './ImageViewer';
import TextEditor from './TextEditor';
import { reconstructCleanText, generateMarkdown, generateHTML, generateEPUB } from '../../utils/reconstruction';
import { DownloadIcon, CheckCircleIcon, CopyIcon, LoaderIcon, ChevronLeftIcon, ChevronRightIcon, ChevronsLeftIcon, ChevronsRightIcon } from '../Icons';
import { reprocessPage } from '../../services/geminiService';
import ProcessingOptionsSelector from '../ProcessingOptionsSelector';

interface EditorViewProps {
  doc: DocumentData;
  onBack: () => void;
  onSave: (docId: string, newText: string) => void;
}

const EditorView: React.FC<EditorViewProps> = ({ doc, onBack, onSave }) => {
  const [activePage, setActivePage] = useState(0);
  const [cleanText, setCleanText] = useState('');
  const [isSaved, setIsSaved] = useState(true);
  const [showCopyFeedback, setShowCopyFeedback] = useState(false);
  const [isReprocessing, setIsReprocessing] = useState(false);
  const [showReprocessModal, setShowReprocessModal] = useState(false);
  const [reprocessOptions, setReprocessOptions] = useState<ProcessingOptions>({
    model: 'gemini-2.5-flash',
    processingMode: 'ocr',
    targetLanguage: 'Español',
    customPrompt: '',
    removeReferences: true
  });
  
  // State for block filters
  const [selectedLabels, setSelectedLabels] = useState<BlockLabel[]>([BlockLabel.TITLE, BlockLabel.MAIN_TEXT]);
  
  // Toggle for full document vs current page view
  const [showFullDocument, setShowFullDocument] = useState(true);
  
  // Toggle for showing/hiding the editor panel
  const [showEditor, setShowEditor] = useState(true);
  
  // Editor panel width percentage (30-70%)
  const [editorWidth, setEditorWidth] = useState(50);

  // Get displayed text based on view mode
  const getDisplayedText = (fullDoc: boolean, pageIndex: number, labels: BlockLabel[]) => {
    if (fullDoc) {
      return reconstructCleanText(doc.pages, labels);
    } else {
      return reconstructCleanText([doc.pages[pageIndex]], labels);
    }
  };

  // Initialize text on load
  useEffect(() => {
    // If we have previously saved text from the server, use it.
    // Otherwise, reconstruct from blocks using default filters.
    if (doc.savedText) {
      setCleanText(doc.savedText);
    } else {
      setCleanText(getDisplayedText(showFullDocument, activePage, selectedLabels));
    }
    setIsSaved(true); // Reset save state when loading a new document
    // We only want to run this init logic once when doc changes, 
    // we don't depend on selectedLabels here because that's for manual updates later.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id]); // Only re-run when document ID changes

  // Update text when view mode or active page changes
  useEffect(() => {
    const newText = getDisplayedText(showFullDocument, activePage, selectedLabels);
    setCleanText(newText);
    setIsSaved(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showFullDocument, activePage]);

  const handleTextChange = (newText: string) => {
    setCleanText(newText);
    setIsSaved(false);
  };

  const toggleLabel = (label: BlockLabel) => {
    setSelectedLabels(prev => {
      const newLabels = prev.includes(label) 
        ? prev.filter(l => l !== label)
        : [...prev, label];
      
      // Trigger reconstruction immediately using the new labels
      // Note: This will overwrite manual edits if they haven't been saved/exported.
      const newText = getDisplayedText(showFullDocument, activePage, newLabels);
      setCleanText(newText);
      setIsSaved(false); // Mark as unsaved
      
      return newLabels;
    });
  };

  const handleSave = () => {
    onSave(doc.id, cleanText);
    setIsSaved(true);
  };

  const handleCopyTitle = () => {
    navigator.clipboard.writeText(doc.name);
    setShowCopyFeedback(true);
    setTimeout(() => setShowCopyFeedback(false), 1000);
  };

  const handleReprocessPage = async () => {
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
      
      // Update local state
      doc.pages[activePage].blocks = newBlocks;
      
      // Reconstruct text
      const newText = reconstructCleanText(doc.pages, selectedLabels);
      setCleanText(newText);
      setIsSaved(false);
      setShowReprocessModal(false);
    } catch (e: any) {
      console.error("Reprocess failed", e);
      alert(`Failed to reprocess page: ${e.message || "Unknown error"}`);
    } finally {
      setIsReprocessing(false);
    }
  };

  const handleDownload = async (format: 'md' | 'txt' | 'html' | 'epub') => {
    let blob: Blob;
    let extension = format;
    
    // Always export full document regardless of view mode
    const fullText = reconstructCleanText(doc.pages, selectedLabels);

    if (format === 'html') {
      blob = generateHTML(fullText, doc.name);
    } else if (format === 'epub') {
      blob = await generateEPUB(fullText, doc.name);
      extension = 'epub';
    } else {
      blob = generateMarkdown(fullText);
    }
    
    const url = URL.createObjectURL(blob);
    // document.createElement now correctly refers to the global DOM document
    const a = document.createElement('a');
    a.href = url;
    a.download = `${doc.name.replace(/\.[^/.]+$/, "")}_clean.${extension}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const availableLabels = [
    BlockLabel.TITLE, 
    BlockLabel.MAIN_TEXT, 
    BlockLabel.HEADER, 
    BlockLabel.FOOTER, 
    BlockLabel.FOOTNOTE, 
    BlockLabel.CAPTION
  ];

  const filterControls = (
    <div className="flex items-center gap-4 overflow-x-auto no-scrollbar py-1 flex-wrap">
      {/* View Mode Toggle */}
      <div className="flex items-center space-x-1">
        <button
          onClick={() => setShowFullDocument(true)}
          className={`px-2 py-1 text-xs rounded-l-md transition-colors ${
            showFullDocument 
              ? 'bg-blue-600 text-white' 
              : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'
          }`}
          title="Show full document transcription"
        >
          Full Doc
        </button>
        <button
          onClick={() => setShowFullDocument(false)}
          className={`px-2 py-1 text-xs rounded-r-md transition-colors ${
            !showFullDocument 
              ? 'bg-blue-600 text-white' 
              : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'
          }`}
          title="Show only current page transcription"
        >
          Page {activePage + 1}
        </button>
      </div>
      
      <div className="h-4 w-px bg-slate-200 dark:bg-slate-700" />
      
      <span className="text-xs text-slate-400 font-medium whitespace-nowrap">Include:</span>
      <div className="flex items-center gap-4">
        {availableLabels.map(label => (
          <label key={label} className="flex items-center gap-1.5 cursor-pointer group select-none">
            <input 
              type="checkbox" 
              checked={selectedLabels.includes(label)}
              onChange={() => toggleLabel(label)}
              className="w-4 h-4 text-blue-600 rounded border-slate-300 dark:border-slate-600 focus:ring-blue-500 bg-white dark:bg-slate-700"
            />
            <span className="text-xs text-slate-600 dark:text-slate-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 capitalize whitespace-nowrap">
              {label.toLowerCase().replace('_', ' ')}
            </span>
          </label>
        ))}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full bg-slate-100 dark:bg-slate-900 transition-colors">
      {/* Header */}
      <header className="h-16 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between px-6 z-10 shrink-0 transition-colors">
        <div className="flex items-center space-x-4">
          <button onClick={onBack} className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white">
            &larr; Back
          </button>
          <h1 className="text-lg font-semibold text-slate-800 dark:text-white truncate max-w-xs" title={doc.name}>
            {doc.name}
          </h1>
          <div className="relative flex items-center">
            <button 
              onClick={handleCopyTitle}
              className="p-1.5 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-md transition-colors"
              title="Copy Title"
            >
              <CopyIcon className="w-4 h-4" />
            </button>
            {showCopyFeedback && (
              <span className="absolute top-full mt-1 left-1/2 -translate-x-1/2 px-2 py-1 bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900 text-[10px] font-medium rounded shadow-lg whitespace-nowrap animate-fade-in-out z-50 pointer-events-none">
                Title copied
              </span>
            )}
          </div>
          <span className="text-xs px-2 py-1 bg-slate-100 dark:bg-slate-700 rounded text-slate-500 dark:text-slate-300">
            {doc.pages.length} Pages
          </span>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={handleSave}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center ${
              isSaved 
              ? 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20' 
              : 'text-white bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {isSaved ? <><CheckCircleIcon className="w-4 h-4 mr-1"/> Saved</> : 'Save Changes'}
          </button>
          
          <div className="relative group">
            <button className="px-4 py-2 bg-slate-900 dark:bg-slate-700 text-white rounded-lg text-sm font-medium hover:bg-slate-800 dark:hover:bg-slate-600 flex items-center">
              <DownloadIcon className="w-4 h-4 mr-2" /> Export
            </button>
            <div className="absolute right-0 top-full pt-2 w-48 hidden group-hover:block z-50">
               <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-slate-100 dark:border-slate-700 overflow-hidden">
                <button onClick={() => handleDownload('md')} className="block w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 hover:text-blue-600 dark:hover:text-blue-400">Markdown (.md)</button>
                <button onClick={() => handleDownload('epub')} className="block w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 hover:text-blue-600 dark:hover:text-blue-400">EPUB (.epub)</button>
                <button onClick={() => handleDownload('html')} className="block w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 hover:text-blue-600 dark:hover:text-blue-400">HTML (.html)</button>
                <button onClick={() => handleDownload('txt')} className="block w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 hover:text-blue-600 dark:hover:text-blue-400">Plain Text (.txt)</button>
               </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Image Viewer */}
        <div 
          className="flex flex-col border-r border-slate-200 dark:border-slate-700 transition-all duration-300"
          style={{ width: showEditor ? `${100 - editorWidth}%` : '100%' }}
        >
          <div className="flex-1 overflow-hidden relative bg-slate-100 dark:bg-slate-900">
            {doc.pages[activePage] && (
              <ImageViewer page={doc.pages[activePage]} />
            )}
          </div>
          {/* Pagination */}
          <div className="h-14 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between px-4 shrink-0 transition-colors">
            <div className="flex items-center space-x-2">
              <button 
                disabled={activePage === 0}
                onClick={() => setActivePage(0)}
                className="p-2 rounded bg-slate-100 dark:bg-slate-700 disabled:opacity-50 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                title="First Page"
              >
                <ChevronsLeftIcon className="w-4 h-4" />
              </button>
              <button 
                disabled={activePage === 0}
                onClick={() => setActivePage(p => p - 1)}
                className="p-2 rounded bg-slate-100 dark:bg-slate-700 disabled:opacity-50 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                title="Previous Page"
              >
                <ChevronLeftIcon className="w-4 h-4" />
              </button>
              
              <div className="flex items-center space-x-2 mx-2">
                <span className="text-sm text-slate-600 dark:text-slate-400 font-medium">Page</span>
                <input 
                  type="number" 
                  min={1} 
                  max={doc.pages.length}
                  value={activePage + 1}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    if (!isNaN(val) && val >= 1 && val <= doc.pages.length) {
                      setActivePage(val - 1);
                    }
                  }}
                  className="w-12 px-1 py-1 text-center text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                />
                <span className="text-sm text-slate-600 dark:text-slate-400 font-medium">
                  of {doc.pages.length}
                </span>
              </div>

              <button 
                disabled={activePage === doc.pages.length - 1}
                onClick={() => setActivePage(p => p + 1)}
                className="p-2 rounded bg-slate-100 dark:bg-slate-700 disabled:opacity-50 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                title="Next Page"
              >
                <ChevronRightIcon className="w-4 h-4" />
              </button>
              <button 
                disabled={activePage === doc.pages.length - 1}
                onClick={() => setActivePage(doc.pages.length - 1)}
                className="p-2 rounded bg-slate-100 dark:bg-slate-700 disabled:opacity-50 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                title="Last Page"
              >
                <ChevronsRightIcon className="w-4 h-4" />
              </button>
            </div>
            
            <button
              onClick={() => setShowReprocessModal(true)}
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium"
            >
              Reprocess Page
            </button>
          </div>
        </div>

        {/* Right: Text Editor */}
        {showEditor && (
          <div 
            className="h-full flex flex-col transition-all duration-300"
            style={{ width: `${editorWidth}%` }}
          >
            {/* Editor Panel Controls */}
            <div className="flex items-center justify-between px-3 py-1.5 bg-slate-100 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 dark:text-slate-400">Panel Size:</span>
                <input
                  type="range"
                  min="30"
                  max="70"
                  value={editorWidth}
                  onChange={(e) => setEditorWidth(Number(e.target.value))}
                  className="w-20 h-1 bg-slate-300 dark:bg-slate-600 rounded-lg appearance-none cursor-pointer accent-blue-600"
                  title="Adjust editor panel width"
                />
                <span className="text-xs text-slate-400 w-8">{editorWidth}%</span>
              </div>
              <button
                onClick={() => setShowEditor(false)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors"
                title="Hide Editor Panel"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              <TextEditor 
                text={cleanText} 
                onChange={handleTextChange} 
                headerControls={filterControls}
              />
            </div>
          </div>
        )}
        
        {/* Show Editor Button (when editor is hidden) */}
        {!showEditor && (
          <div className="absolute right-4 top-1/2 -translate-y-1/2 z-20">
            <button
              onClick={() => setShowEditor(true)}
              className="p-3 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 transition-colors"
              title="Show Editor Panel"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Reprocess Modal */}
      {showReprocessModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
              <h3 className="text-lg font-bold text-slate-800 dark:text-white">Reprocess Page {activePage + 1}</h3>
              <button onClick={() => setShowReprocessModal(false)} className="text-slate-500 hover:text-slate-800 dark:hover:text-white">
                ✕
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto">
              <ProcessingOptionsSelector 
                options={reprocessOptions} 
                onChange={setReprocessOptions}
                showSavePrompt={false}
              />
            </div>

            <div className="p-4 border-t border-slate-200 dark:border-slate-700 flex justify-end space-x-3 bg-slate-50 dark:bg-slate-900/50">
              <button 
                onClick={() => setShowReprocessModal(false)}
                className="px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleReprocessPage}
                disabled={isReprocessing}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center"
              >
                {isReprocessing ? 'Processing...' : 'Reprocess Page'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full Screen Reprocessing Overlay */}
      {isReprocessing && (
        <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-2xl flex flex-col items-center animate-bounce-in">
            <LoaderIcon className="w-16 h-16 text-blue-600 dark:text-blue-400 animate-spin mb-4" />
            <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-2">Reprocessing Page...</h3>
            <p className="text-slate-500 dark:text-slate-400 text-center max-w-xs">
              Please wait while we analyze the document with Gemini AI.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default EditorView;
