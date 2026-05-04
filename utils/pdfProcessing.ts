const PDF_RENDER_CONCURRENCY_LIMIT = 4;
const DEFAULT_PDF_RENDER_CONCURRENCY = 1;
const DEFAULT_PDF_VIEWPORT_SCALE = 1.5;
const PDF_MAX_CANVAS_DIMENSION = 3072;
const PDF_MAX_CANVAS_PIXELS = 12_000_000;

const normalizePositiveInteger = (value: number | undefined, fallbackValue: number) => {
  if (!Number.isFinite(value)) {
    return fallbackValue;
  }

  const normalizedValue = Math.trunc(value as number);
  return normalizedValue > 0 ? normalizedValue : fallbackValue;
};

const normalizePositiveNumber = (value: number | undefined, fallbackValue: number) => {
  if (!Number.isFinite(value)) {
    return fallbackValue;
  }

  return (value as number) > 0 ? (value as number) : fallbackValue;
};

export const getPdfRenderConcurrency = (requestedConcurrency?: number) =>
  Math.min(normalizePositiveInteger(requestedConcurrency, DEFAULT_PDF_RENDER_CONCURRENCY), PDF_RENDER_CONCURRENCY_LIMIT);

export const getSafePdfViewportScale = (
  viewport: { width: number; height: number },
  requestedScale: number = DEFAULT_PDF_VIEWPORT_SCALE
) => {
  const width = normalizePositiveNumber(viewport?.width, 0);
  const height = normalizePositiveNumber(viewport?.height, 0);

  if (width <= 0 || height <= 0) {
    throw new Error('Invalid PDF page dimensions');
  }

  const normalizedRequestedScale = normalizePositiveNumber(requestedScale, DEFAULT_PDF_VIEWPORT_SCALE);
  const dimensionScale = Math.min(PDF_MAX_CANVAS_DIMENSION / width, PDF_MAX_CANVAS_DIMENSION / height);
  const pixelScale = Math.sqrt(PDF_MAX_CANVAS_PIXELS / (width * height));
  const safeScale = Math.min(normalizedRequestedScale, dimensionScale, pixelScale);

  if (!Number.isFinite(safeScale) || safeScale <= 0) {
    throw new Error('Failed to determine a safe PDF render scale');
  }

  return safeScale;
};
