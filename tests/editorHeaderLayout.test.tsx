// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import EditorView from '../components/Editor/EditorView';
import { reprocessPage } from '../services/geminiService';
import { BlockLabel, type DocumentData } from '../types';

vi.mock('../components/Editor/ImageViewer', () => ({
  default: () => React.createElement('div', null, 'image-viewer'),
}));

vi.mock('../components/Editor/TextEditor', () => ({
  default: () => React.createElement('div', null, 'text-editor'),
}));

vi.mock('../components/ProcessingOptionsSelector', () => ({
  default: () => React.createElement('div', null, 'processing-options'),
}));

vi.mock('../services/geminiService', () => ({
  reprocessPage: vi.fn(),
}));

const reprocessPageMock = vi.mocked(reprocessPage);

const buildDocument = (name: string): DocumentData => ({
  id: 'doc-long-name',
  name,
  type: 'file',
  parentId: null,
  createdAt: Date.now(),
  uploadDate: Date.now(),
  status: 'ready',
  modelUsed: 'gemini-flash-latest',
  processingMode: 'ocr',
  removeReferences: true,
  pagesPerBatch: 1,
  totalPages: 2,
  processedPages: 2,
  failedPages: 0,
  pages: [
    {
      pageNumber: 1,
      imageUrl: '/api/data/doc-long-name/page_1.jpg',
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
      imageUrl: '/api/data/doc-long-name/page_2.jpg',
      blocks: [],
      status: 'completed',
      errorDismissed: false,
      retryCount: 0,
      lastError: '',
      nextRetryAt: null,
      lastAttemptAt: null,
    },
  ],
});

