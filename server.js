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
import { handleLoginAttempt, verifySession, logoutSession } from './services/authService.js';
import {
  createDocumentProcessingManager,
  formatProcessingError,
  getPageNumber,
  getPagesPerBatch,
  normalizeDocumentRuntimeState,
} from './services/documentProcessing.js';

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

const normalizePositiveInteger = (value, fallbackValue) => {
  const parsedValue = Number(value);
  if (!Number.isFinite(parsedValue)) {
    return fallbackValue;
  }

  const normalizedValue = Math.trunc(parsedValue);
  return normalizedValue > 0 ? normalizedValue : fallbackValue;
};

const findPageIndexByNumber = (pages, pageNumber, fallbackIndex) => {
  const targetPageNumber = normalizePositiveInteger(pageNumber, fallbackIndex + 1);
  const pageIndex = pages.findIndex((page, index) => getPageNumber(page, index + 1) === targetPageNumber);
  return pageIndex >= 0 ? pageIndex : fallbackIndex;
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
const PROMPTS_FILE = path.join(DATA_DIR, 'prompts.json');

const DEFAULT_MODELS = [
  { id: 'gemini-flash-latest', name: 'Gemini Flash Latest', description: 'Balanced' },
  { id: 'gemini-flash-lite-latest', name: 'Gemini Flash Lite Latest', description: 'Faster' },
];

const REMOVED_MODEL_IDS = new Set(['gemini-2.5-flash', 'gemini-2.5-flash-lite']);

const sanitizeModel = (model) => {
  const id = typeof model?.id === 'string' ? model.id.trim() : '';
  if (!id || REMOVED_MODEL_IDS.has(id)) {
    return null;
  }

  const name = typeof model?.name === 'string' && model.name.trim() ? model.name.trim() : id;
  const description = typeof model?.description === 'string' && model.description.trim()
    ? model.description.trim()
    : 'Custom';

  return { id, name, description };
};

const sortModels = (models) => {
  const defaultIds = new Set(DEFAULT_MODELS.map((model) => model.id));
  const defaults = DEFAULT_MODELS.map((model) => ({ ...model }));
  const customs = models
    .filter((model) => !defaultIds.has(model.id))
    .sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }))
    .map((model) => ({ ...model, isCustom: true }));

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
    .filter((model, index, collection) => collection.findIndex((entry) => entry.id === model.id) === index)
    .sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }));

  await fs.promises.writeFile(MODELS_FILE, JSON.stringify(sanitized, null, 2));
  return sanitized;
};

const getAllModels = async () => {
  const customModels = await readCustomModels();
  return sortModels(customModels);
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
    if (existingModels.some((entry) => entry.id === model.id)) {
      return res.status(400).json({ error: `Model with ID "${model.id}" already exists` });
    }

    const customModels = await readCustomModels();
    await writeCustomModels([...customModels, model]);
    res.json(await getAllModels());
  } catch (error) {
    handleRouteError(res, 'Failed to save model', error);
  }
});

