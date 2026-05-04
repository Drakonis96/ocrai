import express from 'express';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import crypto, { randomUUID } from 'crypto';
import { GoogleGenAI, Type } from "@google/genai";
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import sharp from 'sharp';
import { getPdfPageCount, renderPdfToPageImages } from './services/pdfRasterization.js';
import { handleLoginAttempt, verifySession, logoutSession } from './services/authService.js';
import {
  createDocumentProcessingManager,
  formatProcessingError,
  getPageNumber,
  getPagesPerBatch,
  normalizeProcessPageResult,
  normalizeDocumentRuntimeState,
} from './services/documentProcessing.js';
import { buildOcrPrompt } from './services/ocrPromptBuilder.js';
import {
  DEFAULT_PROVIDER_CONNECTIONS,
  LOCAL_OCR_PROVIDERS,
  autodetectLmStudioModels,
  autodetectOllamaModels,
  normalizeOcrProvider,
  normalizeProviderConnection,
  requestStructuredOutputFromLmStudio,
  requestStructuredOutputFromOllama,
  sanitizeOcrModel,
} from './services/ocrProviderService.js';

// Load environment variables
dotenv.config({ path: '.env.local' });
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT || 5037);
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const TRUST_PROXY = process.env.TRUST_PROXY;
const DATA_DIR = path.join(__dirname, 'data');
const SESSION_COOKIE_NAME = IS_PRODUCTION ? '__Host-session_id' : 'session_id';
const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: IS_PRODUCTION,
  sameSite: 'strict',
  path: '/',
  maxAge: 24 * 60 * 60 * 1000,
  priority: 'high',
};
const DEV_CORS_ORIGINS = new Set(['http://localhost:5173', 'http://127.0.0.1:5173']);
const CONFIGURED_CORS_ORIGINS = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const DOCUMENT_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const SAFE_FILE_BASENAME_PATTERN = /[^A-Za-z0-9._-]+/g;
const ALLOWED_IMAGE_MIME_TYPES = new Map([
  ['image/jpeg', 'jpg'],
  ['image/jpg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
]);
const DEFAULT_METADATA_READ_RETRIES = 5;
const DEFAULT_METADATA_READ_RETRY_DELAY_MS = 25;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));

const parseTrustProxy = (value) => {
  if (!value) {
    return IS_PRODUCTION ? 1 : false;
  }

  const numericValue = Number(value);
  return Number.isNaN(numericValue) ? value : numericValue;
};

const createPublicError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.expose = true;
  return error;
};

const handleRouteError = (res, context, error, fallbackMessage = 'Internal server error') => {
  console.error(`${context}:`, error);
  const statusCode = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
  const message = error?.expose ? error.message : fallbackMessage;
  res.status(statusCode).json({ error: message });
};

const assertDocumentId = (value) => {
  const docId = typeof value === 'string' ? value.trim() : '';
  if (!DOCUMENT_ID_PATTERN.test(docId)) {
    throw createPublicError(400, 'Invalid document ID');
  }

  return docId;
};

const resolveDocumentDir = (docId) => path.join(DATA_DIR, assertDocumentId(docId));

const sanitizeDocumentBaseName = (value) => {
  const baseName = path.basename(typeof value === 'string' ? value.trim() : '');
  const withoutExtension = baseName.replace(/\.[^/.]+$/, '');
  const sanitized = withoutExtension
    .replace(SAFE_FILE_BASENAME_PATTERN, '_')
    .replace(/^_+|_+$/g, '');

  return sanitized || 'document';
};

const getImageExtensionForMimeType = (value) => {
  const mimeType = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return ALLOWED_IMAGE_MIME_TYPES.get(mimeType) || null;
};

const normalizeUploadedSourceFile = (value) => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const mimeType = typeof value.mimeType === 'string' ? value.mimeType.trim().toLowerCase() : '';
  const data = typeof value.data === 'string' ? value.data.trim() : '';
  const name = typeof value.name === 'string' ? value.name.trim() : '';

  if (!mimeType || !data) {
    return null;
  }

  return { mimeType, data, name };
};

const createPendingRasterizedPage = (pageNumber) => ({
  pageNumber,
  imageUrl: '',
  blocks: [],
  status: 'pending',
  blankPage: false,
  errorDismissed: false,
  retryCount: 0,
  lastError: '',
  nextRetryAt: null,
  lastAttemptAt: null,
});

const createRasterizedPageMetadata = (docId, renderedPage, existingPage = null) => ({
  ...(existingPage && typeof existingPage === 'object' ? existingPage : {}),
  ...createPendingRasterizedPage(renderedPage.pageNumber),
  pageNumber: renderedPage.pageNumber,
  imageUrl: `/api/data/${docId}/page_${renderedPage.pageNumber}.${renderedPage.extension}`,
});

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

const findPageIndexByNumber = (pages, pageNumber, fallbackIndex) => {
  const targetPageNumber = normalizePositiveInteger(pageNumber, fallbackIndex + 1);
  const pageIndex = pages.findIndex((page, index) => getPageNumber(page, index + 1) === targetPageNumber);
  return pageIndex >= 0 ? pageIndex : fallbackIndex;
};

const readJsonFileWithRetry = async (
  filePath,
  {
    retries = DEFAULT_METADATA_READ_RETRIES,
    retryDelayMs = DEFAULT_METADATA_READ_RETRY_DELAY_MS,
  } = {}
) => {
  let lastError = null;

  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      return JSON.parse(await fs.promises.readFile(filePath, 'utf-8'));
    } catch (error) {
      lastError = error;

      if (attempt === retries - 1) {
        break;
      }

      await sleep(retryDelayMs);
    }
  }

  throw lastError;
};

const writeJsonFileAtomic = async (filePath, value) => {
  const tempFilePath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  await fs.promises.writeFile(tempFilePath, JSON.stringify(value, null, 2));
  await fs.promises.rename(tempFilePath, filePath);
};

app.disable('x-powered-by');
app.set('trust proxy', parseTrustProxy(TRUST_PROXY));

if (!IS_PRODUCTION || CONFIGURED_CORS_ORIGINS.length > 0) {
  app.use(cors({
    origin(origin, callback) {
      if (!origin) {
        return callback(null, true);
      }

      if ((!IS_PRODUCTION && DEV_CORS_ORIGINS.has(origin)) || CONFIGURED_CORS_ORIGINS.includes(origin)) {
        return callback(null, true);
      }

      return callback(createPublicError(403, 'Origin not allowed'));
    },
    credentials: true,
  }));
}

app.use(helmet(
  IS_PRODUCTION
    ? {
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:', 'blob:'],
            connectSrc: ["'self'"],
            fontSrc: ["'self'", 'data:'],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"],
            frameAncestors: ["'self'"],
            workerSrc: ["'self'", 'blob:'],
          },
        },
      }
    : {
        contentSecurityPolicy: false,
      }
));
app.use(cookieParser());

// Increase limit for image uploads
app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ limit: '500mb', extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Serve static files from the build directory
app.use(express.static(path.join(__dirname, 'dist')));
// Also serve public directory as fallback (useful if build didn't copy or for direct access)
app.use(express.static(path.join(__dirname, 'public')));

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR);
}

const MODELS_FILE = path.join(DATA_DIR, 'models.json');
const OCR_SETTINGS_FILE = path.join(DATA_DIR, 'ocr-settings.json');
const PROMPTS_FILE = path.join(DATA_DIR, 'prompts.json');
const LABELS_FILE = path.join(DATA_DIR, 'labels.json');
const LABELING_SETTINGS_FILE = path.join(DATA_DIR, 'labeling-settings.json');
const DEFAULT_MODEL_ID = 'gemini-flash-lite-latest';
const DEFAULT_OCR_PROVIDER = 'gemini';
const DEFAULT_LABELING_SETTINGS = {
  autoLabelDocuments: false,
};

