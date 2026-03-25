import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { createDocumentProcessingManager, normalizeDocumentRuntimeState } from '../services/documentProcessing.js';

const createdDirs = [];

const noopLogger = {
  log() {},
  warn() {},
  error() {},
};

const createBlocks = (pageNumber) => [
  {
    text: `Page ${pageNumber} content`,
    label: 'MAIN_TEXT',
    box_2d: [0, 0, 1000, 1000],
  },
];

const createMetadata = ({ docId, pages }) => ({
  id: docId,
  name: 'sample.pdf',
  type: 'file',
  parentId: null,
  createdAt: Date.now(),
  uploadDate: Date.now(),
  status: 'processing',
  modelUsed: 'gemini-flash-latest',
  processingMode: 'ocr',
  removeReferences: true,
  pagesPerBatch: 1,
  totalPages: pages.length,
  processedPages: 0,
  failedPages: 0,
  pages,
});

const createPage = (docId, pageNumber, overrides = {}) => ({
  pageNumber,
  imageUrl: `/api/data/${docId}/page_${pageNumber}.png`,
  blocks: [],
  status: 'pending',
  errorDismissed: false,
  retryCount: 0,
  lastError: '',
  nextRetryAt: null,
  lastAttemptAt: null,
  ...overrides,
});

const createFixture = async (metadata) => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ocrai-doc-processing-'));
  createdDirs.push(dataDir);
  const docDir = path.join(dataDir, metadata.id);
  await fs.mkdir(docDir, { recursive: true });

  await Promise.all(metadata.pages.map((page) =>
    fs.writeFile(path.join(docDir, path.basename(page.imageUrl)), 'image-bytes')
  ));
  await fs.writeFile(path.join(docDir, 'metadata.json'), JSON.stringify(metadata, null, 2));

  return { dataDir, docDir };
};

const readMetadata = async (docDir) =>
  JSON.parse(await fs.readFile(path.join(docDir, 'metadata.json'), 'utf-8'));

const createManager = (dataDir, processPage, config = {}) =>
  createDocumentProcessingManager({
    dataDir,
    resolveDocumentDir: (docId) => path.join(dataDir, docId),
    processPage,
    blocksToMarkdown: (blocks) => blocks.map((block) => block.text).join('\n'),
    logger: noopLogger,
    config: {
      maxRetries: 3,
      retryBaseDelayMs: 5,
      retryMaxDelayMs: 10,
      readMetadataRetries: 2,
      readMetadataRetryDelayMs: 5,
      initialReadDelayMs: 0,
      ...config,
    },
  });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

