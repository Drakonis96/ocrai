import { PageData, BlockLabel } from "../types";
// @ts-ignore
import JSZip from 'jszip';
import { jsPDF } from 'jspdf';
import {
  extractHeadingsFromRichHtml,
  generateRichHtmlDocument,
  markdownToPlainText,
  markdownToRichTextHtml,
  toEpubXhtml,
} from './richText';
import { downloadBlob } from './download';

/**
 * Cleans the content of a text block:
 * 1. Rejoins hyphenated words split across lines (e.g., "exam-\nple" -> "example").
 * 2. Replaces internal line breaks with spaces to create continuous flow.
 * 3. Preserves double newlines (paragraph breaks) if they exist within the block.
 * 4. Normalizes whitespace.
 */
const cleanBlockContent = (text: string): string => {
  if (!text) return "";

  // 1. Fix Hyphenation: "exam-\nple" -> "example"
  // Look for hyphen at the end of a line (ignoring trailing spaces on that line)
  // We replace hyphen+newline(s)+indentation with nothing.
  let cleaned = text.replace(/-\s*[\r\n]+\s*/g, '');

  // 2. Preserve Paragraphs inside block
  // Sometimes a single block contains multiple paragraphs. We temporarily mark them.
  cleaned = cleaned.replace(/(\r\n|\n|\r){2,}/g, '___PARAGRAPH_BREAK___');

  // 3. Remove single Line Breaks: "Line one\nLine two" -> "Line one Line two"
  cleaned = cleaned.replace(/[\r\n]+/g, ' ');

  // 4. Restore paragraphs
  cleaned = cleaned.replace(/___PARAGRAPH_BREAK___/g, '\n\n');

  // 5. Normalize spaces: Split by paragraph, trim each, join back
  return cleaned
    .split('\n\n')
    .map(p => p.replace(/\s+/g, ' ').trim())
    .join('\n\n');
};

/**
 * Reconstructs the "Clean Transcript" by:
 * 1. Concatenating blocks that match the allowed labels.
 * 2. Inserting TITLE blocks in their logical position.
 */
export const reconstructCleanText = (
  pages: PageData[], 
  includeLabels: BlockLabel[] = [BlockLabel.TITLE, BlockLabel.MAIN_TEXT]
): string => {
  let cleanText = "";

  pages.forEach((page) => {
    // Sort blocks by vertical position (ymin) then horizontal (xmin) to ensure reading order
    // box_2d is [ymin, xmin, ymax, xmax]
    const sortedBlocks = [...page.blocks].sort((a, b) => {
      const boxA = a.box_2d || [0, 0, 0, 0];
      const boxB = b.box_2d || [0, 0, 0, 0];
      
      // If lines are significantly different in Y (> 10 normalized units), sort by Y
      if (Math.abs(boxA[0] - boxB[0]) > 10) { 
         return boxA[0] - boxB[0];
      }
      return boxA[1] - boxB[1]; // Same line, sort left to right
    });

    sortedBlocks.forEach((block) => {
      // Filter based on user selection
      if (!includeLabels.includes(block.label)) return;

      if (block.label === BlockLabel.TITLE) {
        // Titles are distinct sections
        const processedTitle = cleanBlockContent(block.text);
        if (processedTitle) {
          cleanText += `\n\n# ${processedTitle}\n\n`;
        }
      } else {
        // Treat everything else (MAIN_TEXT, HEADER, FOOTNOTE, etc.) as standard paragraphs
        // if the user has opted to include them.
        const processed = cleanBlockContent(block.text);
        if (processed) {
          cleanText += `${processed}\n\n`;
        }
      }
    });
  });

  // Post-processing to clean up excessive newlines (more than 2)
  return cleanText.replace(/\n{3,}/g, '\n\n').trim();
};

export const generateMarkdown = (text: string): Blob => {
  return new Blob([text], { type: 'text/markdown' });
};

export const generatePlainText = (text: string): Blob => {
  return new Blob([markdownToPlainText(text)], { type: 'text/plain;charset=utf-8' });
};

export const generateHTML = (text: string, title: string): Blob => {
  return new Blob([generateRichHtmlDocument(text, title)], { type: 'text/html;charset=utf-8' });
};