const DEFAULT_MODELS = [
  { id: DEFAULT_MODEL_ID, name: 'Gemini Flash Lite Latest', description: 'Cheapest', provider: 'gemini' },
  { id: 'gemini-flash-latest', name: 'Gemini Flash Latest', description: 'Balanced', provider: 'gemini' },
];
const BlockLabelValues = [
  'TITLE', 'MAIN_TEXT', 'FOOTNOTE', 'HEADER', 'FOOTER', 'CAPTION', 'UNKNOWN'
];

const REMOVED_MODEL_IDS = new Set(['gemini-2.5-flash', 'gemini-2.5-flash-lite']);
const DEFAULT_OCR_SETTINGS = {
  provider: DEFAULT_OCR_PROVIDER,
  selectedModelId: DEFAULT_MODEL_ID,
  lmStudio: { ...DEFAULT_PROVIDER_CONNECTIONS.lmstudio },
  ollama: { ...DEFAULT_PROVIDER_CONNECTIONS.ollama },
};

const sanitizeModel = (model) => {
  const sanitized = sanitizeOcrModel(model);
  if (!sanitized || REMOVED_MODEL_IDS.has(sanitized.id)) {
    return null;
  }

  return sanitized;
};

const sortModels = (models) => {
  const defaultKeys = new Set(DEFAULT_MODELS.map((model) => `${model.provider}:${model.id}`));
  const defaults = DEFAULT_MODELS.map((model) => ({ ...model }));
  const customs = models
    .filter((model) => !defaultKeys.has(`${model.provider}:${model.id}`))
    .sort((left, right) => (
      left.provider.localeCompare(right.provider, undefined, { sensitivity: 'base' })
      || left.name.localeCompare(right.name, undefined, { sensitivity: 'base' })
    ))
    .map((model) => ({
      ...model,
      isCustom: model.isCustom === true,
      isAutodetected: model.isAutodetected === true,
    }));

  return [...defaults, ...customs];
};

const readCustomModels = async () => {
  if (!fs.existsSync(MODELS_FILE)) {
    return [];
  }

  const data = await fs.promises.readFile(MODELS_FILE, 'utf-8');
  const parsed = JSON.parse(data);
  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed
    .map(sanitizeModel)
    .filter(Boolean);
};

const writeCustomModels = async (models) => {
  const sanitized = models
    .map(sanitizeModel)
    .filter(Boolean)
    .filter((model, index, collection) => collection.findIndex((entry) => (
      entry.provider === model.provider && entry.id === model.id
    )) === index)
    .sort((left, right) => (
      left.provider.localeCompare(right.provider, undefined, { sensitivity: 'base' })
      || left.name.localeCompare(right.name, undefined, { sensitivity: 'base' })
    ));

  await fs.promises.writeFile(MODELS_FILE, JSON.stringify(sanitized, null, 2));
  return sanitized;
};

const getAllModels = async () => {
  const customModels = await readCustomModels();
  return sortModels(customModels);
};

const normalizeOcrSettings = (settings, models = DEFAULT_MODELS) => {
  const provider = normalizeOcrProvider(settings?.provider);
  const selectedModelId = typeof settings?.selectedModelId === 'string' ? settings.selectedModelId.trim() : '';
  const providerModels = models.filter((model) => model.provider === provider);
  const preferredModelId = providerModels.some((model) => model.id === selectedModelId)
    ? selectedModelId
    : (providerModels[0]?.id ?? (provider === DEFAULT_OCR_PROVIDER ? DEFAULT_MODEL_ID : ''));

  return {
    provider,
    selectedModelId: preferredModelId,
    lmStudio: normalizeProviderConnection('lmstudio', settings?.lmStudio),
    ollama: normalizeProviderConnection('ollama', settings?.ollama),
  };
};

const mergeOcrSettings = (baseSettings, nextSettings) => {
  if (!nextSettings || typeof nextSettings !== 'object') {
    return baseSettings;
  }

  return {
    ...baseSettings,
    ...nextSettings,
    lmStudio: {
      ...baseSettings.lmStudio,
      ...(nextSettings.lmStudio && typeof nextSettings.lmStudio === 'object' ? nextSettings.lmStudio : {}),
    },
    ollama: {
      ...baseSettings.ollama,
      ...(nextSettings.ollama && typeof nextSettings.ollama === 'object' ? nextSettings.ollama : {}),
    },
  };
};

const readOcrSettings = async (models = DEFAULT_MODELS) => {
  if (!fs.existsSync(OCR_SETTINGS_FILE)) {
    return normalizeOcrSettings(DEFAULT_OCR_SETTINGS, models);
  }

  const data = await fs.promises.readFile(OCR_SETTINGS_FILE, 'utf-8');
  const parsed = JSON.parse(data);
  const normalized = normalizeOcrSettings(parsed, models);
  const normalizedJson = JSON.stringify(normalized, null, 2);

  if (normalizedJson !== JSON.stringify(parsed, null, 2)) {
    await fs.promises.writeFile(OCR_SETTINGS_FILE, normalizedJson);
  }

  return normalized;
};

const writeOcrSettings = async (settings, models = DEFAULT_MODELS) => {
  const normalized = normalizeOcrSettings(settings, models);
  await fs.promises.writeFile(OCR_SETTINGS_FILE, JSON.stringify(normalized, null, 2));
  return normalized;
};

const normalizePrompt = (prompt) => {
  const name = typeof prompt?.name === 'string' ? prompt.name.trim() : '';
  const content = typeof prompt?.prompt === 'string' ? prompt.prompt.trim() : '';

  if (!name || !content) {
    return null;
  }

  const now = Date.now();
  return {
    id: typeof prompt?.id === 'string' && prompt.id.trim() ? prompt.id.trim() : randomUUID(),
    name,
    prompt: content,
    createdAt: typeof prompt?.createdAt === 'number' ? prompt.createdAt : now,
    updatedAt: typeof prompt?.updatedAt === 'number' ? prompt.updatedAt : now,
  };
};

const sortPrompts = (prompts) =>
  [...prompts].sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }));

const readPrompts = async () => {
  if (!fs.existsSync(PROMPTS_FILE)) {
    return [];
  }

  const data = await fs.promises.readFile(PROMPTS_FILE, 'utf-8');
  const parsed = JSON.parse(data);
  if (!Array.isArray(parsed)) {
    return [];
  }

  const normalized = parsed
    .map(normalizePrompt)
    .filter(Boolean)
    .filter((prompt, index, collection) => collection.findIndex((entry) => entry.id === prompt.id) === index);

  const sorted = sortPrompts(normalized);
  const normalizedJson = JSON.stringify(sorted, null, 2);
  if (normalizedJson !== JSON.stringify(parsed, null, 2)) {
    await fs.promises.writeFile(PROMPTS_FILE, normalizedJson);
  }

  return sorted;
};

const writePrompts = async (prompts) => {
  const normalized = sortPrompts(
    prompts
      .map(normalizePrompt)
      .filter(Boolean)
      .filter((prompt, index, collection) => collection.findIndex((entry) => entry.id === prompt.id) === index)
  );

  await fs.promises.writeFile(PROMPTS_FILE, JSON.stringify(normalized, null, 2));
  return normalized;
};

const normalizeLabelName = (value) => {
  const name = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  return name || null;
};

const normalizeDocumentLabels = (labels) => {
  if (!Array.isArray(labels)) {
    return [];
  }

  const seen = new Set();
  const normalized = [];

  labels.forEach((label) => {
    const normalizedLabel = normalizeLabelName(label);
    if (!normalizedLabel) {
      return;
    }

    const key = normalizedLabel.toLowerCase();
    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    normalized.push(normalizedLabel);
  });

  return normalized;
};

const sortLabels = (labels) =>
  [...labels].sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }));

const readLabels = async () => {
  if (!fs.existsSync(LABELS_FILE)) {
    return [];
  }

  const data = await fs.promises.readFile(LABELS_FILE, 'utf-8');
  const parsed = JSON.parse(data);
  const normalized = sortLabels(normalizeDocumentLabels(parsed));
  const normalizedJson = JSON.stringify(normalized, null, 2);

  if (normalizedJson !== JSON.stringify(parsed, null, 2)) {
    await fs.promises.writeFile(LABELS_FILE, normalizedJson);
  }

  return normalized;
};

