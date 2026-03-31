/** @vitest-environment jsdom */

import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { generateEPUB, generateHTML, generatePlainText } from '../utils/reconstruction';
import { markdownToPlainText, markdownToRichTextHtml, richTextHtmlToMarkdown } from '../utils/richText';

const SAMPLE_MARKDOWN = `# Title

Hello **world**

- One
- Two`;

describe('rich text helpers', () => {
  it('renders markdown as semantic html', () => {
    const html = markdownToRichTextHtml(SAMPLE_MARKDOWN);

    expect(html).toContain('<h1>Title</h1>');
    expect(html).toContain('<strong>world</strong>');
    expect(html).toContain('<li>One</li>');
    expect(html).toContain('<li>Two</li>');
  });

  it('converts rich html back to markdown', () => {
    const markdown = richTextHtmlToMarkdown('<h1>Title</h1><p>Hello <strong>world</strong></p><ul><li>One</li><li>Two</li></ul>');

    expect(markdown).toContain('# Title');
    expect(markdown).toContain('Hello **world**');
    expect(markdown).toMatch(/-\s+One/);
    expect(markdown).toMatch(/-\s+Two/);
  });

  it('strips markdown syntax from plain text output', async () => {
    const plainBlob = generatePlainText(SAMPLE_MARKDOWN);
    const plainText = await plainBlob.text();

    expect(markdownToPlainText(SAMPLE_MARKDOWN)).toContain('Hello world');
    expect(plainText).toContain('Title');
    expect(plainText).toContain('Hello world');
    expect(plainText).toContain('One');
    expect(plainText).not.toContain('# ');
    expect(plainText).not.toContain('**');
  });

  it('embeds formatted html in html export', async () => {
    const htmlBlob = generateHTML(SAMPLE_MARKDOWN, 'Sample');
    const html = await htmlBlob.text();

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<title>Sample</title>');
    expect(html).toContain('<h1>Title</h1>');
    expect(html).toContain('<strong>world</strong>');
  });

  it('creates a non-empty epub export', async () => {
    const epubBlob = await generateEPUB(SAMPLE_MARKDOWN, 'Sample');

    expect(epubBlob.type).toBe('application/epub+zip');
    expect(epubBlob.size).toBeGreaterThan(0);
  });

  it('uses ocrAI branding in epub metadata', async () => {
    const epubBlob = await generateEPUB(SAMPLE_MARKDOWN, 'Sample');
    const archive = await JSZip.loadAsync(await epubBlob.arrayBuffer());
    const opfContent = await archive.file('OEBPS/content.opf')?.async('string');

    expect(opfContent).toContain('<dc:creator opf:role="aut">ocrAI</dc:creator>');
    expect(opfContent).not.toContain('DocuClean AI');
    expect(opfContent).not.toContain('docucleanai');
  });
});
