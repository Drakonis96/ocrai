import { DocumentData, TextBlock, ProcessingOptions } from "../types";
import { DEFAULT_MODEL_ID, OcrProvider } from "../utils/modelStorage";

type ReprocessResponseFormat = 'html' | 'json' | 'text';

export interface ReprocessPageRequestError extends Error {
  responseBody?: string;
  responseStatus?: number;
  responseFormat?: ReprocessResponseFormat;
}

const MAX_REPROCESS_ERROR_BODY_LENGTH = 12_000;

const looksLikeHtml = (value: string) => {
  const normalized = value.trim().toLowerCase();
  return normalized.startsWith('<!doctype html') || normalized.startsWith('<html') || normalized.startsWith('<body');
};

const parseJsonPayload = (value: string) => {
  if (!value.trim()) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const truncateResponseBody = (value: string) => {
  const normalized = value.trim();
  if (normalized.length <= MAX_REPROCESS_ERROR_BODY_LENGTH) {
    return normalized;
  }

  return `${normalized.slice(0, MAX_REPROCESS_ERROR_BODY_LENGTH)}\n\n...[truncated]`;
};

const createReprocessPageError = (
  message: string,
  details: {
    rawBody?: string;
    status?: number;
    format?: ReprocessResponseFormat;
  } = {}
): ReprocessPageRequestError => {
  const error = new Error(message) as ReprocessPageRequestError;

  if (typeof details.rawBody === 'string' && details.rawBody.trim()) {
    error.responseBody = truncateResponseBody(details.rawBody);
  }

  if (Number.isInteger(details.status)) {
    error.responseStatus = details.status;
  }

  if (details.format) {
    error.responseFormat = details.format;
  }

  return error;
};

const parseReprocessPageResponse = async (response: Response): Promise<{ blocks?: unknown[]; blankPage?: boolean }> => {
  const rawBody = await response.text();
  const payload = parseJsonPayload(rawBody);

  if (!response.ok) {
    if (typeof payload?.error === 'string' && payload.error.trim()) {
      throw createReprocessPageError(payload.error, {
        rawBody,
        status: response.status,
        format: 'json',
      });
    }

    if (looksLikeHtml(rawBody)) {
      throw createReprocessPageError(
        `Server returned HTML instead of JSON while reprocessing page (status ${response.status}). Check that the API route is reachable and your session is still valid.`,
        {
          rawBody,
          status: response.status,
          format: 'html',
        }
      );
    }

    throw createReprocessPageError(rawBody.trim() || 'Failed to reprocess page on server', {
      rawBody,
      status: response.status,
      format: payload ? 'json' : 'text',
    });
  }

  if (payload) {
    return payload;
  }

  if (looksLikeHtml(rawBody)) {
    throw createReprocessPageError(
      `Server returned HTML instead of JSON while reprocessing page (status ${response.status}). Check that the API route is reachable and your session is still valid.`,
      {
        rawBody,
        status: response.status,
        format: 'html',
      }
    );
  }

  throw createReprocessPageError('Server returned a non-JSON response while reprocessing page', {
    rawBody,
    status: response.status,
    format: 'text',
  });
};

const processPageWithGemini = async (
  base64Image: string,
  mimeType: string,
  modelName: string = DEFAULT_MODEL_ID,
  modelProvider: OcrProvider = 'gemini',
  processingMode: ProcessingOptions['processingMode'] = 'ocr',
  targetLanguage?: string,
  customPrompt?: string
): Promise<TextBlock[]> => {
  
  try {
    const response = await fetch('/api/process-page', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        base64Image,
        mimeType,
        modelName,
        modelProvider,
        processingMode,
        targetLanguage,
        customPrompt
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Failed to process document on server");
    }

    const data = await response.json();
    const text = data.text;

    if (!text) {
      throw new Error("No text response from AI.");
    }

    const parsed = JSON.parse(text);
    
    // Add unique IDs to blocks for React keys
    const blocksWithIds = (parsed.blocks || []).map((b: any) => ({
      ...b,
      id: crypto.randomUUID(),
      // Ensure boxes are present even if model omits them
      box_2d: b.box_2d || [0, 0, 0, 0] 
    }));

    return blocksWithIds;

  } catch (error: any) {
    console.error("Gemini Service Error:", error);
    throw new Error(error.message || "Failed to process document");
  }
};

const generateAppLogo = async (): Promise<string> => {
  try {
    const response = await fetch('/api/generate-logo', {
      method: 'POST',
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Failed to generate logo on server");
    }

    const imageData = await response.json();

    if (!imageData || !imageData.data) {
      throw new Error("No image generated");
    }

    return `data:${imageData.mimeType};base64,${imageData.data}`;

  } catch (e: any) {
    console.error("Logo generation failed", e);
    throw e;
  }
};

const getSavedPrompts = async (): Promise<{name: string, prompt: string}[]> => {
  try {
    const response = await fetch('/api/prompts');
    if (!response.ok) throw new Error("Failed to fetch prompts");
    return await response.json();
  } catch (e) {
    console.error("Failed to fetch prompts", e);
    return [];
  }
};

const savePrompt = async (name: string, prompt: string): Promise<void> => {
  try {
    const response = await fetch('/api/prompts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, prompt })
    });
    if (!response.ok) throw new Error("Failed to save prompt");
  } catch (e) {
    console.error("Failed to save prompt", e);
    throw e;
  }
};

const reprocessPage = async (
  docId: string,
  pageIndex: number,
  modelName: string = DEFAULT_MODEL_ID,
  modelProvider: OcrProvider = 'gemini',
  processingMode: ProcessingOptions['processingMode'] = 'ocr',
  targetLanguage?: string,
  customPrompt?: string,
  removeReferences?: boolean,
  splitColumns?: boolean
): Promise<TextBlock[]> => {
  try {
    const response = await fetch('/api/reprocess-page', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        docId,
        pageIndex,
        modelName,
        modelProvider,
        processingMode,
        targetLanguage,
        customPrompt,
        removeReferences,
        splitColumns
      }),
    });
    const data = await parseReprocessPageResponse(response);
    
    // Add unique IDs to blocks for React keys
    const blocksWithIds = (data.blocks || []).map((b: any) => ({
      ...b,
      id: crypto.randomUUID(),
      // Ensure boxes are present even if model omits them
      box_2d: b.box_2d || [0, 0, 0, 0] 
    }));

    return blocksWithIds;

  } catch (error: any) {
    console.error("Gemini Service Error:", error);
    if (error instanceof Error) {
      throw error;
    }

    throw new Error(error?.message || "Failed to reprocess page");
  }
};

const reprocessDocument = async (
  docId: string,
  modelName: string = DEFAULT_MODEL_ID,
  pagesPerBatch: number = 1,
  splitColumns: boolean = false,
  modelProvider: OcrProvider = 'gemini'
): Promise<DocumentData> => {
  try {
    const response = await fetch('/api/reprocess-document', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        docId,
        modelName,
        modelProvider,
        pagesPerBatch,
        splitColumns,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      throw new Error(errorData?.error || 'Failed to reprocess document on server');
    }

    return response.json();
  } catch (error: any) {
    console.error('Gemini Service Error:', error);
    throw new Error(error.message || 'Failed to reprocess document');
  }
};

export { processPageWithGemini, generateAppLogo, getSavedPrompts, savePrompt, reprocessPage, reprocessDocument };