const writeLabels = async (labels) => {
  const normalized = sortLabels(normalizeDocumentLabels(labels));
  await fs.promises.writeFile(LABELS_FILE, JSON.stringify(normalized, null, 2));
  return normalized;
};

const normalizeLabelingSettings = (settings) => ({
  autoLabelDocuments: settings?.autoLabelDocuments === true,
});

const readLabelingSettings = async () => {
  if (!fs.existsSync(LABELING_SETTINGS_FILE)) {
    return { ...DEFAULT_LABELING_SETTINGS };
  }

  const data = await fs.promises.readFile(LABELING_SETTINGS_FILE, 'utf-8');
  const parsed = JSON.parse(data);
  const normalized = normalizeLabelingSettings(parsed);
  const normalizedJson = JSON.stringify(normalized, null, 2);

  if (normalizedJson !== JSON.stringify(parsed, null, 2)) {
    await fs.promises.writeFile(LABELING_SETTINGS_FILE, normalizedJson);
  }

  return normalized;
};

const writeLabelingSettings = async (settings) => {
  const normalized = normalizeLabelingSettings(settings);
  await fs.promises.writeFile(LABELING_SETTINGS_FILE, JSON.stringify(normalized, null, 2));
  return normalized;
};

const buildLocalResponseSchema = (properties, required) => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});

const OCR_RESPONSE_JSON_SCHEMA = buildLocalResponseSchema({
  blankPage: { type: 'boolean' },
  blocks: {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        text: { type: 'string' },
        label: {
          type: 'string',
          enum: BlockLabelValues,
        },
        box_2d: {
          type: 'array',
          items: { type: 'number' },
        },
      },
      required: ['text', 'label'],
      additionalProperties: false,
    },
  },
}, ['blankPage', 'blocks']);

const LABEL_SELECTION_JSON_SCHEMA = buildLocalResponseSchema({
  labels: {
    type: 'array',
    items: { type: 'string' },
  },
}, ['labels']);

const getStructuredOutputFromLocalProvider = async ({
  provider,
  modelName,
  prompt,
  responseSchema,
  image,
}) => {
  const models = await getAllModels();
  const ocrSettings = await readOcrSettings(models);
  const connection = provider === 'lmstudio' ? ocrSettings.lmStudio : ocrSettings.ollama;

  if (provider === 'lmstudio') {
    return requestStructuredOutputFromLmStudio({
      connection,
      modelName,
      prompt,
      responseSchema,
      image,
    });
  }

  return requestStructuredOutputFromOllama({
    connection,
    modelName,
    prompt,
    responseSchema,
    image,
  });
};

const selectLabelsForDocumentName = async (
  documentName,
  availableLabels,
  modelName = DEFAULT_MODEL_ID,
  modelProvider = DEFAULT_OCR_PROVIDER
) => {
  const normalizedDocumentName = typeof documentName === 'string' ? documentName.trim() : '';
  const canonicalLabels = normalizeDocumentLabels(availableLabels);
  const provider = normalizeOcrProvider(modelProvider);

  if (!normalizedDocumentName || canonicalLabels.length === 0) {
    return [];
  }

  const prompt = [
    'You assign document labels using only the document name.',
    `Document name: "${normalizedDocumentName}"`,
    `Available labels: ${canonicalLabels.join(', ')}`,
    'Choose the most relevant labels from the available list.',
    'Use only labels from the available list.',
    'Return between 0 and 3 labels.',
    'Prefer fewer labels when uncertain.',
  ].join('\n');

  let parsed;
  if (provider === 'gemini') {
    if (!process.env.GEMINI_API_KEY) {
      return [];
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: modelName || DEFAULT_MODEL_ID,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            labels: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
          },
          required: ['labels'],
        },
        temperature: 0.1,
      },
    });

    const responseText = typeof response.text === 'function' ? response.text() : response.text;
    if (!responseText) {
      return [];
    }

    parsed = JSON.parse(responseText);
  } else {
    parsed = await getStructuredOutputFromLocalProvider({
      provider,
      modelName,
      prompt,
      responseSchema: LABEL_SELECTION_JSON_SCHEMA,
    });
  }

  const selectedLabels = Array.isArray(parsed?.labels) ? parsed.labels : [];
  const labelsByKey = new Map(canonicalLabels.map((label) => [label.toLowerCase(), label]));

  return normalizeDocumentLabels(selectedLabels)
    .map((label) => labelsByKey.get(label.toLowerCase()) || null)
    .filter(Boolean)
    .slice(0, 3);
};

// --- API ROUTES ---

app.post('/api/login', async (req, res) => {
  const ip = req.ip;
  const { username, password } = req.body;

  try {
    const result = await handleLoginAttempt(ip, username, password);

    if (result.locked) {
      return res.status(429).json({ error: 'Too many failed attempts. Please try again later.' });
    }

    if (result.success) {
      res.cookie(SESSION_COOKIE_NAME, result.sessionId, SESSION_COOKIE_OPTIONS);
      return res.json({ success: true });
    } else {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
  } catch (error) {
    handleRouteError(res, 'Login error', error);
  }
});

app.get('/api/models', async (req, res) => {
  try {
    res.json(await getAllModels());
  } catch (error) {
    handleRouteError(res, 'Failed to load models', error);
  }
});

app.post('/api/models', async (req, res) => {
  try {
    const model = sanitizeModel(req.body);
    if (!model) {
      return res.status(400).json({ error: 'A valid model ID is required' });
    }

    const existingModels = await getAllModels();
    if (existingModels.some((entry) => entry.id === model.id && entry.provider === model.provider)) {
      return res.status(400).json({ error: `Model with ID "${model.id}" already exists for ${model.provider}` });
    }

    const customModels = await readCustomModels();
    await writeCustomModels([...customModels, { ...model, isCustom: true, isAutodetected: false }]);
    res.json(await getAllModels());
  } catch (error) {
    handleRouteError(res, 'Failed to save model', error);
  }
});

app.delete('/api/models/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const provider = normalizeOcrProvider(req.query?.provider);
    if (DEFAULT_MODELS.some((model) => model.id === id && model.provider === provider)) {
      return res.status(400).json({ error: 'Cannot remove default models' });
    }

    const customModels = await readCustomModels();
    const nextModels = customModels.filter((model) => !(model.id === id && model.provider === provider));
    if (nextModels.length === customModels.length) {
      return res.status(404).json({ error: 'Model not found' });
    }

    await writeCustomModels(nextModels);
    res.json(await getAllModels());
  } catch (error) {
    handleRouteError(res, 'Failed to delete model', error);
  }
});

app.get('/api/ocr-settings', async (req, res) => {
  try {
    const models = await getAllModels();
    res.json(await readOcrSettings(models));
  } catch (error) {
    handleRouteError(res, 'Failed to load OCR settings', error);
  }
});

app.put('/api/ocr-settings', async (req, res) => {
  try {
    const models = await getAllModels();
    res.json(await writeOcrSettings(req.body, models));
  } catch (error) {
    handleRouteError(res, 'Failed to save OCR settings', error);
  }
});

app.post('/api/ocr-providers/:provider/models/autodetect', async (req, res) => {
  try {
    const provider = normalizeOcrProvider(req.params.provider);
    if (!LOCAL_OCR_PROVIDERS.has(provider)) {
      throw createPublicError(400, 'Autodetection is only available for LM Studio and Ollama');
    }

    const existingModels = await readCustomModels();
    const currentAllModels = sortModels(existingModels);
    const savedOcrSettings = await readOcrSettings(currentAllModels);
    const requestedOcrSettings = normalizeOcrSettings(
      mergeOcrSettings(savedOcrSettings, req.body),
      currentAllModels
    );
    const connection = provider === 'lmstudio' ? requestedOcrSettings.lmStudio : requestedOcrSettings.ollama;
    const detectedModels = provider === 'lmstudio'
      ? await autodetectLmStudioModels(connection)
      : await autodetectOllamaModels(connection);

    const remainingModels = existingModels.filter((model) => model.provider !== provider || model.isAutodetected !== true);
    const persistedModels = await writeCustomModels([
      ...remainingModels,
      ...detectedModels,
    ]);
    const allModels = sortModels(persistedModels);
    const nextSettings = await writeOcrSettings({
      ...requestedOcrSettings,
      provider,
      selectedModelId: requestedOcrSettings.provider === provider
        ? requestedOcrSettings.selectedModelId
        : (requestedOcrSettings.selectedModelId || detectedModels[0]?.id || ''),
    }, allModels);

    res.json({
      models: allModels,
      settings: nextSettings,
    });
  } catch (error) {
    handleRouteError(res, 'Failed to autodetect provider models', error);
  }
});

