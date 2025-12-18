import express from 'express';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from "@google/genai";
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { handleLoginAttempt, verifySession, logoutSession, checkLockout } from './services/authService.js';

// Load environment variables
dotenv.config({ path: '.env.local' });
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 5037;

// Trust proxy for secure cookies and IP rate limiting behind reverse proxy
app.set('trust proxy', 1);

// Enable CORS for development
app.use(cors());

// Security headers
app.use(helmet({
  contentSecurityPolicy: false, // Disable CSP for simplicity in this context, or configure it properly
}));
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

const DATA_DIR = path.join(__dirname, 'data');
// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR);
}

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
      res.cookie('session_id', result.sessionId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
      });
      return res.json({ success: true });
    } else {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/logout', async (req, res) => {
  const sessionId = req.cookies['session_id'];
  if (sessionId) {
    await logoutSession(sessionId);
  }
  res.clearCookie('session_id');
  res.json({ success: true });
});

app.get('/api/check-auth', async (req, res) => {
  const sessionId = req.cookies['session_id'];
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

  const sessionId = req.cookies['session_id'];
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

**Task Steps**:
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
4.  **REMOVE IN-TEXT REFERENCES**: When extracting MAIN_TEXT blocks, you MUST omit all in-text academic citations and references. These include patterns like:
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
    }
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
    model: modelName || 'gemini-2.5-flash',
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
    return [];
  }

  try {
    return JSON.parse(textResponse).blocks;
  } catch (e) {
    console.error("Failed to parse Gemini response:", textResponse);
    throw new Error(`Invalid JSON response from Gemini: ${e.message}`);
  }
}

const activeProcessing = new Set();

