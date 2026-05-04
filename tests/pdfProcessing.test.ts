import { describe, expect, it } from 'vitest';
import { getPdfRenderConcurrency, getSafePdfViewportScale } from '../utils/pdfProcessing';

describe('pdf processing helpers', () => {
  it('caps pdf render concurrency to a safe limit', () => {
    expect(getPdfRenderConcurrency()).toBe(1);
    expect(getPdfRenderConcurrency(0)).toBe(1);
    expect(getPdfRenderConcurrency(2)).toBe(2);
    expect(getPdfRenderConcurrency(10)).toBe(4);
  });

  it('keeps the default render scale for regular document pages', () => {
    expect(getSafePdfViewportScale({ width: 612, height: 792 })).toBe(1.5);
  });

  it('downscales oversized pages to stay within safe canvas limits', () => {
    const scale = getSafePdfViewportScale({ width: 5000, height: 7000 });

    expect(scale).toBeLessThan(1.5);
    expect(5000 * scale).toBeLessThanOrEqual(3072);
    expect(7000 * scale).toBeLessThanOrEqual(3072);
    expect(5000 * scale * 7000 * scale).toBeLessThanOrEqual(12_000_000);
  });
});
