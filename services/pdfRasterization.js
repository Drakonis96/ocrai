import path from 'path';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createCanvas } from '@napi-rs/canvas';
import sharp from 'sharp';
import { fileURLToPath } from 'url';

const DEFAULT_PDF_RENDER_SCALE = 2;
const DEFAULT_PDF_RENDER_CONCURRENCY = 4;
const PDF_MAX_RENDER_DIMENSION = 3072;
const PDF_MAX_RENDER_PIXELS = 12_000_000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PDFJS_DIST_DIR = path.resolve(__dirname, '../node_modules/pdfjs-dist');

const toDirectoryPath = (dirPath) => (dirPath.endsWith(path.sep) ? dirPath : `${dirPath}${path.sep}`);

const PDFJS_ASSET_URLS = {
  wasmUrl: toDirectoryPath(path.join(PDFJS_DIST_DIR, 'wasm')),
  iccUrl: toDirectoryPath(path.join(PDFJS_DIST_DIR, 'iccs')),
  cMapUrl: toDirectoryPath(path.join(PDFJS_DIST_DIR, 'cmaps')),
  standardFontDataUrl: toDirectoryPath(path.join(PDFJS_DIST_DIR, 'standard_fonts')),
};

const normalizePositiveNumber = (value, fallbackValue) => {
  const parsedValue = Number(value);
  if (!Number.isFinite(parsedValue)) {
    return fallbackValue;
  }

  return parsedValue > 0 ? parsedValue : fallbackValue;
};

const normalizePositiveInteger = (value, fallbackValue) => {
  const parsedValue = Number(value);
  if (!Number.isFinite(parsedValue)) {
    return fallbackValue;
  }

  const normalizedValue = Math.trunc(parsedValue);
  return normalizedValue > 0 ? normalizedValue : fallbackValue;
};

const getSafePdfRenderScale = (viewport, requestedScale = DEFAULT_PDF_RENDER_SCALE) => {
  const width = normalizePositiveNumber(viewport?.width, 0);
  const height = normalizePositiveNumber(viewport?.height, 0);

  if (width <= 0 || height <= 0) {
    throw new Error('Invalid PDF page dimensions');
  }

  const normalizedRequestedScale = normalizePositiveNumber(requestedScale, DEFAULT_PDF_RENDER_SCALE);
  const dimensionScale = Math.min(PDF_MAX_RENDER_DIMENSION / width, PDF_MAX_RENDER_DIMENSION / height);
  const pixelScale = Math.sqrt(PDF_MAX_RENDER_PIXELS / (width * height));
  const safeScale = Math.min(normalizedRequestedScale, dimensionScale, pixelScale);

  if (!Number.isFinite(safeScale) || safeScale <= 0) {
    throw new Error('Failed to determine a safe PDF render scale');
  }

  return safeScale;
};

class NodeCanvasFactory {
  create(width, height) {
    const canvas = createCanvas(Math.max(1, Math.ceil(width)), Math.max(1, Math.ceil(height)));
    const context = canvas.getContext('2d');
    return { canvas, context };
  }

  reset(target, width, height) {
    target.canvas.width = Math.max(1, Math.ceil(width));
    target.canvas.height = Math.max(1, Math.ceil(height));
  }

  destroy(target) {
    target.canvas.width = 0;
    target.canvas.height = 0;
  }
}

const createPdfLoadingTask = (pdfBuffer) => pdfjsLib.getDocument({
  data: new Uint8Array(pdfBuffer),
  disableWorker: true,
  useWorkerFetch: false,
  useWasm: true,
  useSystemFonts: true,
  isEvalSupported: false,
  cMapPacked: true,
  ...PDFJS_ASSET_URLS,
});

export const getPdfPageCount = async (pdfBuffer) => {
  const loadingTask = createPdfLoadingTask(pdfBuffer);

  try {
    const pdf = await loadingTask.promise;
    return pdf.numPages;
  } finally {
    await loadingTask.destroy();
  }
};

export const renderPdfToPageImages = async (pdfBuffer, options = {}) => {
  const requestedScale = normalizePositiveNumber(options.scale, DEFAULT_PDF_RENDER_SCALE);
  const loadingTask = createPdfLoadingTask(pdfBuffer);
  const pdf = await loadingTask.promise;
  const canvasFactory = new NodeCanvasFactory();
  const onPageRendered = typeof options.onPageRendered === 'function' ? options.onPageRendered : null;
  const renderConcurrency = Math.min(
    normalizePositiveInteger(options.concurrency, DEFAULT_PDF_RENDER_CONCURRENCY),
    pdf.numPages || 1
  );

  try {
    const renderedPages = new Array(pdf.numPages);
    let completedPages = 0;

    const renderPage = async (pageNumber) => {
      const page = await pdf.getPage(pageNumber);

      try {
        const baseViewport = page.getViewport({ scale: 1 });
        const safeScale = getSafePdfRenderScale(baseViewport, requestedScale);
        const viewport = page.getViewport({ scale: safeScale });
        const { canvas, context } = canvasFactory.create(viewport.width, viewport.height);

        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);

        await page.render({
          canvasContext: context,
          viewport,
          canvasFactory,
          intent: 'display',
        }).promise;

        const pngBuffer = canvas.toBuffer('image/png');
        const jpegBuffer = await sharp(pngBuffer)
          .flatten({ background: '#ffffff' })
          .jpeg({ quality: 90, mozjpeg: true })
          .toBuffer();

        renderedPages[pageNumber - 1] = {
          pageNumber,
          mimeType: 'image/jpeg',
          extension: 'jpg',
          buffer: jpegBuffer,
        };

        completedPages += 1;

        if (onPageRendered) {
          await onPageRendered({
            renderedPage: renderedPages[pageNumber - 1],
            completedPages,
            totalPages: pdf.numPages,
          });
        }

        canvasFactory.destroy({ canvas, context });
      } finally {
        page.cleanup();
      }

      return renderedPages[pageNumber - 1];
    };

    let nextPageNumber = 1;
    await Promise.all(Array.from({ length: renderConcurrency }, async () => {
      while (true) {
        const pageNumber = nextPageNumber;
        nextPageNumber += 1;

        if (pageNumber > pdf.numPages) {
          return;
        }

        await renderPage(pageNumber);
      }
    }));

    return renderedPages;
  } finally {
    await loadingTask.destroy();
  }
};