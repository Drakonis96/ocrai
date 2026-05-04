import { describe, expect, it } from 'vitest';
import { runWithConcurrencyLimit } from '../utils/asyncPool';

describe('runWithConcurrencyLimit', () => {
  it('caps the number of active workers', async () => {
    let activeWorkers = 0;
    let peakWorkers = 0;
    const processedItems: number[] = [];

    await runWithConcurrencyLimit([1, 2, 3, 4, 5, 6], 3, async (item) => {
      activeWorkers += 1;
      peakWorkers = Math.max(peakWorkers, activeWorkers);

      await new Promise((resolve) => setTimeout(resolve, 5));
      processedItems.push(item);

      activeWorkers -= 1;
    });

    expect(peakWorkers).toBeLessThanOrEqual(3);
    expect(processedItems.slice().sort((left, right) => left - right)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('falls back to sequential execution for invalid limits', async () => {
    let peakWorkers = 0;
    let activeWorkers = 0;

    await runWithConcurrencyLimit([1, 2, 3], 0, async () => {
      activeWorkers += 1;
      peakWorkers = Math.max(peakWorkers, activeWorkers);
      await new Promise((resolve) => setTimeout(resolve, 5));
      activeWorkers -= 1;
    });

    expect(peakWorkers).toBe(1);
  });
});