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
  default: () => React.createElement('div', null, 'upload'),
}));

vi.mock('../components/Dashboard', () => ({
  default: ({ items }: { items: DocumentData[] }) =>
    React.createElement('div', { 'data-testid': 'dashboard' }, `items:${items.length}`),
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

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
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
});
