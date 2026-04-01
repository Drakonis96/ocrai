const getExtractionInstruction = (processingMode, targetLanguage) => {
  if (processingMode === 'translation' && targetLanguage) {
    return `**TRANSLATION**: Extract the text and translate it into ${targetLanguage}. **DO NOT SUMMARIZE**. **DO NOT ADD COMMENTS**.`;
  }

  if (processingMode === 'manual') {
    return '**ADDITIONAL INSTRUCTIONS MODE**: Apply the extra user instructions included below, but never violate the mandatory paragraph reconstruction, reading order, blank-page detection, labeling, or JSON output rules.';
  }

  return '**LITERAL EXTRACTION ONLY**: Extract the text exactly as it appears in the image. **DO NOT TRANSLATE**. **DO NOT SUMMARIZE**. **DO NOT ADD COMMENTS**.';
};

const getLanguageInstruction = (processingMode, targetLanguage) => {
  if (processingMode === 'translation' && targetLanguage) {
    return `**TARGET LANGUAGE**: The text must be in ${targetLanguage}.`;
  }

  if (processingMode === 'manual') {
    return '**LANGUAGE HANDLING**: Keep the original language unless the additional user instructions explicitly request a different target language.';
  }

  return '**ORIGINAL LANGUAGE**: The text must remain in the original language of the document.';
};

const getReferenceInstruction = (removeReferences) => {
  if (!removeReferences) {
    return '\n8.  **KEEP IN-TEXT REFERENCES**: Preserve citations and references exactly as written in the source text.';
  }

  return `
8.  **REMOVE IN-TEXT REFERENCES**: When extracting MAIN_TEXT blocks, omit in-text academic citations and references such as:
    - (Author, Year)
    - (Author, Year: page)
    - (Author, Year: p. XX)
    - (SURNAME, 1908: p. 104)
    - (Surname, 1908:104)
    - (Author et al., Year)
    - (Author & Author, Year)
    - Multiple authors in parentheses
    - Similar APA, MLA, Chicago, or academic citation formats in parentheses
    Skip these references entirely and keep the remaining sentence flowing naturally.`;
};

const getAdditionalInstructionsSection = (processingMode, customPrompt) => {
  if (processingMode !== 'manual' || !customPrompt?.trim()) {
    return '';
  }

  return `

**ADDITIONAL USER INSTRUCTIONS**:
${customPrompt.trim()}

These instructions are additive only. If they conflict with the mandatory OCR and layout rules above, follow the mandatory OCR and layout rules.`;
};

const getColumnInstructions = (singleColumn) => {
  if (singleColumn) {
    return `10. **SINGLE COLUMN MODE**: This image is a pre-cropped single column extracted from a multi-column page. The entire visible area is ONE column of text. Read it straight from top to bottom. Do NOT attempt to detect or split into multiple columns — there is only one.`;
  }

  return `10. **MULTI-COLUMN READING ORDER IS MANDATORY**: Before transcribing, decide whether the page has one column or multiple separated columns. If multiple columns exist, finish the entire leftmost column from top to bottom before moving to the next column on the right. Never read horizontally across the full page width.
11. **DO NOT CROSS COLUMN GUTTERS**: A wide vertical blank gutter or clearly separated text region means separate columns. Do not merge text from adjacent columns into one paragraph, and never continue a sentence across the gutter.`;
};

const getColumnTaskStep = (singleColumn) => {
  if (singleColumn) {
    return '1.  **Read Top to Bottom**: This is a single pre-cropped column. Read the text from top to bottom without looking for additional columns.';
  }

  return '1.  **Determine Reading Order**: Identify the correct reading order before transcribing. Detect the column structure first. Respect true paragraph flow, indentation cues, and multi-column layout. When columns exist, finish the full left column before moving to the next column on the right.';
};

