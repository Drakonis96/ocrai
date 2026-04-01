// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getDocument } = vi.hoisted(() => ({
  getDocument: vi.fn(),
}));

vi.mock('pdfjs-dist', () => ({
  getDocument,
}));

import UploadView from '../components/UploadView';

const MODELS = [
  { id: 'gemini-flash-lite-latest', name: 'Gemini Flash Lite Latest', description: 'Cheapest', provider: 'gemini' },
];

const flushPromises = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe('UploadView layout and page summary', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    getDocument.mockReset();
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  it('shows the selected document page count to guide the batch size choice', async () => {
    getDocument.mockReturnValue({
      promise: Promise.resolve({ numPages: 26 }),
    });

    await act(async () => {
      root.render(
        <UploadView
          onFileSelect={vi.fn()}
          models={MODELS}
          activeOcrProvider="gemini"
          prompts={[]}
          onOpenSettings={vi.fn()}
        />
      );
    });

    const input = container.querySelector('#file-upload') as HTMLInputElement | null;
    expect(input).not.toBeNull();

    const file = new File([new Uint8Array([37, 80, 68, 70])], 'sample-book.pdf', { type: 'application/pdf' });
    Object.defineProperty(file, 'arrayBuffer', {
      configurable: true,
      value: vi.fn(async () => new Uint8Array([37, 80, 68, 70]).buffer),
    });

    await act(async () => {
      Object.defineProperty(input, 'files', {
        configurable: true,
        value: [file],
      });
      input?.dispatchEvent(new Event('change', { bubbles: true }));
      await flushPromises();
    });

    expect(getDocument).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('26 pages');
    expect(container.querySelector('[data-testid="selected-pages-summary"]')?.textContent).toContain('Selected document: 26 pages.');
  });

  it('keeps the upload panels vertically centered inside the available area', async () => {
    await act(async () => {
      root.render(
        <UploadView
          onFileSelect={vi.fn()}
          models={MODELS}
          activeOcrProvider="gemini"
          prompts={[]}
          onOpenSettings={vi.fn()}
        />
      );
    });

    const panels = container.querySelector('[data-testid="upload-view-panels"]') as HTMLDivElement | null;
    expect(panels).not.toBeNull();
    expect(panels?.className).toContain('min-h-full');
    expect(panels?.className).toContain('items-center');
  });
});
