import fs from 'fs';
import path from 'path';

const DEFAULT_MAX_RETRIES = 4;
const DEFAULT_RETRY_BASE_DELAY_MS = 30_000;
const DEFAULT_RETRY_MAX_DELAY_MS = 10 * 60 * 1000;
const DEFAULT_READ_METADATA_RETRIES = 5;
const DEFAULT_READ_METADATA_RETRY_DELAY_MS = 250;
const DEFAULT_INITIAL_READ_DELAY_MS = 0;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));

const writeJsonFileAtomic = async (filePath, value) => {
  const tempFilePath = `${filePath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`;
  await fs.promises.writeFile(tempFilePath, JSON.stringify(value, null, 2));
  await fs.promises.rename(tempFilePath, filePath);
};

const normalizePositiveInteger = (value, fallbackValue) => {
  const parsedValue = Number(value);
  if (!Number.isFinite(parsedValue)) {
    return fallbackValue;
  }

  const normalizedValue = Math.trunc(parsedValue);
  return normalizedValue > 0 ? normalizedValue : fallbackValue;
};

const normalizeNonNegativeInteger = (value, fallbackValue = 0) => {
  const parsedValue = Number(value);
  if (!Number.isFinite(parsedValue)) {
    return fallbackValue;
  }

  const normalizedValue = Math.trunc(parsedValue);
  return normalizedValue >= 0 ? normalizedValue : fallbackValue;
};

const normalizeTimestamp = (value) => {
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : null;
};

const normalizeSourceRenderStatus = (value) => {
  if (value === 'pending' || value === 'processing' || value === 'completed' || value === 'error') {
    return value;
  }

  return 'completed';
};

export const getPagesPerBatch = (value, fallbackValue = 1) =>
  normalizePositiveInteger(value, fallbackValue);

export const getPageNumber = (page, fallbackValue) =>
  normalizePositiveInteger(page?.pageNumber, fallbackValue);

const isVisibleErrorPage = (page) =>
  page?.status === 'error' && page?.errorDismissed !== true;

export const getProcessedPageCount = (pages = []) =>
  pages.filter((page) => page?.status === 'completed').length;

export const getFailedPageCount = (pages = []) =>
  pages.filter(isVisibleErrorPage).length;

const getRetryQueueCount = (pages = []) =>
  pages.filter((page) => (
    page?.status !== 'completed'
    && page?.status !== 'error'
    && normalizeNonNegativeInteger(page?.retryCount, 0) > 0
  )).length;

const getDocumentStatus = (pages = []) => {
  if (pages.some((page) => page?.status === 'processing' || page?.status === 'pending')) {
    return 'processing';
  }

  if (pages.some(isVisibleErrorPage)) {
    return 'error';
  }

  return 'ready';
};

export const formatProcessingError = (error) => {
  if (!error) {
    return 'Unknown processing error';
  }

  if (typeof error === 'string') {
    return error;
  }

  const statusCode = error?.statusCode ?? error?.status ?? error?.response?.status;
  const message = typeof error?.message === 'string' && error.message.trim()
    ? error.message.trim()
    : 'Unknown processing error';

  return statusCode ? `${statusCode}: ${message}` : message;
};

const createNoTextResponseError = () => {
  const error = new Error('OCR response did not contain any text blocks');
  error.statusCode = 502;
  error.expose = true;
  return error;
};

const hasTextInBlocks = (blocks = []) =>
  blocks.some((block) => typeof block?.text === 'string' && block.text.trim().length > 0);

export const isRetryableProcessingError = (error) => {
  const statusCode = Number(error?.statusCode ?? error?.status ?? error?.response?.status);
  if ([408, 409, 425, 429, 500, 502, 503, 504].includes(statusCode)) {
    return true;
  }

  const code = typeof error?.code === 'string'
    ? error.code
    : (typeof error?.cause?.code === 'string' ? error.cause.code : '');
  if (['ECONNABORTED', 'ECONNREFUSED', 'ECONNRESET', 'EAI_AGAIN', 'ENETUNREACH', 'ENOTFOUND', 'ETIMEDOUT'].includes(code)) {
    return true;
  }

  const message = formatProcessingError(error).toLowerCase();
  return [
    '429',
    'quota',
    'rate limit',
    'resource exhausted',
    'temporarily unavailable',
    'try again later',
    'timeout',
    'timed out',
    'overloaded',
    'service unavailable',
    'internal error',
    'bad gateway',
  ].some((token) => message.includes(token));
};

