import DOMPurify from 'dompurify';
import { marked } from 'marked';
import TurndownService from 'turndown';

const RICH_TEXT_ALLOWED_TAGS = [
  'a',
  'blockquote',
  'br',
  'code',
  'em',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'i',
  'li',
  'ol',
  'p',
  'pre',
  'strong',
  'ul',
];

const RICH_TEXT_ALLOWED_ATTR = ['href', 'target', 'rel'];

marked.setOptions({
  breaks: true,
  gfm: true,
});

const createTurndownService = () =>
  new TurndownService({
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    emDelimiter: '*',
    headingStyle: 'atx',
    strongDelimiter: '**',
  });

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const sanitizeRichTextHtml = (html: string) => {
  if (typeof window === 'undefined') {
    return html;
  }

  return DOMPurify.sanitize(html, {
    ALLOWED_ATTR: RICH_TEXT_ALLOWED_ATTR,
    ALLOWED_TAGS: RICH_TEXT_ALLOWED_TAGS,
  });
};

const normalizeWhitespace = (value: string) =>
  value.replace(/\u00a0/g, ' ').replace(/\n{3,}/g, '\n\n').trim();

const getDomParser = () => {
  if (typeof window !== 'undefined' && 'DOMParser' in window) {
    return new window.DOMParser();
  }

  return null;
};

const wrapHtmlDocument = (bodyHtml: string, title: string) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      color-scheme: light;
    }
    body {
      margin: 0;
      background: #f5f7fb;
      color: #0f172a;
      font-family: Georgia, "Times New Roman", serif;
    }
    main {
      max-width: 860px;
      margin: 0 auto;
      padding: 56px 48px 72px;
      background: #ffffff;
      box-sizing: border-box;
      min-height: 100vh;
    }
    h1, h2, h3, h4, h5, h6 {
      color: #0f172a;
      font-weight: 700;
      line-height: 1.2;
      margin: 1.5em 0 0.65em;
    }
    h1 { font-size: 2.1rem; }
    h2 { font-size: 1.8rem; }
    h3 { font-size: 1.5rem; }
    h4 { font-size: 1.25rem; }
    h5, h6 { font-size: 1.05rem; }
    p, li, blockquote {
      font-size: 1.05rem;
      line-height: 1.72;
    }
    p, ul, ol, pre, blockquote {
      margin: 0 0 1.1em;
    }
    ul, ol {
      padding-left: 1.5em;
    }
    blockquote {
      border-left: 4px solid #cbd5e1;
      color: #334155;
      padding-left: 1rem;
    }
    code {
      background: #e2e8f0;
      border-radius: 0.35rem;
      font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
      font-size: 0.92em;
      padding: 0.12em 0.35em;
    }
    pre {
      background: #0f172a;
      border-radius: 0.9rem;
      color: #e2e8f0;
      overflow-x: auto;
      padding: 1rem 1.1rem;
    }
    pre code {
      background: transparent;
      color: inherit;
      padding: 0;
    }
    strong {
      font-weight: 700;
    }
    em {
      font-style: italic;
    }
    a {
      color: #2563eb;
      text-decoration: underline;
    }
    hr {
      border: 0;
      border-top: 1px solid #cbd5e1;
      margin: 2rem 0;
    }
    @media print {
      body {
        background: #ffffff;
      }
      main {
        max-width: none;
        min-height: auto;
        padding: 0;
      }
    }
  </style>
</head>
<body>
  <main>
    ${bodyHtml}
  </main>
</body>
</html>`;

export const markdownToRichTextHtml = (markdown: string) => {
  const rawHtml = marked.parse(markdown ?? '') as string;
  return sanitizeRichTextHtml(rawHtml);
};

export const markdownToEditorHtml = (markdown: string) => {
  const html = markdownToRichTextHtml(markdown);
  return html.trim() ? html : '<p><br></p>';
};

export const richTextHtmlToMarkdown = (html: string) => {
  const sanitizedHtml = sanitizeRichTextHtml(html);
  const turndownService = createTurndownService();
  return normalizeWhitespace(turndownService.turndown(sanitizedHtml));
};

export const richTextHtmlToPlainText = (html: string) => {
  const parser = getDomParser();
  if (!parser) {
    return normalizeWhitespace(html.replace(/<[^>]+>/g, ' '));
  }

  const doc = parser.parseFromString(`<body>${sanitizeRichTextHtml(html)}</body>`, 'text/html');
  const serialize = (node: Node, listContext?: { type: 'ol' | 'ul'; index: number }) => {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent ?? '';
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return '';
    }

    const element = node as HTMLElement;
    const tagName = element.tagName.toLowerCase();

    if (tagName === 'br') {
      return '\n';
    }

    if (tagName === 'hr') {
      return '\n\n';
    }

    if (tagName === 'ul' || tagName === 'ol') {
      let childIndex = 1;
      const items = Array.from(element.childNodes)
        .map((child) => {
          if (!(child instanceof HTMLElement) || child.tagName.toLowerCase() !== 'li') {
            return '';
          }

          const text = serialize(child, { type: tagName as 'ol' | 'ul', index: childIndex });
          childIndex += 1;
          return text;
        })
        .filter(Boolean)
        .join('\n');

      return `${items}\n\n`;
    }

    if (tagName === 'li') {
      const prefix = listContext?.type === 'ol' ? `${listContext.index}. ` : '• ';
      const content = Array.from(element.childNodes).map((child) => serialize(child)).join('').trim();
      return `${prefix}${content}`;
    }

    const content = Array.from(element.childNodes).map((child) => serialize(child)).join('');

    if (/^h[1-6]$/.test(tagName) || ['p', 'div', 'blockquote', 'pre'].includes(tagName)) {
      return `${content.trim()}\n\n`;
    }

    return content;
  };

  return normalizeWhitespace(Array.from(doc.body.childNodes).map((node) => serialize(node)).join(''));
};

export const markdownToPlainText = (markdown: string) =>
  richTextHtmlToPlainText(markdownToRichTextHtml(markdown));

export const generateRichHtmlDocument = (markdown: string, title: string) =>
  wrapHtmlDocument(markdownToRichTextHtml(markdown), title);

export const extractHeadingsFromRichHtml = (html: string) => {
  const parser = getDomParser();
  if (!parser) {
    return [];
  }

  const doc = parser.parseFromString(`<body>${sanitizeRichTextHtml(html)}</body>`, 'text/html');
  return Array.from(doc.body.querySelectorAll('h1, h2, h3')).map((heading, index) => ({
    id: `section-${index + 1}`,
    title: heading.textContent?.trim() || `Section ${index + 1}`,
    level: Number(heading.tagName.slice(1)),
  }));
};

export const toEpubXhtml = (html: string, title: string) => {
  const parser = getDomParser();
  if (!parser) {
    return `<h1>${escapeHtml(title)}</h1>${html}`;
  }

  const doc = parser.parseFromString(`<body>${sanitizeRichTextHtml(html)}</body>`, 'text/html');
  let headingIndex = 0;

  Array.from(doc.body.querySelectorAll('h1, h2, h3')).forEach((heading) => {
    headingIndex += 1;
    heading.setAttribute('id', `section-${headingIndex}`);
  });

  return doc.body.innerHTML
    .replace(/<br>/g, '<br />')
    .replace(/<hr>/g, '<hr />');
};