const installMatchMedia = (matchesByQuery: Record<string, boolean>) => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn((query: string) => ({
      matches: matchesByQuery[query] ?? false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
};

describe('Editor header layout', () => {
  let container: HTMLDivElement;
  let root: Root;
  let alertMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    reprocessPageMock.mockReset();
    alertMock = vi.fn();
    vi.stubGlobal('alert', alertMock);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    vi.unstubAllGlobals();
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  it('uses a compact export sheet and keeps long titles truncated on compact layouts', async () => {
    installMatchMedia({
      '(max-width: 1023px)': true,
      '(max-width: 1279px)': true,
    });

    await act(async () => {
      root.render(
        <EditorView
          doc={buildDocument('documento-con-un-nombre-extremadamente-largo-que-no-debe-invadir-la-zona-de-botones-ni-en-escritorio-ni-en-movil.pdf')}
          onBack={vi.fn()}
          onPersistDocument={vi.fn(async (doc) => doc)}
          onRefreshDocument={vi.fn(async () => null)}
          models={[]}
          activeOcrProvider="gemini"
          prompts={[]}
          onOpenSettings={vi.fn()}
        />
      );
    });

    const title = container.querySelector('[data-testid="editor-document-title"]') as HTMLElement | null;
    const actions = container.querySelector('[data-testid="editor-header-actions"]') as HTMLElement | null;
    const exportButton = container.querySelector('button[aria-label="Export"]') as HTMLButtonElement | null;

    expect(title).not.toBeNull();
    expect(title?.className).toContain('truncate');
    expect(title?.className).toContain('min-w-0');
    expect(actions?.className).toContain('grid-cols-2');
    expect(exportButton).not.toBeNull();

    await act(async () => {
      exportButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.querySelector('[data-testid="editor-export-sheet"]')).not.toBeNull();
    expect(container.textContent).toContain('Export document');
    expect(container.textContent).toContain('Markdown (.md)');
  });

  it('renames the document and refreshes the header title after persistence', async () => {
    installMatchMedia({
      '(max-width: 1023px)': false,
      '(max-width: 1279px)': false,
    });

    const onPersistDocument = vi.fn(async (nextDoc: DocumentData) => nextDoc);

    await act(async () => {
      root.render(
        <EditorView
          doc={buildDocument('before-rename.pdf')}
          onBack={vi.fn()}
          onPersistDocument={onPersistDocument}
          onRefreshDocument={vi.fn(async () => null)}
          models={[]}
          activeOcrProvider="gemini"
          prompts={[]}
          onOpenSettings={vi.fn()}
        />
      );
    });

    const renameButton = container.querySelector('button[aria-label="Rename"]') as HTMLButtonElement | null;
    expect(renameButton).not.toBeNull();

    await act(async () => {
      renameButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const input = container.querySelector('[data-testid="rename-document-input"]') as HTMLInputElement | null;
    expect(input).not.toBeNull();

    await act(async () => {
      if (input) {
        const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        valueSetter?.call(input, 'after-rename.pdf');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });

    const saveButton = container.querySelector('button[aria-label="Save name"]') as HTMLButtonElement | null;
    expect(saveButton).not.toBeNull();

    await act(async () => {
      saveButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onPersistDocument).toHaveBeenCalledWith(expect.objectContaining({ name: 'after-rename.pdf' }));
    expect(container.querySelector('[data-testid="editor-document-title"]')?.textContent).toContain('after-rename.pdf');
  });

  it('reprocesses the current page with the document OCR options by default', async () => {
    installMatchMedia({
      '(max-width: 1023px)': false,
      '(max-width: 1279px)': false,
    });

    reprocessPageMock.mockResolvedValue([
      {
        id: 'block-1',
        text: 'Texto reprocesado',
        label: BlockLabel.MAIN_TEXT,
        box_2d: [0, 0, 1, 1],
      },
    ]);

    const translatedDoc: DocumentData = {
      ...buildDocument('translated.pdf'),
      modelUsed: 'doc-model',
      processingMode: 'translation',
      targetLanguage: 'Deutsch',
      customPrompt: 'Keep headings intact',
      removeReferences: false,
      splitColumns: true,
    };

    await act(async () => {
      root.render(
        <EditorView
          doc={translatedDoc}
          onBack={vi.fn()}
          onPersistDocument={vi.fn(async (doc) => doc)}
          onRefreshDocument={vi.fn(async () => null)}
          models={[
            {
              id: 'doc-model',
              name: 'Doc model',
              description: 'Preferred model',
              provider: 'gemini',
              isCustom: false,
              isAutodetected: false,
            },
          ]}
          activeOcrProvider="gemini"
          prompts={[]}
          onOpenSettings={vi.fn()}
        />
      );
    });

    const openReprocessButton = container.querySelector('button[aria-label="Reprocess"]') as HTMLButtonElement | null;
    expect(openReprocessButton).not.toBeNull();

    await act(async () => {
      openReprocessButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const confirmButton = container.querySelector('button[aria-label="Reprocess page"]') as HTMLButtonElement | null;
    expect(confirmButton).not.toBeNull();

    await act(async () => {
      confirmButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(reprocessPageMock).toHaveBeenCalledWith(
      'doc-long-name',
      0,
      'doc-model',
      'gemini',
      'translation',
      'Deutsch',
      'Keep headings intact',
      false,
      true
    );
  });

  it('retries failed page reprocessing the selected number of times and shows the final error', async () => {
    installMatchMedia({
      '(max-width: 1023px)': false,
      '(max-width: 1279px)': false,
    });

    const error = new Error('502: OCR response did not contain any text blocks') as Error & {
      responseBody?: string;
      responseStatus?: number;
      responseFormat?: string;
    };
    error.responseBody = '<!DOCTYPE html><html><body>Bad Gateway</body></html>';
    error.responseStatus = 502;
    error.responseFormat = 'html';
    reprocessPageMock.mockRejectedValue(error);

    await act(async () => {
      root.render(
        <EditorView
          doc={buildDocument('retry.pdf')}
          onBack={vi.fn()}
          onPersistDocument={vi.fn(async (doc) => doc)}
          onRefreshDocument={vi.fn(async () => buildDocument('retry.pdf'))}
          models={[]}
          activeOcrProvider="gemini"
          prompts={[]}
          onOpenSettings={vi.fn()}
        />
      );
    });

    await act(async () => {
      (container.querySelector('button[aria-label="Reprocess"]') as HTMLButtonElement | null)
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const retriesInput = container.querySelector('[data-testid="reprocess-retries-input"]') as HTMLInputElement | null;
    expect(retriesInput).not.toBeNull();

    await act(async () => {
      if (retriesInput) {
        const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        valueSetter?.call(retriesInput, '2');
        retriesInput.dispatchEvent(new Event('input', { bubbles: true }));
        retriesInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });

    await act(async () => {
      (container.querySelector('button[aria-label="Reprocess page"]') as HTMLButtonElement | null)
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(reprocessPageMock).toHaveBeenCalledTimes(3);
    expect(alertMock).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Failed to reprocess page 1');
    expect(container.textContent).toContain('Page 1: 502: OCR response did not contain any text blocks');
    expect(container.querySelector('[data-testid="reprocess-error-details"]')?.textContent).toContain('Bad Gateway');
    expect(container.querySelector('[data-testid="reprocess-error-details"]')?.textContent).toContain('Response format: html');
  });
});