afterEach(async () => {
  await Promise.all(createdDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe('document processing manager', () => {
  it('treats dismissed page errors as resolved in document totals', () => {
    const doc = createMetadata({
      docId: 'doc-dismissed-error',
      pages: [
        createPage('doc-dismissed-error', 1, {
          status: 'error',
          errorDismissed: true,
          lastError: '400: Blank page',
        }),
        createPage('doc-dismissed-error', 2, {
          status: 'completed',
          blocks: createBlocks(2),
        }),
      ],
    });

    normalizeDocumentRuntimeState(doc);

    expect(doc.status).toBe('ready');
    expect(doc.processedPages).toBe(1);
    expect(doc.failedPages).toBe(0);
    expect(doc.pages[0].errorDismissed).toBe(true);
  });

  it('persists retry attempts and eventually completes after a retryable AI error', async () => {
    const docId = 'doc-retry-success';
    const metadata = createMetadata({
      docId,
      pages: [createPage(docId, 1)],
    });
    const { dataDir, docDir } = await createFixture(metadata);

    let attempts = 0;
    const manager = createManager(dataDir, async ({ pageNumber }) => {
      attempts += 1;
      if (attempts < 3) {
        const error = new Error('429 rate limit reached');
        error.status = 429;
        throw error;
      }

      return createBlocks(pageNumber);
    });

    await manager.processDocumentBackground(docId);

    const stored = await readMetadata(docDir);
    expect(attempts).toBe(3);
    expect(stored.status).toBe('ready');
    expect(stored.processedPages).toBe(1);
    expect(stored.failedPages).toBe(0);
    expect(stored.pages[0].status).toBe('completed');
    expect(stored.pages[0].retryCount).toBe(0);
    expect(stored.pages[0].lastError).toBe('');
    await expect(fs.readFile(path.join(docDir, 'page_1.md'), 'utf-8')).resolves.toContain('Page 1 content');
  });

  it('does not count terminal page errors as processed', async () => {
    const docId = 'doc-terminal-error';
    const metadata = createMetadata({
      docId,
      pages: [createPage(docId, 1)],
    });
    const { dataDir, docDir } = await createFixture(metadata);

    const manager = createManager(
      dataDir,
      async () => {
        const error = new Error('Bad request');
        error.status = 400;
        throw error;
      },
      { maxRetries: 0 }
    );

    await manager.processDocumentBackground(docId);

    const stored = await readMetadata(docDir);
    expect(stored.status).toBe('error');
    expect(stored.processedPages).toBe(0);
    expect(stored.failedPages).toBe(1);
    expect(stored.pages[0].status).toBe('error');
    expect(stored.pages[0].lastError).toContain('400: Bad request');
    await expect(fs.readFile(path.join(docDir, 'page_1.md'), 'utf-8')).rejects.toThrow();
  });

  it('resumes pending documents automatically from persisted page state', async () => {
    const docId = 'doc-resume';
    const metadata = createMetadata({
      docId,
      pages: [
        createPage(docId, 1, {
          status: 'processing',
          retryCount: 1,
          lastError: '429: rate limit reached',
          nextRetryAt: Date.now() - 1_000,
        }),
      ],
    });
    const { dataDir, docDir } = await createFixture(metadata);

    const manager = createManager(dataDir, async ({ pageNumber }) => createBlocks(pageNumber));

    await manager.resumePendingDocuments();

    const stored = await readMetadata(docDir);
    expect(stored.status).toBe('ready');
    expect(stored.processedPages).toBe(1);
    expect(stored.failedPages).toBe(0);
    expect(stored.pages[0].status).toBe('completed');
    expect(stored.pages[0].retryCount).toBe(0);
  });

  it('tracks mixed completion and failure across pages', async () => {
    const docId = 'doc-mixed-result';
    const metadata = createMetadata({
      docId,
      pages: [createPage(docId, 1), createPage(docId, 2)],
    });
    const { dataDir, docDir } = await createFixture(metadata);

    const manager = createManager(
      dataDir,
      async ({ pageNumber }) => {
        if (pageNumber === 2) {
          const error = new Error('Unsupported input');
          error.status = 400;
          throw error;
        }

        return createBlocks(pageNumber);
      },
      { maxRetries: 0 }
    );

    await manager.processDocumentBackground(docId);

    const stored = await readMetadata(docDir);
    expect(stored.status).toBe('error');
    expect(stored.processedPages).toBe(1);
    expect(stored.failedPages).toBe(1);
    expect(stored.pages[0].status).toBe('completed');
    expect(stored.pages[1].status).toBe('error');
  });

  it.each([1, 2, 5, 10])('processes pages in parallel up to pagesPerBatch=%s without duplicate attempts', async (pagesPerBatch) => {
    const docId = `doc-batch-${pagesPerBatch}`;
    const pageCount = 10;
    const metadata = createMetadata({
      docId,
      pages: Array.from({ length: pageCount }, (_, index) => createPage(docId, index + 1)),
    });
    metadata.pagesPerBatch = pagesPerBatch;

    const { dataDir, docDir } = await createFixture(metadata);

    const attemptsByPage = new Map();
    let inFlight = 0;
    let maxInFlight = 0;

    const manager = createManager(
      dataDir,
      async ({ pageNumber }) => {
        attemptsByPage.set(pageNumber, (attemptsByPage.get(pageNumber) ?? 0) + 1);
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);

        await sleep(pageNumber % 2 === 0 ? 5 : 25);

        inFlight -= 1;
        return createBlocks(pageNumber);
      },
      { maxRetries: 0 }
    );

    await manager.processDocumentBackground(docId);

    const stored = await readMetadata(docDir);
    expect(maxInFlight).toBe(Math.min(pagesPerBatch, pageCount));
    expect(Array.from(attemptsByPage.values())).toEqual(Array(pageCount).fill(1));
    expect(stored.status).toBe('ready');
    expect(stored.processedPages).toBe(pageCount);
    expect(stored.failedPages).toBe(0);
  });

  it('persists blank-page classifications returned by the processor', async () => {
    const docId = 'doc-blank-page';
    const metadata = createMetadata({
      docId,
      pages: [createPage(docId, 1)],
    });
    const { dataDir, docDir } = await createFixture(metadata);

    const manager = createManager(dataDir, async () => ({
      blankPage: true,
      blocks: [],
    }));

    await manager.processDocumentBackground(docId);

    const stored = await readMetadata(docDir);
    expect(stored.status).toBe('ready');
    expect(stored.processedPages).toBe(1);
    expect(stored.failedPages).toBe(0);
    expect(stored.pages[0].status).toBe('completed');
    expect(stored.pages[0].blankPage).toBe(true);
    expect(stored.pages[0].blocks).toEqual([]);
  });
});
