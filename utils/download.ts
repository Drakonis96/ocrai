const restoreScrollPosition = (scrollX: number, scrollY: number) => {
  window.scrollTo(scrollX, scrollY);
};

const triggerHiddenAnchorDownload = (url: string, filename: string) => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('File downloads are only available in the browser.');
  }

  const scrollX = window.scrollX;
  const scrollY = window.scrollY;
  const previouslyFocusedElement = document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null;
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  anchor.tabIndex = -1;
  anchor.setAttribute('aria-hidden', 'true');
  anchor.style.height = '1px';
  anchor.style.left = '-9999px';
  anchor.style.opacity = '0';
  anchor.style.pointerEvents = 'none';
  anchor.style.position = 'fixed';
  anchor.style.top = '0';
  anchor.style.width = '1px';

  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);

  if (previouslyFocusedElement) {
    try {
      previouslyFocusedElement.focus({ preventScroll: true });
    } catch {
      previouslyFocusedElement.focus();
    }
  }

  restoreScrollPosition(scrollX, scrollY);
  if (typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(() => restoreScrollPosition(scrollX, scrollY));
  }
};

export const downloadBlob = (blob: Blob, filename: string) => {
  const objectUrl = URL.createObjectURL(blob);

  try {
    triggerHiddenAnchorDownload(objectUrl, filename);
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  }
};