app.post('/api/logout', async (req, res) => {
  const sessionId = req.cookies[SESSION_COOKIE_NAME];
  if (sessionId) {
    await logoutSession(sessionId);
  }
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    secure: IS_PRODUCTION,
    sameSite: 'strict',
    path: '/',
  });
  res.json({ success: true });
});

app.get('/api/check-auth', async (req, res) => {
  const sessionId = req.cookies[SESSION_COOKIE_NAME];
  if (!sessionId) {
    return res.json({ authenticated: false });
  }
  const isValid = await verifySession(sessionId);
  res.json({ authenticated: isValid });
});

// Protect all other API routes
app.use('/api', async (req, res, next) => {
  // Skip if headers are already sent (handled by above routes)
  if (res.headersSent) return;

  const sessionId = req.cookies[SESSION_COOKIE_NAME];
  if (!sessionId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const isValid = await verifySession(sessionId);
  if (!isValid) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  next();
});

function blocksToMarkdown(blocks) {
  if (!Array.isArray(blocks)) return '';
  return blocks.map(block => {
    const text = block.text || '';
    switch (block.label) {
      case 'TITLE': return `# ${text}\n\n`;
      case 'HEADER': return `_${text}_\n\n`;
      case 'FOOTER': return `_${text}_\n\n`;
      case 'CAPTION': return `*${text}*\n\n`;
      case 'FOOTNOTE': return `^ ${text}\n\n`;
      default: return `${text}\n\n`;
    }
  }).join('');
}

async function detectColumnsFromImage(base64Image) {
  const imageBuffer = Buffer.from(base64Image, 'base64');
  const { data, info } = await sharp(imageBuffer)
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height } = info;

  // Analyze the central vertical band (skip top/bottom 25% to avoid headers/footers/titles)
  const yStart = Math.floor(height * 0.25);
  const yEnd = Math.floor(height * 0.75);
  const sampleHeight = yEnd - yStart;
  if (sampleHeight <= 0 || width <= 100) return null;

  // For each x, calculate the ratio of near-white pixels in the sample band
  const BRIGHT_THRESHOLD = 200;
  const brightRatio = new Float32Array(width);
  for (let x = 0; x < width; x++) {
    let count = 0;
    for (let y = yStart; y < yEnd; y++) {
      if (data[y * width + x] >= BRIGHT_THRESHOLD) count++;
    }
    brightRatio[x] = count / sampleHeight;
  }

  // Smooth the profile to tolerate noise and thin lines
  const SMOOTH_RADIUS = Math.max(3, Math.floor(width * 0.005));
  const smoothed = new Float32Array(width);
  for (let x = 0; x < width; x++) {
    let sum = 0, n = 0;
    for (let k = Math.max(0, x - SMOOTH_RADIUS); k <= Math.min(width - 1, x + SMOOTH_RADIUS); k++) {
      sum += brightRatio[k]; n++;
    }
    smoothed[x] = sum / n;
  }

  // Find gutter candidates: continuous high-brightness vertical strips in the inner 80% of width
  const GUTTER_BRIGHT_THRESHOLD = 0.85;
  const MIN_GUTTER_PX = Math.max(8, Math.floor(width * 0.015));
  const margin = Math.floor(width * 0.1);
  const gutters = [];
  let gutterStart = -1;

  for (let x = margin; x < width - margin; x++) {
    if (smoothed[x] >= GUTTER_BRIGHT_THRESHOLD) {
      if (gutterStart === -1) gutterStart = x;
    } else if (gutterStart !== -1) {
      if (x - gutterStart >= MIN_GUTTER_PX) {
        gutters.push({ left: gutterStart, right: x });
      }
      gutterStart = -1;
    }
  }
  if (gutterStart !== -1 && (width - margin) - gutterStart >= MIN_GUTTER_PX) {
    gutters.push({ left: gutterStart, right: width - margin });
  }

  if (gutters.length === 0) return null;

  // Build pixel-coordinate column regions from the gutters
  const MIN_COL_FRACTION = 0.12;
  const columns = [];
  let prevRight = 0;
  for (const g of gutters) {
    if (g.left - prevRight >= width * MIN_COL_FRACTION) {
      columns.push({ left: prevRight, right: g.left });
    }
    prevRight = g.right;
  }
  if (width - prevRight >= width * MIN_COL_FRACTION) {
    columns.push({ left: prevRight, right: width });
  }

  return columns.length >= 2 ? { columns, width, height } : null;
}

async function cropColumnFromImage(base64Image, column, imageHeight) {
  const imageBuffer = Buffer.from(base64Image, 'base64');
  const cropWidth = Math.max(1, column.right - column.left);

  const croppedBuffer = await sharp(imageBuffer)
    .extract({ left: column.left, top: 0, width: cropWidth, height: imageHeight })
    .toBuffer();

  return croppedBuffer.toString('base64');
}

async function processPageWithGemini(
  base64Image,
  mimeType,
  modelName,
  processingMode = 'ocr',
  targetLanguage = '',
  customPrompt = '',
  removeReferences = true,
  singleColumn = false
) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('Server API Key configuration missing.');
  }

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  const finalPrompt = buildOcrPrompt({
    processingMode,
    targetLanguage,
    customPrompt,
    removeReferences,
    singleColumn,
  });

  const response = await ai.models.generateContent({
    model: modelName || DEFAULT_MODEL_ID,
    contents: [
      {
        role: 'user',
        parts: [
          { text: finalPrompt },
          {
            inlineData: {
              mimeType: mimeType,
              data: base64Image
            }
          }
        ]
      }
    ],
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          blankPage: { type: Type.BOOLEAN },
          blocks: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                text: { type: Type.STRING },
                label: {
                  type: Type.STRING,
                  enum: BlockLabelValues,
                },
                box_2d: {
                  type: Type.ARRAY,
                  items: { type: Type.NUMBER },
                  description: 'Bounding box [ymin, xmin, ymax, xmax] normalized 0-1000',
                },
              },
              required: ['text', 'label'],
            },
          },
        },
        required: ['blankPage', 'blocks'],
      },
      temperature: 0.1,
      safetySettings: [
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' }
      ]
    }
  });

  const textResponse = typeof response.text === 'function' ? response.text() : response.text;

  if (!textResponse) {
    console.warn('Gemini returned empty text response. Returning empty blocks.');
    return { blankPage: false, blocks: [] };
  }

  try {
    const parsedResponse = JSON.parse(textResponse);
    const blankPage = parsedResponse?.blankPage === true;
    const blocks = Array.isArray(parsedResponse?.blocks) ? parsedResponse.blocks : [];

    return {
      blankPage,
      blocks: blankPage ? [] : blocks,
    };
  } catch (e) {
    console.error('Failed to parse Gemini response.', {
      responseLength: textResponse.length,
      message: e.message,
    });
    throw new Error(`Invalid JSON response from Gemini: ${e.message}`);
  }
}

async function processPageWithLocalProvider(
  provider,
  base64Image,
  mimeType,
  modelName,
  processingMode = 'ocr',
  targetLanguage = '',
  customPrompt = '',
  removeReferences = true,
  singleColumn = false
) {
  const finalPrompt = buildOcrPrompt({
    processingMode,
    targetLanguage,
    customPrompt,
    removeReferences,
    singleColumn,
  });

  const parsedResponse = await getStructuredOutputFromLocalProvider({
    provider,
    modelName,
    prompt: finalPrompt,
    responseSchema: OCR_RESPONSE_JSON_SCHEMA,
    image: {
      base64Image,
      mimeType,
    },
  });

  const blankPage = parsedResponse?.blankPage === true;
  const blocks = Array.isArray(parsedResponse?.blocks) ? parsedResponse.blocks : [];

  return {
    blankPage,
    blocks: blankPage ? [] : blocks,
  };
}

