// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadBlob } from '../utils/download';

describe('downloadBlob', () => {
  beforeEach(() => {
    vi.useFakeTimers();

    Object.defineProperty(window, 'scrollX', {
      configurable: true,
      value: 42,
    });
    Object.defineProperty(window, 'scrollY', {
      configurable: true,
      value: 84,
    });

    window.requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    window.scrollTo = vi.fn();
    URL.createObjectURL = vi.fn(() => 'blob:test-url');
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('downloads through a hidden off-screen anchor and restores scroll position', () => {
    const focusedButton = document.createElement('button');
    document.body.appendChild(focusedButton);
    focusedButton.focus();

    const clickedAnchors: HTMLAnchorElement[] = [];
    const anchorClickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function click(this: HTMLAnchorElement) {
        clickedAnchors.push(this);
      });

    downloadBlob(new Blob(['test file']), 'result.txt');
    vi.runAllTimers();

    expect(clickedAnchors).toHaveLength(1);
    expect(clickedAnchors[0].download).toBe('result.txt');
    expect(clickedAnchors[0].href).toBe('blob:test-url');
    expect(clickedAnchors[0].style.position).toBe('fixed');
    expect(clickedAnchors[0].style.left).toBe('-9999px');
    expect(clickedAnchors[0].style.opacity).toBe('0');
    expect(window.scrollTo).toHaveBeenCalledWith(42, 84);
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-url');

    anchorClickSpy.mockRestore();
    focusedButton.remove();
  });
});
