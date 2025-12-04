import React from 'react';

interface TextEditorProps {
  text: string;
  onChange: (newText: string) => void;
  headerControls?: React.ReactNode;
}

const TextEditor: React.FC<TextEditorProps> = ({ text, onChange, headerControls }) => {
  return (
    <div className="h-full flex flex-col bg-white dark:bg-slate-800 transition-colors">
      <div className="p-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 flex justify-between items-center transition-colors">
        <div className="flex items-center space-x-4">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Clean Transcription</span>
          {headerControls}
        </div>
        <span className="text-xs text-slate-400 dark:text-slate-500 hidden sm:inline">Markdown Format Support</span>
      </div>
      <textarea
        className="flex-1 w-full h-full p-8 resize-none focus:outline-none font-serif text-lg leading-relaxed text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-800 placeholder-slate-400 dark:placeholder-slate-600 transition-colors"
        value={text}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
      />
    </div>
  );
};

export default TextEditor;