const getRetryAfterMs = (error) => {
  const directValue = Number(error?.retryAfterMs);
  if (Number.isFinite(directValue) && directValue > 0) {
    return directValue;
  }

  const headerValue = error?.response?.headers?.get?.('retry-after');
  if (typeof headerValue !== 'string' || !headerValue.trim()) {
    return null;
  }

  const parsedSeconds = Number(headerValue);
  if (Number.isFinite(parsedSeconds) && parsedSeconds > 0) {
    return parsedSeconds * 1000;
  }

  const parsedDate = Date.parse(headerValue);
  return Number.isNaN(parsedDate) ? null : Math.max(0, parsedDate - Date.now());
};

const getRetryDelayMs = (retryCount, config, error) => {
  const exponentialDelay = config.retryBaseDelayMs * (2 ** Math.max(0, retryCount - 1));
  const retryAfterMs = getRetryAfterMs(error);
  const preferredDelay = retryAfterMs ? Math.max(exponentialDelay, retryAfterMs) : exponentialDelay;
  return Math.min(config.retryMaxDelayMs, Math.max(config.retryBaseDelayMs, preferredDelay));
};

const normalizePageState = (page, pageIndex, { resetInFlightProcessing = false } = {}) => {
  const normalizedPage = {
    ...(page || {}),
    pageNumber: getPageNumber(page, pageIndex + 1),
    blocks: Array.isArray(page?.blocks) ? page.blocks : [],
    blankPage: page?.blankPage === true,
    errorDismissed: page?.errorDismissed === true,
    retryCount: normalizeNonNegativeInteger(page?.retryCount, 0),
    lastError: typeof page?.lastError === 'string' ? page.lastError : '',
    nextRetryAt: normalizeTimestamp(page?.nextRetryAt),
    lastAttemptAt: normalizeTimestamp(page?.lastAttemptAt),
  };

  const rawStatus = typeof page?.status === 'string' ? page.status : 'pending';
  if (rawStatus === 'completed') {
    normalizedPage.status = 'completed';
    normalizedPage.errorDismissed = false;
    normalizedPage.retryCount = 0;
    normalizedPage.lastError = '';
    normalizedPage.nextRetryAt = null;
    return normalizedPage;
  }

  if (rawStatus === 'error') {
    normalizedPage.status = 'error';
    normalizedPage.nextRetryAt = null;
    return normalizedPage;
  }

  if (rawStatus === 'processing') {
    normalizedPage.status = resetInFlightProcessing ? 'pending' : 'processing';
    normalizedPage.errorDismissed = false;
    return normalizedPage;
  }

  normalizedPage.status = 'pending';
  normalizedPage.errorDismissed = false;
  return normalizedPage;
};

