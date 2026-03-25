import React, { useEffect, useMemo, useRef } from 'react';
import { markdownToEditorHtml, richTextHtmlToMarkdown, richTextHtmlToPlainText } from '../../utils/richText';

interface TextEditorProps {
  text: string;
  onChange: (newText: string) => void;
  headerControls?: React.ReactNode;
}

const TextEditor: React.FC<TextEditorProps> = ({ text, onChange, headerControls }) => {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const renderedHtml = useMemo(() => markdownToEditorHtml(text), [text]);

  useEffect(() => {
    if (!editorRef.current) {
      return;
    }

    if (editorRef.current.innerHTML !== renderedHtml) {
      editorRef.current.innerHTML = renderedHtml;
    }
  }, [renderedHtml]);

  const handleInput = () => {
    if (!editorRef.current) {
      return;
    }

    onChange(richTextHtmlToMarkdown(editorRef.current.innerHTML));
  };

  const handleCopy = (event: React.ClipboardEvent<HTMLDivElement>) => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || !editorRef.current) {
      return;
    }

    const range = selection.getRangeAt(0);
    if (!editorRef.current.contains(range.commonAncestorContainer)) {
      return;
    }

    const fragment = range.cloneContents();
    const container = document.createElement('div');
    container.appendChild(fragment);
    const html = container.innerHTML;
    event.preventDefault();
    event.clipboardData.setData('text/html', html);
    event.clipboardData.setData('text/plain', richTextHtmlToPlainText(html));
  };

  return (
    <div className="h-full flex flex-col bg-white dark:bg-slate-800 transition-colors">
      <div className="p-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 transition-colors">
        <div className="flex items-center space-x-4 flex-wrap gap-y-2">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Clean Transcription</span>
          {headerControls}
        </div>
      </div>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        spellCheck={false}
        onInput={handleInput}
        onCopy={handleCopy}
        className="flex-1 overflow-y-auto bg-white p-4 font-serif text-base leading-relaxed text-slate-800 outline-none transition-colors dark:bg-slate-800 dark:text-slate-200 sm:p-8 sm:text-lg [&_a]:text-blue-600 [&_a]:underline [&_blockquote]:border-l-4 [&_blockquote]:border-slate-300 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-slate-600 dark:[&_blockquote]:border-slate-600 dark:[&_blockquote]:text-slate-300 [&_code]:rounded [&_code]:bg-slate-100 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.9em] dark:[&_code]:bg-slate-700 [&_h1]:mb-4 [&_h1]:text-4xl [&_h1]:font-bold [&_h2]:mb-3 [&_h2]:text-3xl [&_h2]:font-bold [&_h3]:mb-3 [&_h3]:text-2xl [&_h3]:font-semibold [&_h4]:mb-2 [&_h4]:text-xl [&_h4]:font-semibold [&_h5]:mb-2 [&_h5]:text-lg [&_h5]:font-semibold [&_h6]:mb-2 [&_h6]:text-base [&_h6]:font-semibold [&_hr]:my-6 [&_hr]:border-slate-300 dark:[&_hr]:border-slate-600 [&_li]:mb-2 [&_ol]:mb-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:mb-4 [&_pre]:mb-4 [&_pre]:overflow-x-auto [&_pre]:rounded-2xl [&_pre]:bg-slate-900 [&_pre]:p-4 [&_pre]:text-slate-100 dark:[&_pre]:bg-slate-950 [&_strong]:font-bold [&_ul]:mb-4 [&_ul]:list-disc [&_ul]:pl-6"
      />
    </div>
  );
};

export default TextEditor;