app.delete('/api/models/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (DEFAULT_MODELS.some((model) => model.id === id)) {
      return res.status(400).json({ error: 'Cannot remove default models' });
    }

    const customModels = await readCustomModels();
    const nextModels = customModels.filter((model) => model.id !== id);
    if (nextModels.length === customModels.length) {
      return res.status(404).json({ error: 'Model not found' });
    }

    await writeCustomModels(nextModels);
    res.json(await getAllModels());
  } catch (error) {
    handleRouteError(res, 'Failed to delete model', error);
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

const OCR_LAYOUT_PROMPT = `
You are a highly advanced Document Layout Analysis AI. Your task is to perform OCR and layout segmentation on the provided document image.

**CRITICAL INSTRUCTIONS:**
1.  **LITERAL EXTRACTION ONLY**: Extract the text exactly as it appears in the image. **DO NOT TRANSLATE**. **DO NOT SUMMARIZE**. **DO NOT ADD COMMENTS**.
2.  **ORIGINAL LANGUAGE**: The text must remain in the original language of the document.
3.  **JSON ONLY**: Output strictly valid JSON. Do not include markdown formatting (like \`\`\`json) or conversational text.
4.  **HYPHENATED WORDS ACROSS LINES**: If a word is cut at the end of a line with a hyphen and continues on the next line, do not transcribe the hyphen. Join both fragments into the complete word.

**Task Steps**:
0.  **Classify Blank Pages**: If the page is blank or only contains scanning artifacts, stains, or edge noise without readable content, set "blankPage" to true and return an empty "blocks" array.
1.  **Extract Text**: Read all text in the image.
2.  **Segment Blocks**: Group continuous text into paragraphs (MAIN_TEXT). Do not split a single paragraph into multiple blocks unless necessary (e.g., page break).
3.  **Label Blocks**: Assign one of the following labels to each block:
    *   **TITLE**: Titles, subtitles, section headers (usually larger font, bold, centered, or short lines at the start of sections).
    *   **MAIN_TEXT**: The primary body content of the document.
    *   **FOOTNOTE**: Notes usually at the bottom of the page, often starting with small numbers/superscripts (1, *, etc.) or containing bibliographic references (Ibid, Op. cit.).
    *   **HEADER**: Repeated text at the very top (page numbers, chapter titles).
    *   **FOOTER**: Repeated text at the very bottom (page numbers, book titles).
    *   **CAPTION**: Text describing images or tables.
4.  **Handling Ambiguity**: If no clear title exists, label as MAIN_TEXT. Be strict about separating HEADER and FOOTER from MAIN_TEXT.

**Output Format**:
Return a valid JSON object with the following structure:
{
  "blankPage": false,
  "blocks": [
    {
      "text": "The content of the block...",
      "label": "MAIN_TEXT",
      "box_2d": [ymin, xmin, ymax, xmax] 
    },
    ...
  ]
}
The "box_2d" should be normalized coordinates (0-1000) if possible, or 0-1 range.
`;

const OCR_LAYOUT_PROMPT_NO_REFS = `
You are a highly advanced Document Layout Analysis AI. Your task is to perform OCR and layout segmentation on the provided document image.

**CRITICAL INSTRUCTIONS:**
1.  **LITERAL EXTRACTION ONLY**: Extract the text exactly as it appears in the image. **DO NOT TRANSLATE**. **DO NOT SUMMARIZE**. **DO NOT ADD COMMENTS**.
2.  **ORIGINAL LANGUAGE**: The text must remain in the original language of the document.
3.  **JSON ONLY**: Output strictly valid JSON. Do not include markdown formatting (like \`\`\`json) or conversational text.
4.  **HYPHENATED WORDS ACROSS LINES**: If a word is cut at the end of a line with a hyphen and continues on the next line, do not transcribe the hyphen. Join both fragments into the complete word.
5.  **REMOVE IN-TEXT REFERENCES**: When extracting MAIN_TEXT blocks, you MUST omit all in-text academic citations and references. These include patterns like:
    - (Author, Year)
    - (Author, Year: page)
    - (Author, Year: p. XX)
    - (SURNAME, 1908: p. 104)
    - (Surname, 1908:104)
    - (Author et al., Year)
    - (Author & Author, Year)
    - Multiple authors in parentheses
    - Any similar APA, MLA, Chicago, or academic citation formats in parentheses
    Do NOT include these references in the extracted text. Simply skip them entirely, ensuring the remaining text flows naturally.

**Task Steps**:
0.  **Classify Blank Pages**: If the page is blank or only contains scanning artifacts, stains, or edge noise without readable content, set "blankPage" to true and return an empty "blocks" array.
1.  **Extract Text**: Read all text in the image.
2.  **Segment Blocks**: Group continuous text into paragraphs (MAIN_TEXT). Do not split a single paragraph into multiple blocks unless necessary (e.g., page break).
3.  **Label Blocks**: Assign one of the following labels to each block:
    *   **TITLE**: Titles, subtitles, section headers (usually larger font, bold, centered, or short lines at the start of sections).
    *   **MAIN_TEXT**: The primary body content of the document. **Remember to remove all in-text citations from this content.**
    *   **FOOTNOTE**: Notes usually at the bottom of the page, often starting with small numbers/superscripts (1, *, etc.) or containing bibliographic references (Ibid, Op. cit.).
    *   **HEADER**: Repeated text at the very top (page numbers, chapter titles).
    *   **FOOTER**: Repeated text at the very bottom (page numbers, book titles).
    *   **CAPTION**: Text describing images or tables.
4.  **Handling Ambiguity**: If no clear title exists, label as MAIN_TEXT. Be strict about separating HEADER and FOOTER from MAIN_TEXT.

**Output Format**:
Return a valid JSON object with the following structure:
{
  "blankPage": false,
  "blocks": [
    {
      "text": "The content of the block...",
      "label": "MAIN_TEXT",
      "box_2d": [ymin, xmin, ymax, xmax] 
    },
    ...
  ]
}
The "box_2d" should be normalized coordinates (0-1000) if possible, or 0-1 range.
`;

const BlockLabelValues = [
  'TITLE', 'MAIN_TEXT', 'FOOTNOTE', 'HEADER', 'FOOTER', 'CAPTION', 'UNKNOWN'
];

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

async function processPageWithGemini(base64Image, mimeType, modelName, processingMode = 'ocr', targetLanguage = '', customPrompt = '', removeReferences = true) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("Server API Key configuration missing.");
  }

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    
  const responseSchema = {
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
              enum: BlockLabelValues 
            },
            box_2d: {
              type: Type.ARRAY,
              items: { type: Type.NUMBER },
              description: "Bounding box [ymin, xmin, ymax, xmax] normalized 0-1000"
            }
          },
          required: ["text", "label"]
        }
      }
    },
    required: ["blankPage", "blocks"]
  };

  let finalPrompt = removeReferences ? OCR_LAYOUT_PROMPT_NO_REFS : OCR_LAYOUT_PROMPT;

  if (processingMode === 'translation' && targetLanguage) {
    const basePrompt = removeReferences ? OCR_LAYOUT_PROMPT_NO_REFS : OCR_LAYOUT_PROMPT;
    finalPrompt = basePrompt.replace(
      "**LITERAL EXTRACTION ONLY**: Extract the text exactly as it appears in the image. **DO NOT TRANSLATE**. **DO NOT SUMMARIZE**. **DO NOT ADD COMMENTS**.",
      `**TRANSLATION**: Extract the text and TRANSLATE it into ${targetLanguage}. **DO NOT SUMMARIZE**. **DO NOT ADD COMMENTS**.`
    ).replace(
      "**ORIGINAL LANGUAGE**: The text must remain in the original language of the document.",
      `**TARGET LANGUAGE**: The text must be in ${targetLanguage}.`
    );
  } else if (processingMode === 'manual' && customPrompt) {
    finalPrompt = customPrompt;
  }

  const response = await ai.models.generateContent({
    model: modelName || 'gemini-flash-latest',
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
      responseMimeType: "application/json",
      responseSchema: responseSchema,
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
    console.warn("Gemini returned empty text response. Returning empty blocks.");
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

const { processDocumentBackground, resumePendingDocuments } = createDocumentProcessingManager({
  dataDir: DATA_DIR,
  resolveDocumentDir,
  blocksToMarkdown,
  processPage: async ({
    base64Image,
    mimeType,
    modelName,
    processingMode,
    targetLanguage,
    customPrompt,
    removeReferences,
  }) => processPageWithGemini(
    base64Image,
    mimeType,
    modelName,
    processingMode,
    targetLanguage,
    customPrompt,
    removeReferences
  ),
});

app.post('/api/reprocess-page', async (req, res) => {
  const { docId, pageIndex, modelName, processingMode, targetLanguage, customPrompt, removeReferences } = req.body;
  
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

    const docData = JSON.parse(await fs.promises.readFile(metadataPath, 'utf-8'));
    normalizeDocumentRuntimeState(docData);
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

    console.log(`Calling Gemini for reprocessing... Model: ${modelName || 'default'}`);

    try {
      const result = await processPageWithGemini(
        base64Image,
        mimeType,
        modelName,
        processingMode,
        targetLanguage,
        customPrompt,
        removeReferences !== false
      );
      const blocks = Array.isArray(result?.blocks) ? result.blocks : [];

      console.log(`Gemini reprocessing successful. Blocks: ${blocks ? blocks.length : 0}`);

      docData.pages[parsedPageIndex].blocks = blocks;
      docData.pages[parsedPageIndex].status = 'completed';
      docData.pages[parsedPageIndex].blankPage = result?.blankPage === true;
      docData.pages[parsedPageIndex].errorDismissed = false;
      docData.pages[parsedPageIndex].retryCount = 0;
      docData.pages[parsedPageIndex].lastError = '';
      docData.pages[parsedPageIndex].nextRetryAt = null;
      docData.pages[parsedPageIndex].lastAttemptAt = Date.now();

      const mdContent = blocksToMarkdown(blocks);
      await fs.promises.writeFile(path.join(docDir, `page_${parsedPageIndex + 1}.md`), mdContent);

      normalizeDocumentRuntimeState(docData);
      await fs.promises.writeFile(metadataPath, JSON.stringify(docData, null, 2));

      res.json({ blocks, blankPage: result?.blankPage === true });
    } catch (error) {
      docData.pages[parsedPageIndex].lastAttemptAt = Date.now();
      docData.pages[parsedPageIndex].lastError = formatProcessingError(error);
      docData.pages[parsedPageIndex].errorDismissed = false;
      if (docData.pages[parsedPageIndex].status !== 'completed') {
        docData.pages[parsedPageIndex].status = 'error';
        docData.pages[parsedPageIndex].nextRetryAt = null;
      }
      normalizeDocumentRuntimeState(docData);
      await fs.promises.writeFile(metadataPath, JSON.stringify(docData, null, 2));
      throw error;
    }

  } catch (error) {
    handleRouteError(res, 'Reprocess error', error, 'Reprocessing failed');
  }
});

app.post('/api/process-page', async (req, res) => {
  const { base64Image, mimeType, modelName, processingMode, targetLanguage, customPrompt, removeReferences } = req.body;

  try {
    if (typeof base64Image !== 'string' || !base64Image.trim()) {
      throw createPublicError(400, 'Image payload is required');
    }

    if (!getImageExtensionForMimeType(mimeType)) {
      throw createPublicError(400, 'Unsupported image type');
    }

    const result = await processPageWithGemini(base64Image, mimeType, modelName, processingMode, targetLanguage, customPrompt, removeReferences !== false);
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
          { text: "A minimalist, modern vector logo for an app called 'DocuClean AI'. The icon should feature a stylized document or sheet of paper being cleaned or sparkling, implying clarity and organization. Use a color palette of Royal Blue, Slate Grey, and White. Flat design, clean lines, suitable for an app icon." }
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
    const items = [];
    const entries = await fs.promises.readdir(DATA_DIR, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const metadataPath = path.join(DATA_DIR, entry.name, 'metadata.json');
        try {
          const data = await fs.promises.readFile(metadataPath, 'utf-8');
          const parsedItem = JSON.parse(data);
          if (parsedItem?.type === 'file') {
            normalizeDocumentRuntimeState(parsedItem);
          }
          items.push(parsedItem);
        } catch (err) {
          console.warn(`Skipping invalid directory ${entry.name}:`, err.message);
        }
      }
    }
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
    const docDir = resolveDocumentDir(item.id);
    if (!fs.existsSync(docDir)) {
      await fs.promises.mkdir(docDir, { recursive: true });
    }

    // Handle image saving for files
    if (item.type === 'file' && item.pages && Array.isArray(item.pages)) {
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

    // Save the full edited text to a markdown file if savedText exists
    if (item.type === 'file' && item.savedText) {
      const cleanName = sanitizeDocumentBaseName(item.name);
      const fullDocMarkdownPath = path.join(docDir, `${cleanName}_edited.md`);
      await fs.promises.writeFile(fullDocMarkdownPath, item.savedText);
      console.log(`Saved edited document text to: ${fullDocMarkdownPath}`);
    }

    // Save metadata (now with URLs instead of base64)
    await fs.promises.writeFile(
      path.join(docDir, 'metadata.json'), 
      JSON.stringify(item, null, 2)
    );

    // Trigger background processing if requested
    if (item.startProcessing) {
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
