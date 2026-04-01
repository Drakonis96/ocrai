// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Dashboard from '../components/Dashboard';
import { BlockLabel, type DocumentData, type FileSystemItem, type FolderData } from '../types';

const DASHBOARD_MODELS = [
  { id: 'gemini-flash-lite-latest', name: 'Gemini Flash Lite Latest', description: 'Cheapest' },
];

const buildFolder = ({
  id,
  name,
  parentId = null,
  createdAt,
}: {
  id: string;
  name: string;
  parentId?: string | null;
  createdAt: number;
}): FolderData => ({
  id,
  name,
  type: 'folder',
  parentId,
  createdAt,
});

const buildDocument = ({
  id,
  name,
  parentId = null,
  uploadDate,
  status,
  labels,
  savedText,
}: {
  id: string;
  name: string;
  parentId?: string | null;
  uploadDate: number;
  status: DocumentData['status'];
  labels: string[];
  savedText: string;
}): DocumentData => ({
  id,
  name,
  type: 'file',
  parentId,
  createdAt: uploadDate,
  uploadDate,
  pages: [
    {
      pageNumber: 1,
      imageUrl: `/api/data/${id}/page_1.jpg`,
      blocks: [
        {
          id: `${id}-block-1`,
          text: savedText,
          label: BlockLabel.MAIN_TEXT,
        },
      ],
      status: 'completed',
    },
  ],
  status,
  modelUsed: 'gemini-flash-lite-latest',
  labels,
  processingMode: 'ocr',
  removeReferences: true,
  pagesPerBatch: 1,
  totalPages: 1,
  processedPages: status === 'processing' ? 0 : 1,
  failedPages: status === 'error' ? 1 : 0,
  savedText,
});

const createItems = (): FileSystemItem[] => ([
  buildFolder({ id: 'folder-finance', name: 'Finance', createdAt: Date.UTC(2026, 0, 1) }),
  buildFolder({ id: 'folder-legal', name: 'Legal', createdAt: Date.UTC(2026, 0, 2) }),
  buildDocument({
    id: 'doc-root',
    name: 'Operations summary.pdf',
    uploadDate: Date.UTC(2026, 2, 5),
    status: 'processing',
    labels: ['Ops'],
    savedText: 'Weekly team sync notes and delivery updates.',
  }),
  buildDocument({
    id: 'doc-finance',
    name: 'Budget Q1.pdf',
    parentId: 'folder-finance',
    uploadDate: Date.UTC(2026, 0, 15),
    status: 'ready',
    labels: ['Finance'],
    savedText: 'Projected revenue and budget targets for the first quarter.',
  }),
  buildDocument({
    id: 'doc-legal',
    name: 'Contract renewal.pdf',
    parentId: 'folder-legal',
    uploadDate: Date.UTC(2026, 1, 18),
    status: 'error',
    labels: ['Legal'],
    savedText: 'This contract includes an exclusivity clause and renewal terms.',
  }),
]);

const setInputValue = async (input: HTMLInputElement | null, value: string) => {
  await act(async () => {
    if (!input) {
      return;
    }

    const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    valueSetter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
};

const setSelectValue = async (select: HTMLSelectElement | null, value: string) => {
  await act(async () => {
    if (!select) {
      return;
    }

    const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')?.set;
    valueSetter?.call(select, value);
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
};

describe('Dashboard search filters', () => {
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

  it('applies folder, label, status, date and full-text filters together', async () => {
    await act(async () => {
      root.render(
        <Dashboard
          items={createItems()}
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
          onReprocessDocument={vi.fn(async () => {})}
        />
      );
    });

    expect(container.textContent).toContain('Operations summary.pdf');
    expect(container.textContent).not.toContain('Budget Q1.pdf');
    expect(container.textContent).not.toContain('Contract renewal.pdf');

    const folderFilter = container.querySelector('select[aria-label="Filter by folder"]') as HTMLSelectElement | null;
    expect(folderFilter).not.toBeNull();

    await setSelectValue(folderFilter, '__all__');

    expect(container.textContent).toContain('Budget Q1.pdf');
    expect(container.textContent).toContain('Contract renewal.pdf');

    await setSelectValue(folderFilter, 'folder-legal');

    expect(container.textContent).toContain('Contract renewal.pdf');
    expect(container.textContent).not.toContain('Budget Q1.pdf');
    expect(container.textContent).not.toContain('Operations summary.pdf');

    await setSelectValue(folderFilter, '__all__');

    const searchInput = container.querySelector('input[aria-label="Search documents"]') as HTMLInputElement | null;
    expect(searchInput).not.toBeNull();

    await setInputValue(searchInput, 'exclusivity');

    expect(container.textContent).not.toContain('Contract renewal.pdf');

    const fullTextToggle = container.querySelector('button[aria-label="Enable full text search"]') as HTMLButtonElement | null;
    expect(fullTextToggle).not.toBeNull();

    await act(async () => {
      fullTextToggle?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain('Contract renewal.pdf');
    expect(container.textContent).toContain('1 result');

    const labelFilter = container.querySelector('select[aria-label="Filter by label"]') as HTMLSelectElement | null;
    const statusFilter = container.querySelector('select[aria-label="Filter by status"]') as HTMLSelectElement | null;
    const fromDateFilter = container.querySelector('input[aria-label="Filter from date"]') as HTMLInputElement | null;
    const toDateFilter = container.querySelector('input[aria-label="Filter to date"]') as HTMLInputElement | null;

    expect(labelFilter).not.toBeNull();
    expect(statusFilter).not.toBeNull();
    expect(fromDateFilter).not.toBeNull();
    expect(toDateFilter).not.toBeNull();

    await setSelectValue(labelFilter, 'Legal');
    await setSelectValue(statusFilter, 'error');
    await setInputValue(fromDateFilter, '2026-02-01');
    await setInputValue(toDateFilter, '2026-02-28');
    await setSelectValue(folderFilter, 'folder-legal');

    expect(container.textContent).toContain('Contract renewal.pdf');
    expect(container.textContent).toContain('1 result');
    expect(container.textContent).not.toContain('Budget Q1.pdf');
    expect(container.textContent).not.toContain('Operations summary.pdf');
  });
});
