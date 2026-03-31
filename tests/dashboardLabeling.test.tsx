// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Dashboard from '../components/Dashboard';
import type { DocumentData } from '../types';

const DASHBOARD_MODELS = [
  { id: 'gemini-flash-lite-latest', name: 'Gemini Flash Lite Latest', description: 'Cheapest' },
];

const buildDocument = (overrides: Partial<DocumentData> = {}): DocumentData => ({
  id: 'doc-1',
  name: 'Quarterly report.pdf',
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
  ],
  status: 'ready',
  modelUsed: 'gemini-flash-lite-latest',
  labels: ['Finance'],
  processingMode: 'ocr',
  removeReferences: true,
  pagesPerBatch: 1,
  totalPages: 1,
  processedPages: 1,
  failedPages: 0,
  ...overrides,
});

describe('Dashboard labeling', () => {
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

  it('renders document labels and updates them from the dashboard modal', async () => {
    const onUpdateDocumentLabels = vi.fn(async () => {});

    await act(async () => {
      root.render(
        <Dashboard
          items={[buildDocument()]}
          models={DASHBOARD_MODELS}
          availableLabels={['Finance', 'Urgent']}
          currentFolderId={null}
          onOpenDocument={vi.fn()}
          onNewUpload={vi.fn()}
          onCreateFolder={vi.fn()}
          onNavigateFolder={vi.fn()}
          onDeleteItem={vi.fn()}
          onMoveItem={vi.fn(async () => {})}
          onRenameDocument={vi.fn(async () => {})}
          onToggleDocumentRead={vi.fn(async () => {})}
          onUpdateDocumentLabels={onUpdateDocumentLabels}
          onReprocessDocument={vi.fn(async () => {})}
        />
      );
    });

    expect(container.textContent).toContain('Finance');

    const manageLabelsButton = container.querySelector('button[aria-label="Manage labels for Quarterly report.pdf"]') as HTMLButtonElement | null;
    expect(manageLabelsButton).not.toBeNull();

    await act(async () => {
      manageLabelsButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const dialog = container.querySelector('[data-testid="document-labels-dialog"]') as HTMLDivElement | null;
    expect(dialog).not.toBeNull();

    const urgentCheckbox = dialog?.querySelector('input[aria-label="Toggle Urgent label"]') as HTMLInputElement | null;
    expect(urgentCheckbox).not.toBeNull();

    await act(async () => {
      urgentCheckbox?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      urgentCheckbox?.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const saveButton = dialog?.querySelector('button[aria-label="Save labels"]') as HTMLButtonElement | null;
    expect(saveButton).not.toBeNull();

    await act(async () => {
      saveButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onUpdateDocumentLabels).toHaveBeenCalledWith('doc-1', ['Finance', 'Urgent']);
  });

  it('opens Settings > Labeling when there are no available labels to assign', async () => {
    const onOpenSettings = vi.fn();

    await act(async () => {
      root.render(
        <Dashboard
          items={[buildDocument({ labels: [] })]}
          models={DASHBOARD_MODELS}
          availableLabels={[]}
          currentFolderId={null}
          onOpenDocument={vi.fn()}
          onNewUpload={vi.fn()}
          onCreateFolder={vi.fn()}
          onNavigateFolder={vi.fn()}
          onDeleteItem={vi.fn()}
          onMoveItem={vi.fn(async () => {})}
          onRenameDocument={vi.fn(async () => {})}
          onToggleDocumentRead={vi.fn(async () => {})}
          onUpdateDocumentLabels={vi.fn(async () => {})}
          onReprocessDocument={vi.fn(async () => {})}
          onOpenSettings={onOpenSettings}
        />
      );
    });

    const manageLabelsButton = container.querySelector('button[aria-label="Manage labels for Quarterly report.pdf"]') as HTMLButtonElement | null;
    expect(manageLabelsButton).not.toBeNull();

    await act(async () => {
      manageLabelsButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const openSettingsButton = container.querySelector('button[aria-label="Open Labeling settings"]') as HTMLButtonElement | null;
    expect(openSettingsButton).not.toBeNull();

    await act(async () => {
      openSettingsButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onOpenSettings).toHaveBeenCalledWith('labeling');
  });
});