export const normalizeDocumentRuntimeState = (docData, { resetInFlightProcessing = false } = {}) => {
  const normalizedDocument = docData;
  normalizedDocument.sourceRenderStatus = normalizeSourceRenderStatus(normalizedDocument.sourceRenderStatus);
  normalizedDocument.pages = Array.isArray(normalizedDocument.pages)
    ? normalizedDocument.pages.map((page, index) => normalizePageState(page, index, { resetInFlightProcessing }))
    : [];
  normalizedDocument.pagesPerBatch = getPagesPerBatch(normalizedDocument.pagesPerBatch);
  normalizedDocument.totalPages = Math.max(
    normalizeNonNegativeInteger(normalizedDocument.totalPages, normalizedDocument.pages.length),
    normalizedDocument.pages.length
  );
  normalizedDocument.sourceRenderCompletedPages = Math.min(
    normalizeNonNegativeInteger(
      normalizedDocument.sourceRenderCompletedPages,
      normalizedDocument.sourceRenderStatus === 'completed' ? normalizedDocument.totalPages : 0
    ),
    normalizedDocument.totalPages
  );
  if (typeof normalizedDocument.sourceRenderError === 'string' && normalizedDocument.sourceRenderError.trim()) {
    normalizedDocument.sourceRenderError = normalizedDocument.sourceRenderError.trim();
  } else {
    delete normalizedDocument.sourceRenderError;
  }
  normalizedDocument.processedPages = getProcessedPageCount(normalizedDocument.pages);
  normalizedDocument.failedPages = getFailedPageCount(normalizedDocument.pages);
  normalizedDocument.retryingPages = getRetryQueueCount(normalizedDocument.pages);

  if (normalizedDocument.sourceRenderStatus === 'pending' || normalizedDocument.sourceRenderStatus === 'processing') {
    normalizedDocument.status = 'uploading';
    normalizedDocument.processedPages = 0;
    normalizedDocument.failedPages = 0;
    normalizedDocument.retryingPages = 0;
    return normalizedDocument;
  }

  if (normalizedDocument.sourceRenderStatus === 'error') {
    normalizedDocument.status = 'error';
    normalizedDocument.processedPages = 0;
    normalizedDocument.failedPages = 0;
    normalizedDocument.retryingPages = 0;
    return normalizedDocument;
  }

  normalizedDocument.status = getDocumentStatus(normalizedDocument.pages);
  return normalizedDocument;
};

const documentNeedsBackgroundProcessing = (docData) =>
  (!docData?.sourceRenderStatus || docData.sourceRenderStatus === 'completed')
  &&
  Array.isArray(docData?.pages)
  && docData.pages.some((page) => page?.status !== 'completed' && page?.status !== 'error');