async function processPageWithProvider({
  provider,
  base64Image,
  mimeType,
  modelName,
  processingMode = 'ocr',
  targetLanguage = '',
  customPrompt = '',
  removeReferences = true,
  singleColumn = false,
}) {
  if (normalizeOcrProvider(provider) === 'gemini') {
    return processPageWithGemini(
      base64Image,
      mimeType,
      modelName,
      processingMode,
      targetLanguage,
      customPrompt,
      removeReferences,
      singleColumn
    );
  }

  return processPageWithLocalProvider(
    normalizeOcrProvider(provider),
    base64Image,
    mimeType,
    modelName,
    processingMode,
    targetLanguage,
    customPrompt,
    removeReferences,
    singleColumn
  );
}

async function processPageWithColumnSplitting({
  provider,
  base64Image,
  mimeType,
  modelName,
  processingMode,
  targetLanguage,
  customPrompt,
  removeReferences,
}) {
  const detection = await detectColumnsFromImage(base64Image);

  if (!detection || detection.columns.length <= 1) {
    return processPageWithProvider({
      provider,
      base64Image,
      mimeType,
      modelName,
      processingMode,
      targetLanguage,
      customPrompt,
      removeReferences,
    });
  }

  console.log(`Detected ${detection.columns.length} columns (px widths: ${detection.columns.map((column) => column.right - column.left).join(', ')}), processing each independently`);

  const allBlocks = [];
  let isBlankPage = true;

  for (const column of detection.columns) {
    const croppedBase64 = await cropColumnFromImage(base64Image, column, detection.height);
    const result = await processPageWithProvider({
      provider,
      base64Image: croppedBase64,
      mimeType,
      modelName,
      processingMode,
      targetLanguage,
      customPrompt,
      removeReferences,
      singleColumn: true,
    });

    if (!result.blankPage) {
      isBlankPage = false;
    }

    if (Array.isArray(result.blocks)) {
      allBlocks.push(...result.blocks);
    }
  }

  return {
    blankPage: isBlankPage,
    blocks: isBlankPage ? [] : allBlocks,
  };
}

const { processDocumentBackground, resumePendingDocuments } = createDocumentProcessingManager({
  dataDir: DATA_DIR,
  resolveDocumentDir,
  blocksToMarkdown,
  processPage: async ({
    modelProvider,
    base64Image,
    mimeType,
    modelName,
    processingMode,
    targetLanguage,
    customPrompt,
    removeReferences,
    splitColumns,
  }) => splitColumns
    ? processPageWithColumnSplitting({
        provider: modelProvider,
        base64Image,
        mimeType,
        modelName,
        processingMode,
        targetLanguage,
        customPrompt,
        removeReferences,
      })
    : processPageWithProvider({
        provider: modelProvider,
        base64Image,
        mimeType,
        modelName,
        processingMode,
        targetLanguage,
        customPrompt,
        removeReferences,
      }),
});

const activePdfRasterizations = new Set();

const rasterizePdfDocumentInBackground = async (docId, { startProcessing = false } = {}) => {
  if (activePdfRasterizations.has(docId)) {
    return;
  }

  activePdfRasterizations.add(docId);

  try {
    const safeDocId = assertDocumentId(docId);
    const docDir = resolveDocumentDir(safeDocId);
    const metadataPath = path.join(docDir, 'metadata.json');
    const sourcePdfPath = path.join(docDir, 'source.pdf');

    if (!fs.existsSync(metadataPath) || !fs.existsSync(sourcePdfPath)) {
      return;
    }

    const docData = JSON.parse(await fs.promises.readFile(metadataPath, 'utf-8'));
    docData.sourceRenderStatus = 'processing';
    docData.sourceRenderCompletedPages = 0;
    delete docData.sourceRenderError;
    normalizeDocumentRuntimeState(docData);
    await writeJsonFileAtomic(metadataPath, docData);

    const pdfBuffer = await fs.promises.readFile(sourcePdfPath);
    let metadataWriteQueue = Promise.resolve();

    const persistRenderedPage = async ({ renderedPage, completedPages, totalPages }) => {
      const filename = `page_${renderedPage.pageNumber}.${renderedPage.extension}`;
      await fs.promises.writeFile(path.join(docDir, filename), renderedPage.buffer);

      metadataWriteQueue = metadataWriteQueue
        .catch(() => {})
        .then(async () => {
          if (!fs.existsSync(metadataPath)) {
            return;
          }

          const latestDocData = JSON.parse(await fs.promises.readFile(metadataPath, 'utf-8'));
          const pages = Array.isArray(latestDocData.pages) ? latestDocData.pages.slice() : [];
          const pageIndex = findPageIndexByNumber(pages, renderedPage.pageNumber, renderedPage.pageNumber - 1);

          pages[pageIndex] = createRasterizedPageMetadata(safeDocId, renderedPage, pages[pageIndex]);
          latestDocData.pages = pages;
          latestDocData.totalPages = Math.max(totalPages, latestDocData.totalPages ?? 0, pages.length);
          latestDocData.processedPages = 0;
          latestDocData.failedPages = 0;
          latestDocData.retryingPages = 0;
          latestDocData.sourceRenderStatus = completedPages >= totalPages ? 'completed' : 'processing';
          latestDocData.sourceRenderCompletedPages = completedPages;
          delete latestDocData.sourceRenderError;
          normalizeDocumentRuntimeState(latestDocData);
          await writeJsonFileAtomic(metadataPath, latestDocData);
        });

      await metadataWriteQueue;
    };

    const renderedPages = await renderPdfToPageImages(pdfBuffer, {
      onPageRendered: persistRenderedPage,
    });

    await metadataWriteQueue;

    const latestDocData = JSON.parse(await fs.promises.readFile(metadataPath, 'utf-8'));
    latestDocData.pages = renderedPages.map((renderedPage, index) => {
      const existingPage = Array.isArray(latestDocData.pages)
        ? latestDocData.pages[findPageIndexByNumber(latestDocData.pages, renderedPage.pageNumber, index)]
        : null;

      return createRasterizedPageMetadata(safeDocId, renderedPage, existingPage);
    });
    latestDocData.totalPages = renderedPages.length;
    latestDocData.processedPages = 0;
    latestDocData.failedPages = 0;
    latestDocData.retryingPages = 0;
    latestDocData.sourceRenderStatus = 'completed';
    latestDocData.sourceRenderCompletedPages = renderedPages.length;
    delete latestDocData.sourceRenderError;
    normalizeDocumentRuntimeState(latestDocData);
    await writeJsonFileAtomic(metadataPath, latestDocData);

    if (startProcessing) {
      processDocumentBackground(safeDocId).catch((error) => {
        console.error(`Background processing trigger failed after rasterizing ${safeDocId}`, error);
      });
    }
  } catch (error) {
    console.error(`Failed to rasterize uploaded PDF ${docId}`, error);

    try {
      const docDir = resolveDocumentDir(docId);
      const metadataPath = path.join(docDir, 'metadata.json');
      if (fs.existsSync(metadataPath)) {
        const docData = JSON.parse(await fs.promises.readFile(metadataPath, 'utf-8'));
        docData.sourceRenderStatus = 'error';
        docData.sourceRenderError = formatProcessingError(error);
        normalizeDocumentRuntimeState(docData);
        await writeJsonFileAtomic(metadataPath, docData);
      }
    } catch (persistError) {
      console.error(`Failed to persist rasterization error for ${docId}`, persistError);
    }
  } finally {
    activePdfRasterizations.delete(docId);
  }
};