export const buildOcrPrompt = ({
  processingMode = 'ocr',
  targetLanguage = '',
  customPrompt = '',
  removeReferences = true,
  singleColumn = false,
} = {}) => `
You are a highly advanced Document Layout Analysis AI. Your task is to perform OCR and layout segmentation on the provided document image.

**CRITICAL INSTRUCTIONS:**
1.  ${getExtractionInstruction(processingMode, targetLanguage)}
2.  ${getLanguageInstruction(processingMode, targetLanguage)}
3.  **JSON ONLY**: Output strictly valid JSON. Do not include markdown formatting (like \`\`\`json) or conversational text.
4.  **REAL PARAGRAPH BREAKS ONLY**: Never insert a line break simply because the source text wrapped onto a new visual line. Insert a new line only when the source document shows a true paragraph break.
5.  **JOIN WRAPPED LINES NATURALLY**: If a sentence continues on the next visual line within the same paragraph, merge it into one continuous sentence with normal spacing.
6.  **RECONSTRUCT HYPHENATED WORDS**: If a word is split by a hyphen at the end of a line and continues on the next line, remove both the line break and the hyphen, then reconstruct the full word.
7.  **SINGLE-COLUMN REWRITE OF THE TEXT**: Do not reproduce the exact visual layout, line wrapping, or page-width text flow inside the transcription. Rewrite the content as if it were a clean single-column document while preserving the true paragraph structure.
${getReferenceInstruction(removeReferences)}
9.  **INDENTATION DEFINES PARAGRAPHS**: Treat visible first-line indentation as a decisive paragraph cue. If a line begins noticeably to the right of the previous paragraph's left margin, start a new paragraph before that line. Never merge an indented line into the previous paragraph.
${getColumnInstructions(singleColumn)}

**Task Steps**:
0.  **Classify Blank Pages**: If the page is blank or only contains scanning artifacts, stains, or edge noise without readable content, set "blankPage" to true and return an empty "blocks" array.
${getColumnTaskStep(singleColumn)}
2.  **Extract Text**: Read all text in the image while enforcing the paragraph and line-reconstruction rules above.
3.  **Segment Blocks**: Group continuous text into coherent paragraphs or logical blocks. Start a new paragraph block whenever the source shows a true paragraph break or a new indented paragraph. Do not split a single paragraph into multiple MAIN_TEXT blocks unless necessary.
4.  **Label Blocks**: Assign one of the following labels to each block:
    *   **TITLE**: Titles, subtitles, section headers (usually larger font, bold, centered, or short lines at the start of sections).
    *   **MAIN_TEXT**: The primary body content of the document.${removeReferences ? ' Remove in-text citations from this content.' : ''}
    *   **FOOTNOTE**: Notes usually at the bottom of the page, often starting with small numbers/superscripts (1, *, etc.) or containing bibliographic references (Ibid, Op. cit.).
    *   **HEADER**: Repeated text at the very top (page numbers, chapter titles).
    *   **FOOTER**: Repeated text at the very bottom (page numbers, book titles).
    *   **CAPTION**: Text describing images or tables.
5.  **Handling Ambiguity**: If no clear title exists, label as MAIN_TEXT. Be strict about separating HEADER and FOOTER from MAIN_TEXT.${singleColumn ? '' : ' When layout cues conflict, column order takes priority for reading order and indentation takes priority for paragraph breaks.'} Keep layout coordinates in "box_2d", but do not let visual line wrapping leak into the block text.

**Output Format**:
Return a valid JSON object with the following structure:
{
  "blankPage": false,
  "blocks": [
    {
      "text": "The content of the block...",
      "label": "MAIN_TEXT",
      "box_2d": [ymin, xmin, ymax, xmax]
    },
    ...
  ]
}
The "box_2d" should be normalized coordinates (0-1000) if possible, or 0-1 range.${getAdditionalInstructionsSection(processingMode, customPrompt)}
`;

export const OCR_LAYOUT_PROMPT = buildOcrPrompt({ processingMode: 'ocr', removeReferences: false });
export const OCR_LAYOUT_PROMPT_NO_REFS = buildOcrPrompt({ processingMode: 'ocr', removeReferences: true });
