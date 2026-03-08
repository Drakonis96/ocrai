import React from 'react';

interface TextEditorProps {
  text: string;
  onChange: (newText: string) => void;
  headerControls?: React.ReactNode;
}

const TextEditor: React.FC<TextEditorProps> = ({ text, onChange, headerControls }) => {
  return (
    <div className="h-full flex flex-col bg-white dark:bg-slate-800 transition-colors">
      <div className="p-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 transition-colors">
        <div className="flex items-center space-x-4 flex-wrap gap-y-2">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Clean Transcription</span>
          {headerControls}
        </div>
      </div>
      <textarea
        className="flex-1 h-full w-full resize-none bg-white p-4 font-serif text-base leading-relaxed text-slate-800 transition-colors placeholder-slate-400 focus:outline-none dark:bg-slate-800 dark:text-slate-200 dark:placeholder-slate-600 sm:p-8 sm:text-lg"
        value={text}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
      />
    </div>
  );
};

export default TextEditor;