export const generateEPUB = async (text: string, title: string): Promise<Blob> => {
  const zip = new JSZip();
  const richHtml = markdownToRichTextHtml(text);
  const headings = extractHeadingsFromRichHtml(richHtml);
  const xhtmlBody = toEpubXhtml(richHtml, title);

  // 1. mimetype (must be first, no compression)
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });

  // 2. META-INF/container.xml
  zip.folder("META-INF").file("container.xml", `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
   <rootfiles>
      <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
   </rootfiles>
</container>`);

  let navPoints = "";
  let playOrder = 1;
  headings.forEach((heading) => {
    navPoints += `
        <navPoint id="navPoint-${playOrder}" playOrder="${playOrder}">
          <navLabel><text>${heading.title}</text></navLabel>
          <content src="content.xhtml#${heading.id}"/>
        </navPoint>`;
    playOrder += 1;
  });

  const uniqueId = `urn:uuid:${crypto.randomUUID()}`;

  // 3. OEBPS/content.opf
  const opfContent = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookId" version="2.0">
   <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
      <dc:title>${title}</dc:title>
      <dc:language>en</dc:language>
      <dc:identifier id="BookId" opf:scheme="UUID">${uniqueId}</dc:identifier>
      <dc:creator opf:role="aut">DocuClean AI</dc:creator>
   </metadata>
   <manifest>
      <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
      <item id="content" href="content.xhtml" media-type="application/xhtml+xml"/>
   </manifest>
   <spine toc="ncx">
      <itemref idref="content"/>
   </spine>
</package>`;

  // 4. OEBPS/toc.ncx
  const ncxContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE ncx PUBLIC "-//NISO//DTD ncx 2005-1//EN" "http://www.daisy.org/z3986/2005/ncx-2005-1.dtd">
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
   <head>
      <meta name="dtb:uid" content="${uniqueId}"/>
      <meta name="dtb:depth" content="1"/>
      <meta name="dtb:totalPageCount" content="0"/>
      <meta name="dtb:maxPageNumber" content="0"/>
   </head>
   <docTitle><text>${title}</text></docTitle>
   <navMap>
      ${navPoints || `<navPoint id="navPoint-1" playOrder="1"><navLabel><text>Start</text></navLabel><content src="content.xhtml"/></navPoint>`}
   </navMap>
</ncx>`;

  // 5. OEBPS/content.xhtml
  const xhtmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <title>${title}</title>
  <style type="text/css">
    body { font-family: serif; line-height: 1.6; margin: 2em; }
    h1, h2, h3 { font-weight: bold; margin-top: 1.5em; page-break-after: avoid; }
    p, li, blockquote { margin-bottom: 1em; text-align: justify; }
    ul, ol { padding-left: 1.5em; }
    blockquote { border-left: 3px solid #888; margin-left: 0; padding-left: 1em; }
    code { font-family: monospace; }
    pre { white-space: pre-wrap; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  ${xhtmlBody}
</body>
</html>`;

  const oebps = zip.folder("OEBPS");
  oebps.file("content.opf", opfContent);
  oebps.file("toc.ncx", ncxContent);
  oebps.file("content.xhtml", xhtmlContent);

  return await zip.generateAsync({ type: "blob", mimeType: "application/epub+zip" });
};

export const downloadPDF = async (text: string, title: string, filename: string): Promise<void> => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('PDF export is only available in the browser.');
  }

  const container = document.createElement('div');
  container.innerHTML = generateRichHtmlDocument(text, title);
  container.style.left = '-99999px';
  container.style.position = 'fixed';
  container.style.top = '0';
  container.style.width = '794px';
  document.body.appendChild(container);

  try {
    const content = container.querySelector('main');
    if (!content) {
      throw new Error('Unable to prepare document content for PDF export.');
    }

    const pdf = new jsPDF({
      format: 'a4',
      unit: 'pt',
    });

    await pdf.html(content as HTMLElement, {
      autoPaging: 'text',
      html2canvas: {
        backgroundColor: '#ffffff',
        scale: 0.7,
      },
      margin: [36, 36, 36, 36],
      width: 523,
      windowWidth: 794,
      x: 36,
      y: 36,
    });

    downloadBlob(pdf.output('blob'), filename);
  } finally {
    document.body.removeChild(container);
  }
};
