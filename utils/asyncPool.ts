export const runWithConcurrencyLimit = async <T>(
  items: readonly T[],
  maxConcurrency: number,
  worker: (item: T, index: number) => Promise<void>
): Promise<void> => {
  const normalizedConcurrency = Number.isInteger(maxConcurrency) && maxConcurrency > 0
    ? maxConcurrency
    : 1;
  let nextIndex = 0;

  const runWorker = async () => {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;

      if (currentIndex >= items.length) {
        return;
      }

      await worker(items[currentIndex], currentIndex);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(normalizedConcurrency, items.length) }, () => runWorker())
  );
};