// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Dashboard from '../components/Dashboard';
import type { DocumentData } from '../types';

const DASHBOARD_MODELS = [
  { id: 'gemini-flash-latest', name: 'Gemini Flash Latest', description: 'Balanced' },
];

const buildDocument = (name: string): DocumentData => ({
  id: 'doc-rename',
  name,
  type: 'file',
  parentId: null,
  createdAt: Date.now(),
  uploadDate: Date.now(),
  pages: [],
  status: 'ready',
  modelUsed: 'gemini-flash-latest',
  processingMode: 'ocr',
  removeReferences: true,
  pagesPerBatch: 1,
  totalPages: 1,
  processedPages: 1,
  failedPages: 0,
});

describe('Dashboard rename flow', () => {
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

  it('opens the rename dialog and persists the new document name', async () => {
    const onRenameDocument = vi.fn(async () => {});

    await act(async () => {
      root.render(
        <Dashboard
          items={[buildDocument('original-name.pdf')]}
          models={DASHBOARD_MODELS}
          currentFolderId={null}
          onOpenDocument={vi.fn()}
          onNewUpload={vi.fn()}
          onCreateFolder={vi.fn()}
          onNavigateFolder={vi.fn()}
          onDeleteItem={vi.fn()}
          onMoveItem={vi.fn()}
          onRenameDocument={onRenameDocument}
          onToggleDocumentRead={vi.fn(async () => {})}
          onReprocessDocument={vi.fn(async () => {})}
        />
      );
    });

    const renameButtons = container.querySelectorAll('button[aria-label="Rename"]');
    expect(renameButtons.length).toBeGreaterThan(0);

    await act(async () => {
      renameButtons[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const input = container.querySelector('[data-testid="rename-document-input"]') as HTMLInputElement | null;
    expect(input).not.toBeNull();

    await act(async () => {
      if (input) {
        const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        valueSetter?.call(input, 'renamed-document.pdf');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });

    const saveButton = container.querySelector('button[aria-label="Save name"]') as HTMLButtonElement | null;
    expect(saveButton).not.toBeNull();

    await act(async () => {
      saveButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onRenameDocument).toHaveBeenCalledWith('doc-rename', 'renamed-document.pdf');
    expect(container.querySelector('[data-testid="rename-document-dialog"]')).toBeNull();
  });
});
