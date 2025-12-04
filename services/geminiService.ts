import { TextBlock, ProcessingOptions } from "../types";

const processPageWithGemini = async (
  base64Image: string,
  mimeType: string,
  modelName: string = 'gemini-2.5-flash',
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
  modelName: string = 'gemini-2.5-flash',
  processingMode: ProcessingOptions['processingMode'] = 'ocr',
  targetLanguage?: string,
  customPrompt?: string,
  removeReferences?: boolean
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
        processingMode,
        targetLanguage,
        customPrompt,
        removeReferences
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Failed to reprocess page on server");
    }

    const data = await response.json();
    
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
    throw new Error(error.message || "Failed to reprocess page");
  }
};

export { processPageWithGemini, generateAppLogo, getSavedPrompts, savePrompt, reprocessPage };
