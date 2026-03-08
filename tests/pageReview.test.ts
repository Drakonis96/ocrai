import { describe, expect, it } from 'vitest';
import { BlockLabel, DocumentData, PageData } from '../types';
import { getIssuePageIndexes, getPageIssueType, pageHasTranscription } from '../utils/pageReview';

const buildPage = (overrides: Partial<PageData> = {}): PageData => ({
  pageNumber: 1,
  imageUrl: '/api/data/doc-1/page_1.png',
  blocks: [],
  status: 'completed',
  errorDismissed: false,
  retryCount: 0,
  lastError: '',
  nextRetryAt: null,
  lastAttemptAt: null,
  ...overrides,
});

const buildDocument = (pages: PageData[]): DocumentData => ({
  id: 'doc-1',
  name: 'sample.pdf',
  type: 'file',
  parentId: null,
  createdAt: Date.now(),
  uploadDate: Date.now(),
  pages,
  status: 'ready',
  modelUsed: 'gemini-flash-latest',
  totalPages: pages.length,
  processedPages: pages.filter((page) => page.status === 'completed').length,
  failedPages: pages.filter((page) => page.status === 'error').length,
});

describe('page review helpers', () => {
  it('detects visible errors and blank completed pages as issues', () => {
    const doc = buildDocument([
      buildPage({
        status: 'error',
        lastError: '400: OCR failed',
      }),
      buildPage({
        blocks: [{ id: 'b-1', text: '', label: BlockLabel.MAIN_TEXT, box_2d: [0, 0, 1, 1] }],
      }),
      buildPage({
        blocks: [{ id: 'b-2', text: 'Some text', label: BlockLabel.MAIN_TEXT, box_2d: [0, 0, 1, 1] }],
      }),
    ]);

    expect(getPageIssueType(doc.pages[0])).toBe('error');
    expect(getPageIssueType(doc.pages[1])).toBe('blank');
    expect(getPageIssueType(doc.pages[2])).toBe(null);
    expect(getIssuePageIndexes(doc)).toEqual([0, 1]);
  });

  it('treats saved override text as valid transcription', () => {
    const page = buildPage();

    expect(pageHasTranscription(page)).toBe(false);
    expect(pageHasTranscription(page, '  manual transcription  ')).toBe(true);
  });

  it('ignores dismissed errors in issue navigation', () => {
    const doc = buildDocument([
      buildPage({
        status: 'error',
        errorDismissed: true,
        lastError: '400: OCR failed',
      }),
      buildPage({
        status: 'error',
        lastError: '500: Retry later',
      }),
    ]);

    expect(getIssuePageIndexes(doc)).toEqual([1]);
  });
});