async function processDocumentBackground(docId) {
  if (activeProcessing.has(docId)) {
    console.log(`Document ${docId} is already being processed.`);
    return;
  }
  activeProcessing.add(docId);
  console.log(`Starting background processing for ${docId}`);
  
  const docDir = path.join(DATA_DIR, docId);
  const metadataPath = path.join(docDir, 'metadata.json');

  try {
    // Wait a bit to ensure file write is complete
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Retry logic for reading metadata
    let docData = null;
    for (let attempt = 0; attempt < 5; attempt++) {
        try {
            if (fs.existsSync(metadataPath)) {
                const content = await fs.promises.readFile(metadataPath, 'utf-8');
                docData = JSON.parse(content);
                break;
            }
        } catch (e) {
            console.warn(`Attempt ${attempt + 1} to read metadata failed: ${e.message}`);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    if (!docData) {
        console.error(`Failed to read metadata for ${docId} after multiple attempts.`);
        activeProcessing.delete(docId);
        return;
    }
    
    // Update status to processing if not already
    if (docData.status !== 'processing') {
        docData.status = 'processing';
        await fs.promises.writeFile(metadataPath, JSON.stringify(docData, null, 2));
    }

    for (let i = 0; i < docData.pages.length; i++) {
      // Re-read metadata to check for cancellation or updates (optional, but good practice)
      // For now, we just process sequentially
      
      const page = docData.pages[i];
      
      if (page.status === 'completed') continue;

      console.log(`Processing page ${i + 1}/${docData.pages.length} for ${docId}`);

      try {
        // Read image file
        const filename = path.basename(page.imageUrl);
        const imagePath = path.join(docDir, filename);
        
        if (!fs.existsSync(imagePath)) {
            throw new Error(`Image file not found: ${imagePath}`);
        }

        const imageBuffer = await fs.promises.readFile(imagePath);
        const base64Image = imageBuffer.toString('base64');
        const mimeType = path.extname(filename) === '.png' ? 'image/png' : 'image/jpeg';

        const blocks = await processPageWithGemini(
          base64Image, 
          mimeType, 
          docData.modelUsed,
          docData.processingMode,
          docData.targetLanguage,
          docData.customPrompt,
          docData.removeReferences !== false
        );

        // Update page data in memory
        docData.pages[i].blocks = blocks;
        docData.pages[i].status = 'completed';
        docData.processedPages = i + 1;

        // Save Markdown
        const mdContent = blocksToMarkdown(blocks);
        await fs.promises.writeFile(path.join(docDir, `page_${i + 1}.md`), mdContent);

        // Save Metadata (incremental update)
        await fs.promises.writeFile(metadataPath, JSON.stringify(docData, null, 2));

      } catch (err) {
        console.error(`Error processing page ${i + 1} of ${docId}:`, err);
        docData.pages[i].status = 'error';
        docData.processedPages = i + 1; 
        await fs.promises.writeFile(metadataPath, JSON.stringify(docData, null, 2));
      }
    }

    // Final status update
    const allFailed = docData.pages.every(p => p.status === 'error');
    docData.status = allFailed ? 'error' : 'ready';
    await fs.promises.writeFile(metadataPath, JSON.stringify(docData, null, 2));
    console.log(`Finished background processing for ${docId}`);

  } catch (e) {
    console.error(`Fatal error in background processing for ${docId}:`, e);
    try {
        if (fs.existsSync(metadataPath)) {
            let currentData = JSON.parse(await fs.promises.readFile(metadataPath, 'utf-8'));
            currentData.status = 'error';
            await fs.promises.writeFile(metadataPath, JSON.stringify(currentData, null, 2));
        }
    } catch (ex) {
        console.error("Failed to update error status", ex);
    }
  } finally {
    activeProcessing.delete(docId);
  }
}

app.post('/api/reprocess-page', async (req, res) => {
  const { docId, pageIndex, modelName, processingMode, targetLanguage, customPrompt, removeReferences } = req.body;
  
  try {
    const docDir = path.join(DATA_DIR, docId);
    const metadataPath = path.join(docDir, 'metadata.json');
    
    if (!fs.existsSync(metadataPath)) {
        return res.status(404).json({ error: "Document not found" });
    }

    const docData = JSON.parse(await fs.promises.readFile(metadataPath, 'utf-8'));
    const page = docData.pages[pageIndex];
    
    if (!page) {
        return res.status(404).json({ error: "Page not found" });
    }

    // Find image file
    const filename = path.basename(page.imageUrl);
    const imagePath = path.join(docDir, filename);
    
    console.log(`Reprocessing page ${pageIndex} for ${docId}. Image path: ${imagePath}`);

    if (!fs.existsSync(imagePath)) {
         console.error(`Image file not found at ${imagePath} (DATA_DIR: ${DATA_DIR})`);
         return res.status(404).json({ error: `Image file not found at ${imagePath}` });
    }

    const imageBuffer = await fs.promises.readFile(imagePath);
    const base64Image = imageBuffer.toString('base64');
    const mimeType = path.extname(filename) === '.png' ? 'image/png' : 'image/jpeg';

    console.log(`Calling Gemini for reprocessing... Model: ${modelName || 'default'}`);

    const blocks = await processPageWithGemini(
        base64Image, 
        mimeType, 
        modelName, 
        processingMode, 
        targetLanguage, 
        customPrompt,
        removeReferences !== false
    );

    console.log(`Gemini reprocessing successful. Blocks: ${blocks ? blocks.length : 0}`);

    // Update metadata
    docData.pages[pageIndex].blocks = blocks;
    docData.pages[pageIndex].status = 'completed';
    
    // Save Markdown for page
    const mdContent = blocksToMarkdown(blocks);
    await fs.promises.writeFile(path.join(docDir, `page_${pageIndex + 1}.md`), mdContent);

    // Save Metadata
    await fs.promises.writeFile(metadataPath, JSON.stringify(docData, null, 2));

    res.json({ blocks });

  } catch (error) {
    console.error("Reprocess Error:", error);
    res.status(500).json({ error: `Reprocessing failed: ${error.message}` });
  }
});

app.post('/api/process-page', async (req, res) => {
  const { base64Image, mimeType, modelName, processingMode, targetLanguage, customPrompt, removeReferences } = req.body;

  try {
    const blocks = await processPageWithGemini(base64Image, mimeType, modelName, processingMode, targetLanguage, customPrompt, removeReferences !== false);
    
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

    res.json({ text: JSON.stringify({ blocks }) }); // Maintain old response format for now

  } catch (error) {
    console.error("Gemini API Error (Server):", error);
    res.status(500).json({ error: error.message });
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
    console.error("Logo generation failed (Server)", e);
    res.status(500).json({ error: e.message });
  }
});

// --- STORAGE ROUTES ---

// DATA_DIR moved to top


// Serve stored data files
app.use('/api/data', express.static(DATA_DIR));

app.get('/api/documents', async (req, res) => {
  try {
    const items = [];
    const entries = await fs.promises.readdir(DATA_DIR, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const metadataPath = path.join(DATA_DIR, entry.name, 'metadata.json');
        try {
          const data = await fs.promises.readFile(metadataPath, 'utf-8');
          items.push(JSON.parse(data));
        } catch (err) {
          console.warn(`Skipping invalid directory ${entry.name}:`, err.message);
        }
      }
    }
    res.json(items);
  } catch (e) {
    console.error("Failed to list documents", e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/documents', async (req, res) => {
  console.log("POST /api/documents hit");
  try {
    let item = req.body;
    if (!item || !item.id) {
      return res.status(400).json({ error: "Invalid item data" });
    }

    const docDir = path.join(DATA_DIR, item.id);
    if (!fs.existsSync(docDir)) {
      await fs.promises.mkdir(docDir, { recursive: true });
    }

    // Handle image saving for files
    if (item.type === 'file' && item.pages && Array.isArray(item.pages)) {
      for (let i = 0; i < item.pages.length; i++) {
        const page = item.pages[i];
        
        // If imageUrl is base64, save it to file and update URL
        if (page.imageUrl && page.imageUrl.startsWith('data:')) {
          const matches = page.imageUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
          if (matches && matches.length === 3) {
            const mimeType = matches[1];
            const base64Data = matches[2];
            const extension = mimeType.split('/')[1] || 'bin';
            const filename = `page_${i + 1}.${extension}`;
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
            path.join(docDir, `page_${i + 1}.md`),
            mdContent
          );
        }
      }
    }

    // Save the full edited text to a markdown file if savedText exists
    if (item.type === 'file' && item.savedText) {
      const cleanName = item.name.replace(/\.[^/.]+$/, ""); // Remove extension
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
    console.error("Failed to save document", e);
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/documents/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const docDir = path.join(DATA_DIR, id);
    
    if (fs.existsSync(docDir)) {
      await fs.promises.rm(docDir, { recursive: true, force: true });
    }
    
    res.json({ success: true });
  } catch (e) {
    console.error("Failed to delete document", e);
    res.status(500).json({ error: e.message });
  }
});

// --- PROMPTS ROUTES ---

const PROMPTS_FILE = path.join(DATA_DIR, 'prompts.json');

app.get('/api/prompts', async (req, res) => {
  try {
    if (!fs.existsSync(PROMPTS_FILE)) {
      return res.json([]);
    }
    const data = await fs.promises.readFile(PROMPTS_FILE, 'utf-8');
    const prompts = JSON.parse(data);
    res.json(prompts.sort((a, b) => a.name.localeCompare(b.name)));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/prompts', async (req, res) => {
  try {
    const { name, prompt } = req.body;
    if (!name || !prompt) {
      return res.status(400).json({ error: "Name and prompt are required" });
    }
    
    let prompts = [];
    if (fs.existsSync(PROMPTS_FILE)) {
      const data = await fs.promises.readFile(PROMPTS_FILE, 'utf-8');
      prompts = JSON.parse(data);
    }
    
    // Check if name exists
    const existingIndex = prompts.findIndex(p => p.name === name);
    if (existingIndex >= 0) {
      prompts[existingIndex] = { name, prompt };
    } else {
      prompts.push({ name, prompt });
    }
    
    await fs.promises.writeFile(PROMPTS_FILE, JSON.stringify(prompts, null, 2));
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
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
  console.error("Global Server Error:", err);
  res.status(500).json({ error: err.message, stack: err.stack });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  if (!process.env.GEMINI_API_KEY) {
    console.warn("\x1b[33m%s\x1b[0m", "WARNING: GEMINI_API_KEY is not set in the environment! API calls will fail.");
  } else {
    console.log("GEMINI_API_KEY is present.");
  }
});