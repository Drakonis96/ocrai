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

    expect(onReprocessDocument).toHaveBeenCalledWith('doc-1', 'gemini-flash-lite-latest', 5, false);
  });

  it('moves multiple selected documents together from the checkbox column', async () => {
    const onMoveItem = vi.fn(async () => {});

    await act(async () => {
      root.render(
        <Dashboard
          items={[
            buildDocument(),
            buildDocument({ id: 'doc-2', name: 'sample-2.pdf' }),
            buildFolder(),
          ]}
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

    const firstCheckbox = container.querySelector('input[aria-label="Select sample.pdf"]') as HTMLInputElement | null;
    const secondCheckbox = container.querySelector('input[aria-label="Select sample-2.pdf"]') as HTMLInputElement | null;
    expect(firstCheckbox).not.toBeNull();
    expect(secondCheckbox).not.toBeNull();

    await act(async () => {
      firstCheckbox?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      secondCheckbox?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain('2 documents selected');

    const moveSelectedButton = container.querySelector('button[aria-label="Move selected"]') as HTMLButtonElement | null;
    expect(moveSelectedButton).not.toBeNull();

    await act(async () => {
      moveSelectedButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const archiveOption = container.querySelector('[data-testid="move-item-dialog"] input[type="radio"][value="folder-1"]') as HTMLInputElement | null;
    expect(archiveOption).not.toBeNull();

    await act(async () => {
      archiveOption?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      archiveOption?.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const confirmMoveButton = container.querySelector('[data-testid="move-item-dialog"] button[aria-label="Move documents"]') as HTMLButtonElement | null;
    expect(confirmMoveButton).not.toBeNull();

    await act(async () => {
      confirmMoveButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onMoveItem).toHaveBeenNthCalledWith(1, 'doc-1', 'folder-1');
    expect(onMoveItem).toHaveBeenNthCalledWith(2, 'doc-2', 'folder-1');
  });

  it('deletes multiple selected documents together', async () => {
    const onDeleteDocuments = vi.fn(async () => {});

    await act(async () => {
      root.render(
        <Dashboard
          items={[
            buildDocument(),
            buildDocument({ id: 'doc-2', name: 'sample-2.pdf' }),
          ]}
          models={DASHBOARD_MODELS}
          currentFolderId={null}
          onOpenDocument={vi.fn()}
          onNewUpload={vi.fn()}
          onCreateFolder={vi.fn()}
          onNavigateFolder={vi.fn()}
          onDeleteItem={vi.fn()}
          onDeleteDocuments={onDeleteDocuments}
          onMoveItem={vi.fn(async () => {})}
          onRenameDocument={vi.fn(async () => {})}
          onToggleDocumentRead={vi.fn(async () => {})}
          onReprocessDocument={vi.fn(async () => {})}
        />
      );
    });

    const firstCheckbox = container.querySelector('input[aria-label="Select sample.pdf"]') as HTMLInputElement | null;
    const secondCheckbox = container.querySelector('input[aria-label="Select sample-2.pdf"]') as HTMLInputElement | null;

    await act(async () => {
      firstCheckbox?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      secondCheckbox?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const deleteSelectedButton = container.querySelector('button[aria-label="Delete selected"]') as HTMLButtonElement | null;
    expect(deleteSelectedButton?.disabled).toBe(false);

    await act(async () => {
      deleteSelectedButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.querySelector('[data-testid="bulk-delete-dialog"]')).not.toBeNull();

    const confirmDeleteButton = container.querySelector('[data-testid="bulk-delete-dialog"] button[aria-label="Delete documents"]') as HTMLButtonElement | null;
    expect(confirmDeleteButton).not.toBeNull();

    await act(async () => {
      confirmDeleteButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onDeleteDocuments).toHaveBeenCalledWith(['doc-1', 'doc-2']);
  });

  it('reprocesses multiple selected documents together', async () => {
    const onReprocessDocument = vi.fn(async () => {});

    await act(async () => {
      root.render(
        <Dashboard
          items={[
            buildDocument(),
            buildDocument({ id: 'doc-2', name: 'sample-2.pdf', modelUsed: 'gemini-flash-lite-latest' }),
          ]}
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

    const firstCheckbox = container.querySelector('input[aria-label="Select sample.pdf"]') as HTMLInputElement | null;
    const secondCheckbox = container.querySelector('input[aria-label="Select sample-2.pdf"]') as HTMLInputElement | null;

    await act(async () => {
      firstCheckbox?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      secondCheckbox?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const reprocessSelectedButton = container.querySelector('button[aria-label="Reprocess selected"]') as HTMLButtonElement | null;
    expect(reprocessSelectedButton?.disabled).toBe(false);

    await act(async () => {
      reprocessSelectedButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain('Reprocess selected documents');
    expect(container.textContent).toContain('Reprocess all 4 pages in 2 selected documents.');

    const selects = Array.from(
      container.querySelectorAll('[data-testid="reprocess-document-dialog"] select')
    ) as HTMLSelectElement[];
    const [, batchSizeSelect] = selects;
    expect(batchSizeSelect).toBeDefined();

    await act(async () => {
      if (batchSizeSelect) {
        const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')?.set;
        valueSetter?.call(batchSizeSelect, '5');
        batchSizeSelect.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });

    const confirmReprocessButton = container.querySelector('[data-testid="reprocess-document-dialog"] button[aria-label="Reprocess documents"]') as HTMLButtonElement | null;
    expect(confirmReprocessButton).not.toBeNull();

    await act(async () => {
      confirmReprocessButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onReprocessDocument).toHaveBeenNthCalledWith(1, 'doc-1', 'gemini-flash-lite-latest', 5, false);
    expect(onReprocessDocument).toHaveBeenNthCalledWith(2, 'doc-2', 'gemini-flash-lite-latest', 5, false);
  });
});
