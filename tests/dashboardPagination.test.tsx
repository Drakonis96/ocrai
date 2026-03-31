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

const buildDocument = ({
  id,
  name,
  createdAt,
  parentId = null,
}: {
  id: string;
  name: string;
  createdAt: number;
  parentId?: string | null;
}): DocumentData => ({
  id,
  name,
  type: 'file',
  parentId,
  createdAt,
  uploadDate: createdAt,
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

const createDocuments = () => ([
  ...Array.from({ length: 30 }, (_, index) => buildDocument({
    id: `doc-${index + 1}`,
    name: `doc-${String(index + 1).padStart(3, '0')}.pdf`,
    createdAt: index + 1,
  })),
  buildDocument({
    id: 'doc-hidden',
    name: 'hidden.pdf',
    createdAt: 99,
    parentId: 'folder-1',
  }),
]);

describe('Dashboard pagination and scroll controls', () => {
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

  it('paginates the already filtered and sorted result set', async () => {
    await act(async () => {
      root.render(
        <Dashboard
          items={createDocuments()}
          models={DASHBOARD_MODELS}
          currentFolderId={null}
          onOpenDocument={vi.fn()}
          onNewUpload={vi.fn()}
          onCreateFolder={vi.fn()}
          onNavigateFolder={vi.fn()}
          onDeleteItem={vi.fn()}
          onMoveItem={vi.fn()}
          onRenameDocument={vi.fn(async () => {})}
          onToggleDocumentRead={vi.fn(async () => {})}
          onReprocessDocument={vi.fn(async () => {})}
        />
      );
    });

    const sortByNameButton = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('Name')) as HTMLButtonElement | undefined;
    expect(sortByNameButton).toBeDefined();

    await act(async () => {
      sortByNameButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const documentsPerPageSelect = container.querySelector('select[aria-label="Documents per page"]') as HTMLSelectElement | null;
    expect(documentsPerPageSelect).not.toBeNull();

    await act(async () => {
      if (documentsPerPageSelect) {
        const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')?.set;
        valueSetter?.call(documentsPerPageSelect, '10');
        documentsPerPageSelect.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });

    expect(container.textContent).toContain('Showing 1-10 of 30 results');
    expect(container.textContent).toContain('doc-001.pdf');
    expect(container.textContent).not.toContain('doc-011.pdf');
    expect(container.textContent).not.toContain('hidden.pdf');

    const nextPageButton = container.querySelector('button[aria-label="Next page"]') as HTMLButtonElement | null;
    expect(nextPageButton).not.toBeNull();

    await act(async () => {
      nextPageButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain('Page 2 of 3');
    expect(container.textContent).toContain('doc-011.pdf');
    expect(container.textContent).not.toContain('doc-001.pdf');

    const searchInput = container.querySelector('input[type="search"]') as HTMLInputElement | null;
    expect(searchInput).not.toBeNull();

    await act(async () => {
      if (searchInput) {
        const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        valueSetter?.call(searchInput, 'doc-025');
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });

    expect(container.textContent).toContain('Showing 1-1 of 1 result');
    expect(container.textContent).toContain('doc-025.pdf');
    expect(container.textContent).not.toContain('doc-011.pdf');
  });

  it('shows the floating scroll-to-top button only after the dashboard is scrolled', async () => {
    await act(async () => {
      root.render(
        <Dashboard
          items={createDocuments()}
          models={DASHBOARD_MODELS}
          currentFolderId={null}
          onOpenDocument={vi.fn()}
          onNewUpload={vi.fn()}
          onCreateFolder={vi.fn()}
          onNavigateFolder={vi.fn()}
          onDeleteItem={vi.fn()}
          onMoveItem={vi.fn()}
          onRenameDocument={vi.fn(async () => {})}
          onToggleDocumentRead={vi.fn(async () => {})}
          onReprocessDocument={vi.fn(async () => {})}
        />
      );
    });

    const scrollContainer = container.querySelector('[data-testid="dashboard-scroll-container"]') as HTMLDivElement | null;
    expect(scrollContainer).not.toBeNull();
    expect(container.querySelector('button[aria-label="Scroll to top"]')).toBeNull();
    if (!scrollContainer) {
      throw new Error('Expected dashboard scroll container');
    }

    const scrollToSpy = vi.fn();
    Object.defineProperty(scrollContainer, 'scrollTo', {
      value: scrollToSpy,
      configurable: true,
    });

    await act(async () => {
      if (scrollContainer) {
        scrollContainer.scrollTop = 400;
        scrollContainer.dispatchEvent(new Event('scroll'));
      }
    });

    const scrollTopButton = container.querySelector('button[aria-label="Scroll to top"]') as HTMLButtonElement | null;
    expect(scrollTopButton).not.toBeNull();

    await act(async () => {
      scrollTopButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(scrollToSpy).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
  });
});