app.post('/api/reprocess-page', async (req, res) => {
  const {
    docId,
    pageIndex,
    modelName,
    modelProvider,
    processingMode,
    targetLanguage,
    customPrompt,
    removeReferences,
    splitColumns,
  } = req.body;
  
  try {
    const safeDocId = assertDocumentId(docId);
    const parsedPageIndex = Number(pageIndex);
    if (!Number.isInteger(parsedPageIndex) || parsedPageIndex < 0) {
      throw createPublicError(400, 'Invalid page index');
    }

    const docDir = resolveDocumentDir(safeDocId);
    const metadataPath = path.join(docDir, 'metadata.json');
    
    if (!fs.existsSync(metadataPath)) {
        return res.status(404).json({ error: "Document not found" });
    }

    const docData = await readJsonFileWithRetry(metadataPath);
    normalizeDocumentRuntimeState(docData);
    docData.ocrProvider = normalizeOcrProvider(docData.ocrProvider);
    const page = docData.pages[parsedPageIndex];
    
    if (!page) {
        return res.status(404).json({ error: "Page not found" });
    }

    // Find image file
    const filename = path.basename(page.imageUrl);
    const imagePath = path.join(docDir, filename);
    
    console.log(`Reprocessing page ${parsedPageIndex} for ${safeDocId}. Image path: ${imagePath}`);

    if (!fs.existsSync(imagePath)) {
         console.error(`Image file not found at ${imagePath} (DATA_DIR: ${DATA_DIR})`);
         return res.status(404).json({ error: 'Image file not found' });
    }

    const imageBuffer = await fs.promises.readFile(imagePath);
    const base64Image = imageBuffer.toString('base64');
    const mimeType = path.extname(filename) === '.png' ? 'image/png' : 'image/jpeg';

    console.log(`Calling OCR provider for reprocessing... Provider: ${normalizeOcrProvider(modelProvider || docData.ocrProvider)}, Model: ${modelName || 'default'}`);
    const nextProvider = normalizeOcrProvider(modelProvider || docData.ocrProvider);
    const nextProcessingMode = typeof processingMode === 'string'
      ? processingMode
      : (docData.processingMode || 'ocr');
    const nextTargetLanguage = typeof targetLanguage === 'string'
      ? targetLanguage
      : (docData.targetLanguage || '');
    const nextCustomPrompt = typeof customPrompt === 'string'
      ? customPrompt
      : (docData.customPrompt || '');
    const nextRemoveReferences = typeof removeReferences === 'boolean'
      ? removeReferences
      : (docData.removeReferences !== false);
    const nextSplitColumns = typeof splitColumns === 'boolean'
      ? splitColumns
      : (docData.splitColumns === true);

    try {
      const result = nextSplitColumns
        ? await processPageWithColumnSplitting({
            provider: nextProvider,
            base64Image,
            mimeType,
            modelName,
            processingMode: nextProcessingMode,
            targetLanguage: nextTargetLanguage,
            customPrompt: nextCustomPrompt,
            removeReferences: nextRemoveReferences,
          })
        : await processPageWithProvider({
            provider: nextProvider,
            base64Image,
            mimeType,
            modelName,
            processingMode: nextProcessingMode,
            targetLanguage: nextTargetLanguage,
            customPrompt: nextCustomPrompt,
            removeReferences: nextRemoveReferences,
          });
      const { blocks, blankPage } = normalizeProcessPageResult(result);

      console.log(`OCR reprocessing successful. Blocks: ${blocks ? blocks.length : 0}`);

      docData.modelUsed = modelName || docData.modelUsed || DEFAULT_MODEL_ID;
      docData.ocrProvider = nextProvider;
      docData.pages[parsedPageIndex].blocks = blocks;
      docData.pages[parsedPageIndex].status = 'completed';
      docData.pages[parsedPageIndex].blankPage = blankPage;
      docData.pages[parsedPageIndex].errorDismissed = false;
      docData.pages[parsedPageIndex].retryCount = 0;
      docData.pages[parsedPageIndex].lastError = '';
      docData.pages[parsedPageIndex].nextRetryAt = null;
      docData.pages[parsedPageIndex].lastAttemptAt = Date.now();

      const mdContent = blocksToMarkdown(blocks);
      await fs.promises.writeFile(path.join(docDir, `page_${parsedPageIndex + 1}.md`), mdContent);

      normalizeDocumentRuntimeState(docData);
      await writeJsonFileAtomic(metadataPath, docData);

      res.json({ blocks, blankPage });
    } catch (error) {
      docData.pages[parsedPageIndex].lastAttemptAt = Date.now();
      docData.pages[parsedPageIndex].lastError = formatProcessingError(error);
      docData.pages[parsedPageIndex].errorDismissed = false;
      docData.pages[parsedPageIndex].retryCount = normalizeNonNegativeInteger(docData.pages[parsedPageIndex].retryCount, 0) + 1;
      if (docData.pages[parsedPageIndex].status !== 'completed') {
        docData.pages[parsedPageIndex].status = 'error';
        docData.pages[parsedPageIndex].nextRetryAt = null;
      }
      normalizeDocumentRuntimeState(docData);
      await writeJsonFileAtomic(metadataPath, docData);
      if (!error?.expose) {
        const publicError = createPublicError(
          Number.isInteger(error?.statusCode) ? error.statusCode : 502,
          formatProcessingError(error)
        );
        publicError.cause = error;
        throw publicError;
      }
      throw error;
    }

  } catch (error) {
    handleRouteError(res, 'Reprocess error', error, 'Reprocessing failed');
  }
});

app.post('/api/reprocess-document', async (req, res) => {
  const { docId, modelName, modelProvider, pagesPerBatch, splitColumns } = req.body;

  try {
    const safeDocId = assertDocumentId(docId);
    const nextModelName = typeof modelName === 'string' && modelName.trim() ? modelName.trim() : '';
    const docDir = resolveDocumentDir(safeDocId);
    const metadataPath = path.join(docDir, 'metadata.json');

    if (!fs.existsSync(metadataPath)) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const docData = JSON.parse(await fs.promises.readFile(metadataPath, 'utf-8'));
    if (docData?.type !== 'file') {
      throw createPublicError(400, 'Only documents can be reprocessed');
    }

    normalizeDocumentRuntimeState(docData);
    docData.ocrProvider = normalizeOcrProvider(docData.ocrProvider);
    docData.isRead = docData.isRead === true;
    const availableLabels = await readLabels();
    docData.labels = normalizeDocumentLabels(docData.labels).filter((label) =>
      availableLabels.some((availableLabel) => availableLabel.toLowerCase() === label.toLowerCase())
    );

    if (!Array.isArray(docData.pages) || docData.pages.length === 0) {
      throw createPublicError(400, 'Document has no pages to reprocess');
    }

    if (docData.status === 'processing' || docData.status === 'uploading') {
      throw createPublicError(409, 'Document is already processing');
    }

    docData.modelUsed = nextModelName || DEFAULT_MODEL_ID;
    docData.ocrProvider = normalizeOcrProvider(modelProvider || docData.ocrProvider);
    docData.pagesPerBatch = getPagesPerBatch(pagesPerBatch, docData.pagesPerBatch);
    docData.splitColumns = splitColumns === true;
    if (docData.labels.length === 0) {
      const labelingSettings = await readLabelingSettings();
      if (labelingSettings.autoLabelDocuments && availableLabels.length > 0) {
        try {
          docData.labels = await selectLabelsForDocumentName(
            docData.name,
            availableLabels,
            docData.modelUsed,
            docData.ocrProvider
          );
        } catch (labelingError) {
          console.error(`Automatic labeling failed during reprocessing for "${docData.name}"`, labelingError);
        }
      }
    }
    docData.pages = docData.pages.map((page, index) => ({
      ...page,
      pageNumber: getPageNumber(page, index + 1),
      blocks: [],
      status: 'pending',
      blankPage: false,
      errorDismissed: false,
      retryCount: 0,
      lastError: '',
      nextRetryAt: null,
      lastAttemptAt: null,
    }));
    delete docData.savedText;
    delete docData.pageSavedTexts;

    const docEntries = await fs.promises.readdir(docDir, { withFileTypes: true });
    await Promise.all(
      docEntries
        .filter((entry) => (
          entry.isFile()
          && (
            (entry.name.startsWith('page_') && entry.name.endsWith('.md'))
            || entry.name.endsWith('_edited.md')
          )
        ))
        .map((entry) => fs.promises.rm(path.join(docDir, entry.name), { force: true }))
    );

    normalizeDocumentRuntimeState(docData);
  await writeJsonFileAtomic(metadataPath, docData);

    processDocumentBackground(safeDocId).catch((error) => {
      console.error(`Background reprocessing trigger failed for ${safeDocId}`, error);
    });

    res.json(docData);
  } catch (error) {
    handleRouteError(res, 'Reprocess document error', error, 'Failed to reprocess document');
  }
});

