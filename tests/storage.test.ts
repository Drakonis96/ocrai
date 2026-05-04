import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BlockLabel, type DocumentData } from '../types';
import { saveItem } from '../utils/storage';

const createJsonResponse = (payload: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  statusText: status === 200 ? 'OK' : 'Error',
  text: vi.fn().mockResolvedValue(JSON.stringify(payload)),
  json: vi.fn().mockResolvedValue(payload),
}) as unknown as Response;

const createDocument = (overrides: Partial<DocumentData> = {}): DocumentData => ({
  id: 'doc-1',
  name: 'example.pdf',
  type: 'file',
  parentId: null,
  createdAt: 1,
  uploadDate: 1,
  status: 'ready',
  modelUsed: 'model-a',
  totalPages: 2,
  processedPages: 2,
  failedPages: 0,
  pages: [
    {
      pageNumber: 1,
      imageUrl: '/api/data/doc-1/page_1.png',
      blocks: [{ id: 'block-1', text: 'Alpha', label: BlockLabel.MAIN_TEXT }],
      status: 'completed',
      errorDismissed: false,
    },
    {
      pageNumber: 2,
      imageUrl: '/api/data/doc-1/page_2.png',
      blocks: [{ id: 'block-2', text: 'Beta', label: BlockLabel.TITLE }],
      status: 'error',
      errorDismissed: true,
    },
  ],
  ...overrides,
});

describe('storage saveItem', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn(async () => createJsonResponse(createDocument()));
  });

  it('sends compact page payloads for existing document updates', async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    const document = createDocument({
      savedText: 'Edited text',
      pageSavedTexts: { 1: 'Edited page 1' },
    });

    await saveItem(document);

    const requestBody = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);

    expect(requestBody.savedText).toBe('Edited text');
    expect(requestBody.pageSavedTexts).toEqual({ 1: 'Edited page 1' });
    expect(requestBody.pages).toEqual([
      { pageNumber: 1, status: 'completed', errorDismissed: false },
      { pageNumber: 2, status: 'error', errorDismissed: true },
    ]);
    expect(requestBody.pages[0]).not.toHaveProperty('imageUrl');
    expect(requestBody.pages[0]).not.toHaveProperty('blocks');
  });

  it('keeps inline image upload data in the request body', async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    const document = createDocument({
      status: 'processing',
      totalPages: 1,
      processedPages: 0,
      pages: [
        {
          pageNumber: 1,
          imageUrl: 'data:image/png;base64,abc123',
          blocks: [],
          status: 'pending',
          errorDismissed: false,
        },
      ],
    });

    await saveItem(document, true);

    const requestBody = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);

    expect(requestBody.startProcessing).toBe(true);
    expect(requestBody.pages[0].imageUrl).toBe('data:image/png;base64,abc123');
  });
});