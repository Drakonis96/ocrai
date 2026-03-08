import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import Dashboard from '../components/Dashboard';
import type { DocumentData } from '../types';

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
      currentFolderId={null}
      onOpenDocument={vi.fn()}
      onNewUpload={vi.fn()}
      onCreateFolder={vi.fn()}
      onNavigateFolder={vi.fn()}
      onDeleteItem={vi.fn()}
      onMoveItem={vi.fn()}
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
});
