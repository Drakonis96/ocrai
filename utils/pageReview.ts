import { DocumentData, PageData } from '../types';

const normalizeOverrideText = (value?: string) =>
  typeof value === 'string' ? value.trim() : '';

export const pageHasTranscription = (page: PageData, overrideText?: string) => {
  if (normalizeOverrideText(overrideText)) {
    return true;
  }

  return Array.isArray(page.blocks)
    && page.blocks.some((block) => typeof block.text === 'string' && block.text.trim().length > 0);
};

export const pageHasVisibleError = (page: PageData) =>
  page.status === 'error' && page.errorDismissed !== true;

export const getPageIssueType = (page: PageData, overrideText?: string): 'error' | 'blank' | null => {
  if (pageHasVisibleError(page)) {
    return 'error';
  }

  if (page.status === 'completed' && !pageHasTranscription(page, overrideText)) {
    return 'blank';
  }

  return null;
};

export const getIssuePageIndexes = (
  doc: DocumentData,
  pageTextOverrides: Record<number, string> = {}
) => doc.pages.reduce<number[]>((indexes, page, pageIndex) => {
  if (getPageIssueType(page, pageTextOverrides[pageIndex])) {
    indexes.push(pageIndex);
  }

  return indexes;
}, []);
