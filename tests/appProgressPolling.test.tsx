// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DocumentData } from '../types';

const getAllItems = vi.fn();
const saveItem = vi.fn();
const deleteItem = vi.fn();
const nukeDB = vi.fn();
const getModels = vi.fn();
const addModel = vi.fn();
const removeModel = vi.fn();
const getPrompts = vi.fn();
const createPrompt = vi.fn();
const updatePrompt = vi.fn();
const deletePrompt = vi.fn();
const getLabels = vi.fn();
const createLabel = vi.fn();
const deleteLabel = vi.fn();
const getLabelingSettings = vi.fn();
const updateLabelingSettings = vi.fn();
const getOcrSettings = vi.fn();
const updateOcrSettings = vi.fn();
const autodetectProviderModels = vi.fn();
const alertMock = vi.fn();

vi.mock('../utils/storage', () => ({
  getAllItems,
  saveItem,
  deleteItem,
  nukeDB,
}));

vi.mock('../utils/modelStorage', () => ({
  DEFAULT_OCR_SETTINGS: {
    provider: 'gemini',
    selectedModelId: 'gemini-flash-latest',
    lmStudio: { host: '127.0.0.1', port: 1234 },
    ollama: { host: '127.0.0.1', port: 11434 },
  },
  DEFAULT_MODELS: [
    { id: 'gemini-flash-latest', name: 'Gemini Flash Latest', description: 'Balanced', provider: 'gemini' },
  ],
  getModels,
  addModel,
  removeModel,
  getProviderModels: (models: Array<{ provider?: string }>, provider: string) =>
    models.filter((model) => (model.provider ?? 'gemini') === provider),
  sortModelsForPreferredSelection: (models: unknown[]) => models,
}));

vi.mock('../services/ocrSettingsService', () => ({
  getOcrSettings,
  updateOcrSettings,
  autodetectProviderModels,
}));

vi.mock('../services/promptService', () => ({
  getPrompts,
  createPrompt,
  updatePrompt,
  deletePrompt,
}));

vi.mock('../services/labelingService', () => ({
  getLabels,
  createLabel,
  deleteLabel,
  getLabelingSettings,
  updateLabelingSettings,
}));

vi.mock('../components/Login', () => ({
  Login: () => React.createElement('div', null, 'login'),
}));

vi.mock('../components/UploadView', () => ({
  default: ({ onFileSelect }: { onFileSelect: (files: FileList, options: {
    model: string;
    ocrProvider: string;
    processingMode: 'ocr';
    removeReferences: boolean;
    pagesPerBatch: number;
    splitColumns: boolean;
  }) => Promise<void> }) => React.createElement('button', {
    type: 'button',
    onClick: async () => {
      const file = new File([new Uint8Array([37, 80, 68, 70])], 'upload.pdf', { type: 'application/pdf' });
      await onFileSelect({
        0: file,
        length: 1,
        item: (index: number) => (index === 0 ? file : null),
      } as unknown as FileList, {
        model: 'gemini-flash-latest',
        ocrProvider: 'gemini',
        processingMode: 'ocr',
        removeReferences: true,
        pagesPerBatch: 1,
        splitColumns: false,
      });
    },
  }, 'start upload'),
}));

vi.mock('../components/Dashboard', () => ({
  default: ({
    items,
    onNewUpload,
  }: {
    items: DocumentData[];
    onNewUpload: () => void;
  }) => React.createElement(
    'div',
    null,
    React.createElement('div', { 'data-testid': 'dashboard' }, `items:${items.length}`),
    React.createElement('button', { type: 'button', onClick: onNewUpload }, 'new upload')
  ),
}));

vi.mock('../components/Editor/EditorView', () => ({
  default: () => React.createElement('div', null, 'editor'),
}));

vi.mock('../components/SettingsModal', () => ({
  default: () => null,
}));

vi.mock('../components/IconActionButton', () => ({
  default: ({
    label,
    onClick,
    disabled,
  }: {
    label: string;
    onClick?: () => void;
    disabled?: boolean;
  }) => React.createElement('button', {
    type: 'button',
    'aria-label': label,
    onClick,
    disabled,
  }, label),
}));

