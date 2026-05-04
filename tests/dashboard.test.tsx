import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import Dashboard from '../components/Dashboard';
import type { DocumentData } from '../types';

const DASHBOARD_MODELS = [
  { id: 'gemini-flash-latest', name: 'Gemini Flash Latest', description: 'Balanced' },
];

const buildDocument = (overrides: Partial<DocumentData> = {}): DocumentData => ({
  id: 'doc-1',
  name: 'ocr-sample.pdf',
  type: 'file',
  parentId: null,
  createdAt: Date.now(),
  uploadDate: Date.now(),
  pages: [],
  status: 'error',
  modelUsed: 'gemini-flash-latest',
  processingMode: 'ocr',
  removeReferences: true,
  pagesPerBatch: 1,
  totalPages: 10,
  processedPages: 8,
  failedPages: 2,
  ...overrides,
});

const renderDashboard = (items: DocumentData[]) =>
  renderToStaticMarkup(
    <Dashboard
      items={items}
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

describe('Dashboard OCR error indicators', () => {
  it('shows the failed pages badge and keeps error documents openable', () => {
    const html = renderDashboard([buildDocument()]);

    expect(html).toContain('2 failed pages');
    expect(html).toContain('Open');
    expect(html).toContain('Error');
  });

  it('shows failed pages while the document is still processing retries', () => {
    const html = renderDashboard([
      buildDocument({
        status: 'processing',
        processedPages: 4,
        failedPages: 1,
      }),
    ]);

    expect(html).toContain('Processing');
    expect(html).toContain('1 failed page');
  });

  it('shows active processing pages in the visual progress count', () => {
    const html = renderDashboard([
      buildDocument({
        status: 'processing',
        totalPages: 10,
        processedPages: 4,
        failedPages: 1,
        pages: [
          {
            pageNumber: 1,
            imageUrl: '/api/data/doc-1/page_1.jpg',
            blocks: [],
            status: 'processing',
          },
        ],
      }),
    ]);

    expect(html).toContain('6/10');
  });

  it('hides the failed pages badge once the document no longer reports unresolved errors', () => {
    const html = renderDashboard([
      buildDocument({
        status: 'ready',
        failedPages: 0,
      }),
    ]);

    expect(html).toContain('Ready');
    expect(html).not.toContain('failed page');
  });

  it('keeps mobile cards constrained to the viewport for long document names', () => {
    const html = renderDashboard([
      buildDocument({
        name: 'this-is-a-very-long-document-name-without-natural-breakpoints-that-should-wrap-on-mobile-and-never-overflow-the-card-width.pdf',
      }),
    ]);

    expect(html).toContain('data-testid="mobile-card-doc-1"');
    expect(html).toContain('w-full min-w-0 overflow-hidden rounded-3xl');
    expect(html).toContain('min-w-0 flex-1 break-all font-semibold');
  });

  it('places the search bar in the primary toolbar between Home and document creation actions', () => {
    const html = renderDashboard([buildDocument()]);

    expect(html).toContain('data-testid="dashboard-primary-toolbar"');

    const homeIndex = html.indexOf('aria-label="Home"');
    const searchIndex = html.indexOf('aria-label="Search documents"');
    const newFolderIndex = html.indexOf('aria-label="New folder"');

    expect(homeIndex).toBeGreaterThan(-1);
    expect(searchIndex).toBeGreaterThan(homeIndex);
    expect(newFolderIndex).toBeGreaterThan(searchIndex);
  });
});
