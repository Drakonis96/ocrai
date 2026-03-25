import { describe, expect, it } from 'vitest';
import { getPdfRenderConcurrency } from '../utils/pdfProcessing';

describe('pdf processing helpers', () => {
  it('caps pdf render concurrency to a safe limit', () => {
    expect(getPdfRenderConcurrency()).toBe(1);
    expect(getPdfRenderConcurrency(0)).toBe(1);
    expect(getPdfRenderConcurrency(2)).toBe(2);
    expect(getPdfRenderConcurrency(10)).toBe(4);
  });
});