vi.mock('../components/Icons', () => ({
  ArchiveIcon: () => null,
  AlertCircleIcon: () => null,
  CloseIcon: () => null,
  HomeIcon: () => null,
  LoaderIcon: () => null,
  LogoutIcon: () => null,
  MoonIcon: () => null,
  SettingsIcon: () => null,
  SunIcon: () => null,
  TrashIcon: () => null,
}));

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: {},
  getDocument: vi.fn(),
}));

vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({
  default: 'pdf-worker-url',
}));

const flushPromises = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

const processingDocument: DocumentData = {
  id: 'doc-processing',
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
  totalPages: 3,
  processedPages: 0,
  failedPages: 0,
  pages: [
    {
      pageNumber: 1,
      imageUrl: '/api/data/doc-processing/page_1.jpg',
      blocks: [],
      status: 'processing',
      errorDismissed: false,
      retryCount: 0,
      lastError: '',
      nextRetryAt: null,
      lastAttemptAt: null,
    },
  ],
};

describe('App processing polling', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    getAllItems.mockReset();
    getAllItems.mockResolvedValue([processingDocument]);
    saveItem.mockReset();
    getModels.mockReset();
    getModels.mockResolvedValue([{ id: 'gemini-flash-latest', name: 'Gemini Flash Latest', description: 'Balanced', provider: 'gemini' }]);
    getOcrSettings.mockReset();
    getOcrSettings.mockResolvedValue({
      provider: 'gemini',
      selectedModelId: 'gemini-flash-latest',
      lmStudio: { host: '127.0.0.1', port: 1234 },
      ollama: { host: '127.0.0.1', port: 11434 },
    });
    getPrompts.mockReset();
    getPrompts.mockResolvedValue([]);
    getLabels.mockReset();
    getLabels.mockResolvedValue([]);
    getLabelingSettings.mockReset();
    getLabelingSettings.mockResolvedValue({ autoLabelDocuments: false });

    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === '/api/check-auth') {
        return {
          ok: true,
          json: async () => ({ authenticated: true }),
        } as Response;
      }

      throw new Error(`Unexpected fetch: ${String(input)}`);
    }));
    vi.stubGlobal('alert', alertMock);
    alertMock.mockReset();

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });

    vi.stubGlobal('FileReader', class MockFileReader {
      result = 'data:application/pdf;base64,JVBERi0x';

      onload: ((this: FileReader, ev: ProgressEvent<FileReader>) => unknown) | null = null;

      onerror: ((this: FileReader, ev: ProgressEvent<FileReader>) => unknown) | null = null;

      readAsDataURL() {
        if (this.onload) {
          this.onload.call(this as unknown as FileReader, new ProgressEvent('load'));
        }
      }
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('keeps polling while documents stay in processing even if each refresh is identical', async () => {
    const { default: App } = await import('../App');

    await act(async () => {
      root.render(React.createElement(App));
      await flushPromises();
    });

    expect(getAllItems).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(9500);
      await flushPromises();
    });

    expect(getAllItems.mock.calls.length).toBeGreaterThanOrEqual(4);
  });

  it('shows per-document progress while uploaded PDFs are still being rasterized or processed', async () => {
    const { default: App } = await import('../App');
    getAllItems.mockResolvedValue([]);
    saveItem.mockImplementation(async (item: DocumentData) => ({
      ...item,
      status: 'uploading',
      sourceRenderStatus: 'processing',
      sourceRenderCompletedPages: 2,
      totalPages: 5,
      pages: Array.from({ length: 5 }, (_, index) => ({
        pageNumber: index + 1,
        imageUrl: index < 2 ? `/api/data/${item.id}/page_${index + 1}.jpg` : '',
        blocks: [],
        status: 'pending',
        errorDismissed: false,
        retryCount: 0,
        lastError: '',
        nextRetryAt: null,
        lastAttemptAt: null,
      })),
    }));

    await act(async () => {
      root.render(React.createElement(App));
      await flushPromises();
    });

    const openUploadButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'new upload');
    expect(openUploadButton).not.toBeUndefined();

    await act(async () => {
      openUploadButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushPromises();
    });

    const startUploadButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'start upload');
    expect(startUploadButton).not.toBeUndefined();

    await act(async () => {
      startUploadButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushPromises();
    });

    expect(saveItem).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('items:1');
    expect(container.textContent).toContain('Processing document...');
    expect(container.textContent).toContain('upload.pdf');
    expect(container.textContent).toContain('Rendering page images');
    expect(container.textContent).toContain('2 / 5 pages');
    expect(container.textContent).toContain('40%');
    expect(container.querySelector('[data-testid="upload-progress-shell"]')?.getAttribute('data-mode')).toBe('panel');
    expect(alertMock).not.toHaveBeenCalled();
  });

  it('recovers documents that were queued server-side even if the save request errors client-side', async () => {
    const { default: App } = await import('../App');
    let recoveredDoc: DocumentData | null = null;

    getAllItems.mockImplementation(async () => (recoveredDoc ? [recoveredDoc] : []));
    saveItem.mockImplementation(async (item: DocumentData) => {
      recoveredDoc = {
        ...item,
        status: 'uploading',
        sourceRenderStatus: 'processing',
        sourceRenderCompletedPages: 1,
        totalPages: 4,
        pages: Array.from({ length: 4 }, (_, index) => ({
          pageNumber: index + 1,
          imageUrl: index === 0 ? `/api/data/${item.id}/page_${index + 1}.jpg` : '',
          blocks: [],
          status: 'pending',
          errorDismissed: false,
          retryCount: 0,
          lastError: '',
          nextRetryAt: null,
          lastAttemptAt: null,
        })),
      };

      throw new Error('Network error while reading the upload response');
    });

    await act(async () => {
      root.render(React.createElement(App));
      await flushPromises();
    });

    const openUploadButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'new upload');
    expect(openUploadButton).not.toBeUndefined();

    await act(async () => {
      openUploadButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushPromises();
    });

    const startUploadButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'start upload');
    expect(startUploadButton).not.toBeUndefined();

    await act(async () => {
      startUploadButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushPromises();
    });

    expect(saveItem).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('items:1');
    expect(container.textContent).toContain('upload.pdf');
    expect(container.textContent).toContain('1 / 4 pages');
    expect(container.querySelector('[data-testid="upload-progress-shell"]')?.getAttribute('data-mode')).toBe('panel');
    expect(alertMock).not.toHaveBeenCalled();
  });

  it('keeps visual progress moving when pages are already in Gemini processing', async () => {
    const { default: App } = await import('../App');

    getAllItems.mockResolvedValue([
      {
        ...processingDocument,
        id: 'doc-gemini-active',
        name: 'gemini-active.pdf',
        status: 'processing',
        sourceRenderStatus: 'completed',
        totalPages: 6,
        processedPages: 2,
        failedPages: 1,
        pages: [
          {
            pageNumber: 1,
            imageUrl: '/api/data/doc-gemini-active/page_1.jpg',
            blocks: [],
            status: 'completed',
            errorDismissed: false,
            retryCount: 0,
            lastError: '',
            nextRetryAt: null,
            lastAttemptAt: null,
          },
          {
            pageNumber: 2,
            imageUrl: '/api/data/doc-gemini-active/page_2.jpg',
            blocks: [],
            status: 'processing',
            errorDismissed: false,
            retryCount: 0,
            lastError: '',
            nextRetryAt: null,
            lastAttemptAt: null,
          },
        ],
      },
    ]);

    await act(async () => {
      root.render(React.createElement(App));
      await flushPromises();
    });

    expect(container.textContent).toContain('gemini-active.pdf');
    expect(container.textContent).toContain('Processing pages');
    expect(container.textContent).toContain('2 done, 1 in progress.');
    expect(container.textContent).toContain('4 / 6 pages');
    expect(container.querySelector('[data-testid="upload-progress-shell"]')?.getAttribute('data-mode')).toBe('panel');
  });
});