app.post('/api/process-page', async (req, res) => {
  const {
    base64Image,
    mimeType,
    modelName,
    modelProvider,
    processingMode,
    targetLanguage,
    customPrompt,
    removeReferences,
  } = req.body;

  try {
    if (typeof base64Image !== 'string' || !base64Image.trim()) {
      throw createPublicError(400, 'Image payload is required');
    }

    if (!getImageExtensionForMimeType(mimeType)) {
      throw createPublicError(400, 'Unsupported image type');
    }

    const result = await processPageWithProvider({
      provider: normalizeOcrProvider(modelProvider),
      base64Image,
      mimeType,
      modelName,
      processingMode,
      targetLanguage,
      customPrompt,
      removeReferences: removeReferences !== false,
    });
    const blocks = Array.isArray(result?.blocks) ? result.blocks : [];
    
    // Try to save to Markdown file (legacy logic, kept for compatibility if needed)
    try {
        const markdownContent = blocksToMarkdown(blocks);
        const dataDir = path.join(__dirname, 'data');
        if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `doc_${timestamp}.md`;
        const filePath = path.join(dataDir, filename);
        fs.writeFileSync(filePath, markdownContent);
    } catch (saveError) {
      console.error("Error saving markdown file:", saveError);
    }

    res.json({ text: JSON.stringify({ blocks, blankPage: result?.blankPage === true }) }); // Maintain old response format for now

  } catch (error) {
    handleRouteError(res, 'Gemini API error', error, 'Failed to process page');
  }
});

app.post('/api/generate-logo', async (req, res) => {
  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ error: "Server API Key configuration missing." });
  }

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [
          { text: "A minimalist, modern vector logo for an app called 'ocrAI'. The icon should feature a stylized document or sheet of paper being cleaned or sparkling, implying clarity and organization. Use a color palette of Royal Blue, Slate Grey, and White. Flat design, clean lines, suitable for an app icon." }
        ]
      },
      config: {
        imageConfig: {
          aspectRatio: "1:1",
        }
      }
    });

    let imageData = null;
    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) {
        imageData = {
          mimeType: part.inlineData.mimeType,
          data: part.inlineData.data
        };
        break;
      }
    }

    if (!imageData) {
      return res.status(500).json({ error: "No image generated" });
    }

    res.json(imageData);
  } catch (e) {
    handleRouteError(res, 'Logo generation failed', e, 'Failed to generate logo');
  }
});

// --- STORAGE ROUTES ---

// DATA_DIR moved to top


// Serve stored data files
app.use('/api/data', express.static(DATA_DIR, {
  dotfiles: 'deny',
  fallthrough: false,
  index: false,
  redirect: false,
}));

app.get('/api/documents', async (req, res) => {
  try {
    const entries = await fs.promises.readdir(DATA_DIR, { withFileTypes: true });

    const items = (await Promise.all(entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const metadataPath = path.join(DATA_DIR, entry.name, 'metadata.json');
        try {
          const parsedItem = await readJsonFileWithRetry(metadataPath);
          if (parsedItem?.type === 'file') {
            normalizeDocumentRuntimeState(parsedItem);
            parsedItem.ocrProvider = normalizeOcrProvider(parsedItem.ocrProvider);
            parsedItem.isRead = parsedItem.isRead === true;
            parsedItem.labels = normalizeDocumentLabels(parsedItem.labels);
          }
          return parsedItem;
        } catch (err) {
          console.warn(`Skipping invalid directory ${entry.name}:`, err.message);
          return null;
        }
      })))
      .filter(Boolean);

    res.json(items);
  } catch (e) {
    handleRouteError(res, 'Failed to list documents', e);
  }
});

app.post('/api/documents', async (req, res) => {
  console.log("POST /api/documents hit");
  try {
    let item = req.body;
    if (!item || !item.id || typeof item.name !== 'string') {
      throw createPublicError(400, 'Invalid item data');
    }

    item.id = assertDocumentId(item.id);
    item.name = item.name.trim();
    if (!item.name) {
      throw createPublicError(400, 'Document name is required');
    }

    if (item.type === 'file') {
      item.ocrProvider = normalizeOcrProvider(item.ocrProvider);
      const availableLabels = await readLabels();
      item.labels = normalizeDocumentLabels(item.labels).filter((label) =>
        availableLabels.some((availableLabel) => availableLabel.toLowerCase() === label.toLowerCase())
      );

      if (item.startProcessing && item.labels.length === 0) {
        const labelingSettings = await readLabelingSettings();
        if (labelingSettings.autoLabelDocuments && availableLabels.length > 0) {
          try {
            item.labels = await selectLabelsForDocumentName(
              item.name,
              availableLabels,
              item.modelUsed || DEFAULT_MODEL_ID,
              item.ocrProvider
            );
          } catch (labelingError) {
            console.error(`Automatic labeling failed for "${item.name}"`, labelingError);
          }
        }
      }
    }

    const docDir = resolveDocumentDir(item.id);
    if (!fs.existsSync(docDir)) {
      await fs.promises.mkdir(docDir, { recursive: true });
    }

    const uploadedSourceFile = item.type === 'file' ? normalizeUploadedSourceFile(item.sourceFile) : null;
    const isUploadedPdf = uploadedSourceFile
      && (
        uploadedSourceFile.mimeType === 'application/pdf'
        || uploadedSourceFile.name.toLowerCase().endsWith('.pdf')
        || item.name.toLowerCase().endsWith('.pdf')
      );

    if (item.type === 'file' && isUploadedPdf) {
      const pdfBuffer = Buffer.from(uploadedSourceFile.data, 'base64');
      const sourcePdfPath = path.join(docDir, 'source.pdf');
      const totalPages = await getPdfPageCount(pdfBuffer);

      await fs.promises.writeFile(sourcePdfPath, pdfBuffer);

      item.pagesPerBatch = getPagesPerBatch(item.pagesPerBatch);
      item.isRead = item.isRead === true;
      item.sourceRenderStatus = 'pending';
      item.sourceRenderCompletedPages = 0;
      delete item.sourceRenderError;
      item.pages = Array.from({ length: totalPages }, (_, index) => createPendingRasterizedPage(index + 1));
      item.totalPages = totalPages;
      item.processedPages = 0;
      item.failedPages = 0;
      delete item.sourceFile;
    }

    // Handle image saving for files
    if (item.type === 'file' && item.pages && Array.isArray(item.pages)) {
      item.ocrProvider = normalizeOcrProvider(item.ocrProvider);
      item.isRead = item.isRead === true;
      item.pagesPerBatch = getPagesPerBatch(item.pagesPerBatch);
      for (let i = 0; i < item.pages.length; i++) {
        const page = item.pages[i];
        const pageNumber = getPageNumber(page, i + 1);
        item.pages[i].pageNumber = pageNumber;
        
        // If imageUrl is base64, save it to file and update URL
        if (page.imageUrl && page.imageUrl.startsWith('data:')) {
          const matches = page.imageUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
          if (matches && matches.length === 3) {
            const mimeType = matches[1];
            const base64Data = matches[2];
            const extension = getImageExtensionForMimeType(mimeType);
            if (!extension) {
              throw createPublicError(400, 'Unsupported page image type');
            }
            const filename = `page_${pageNumber}.${extension}`;
            const filePath = path.join(docDir, filename);
            
            await fs.promises.writeFile(filePath, Buffer.from(base64Data, 'base64'));
            
            // Update item with server URL
            // Use absolute URL or relative to API? 
            // Let's use relative path that the frontend can resolve or use directly if we serve it
            item.pages[i].imageUrl = `/api/data/${item.id}/${filename}`;
          }
        }
        
        // Save markdown if completed
        if (page.status === 'completed' && page.blocks) {
          const mdContent = blocksToMarkdown(page.blocks);
          await fs.promises.writeFile(
            path.join(docDir, `page_${pageNumber}.md`),
            mdContent
          );
        }
      }

      normalizeDocumentRuntimeState(item);
    }

    if (item && typeof item === 'object' && 'sourceFile' in item) {
      delete item.sourceFile;
    }

    // Keep the edited markdown companion aligned with the current document name.
    if (item.type === 'file') {
      const docEntries = await fs.promises.readdir(docDir, { withFileTypes: true });
      await Promise.all(
        docEntries
          .filter((entry) => entry.isFile() && entry.name.endsWith('_edited.md'))
          .map((entry) => fs.promises.rm(path.join(docDir, entry.name), { force: true }))
      );

      if (typeof item.savedText === 'string' && item.savedText) {
        const cleanName = sanitizeDocumentBaseName(item.name);
        const fullDocMarkdownPath = path.join(docDir, `${cleanName}_edited.md`);
        await fs.promises.writeFile(fullDocMarkdownPath, item.savedText);
        console.log(`Saved edited document text to: ${fullDocMarkdownPath}`);
      }
    }

    // Save metadata (now with URLs instead of base64)
    await writeJsonFileAtomic(path.join(docDir, 'metadata.json'), item);

    // Trigger background processing if requested
    if (isUploadedPdf) {
      rasterizePdfDocumentInBackground(item.id, { startProcessing: item.startProcessing === true }).catch((error) => {
        console.error('Background PDF rasterization trigger failed', error);
      });
    } else if (item.startProcessing) {
        processDocumentBackground(item.id).catch(err => console.error("Background processing trigger failed", err));
    }

    res.json(item); // Return the updated item
  } catch (e) {
    handleRouteError(res, 'Failed to save document', e);
  }
});

