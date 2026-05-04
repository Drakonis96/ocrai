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
  let originalDataTransfer: typeof DataTransfer | undefined;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    getDocument.mockReset();

    originalDataTransfer = globalThis.DataTransfer;
    class MockDataTransfer {
      private readonly selectedFiles: File[] = [];

      readonly items = {
        add: (file: File) => {
          this.selectedFiles.push(file);
        },
      };

      get files(): FileList {
        const files = this.selectedFiles;
        return {
          length: files.length,
          item: (index: number) => files[index] ?? null,
          ...files,
        } as FileList;
      }
    }

    (globalThis as { DataTransfer?: typeof DataTransfer }).DataTransfer = MockDataTransfer as unknown as typeof DataTransfer;
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    if (originalDataTransfer) {
      (globalThis as { DataTransfer?: typeof DataTransfer }).DataTransfer = originalDataTransfer;
    } else {
      delete (globalThis as { DataTransfer?: typeof DataTransfer }).DataTransfer;
    }
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

  it('passes the selected initial retry count when starting processing', async () => {
    const onFileSelect = vi.fn();

    await act(async () => {
      root.render(
        <UploadView
          onFileSelect={onFileSelect}
          models={MODELS}
          activeOcrProvider="gemini"
          prompts={[]}
          onOpenSettings={vi.fn()}
        />
      );
    });

    const retryInput = container.querySelector('[data-testid="processing-retries-input"]') as HTMLInputElement | null;
    expect(retryInput).not.toBeNull();

    await act(async () => {
      if (retryInput) {
        const setValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        setValue?.call(retryInput, '3');
        retryInput.dispatchEvent(new Event('input', { bubbles: true }));
        retryInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
      await flushPromises();
    });

    const input = container.querySelector('#file-upload') as HTMLInputElement | null;
    expect(input).not.toBeNull();

    const file = new File(['image-bytes'], 'scan.png', { type: 'image/png' });

    await act(async () => {
      Object.defineProperty(input, 'files', {
        configurable: true,
        value: [file],
      });
      input?.dispatchEvent(new Event('change', { bubbles: true }));
      await flushPromises();
    });

    const startButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Start processing')
    );
    expect(startButton).not.toBeUndefined();

    await act(async () => {
      startButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushPromises();
    });

    expect(onFileSelect).toHaveBeenCalledTimes(1);
    expect(onFileSelect.mock.calls[0][1].maxRetries).toBe(3);
  });
});
