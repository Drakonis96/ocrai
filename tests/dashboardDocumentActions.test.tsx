// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Dashboard from '../components/Dashboard';
import type { DocumentData, FolderData } from '../types';

const DASHBOARD_MODELS = [
  { id: 'gemini-flash-lite-latest', name: 'Gemini Flash Lite Latest', description: 'Faster' },
  { id: 'gemini-flash-latest', name: 'Gemini Flash Latest', description: 'Balanced' },
];

const buildDocument = (overrides: Partial<DocumentData> = {}): DocumentData => ({
  id: 'doc-1',
  name: 'sample.pdf',
  type: 'file',
  parentId: null,
  createdAt: 10,
  uploadDate: 10,
  pages: [
    {
      pageNumber: 1,
      imageUrl: '/api/data/doc-1/page_1.jpg',
      blocks: [],
      status: 'completed',
    },
    {
      pageNumber: 2,
      imageUrl: '/api/data/doc-1/page_2.jpg',
      blocks: [],
      status: 'completed',
    },
  ],
  status: 'ready',
  modelUsed: 'gemini-flash-latest',
  processingMode: 'ocr',
  removeReferences: true,
  pagesPerBatch: 1,
  totalPages: 2,
  processedPages: 2,
  failedPages: 0,
  ...overrides,
});

const buildFolder = (overrides: Partial<FolderData> = {}): FolderData => ({
  id: 'folder-1',
  name: 'Archive',
  type: 'folder',
  parentId: null,
  createdAt: 1,
  ...overrides,
});

describe('Dashboard document actions', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  it('toggles the read checkbox directly from the main list', async () => {
    const onToggleDocumentRead = vi.fn(async () => {});

    await act(async () => {
      root.render(
        <Dashboard
          items={[buildDocument()]}
          models={DASHBOARD_MODELS}
          currentFolderId={null}
          onOpenDocument={vi.fn()}
          onNewUpload={vi.fn()}
          onCreateFolder={vi.fn()}
          onNavigateFolder={vi.fn()}
          onDeleteItem={vi.fn()}
          onMoveItem={vi.fn(async () => {})}
          onRenameDocument={vi.fn(async () => {})}
          onToggleDocumentRead={onToggleDocumentRead}
          onReprocessDocument={vi.fn(async () => {})}
        />
      );
    });

    const checkbox = container.querySelector('input[aria-label="Mark sample.pdf as read"]') as HTMLInputElement | null;
    expect(checkbox).not.toBeNull();

    await act(async () => {
      checkbox?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onToggleDocumentRead).toHaveBeenCalledWith('doc-1', true);
  });

  it('opens the move modal and moves the selected document to the chosen folder', async () => {
    const onMoveItem = vi.fn(async () => {});

    await act(async () => {
      root.render(
        <Dashboard
          items={[buildDocument(), buildFolder()]}
          models={DASHBOARD_MODELS}
          currentFolderId={null}
          onOpenDocument={vi.fn()}
          onNewUpload={vi.fn()}
          onCreateFolder={vi.fn()}
          onNavigateFolder={vi.fn()}
          onDeleteItem={vi.fn()}
          onMoveItem={onMoveItem}
          onRenameDocument={vi.fn(async () => {})}
          onToggleDocumentRead={vi.fn(async () => {})}
          onReprocessDocument={vi.fn(async () => {})}
        />
      );
    });

    const moveButton = container.querySelector('button[aria-label="Move"]') as HTMLButtonElement | null;
    expect(moveButton).not.toBeNull();

    await act(async () => {
      moveButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.querySelector('[data-testid="move-item-dialog"]')).not.toBeNull();
    expect(container.textContent).toContain('Main / Root');
    expect(container.textContent).toContain('Archive');

    const archiveOption = container.querySelector('input[type="radio"][value="folder-1"]') as HTMLInputElement | null;
    expect(archiveOption).not.toBeNull();

    await act(async () => {
      archiveOption?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      archiveOption?.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const confirmButton = container.querySelector('button[aria-label="Move item"]') as HTMLButtonElement | null;
    expect(confirmButton?.disabled).toBe(false);

    await act(async () => {
      confirmButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onMoveItem).toHaveBeenCalledWith('doc-1', 'folder-1');
  });

  it('opens the reprocess modal and submits the selected model and batch size for the full document', async () => {
    const onReprocessDocument = vi.fn(async () => {});

    await act(async () => {
      root.render(
        <Dashboard
          items={[buildDocument()]}
          models={DASHBOARD_MODELS}
          currentFolderId={null}
          onOpenDocument={vi.fn()}
          onNewUpload={vi.fn()}
          onCreateFolder={vi.fn()}
          onNavigateFolder={vi.fn()}
          onDeleteItem={vi.fn()}
          onMoveItem={vi.fn(async () => {})}
          onRenameDocument={vi.fn(async () => {})}
          onToggleDocumentRead={vi.fn(async () => {})}
          onReprocessDocument={onReprocessDocument}
        />
      );
    });

    const reprocessButton = container.querySelector('button[aria-label="Reprocess"]') as HTMLButtonElement | null;
    expect(reprocessButton).not.toBeNull();

    await act(async () => {
      reprocessButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.querySelector('[data-testid="reprocess-document-dialog"]')).not.toBeNull();
    expect(container.textContent).toContain('Reprocess all 2 pages');

    const selects = Array.from(
      container.querySelectorAll('[data-testid="reprocess-document-dialog"] select')
    ) as HTMLSelectElement[];
    const [modelSelect, batchSizeSelect] = selects;
    expect(modelSelect).toBeDefined();
    expect(batchSizeSelect).toBeDefined();
    expect(modelSelect?.value).toBe('gemini-flash-lite-latest');
    expect(batchSizeSelect?.value).toBe('1');

    await act(async () => {
      if (modelSelect) {
        const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')?.set;
        valueSetter?.call(modelSelect, 'gemini-flash-lite-latest');
        modelSelect.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });

    await act(async () => {
      if (batchSizeSelect) {
        const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')?.set;
        valueSetter?.call(batchSizeSelect, '5');
        batchSizeSelect.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });

    const confirmButton = container.querySelector('button[aria-label="Reprocess document"]') as HTMLButtonElement | null;
    expect(confirmButton).not.toBeNull();

    await act(async () => {
      confirmButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onReprocessDocument).toHaveBeenCalledWith('doc-1', 'gemini-flash-lite-latest', 5);
  });
});
