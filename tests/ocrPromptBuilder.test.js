import { describe, expect, it } from 'vitest';
import {
  buildOcrPrompt,
  OCR_LAYOUT_PROMPT,
  OCR_LAYOUT_PROMPT_NO_REFS,
} from '../services/ocrPromptBuilder.js';

describe('ocr prompt builder', () => {
  it('includes the mandatory paragraph and multi-column reconstruction rules in the default OCR prompt', () => {
    expect(OCR_LAYOUT_PROMPT).toContain('REAL PARAGRAPH BREAKS ONLY');
    expect(OCR_LAYOUT_PROMPT).toContain('JOIN WRAPPED LINES NATURALLY');
    expect(OCR_LAYOUT_PROMPT).toContain('RECONSTRUCT HYPHENATED WORDS');
    expect(OCR_LAYOUT_PROMPT).toContain('SINGLE-COLUMN REWRITE OF THE TEXT');
    expect(OCR_LAYOUT_PROMPT).toContain('PARAGRAPH DETECTION');
    expect(OCR_LAYOUT_PROMPT).toContain('MULTI-COLUMN READING ORDER');
    expect(OCR_LAYOUT_PROMPT).toContain('set "blankPage" to true');
    expect(OCR_LAYOUT_PROMPT).toContain('The text must remain in the original language of the document.');
  });

  it('adds citation-removal instructions only when removeReferences is enabled', () => {
    expect(OCR_LAYOUT_PROMPT).not.toContain('REMOVE IN-TEXT REFERENCES');
    expect(OCR_LAYOUT_PROMPT_NO_REFS).toContain('REMOVE IN-TEXT REFERENCES');
    expect(OCR_LAYOUT_PROMPT_NO_REFS).toContain('Remove in-text citations from this content.');
  });

  it('keeps the mandatory OCR rules when translation mode is requested', () => {
    const prompt = buildOcrPrompt({
      processingMode: 'translation',
      targetLanguage: 'Español',
      removeReferences: false,
    });

    expect(prompt).toContain('Extract the text and translate it into Español');
    expect(prompt).toContain('The text must be in Español.');
    expect(prompt).toContain('REAL PARAGRAPH BREAKS ONLY');
    expect(prompt).toContain('MULTI-COLUMN READING ORDER');
  });

  it('treats manual prompts as additive instructions instead of replacing the OCR rules', () => {
    const prompt = buildOcrPrompt({
      processingMode: 'manual',
      customPrompt: 'Also return titles in uppercase.',
      removeReferences: false,
    });

    expect(prompt).toContain('ADDITIONAL INSTRUCTIONS MODE');
    expect(prompt).toContain('ADDITIONAL USER INSTRUCTIONS');
    expect(prompt).toContain('Also return titles in uppercase.');
    expect(prompt).toContain('These instructions are additive only.');
    expect(prompt).toContain('REAL PARAGRAPH BREAKS ONLY');
    expect(prompt).toContain('RECONSTRUCT HYPHENATED WORDS');
    expect(prompt).toContain('MULTI-COLUMN READING ORDER');
  });
});