app.delete('/api/documents/:id', async (req, res) => {
  try {
    const docDir = resolveDocumentDir(req.params.id);
    
    if (fs.existsSync(docDir)) {
      await fs.promises.rm(docDir, { recursive: true, force: true });
    }
    
    res.json({ success: true });
  } catch (e) {
    handleRouteError(res, 'Failed to delete document', e);
  }
});

app.get('/api/prompts', async (req, res) => {
  try {
    res.json(await readPrompts());
  } catch (error) {
    handleRouteError(res, 'Failed to load prompts', error);
  }
});

app.post('/api/prompts', async (req, res) => {
  try {
    const prompt = normalizePrompt(req.body);
    if (!prompt) {
      return res.status(400).json({ error: 'Name and prompt are required' });
    }

    const prompts = await readPrompts();
    const duplicate = prompts.find((entry) => entry.name.toLowerCase() === prompt.name.toLowerCase());
    if (duplicate) {
      return res.status(400).json({ error: `A prompt named "${prompt.name}" already exists` });
    }

    res.json(await writePrompts([...prompts, prompt]));
  } catch (error) {
    handleRouteError(res, 'Failed to create prompt', error);
  }
});

app.put('/api/prompts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const prompts = await readPrompts();
    const existingPrompt = prompts.find((entry) => entry.id === id);

    if (!existingPrompt) {
      return res.status(404).json({ error: 'Prompt not found' });
    }

    const candidate = normalizePrompt({
      ...existingPrompt,
      ...req.body,
      id,
      createdAt: existingPrompt.createdAt,
      updatedAt: Date.now(),
    });

    if (!candidate) {
      return res.status(400).json({ error: 'Name and prompt are required' });
    }

    const duplicate = prompts.find(
      (entry) => entry.id !== id && entry.name.toLowerCase() === candidate.name.toLowerCase()
    );
    if (duplicate) {
      return res.status(400).json({ error: `A prompt named "${candidate.name}" already exists` });
    }

    res.json(await writePrompts(prompts.map((entry) => (entry.id === id ? candidate : entry))));
  } catch (error) {
    handleRouteError(res, 'Failed to update prompt', error);
  }
});

app.delete('/api/prompts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const prompts = await readPrompts();
    const nextPrompts = prompts.filter((entry) => entry.id !== id);

    if (nextPrompts.length === prompts.length) {
      return res.status(404).json({ error: 'Prompt not found' });
    }

    res.json(await writePrompts(nextPrompts));
  } catch (error) {
    handleRouteError(res, 'Failed to delete prompt', error);
  }
});

app.get('/api/labels', async (req, res) => {
  try {
    res.json(await readLabels());
  } catch (error) {
    handleRouteError(res, 'Failed to load labels', error);
  }
});

app.post('/api/labels', async (req, res) => {
  try {
    const labelName = normalizeLabelName(req.body?.name);
    if (!labelName) {
      return res.status(400).json({ error: 'Label name is required' });
    }

    const labels = await readLabels();
    const duplicate = labels.find((label) => label.toLowerCase() === labelName.toLowerCase());
    if (duplicate) {
      return res.status(400).json({ error: `Label "${duplicate}" already exists` });
    }

    res.json(await writeLabels([...labels, labelName]));
  } catch (error) {
    handleRouteError(res, 'Failed to create label', error);
  }
});

app.delete('/api/labels/:name', async (req, res) => {
  try {
    const labelName = normalizeLabelName(req.params.name);
    if (!labelName) {
      return res.status(400).json({ error: 'Label name is required' });
    }

    const labels = await readLabels();
    const nextLabels = labels.filter((label) => label.toLowerCase() !== labelName.toLowerCase());
    if (nextLabels.length === labels.length) {
      return res.status(404).json({ error: 'Label not found' });
    }

    await writeLabels(nextLabels);

    const entries = await fs.promises.readdir(DATA_DIR, { withFileTypes: true });
    await Promise.all(entries.filter((entry) => entry.isDirectory()).map(async (entry) => {
      const metadataPath = path.join(DATA_DIR, entry.name, 'metadata.json');
      if (!fs.existsSync(metadataPath)) {
        return;
      }

      try {
        const rawMetadata = await fs.promises.readFile(metadataPath, 'utf-8');
        const item = JSON.parse(rawMetadata);
        if (item?.type !== 'file') {
          return;
        }

        const nextDocumentLabels = normalizeDocumentLabels(item.labels).filter(
          (label) => label.toLowerCase() !== labelName.toLowerCase()
        );

        if (JSON.stringify(nextDocumentLabels) === JSON.stringify(normalizeDocumentLabels(item.labels))) {
          return;
        }

        item.labels = nextDocumentLabels;
        normalizeDocumentRuntimeState(item);
        await writeJsonFileAtomic(metadataPath, item);
      } catch (documentError) {
        console.warn(`Failed to remove deleted label from ${entry.name}:`, documentError.message);
      }
    }));

    res.json(await readLabels());
  } catch (error) {
    handleRouteError(res, 'Failed to delete label', error);
  }
});

app.get('/api/labeling-settings', async (req, res) => {
  try {
    res.json(await readLabelingSettings());
  } catch (error) {
    handleRouteError(res, 'Failed to load labeling settings', error);
  }
});

app.put('/api/labeling-settings', async (req, res) => {
  try {
    res.json(await writeLabelingSettings(req.body));
  } catch (error) {
    handleRouteError(res, 'Failed to update labeling settings', error);
  }
});

// Handle all other routes by serving the index.html (SPA support)
app.get(/.*/, (req, res) => {
  const indexPath = path.join(__dirname, 'dist', 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send('API Running. Frontend not built. Run `npm run build` to serve the app from this port, or use the Vite dev server.');
  }
});

// Global error handler
app.use((err, req, res, next) => {
  handleRouteError(res, 'Global server error', err);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  if (!process.env.GEMINI_API_KEY) {
    console.warn("\x1b[33m%s\x1b[0m", "WARNING: GEMINI_API_KEY is not set in the environment! API calls will fail.");
  } else {
    console.log("GEMINI_API_KEY is present.");
  }
  resumePendingDocuments().catch((error) => {
    console.error('Failed to resume pending OCR documents on startup', error);
  });
});
