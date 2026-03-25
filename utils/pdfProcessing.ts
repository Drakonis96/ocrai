const PDF_RENDER_CONCURRENCY_LIMIT = 4;

const normalizePositiveInteger = (value: number | undefined, fallbackValue: number) => {
  if (!Number.isFinite(value)) {
    return fallbackValue;
  }

  const normalizedValue = Math.trunc(value as number);
  return normalizedValue > 0 ? normalizedValue : fallbackValue;
};

export const getPdfRenderConcurrency = (requestedConcurrency?: number) =>
  Math.min(normalizePositiveInteger(requestedConcurrency, 1), PDF_RENDER_CONCURRENCY_LIMIT);