const readMetadataWithRetry = async (metadataPath, config, logger) => {
  for (let attempt = 0; attempt < config.readMetadataRetries; attempt += 1) {
    try {
      if (!fs.existsSync(metadataPath)) {
        return null;
      }

      const content = await fs.promises.readFile(metadataPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      logger.warn(`Attempt ${attempt + 1} to read metadata failed: ${error.message}`);
      await sleep(config.readMetadataRetryDelayMs);
    }
  }

  return null;
};

export const normalizeProcessPageResult = (result) => {
  if (Array.isArray(result)) {
    if (!hasTextInBlocks(result)) {
      throw createNoTextResponseError();
    }

    return { blocks: result, blankPage: false };
  }

  const blankPage = result?.blankPage === true;
  const blocks = Array.isArray(result?.blocks) ? result.blocks : [];

  if (!blankPage && !hasTextInBlocks(blocks)) {
    throw createNoTextResponseError();
  }

  return {
    blocks: blankPage ? [] : blocks,
    blankPage,
  };
};

export const createDocumentProcessingManager = ({
  dataDir,
  resolveDocumentDir,
  processPage,
  blocksToMarkdown,
  logger = console,
  config = {},
}) => {
  const runtimeConfig = {
    maxRetries: normalizeNonNegativeInteger(config.maxRetries ?? process.env.OCR_MAX_RETRIES, DEFAULT_MAX_RETRIES),
    retryBaseDelayMs: normalizePositiveInteger(config.retryBaseDelayMs ?? process.env.OCR_RETRY_BASE_DELAY_MS, DEFAULT_RETRY_BASE_DELAY_MS),
    retryMaxDelayMs: normalizePositiveInteger(config.retryMaxDelayMs ?? process.env.OCR_RETRY_MAX_DELAY_MS, DEFAULT_RETRY_MAX_DELAY_MS),
    readMetadataRetries: normalizePositiveInteger(config.readMetadataRetries, DEFAULT_READ_METADATA_RETRIES),
    readMetadataRetryDelayMs: normalizePositiveInteger(config.readMetadataRetryDelayMs, DEFAULT_READ_METADATA_RETRY_DELAY_MS),
    initialReadDelayMs: normalizeNonNegativeInteger(config.initialReadDelayMs, DEFAULT_INITIAL_READ_DELAY_MS),
  };

  const activeProcessing = new Set();

  const processDocumentBackground = async (docId) => {
    if (activeProcessing.has(docId)) {
      logger.log(`Document ${docId} is already being processed.`);
      return;
    }

    activeProcessing.add(docId);
    logger.log(`Starting background processing for ${docId}`);

    try {
      const docDir = resolveDocumentDir(docId);
      const metadataPath = path.join(docDir, 'metadata.json');

      if (runtimeConfig.initialReadDelayMs > 0) {
        await sleep(runtimeConfig.initialReadDelayMs);
      }

      let docData = await readMetadataWithRetry(metadataPath, runtimeConfig, logger);
      if (!docData) {
        logger.error(`Failed to read metadata for ${docId} after multiple attempts.`);
        return;
      }

      normalizeDocumentRuntimeState(docData, { resetInFlightProcessing: true });
      docData.status = 'processing';

      let metadataWriteQueue = Promise.resolve();
      const syncUserManagedMetadata = async () => {
        try {
          if (!fs.existsSync(metadataPath)) {
            return;
          }

          const latestMetadata = JSON.parse(await fs.promises.readFile(metadataPath, 'utf-8'));
          if (typeof latestMetadata?.name === 'string' && latestMetadata.name.trim()) {
            docData.name = latestMetadata.name.trim();
          }

          if (latestMetadata?.parentId === null || typeof latestMetadata?.parentId === 'string') {
            docData.parentId = latestMetadata.parentId;
          }

          docData.isRead = latestMetadata?.isRead === true;
          docData.labels = Array.isArray(latestMetadata?.labels) ? latestMetadata.labels : [];

          if (typeof latestMetadata?.savedText === 'string') {
            docData.savedText = latestMetadata.savedText;
          } else {
            delete docData.savedText;
          }

          if (latestMetadata?.pageSavedTexts && typeof latestMetadata.pageSavedTexts === 'object' && !Array.isArray(latestMetadata.pageSavedTexts)) {
            docData.pageSavedTexts = latestMetadata.pageSavedTexts;
          } else {
            delete docData.pageSavedTexts;
          }
        } catch (error) {
          logger.warn(`Failed to sync latest metadata for ${docId}: ${error.message}`);
        }
      };

      const persistMetadata = async () => {
        await syncUserManagedMetadata();
        normalizeDocumentRuntimeState(docData);
        if (documentNeedsBackgroundProcessing(docData)) {
          docData.status = 'processing';
        }

        metadataWriteQueue = metadataWriteQueue
          .catch(() => {})
          .then(() => writeJsonFileAtomic(metadataPath, docData));
        await metadataWriteQueue;
      };

      await persistMetadata();

      while (documentNeedsBackgroundProcessing(docData)) {
        const now = Date.now();
        const pagesReadyNow = docData.pages
          .map((page, pageIndex) => ({ page, pageIndex, pageNumber: getPageNumber(page, pageIndex + 1) }))
          .filter(({ page }) => (
            page.status !== 'completed'
            && page.status !== 'error'
            && (!page.nextRetryAt || page.nextRetryAt <= now)
          ))
          .sort((left, right) => left.pageNumber - right.pageNumber);

        if (pagesReadyNow.length === 0) {
          const nextRetryAt = docData.pages
            .filter((page) => page.status !== 'completed' && page.status !== 'error')
            .map((page) => page.nextRetryAt)
            .filter(Boolean)
            .sort((left, right) => left - right)[0];

          if (!nextRetryAt) {
            break;
          }

          await sleep(Math.max(0, nextRetryAt - Date.now()));
          continue;
        }

        const batch = pagesReadyNow.slice(0, docData.pagesPerBatch);
        const attemptStartedAt = Date.now();
        batch.forEach(({ pageIndex }) => {
          if (docData.pages[pageIndex] && docData.pages[pageIndex].status !== 'completed') {
            docData.pages[pageIndex].status = 'processing';
            docData.pages[pageIndex].errorDismissed = false;
            docData.pages[pageIndex].lastAttemptAt = attemptStartedAt;
            docData.pages[pageIndex].nextRetryAt = null;
          }
        });
        await persistMetadata();

        await Promise.all(batch.map(async ({ pageIndex, pageNumber }) => {
          if (!docData.pages[pageIndex]) {
            return;
          }

          logger.log(`Processing page ${pageNumber}/${docData.pages.length} for ${docId}`);

          try {
            const currentPage = docData.pages[pageIndex];
            if (!currentPage) {
              return;
            }

            const filename = path.basename(currentPage.imageUrl);
            const imagePath = path.join(docDir, filename);

            if (!fs.existsSync(imagePath)) {
              const notFoundError = new Error(`Image file not found: ${imagePath}`);
              notFoundError.statusCode = 404;
              throw notFoundError;
            }

            const imageBuffer = await fs.promises.readFile(imagePath);
            const base64Image = imageBuffer.toString('base64');
            const mimeType = path.extname(filename).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg';

            const result = await processPage({
              modelProvider: docData.ocrProvider,
              base64Image,
              mimeType,
              modelName: docData.modelUsed,
              processingMode: docData.processingMode,
              targetLanguage: docData.targetLanguage,
              customPrompt: docData.customPrompt,
              removeReferences: docData.removeReferences !== false,
              splitColumns: docData.splitColumns === true,
              docId,
              pageIndex,
              pageNumber,
            });
            const { blocks, blankPage } = normalizeProcessPageResult(result);

            const latestPage = docData.pages[pageIndex];
            if (!latestPage) {
              return;
            }

            latestPage.blocks = blocks;
            latestPage.status = 'completed';
            latestPage.blankPage = blankPage;
            latestPage.errorDismissed = false;
            latestPage.retryCount = 0;
            latestPage.lastError = '';
            latestPage.nextRetryAt = null;

            const mdContent = blocksToMarkdown(latestPage.blocks);
            await fs.promises.writeFile(path.join(docDir, `page_${pageNumber}.md`), mdContent);
            await persistMetadata();
          } catch (error) {
            logger.error(`Error processing page ${pageNumber} of ${docId}:`, error);
            const latestPage = docData.pages[pageIndex];
            if (!latestPage) {
              return;
            }

            latestPage.lastError = formatProcessingError(error);
            latestPage.errorDismissed = false;
            latestPage.retryCount = normalizeNonNegativeInteger(latestPage.retryCount, 0) + 1;

            if (isRetryableProcessingError(error) && latestPage.retryCount <= runtimeConfig.maxRetries) {
              latestPage.status = 'pending';
              latestPage.nextRetryAt = Date.now() + getRetryDelayMs(latestPage.retryCount, runtimeConfig, error);
            } else {
              latestPage.status = 'error';
              latestPage.nextRetryAt = null;
            }

            await persistMetadata();
          }
        }));
      }

      normalizeDocumentRuntimeState(docData);
      await persistMetadata();
      logger.log(`Finished background processing for ${docId}`);
    } catch (error) {
      logger.error(`Fatal error in background processing for ${docId}:`, error);
      try {
        const metadataPath = path.join(resolveDocumentDir(docId), 'metadata.json');
        if (fs.existsSync(metadataPath)) {
          const currentData = JSON.parse(await fs.promises.readFile(metadataPath, 'utf-8'));
          normalizeDocumentRuntimeState(currentData, { resetInFlightProcessing: true });
          currentData.status = 'error';
          await writeJsonFileAtomic(metadataPath, currentData);
        }
      } catch (updateError) {
        logger.error('Failed to update document error status', updateError);
      }
    } finally {
      activeProcessing.delete(docId);
    }
  };

  const resumePendingDocuments = async () => {
    if (!fs.existsSync(dataDir)) {
      return;
    }

    const entries = await fs.promises.readdir(dataDir, { withFileTypes: true });
    const tasks = entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const metadataPath = path.join(dataDir, entry.name, 'metadata.json');
        if (!fs.existsSync(metadataPath)) {
          return;
        }

        try {
          const docData = JSON.parse(await fs.promises.readFile(metadataPath, 'utf-8'));
          normalizeDocumentRuntimeState(docData, { resetInFlightProcessing: true });
          await writeJsonFileAtomic(metadataPath, docData);
          if (!documentNeedsBackgroundProcessing(docData)) {
            return;
          }

          await processDocumentBackground(entry.name);
        } catch (error) {
          logger.error(`Failed to resume processing for ${entry.name}:`, error);
        }
      });

    await Promise.all(tasks);
  };

  return {
    processDocumentBackground,
    resumePendingDocuments,
    isDocumentProcessing: (docId) => activeProcessing.has(docId),
  };
};
