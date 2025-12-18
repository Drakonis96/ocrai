// Default models that come with the app
export const DEFAULT_MODELS: GeminiModel[] = [
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', description: 'Balanced' },
  { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite', description: 'Faster' },
  { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash Preview', description: 'Preview' },
  { id: 'gemini-3-flash-lite-preview', name: 'Gemini 3 Flash Lite Preview', description: 'Preview Lite' },
  { id: 'gemini-3-flash', name: 'Gemini 3 Flash', description: 'Latest' },
  { id: 'gemini-3-flash-lite', name: 'Gemini 3 Flash Lite', description: 'Latest Lite' },
];

export interface GeminiModel {
  id: string;
  name: string;
  description: string;
  isCustom?: boolean;
}

const STORAGE_KEY = 'gemini_models';

export const getModels = (): GeminiModel[] => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const customModels = JSON.parse(stored) as GeminiModel[];
      // Merge default models with custom ones, avoiding duplicates
      const allModels = [...DEFAULT_MODELS];
      customModels.forEach(cm => {
        if (!allModels.find(m => m.id === cm.id)) {
          allModels.push({ ...cm, isCustom: true });
        }
      });
      return allModels;
    }
  } catch (e) {
    console.error('Error loading models from storage:', e);
  }
  return DEFAULT_MODELS;
};

export const addModel = (model: GeminiModel): GeminiModel[] => {
  const currentModels = getModels();
  if (currentModels.find(m => m.id === model.id)) {
    throw new Error(`Model with ID "${model.id}" already exists`);
  }
  
  // Only store custom models
  const customModels = getCustomModels();
  customModels.push({ ...model, isCustom: true });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(customModels));
  
  return getModels();
};

export const removeModel = (modelId: string): GeminiModel[] => {
  const isDefault = DEFAULT_MODELS.find(m => m.id === modelId);
  if (isDefault) {
    throw new Error('Cannot remove default models');
  }
  
  const customModels = getCustomModels().filter(m => m.id !== modelId);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(customModels));
  
  return getModels();
};

export const getCustomModels = (): GeminiModel[] => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored) as GeminiModel[];
    }
  } catch (e) {
    console.error('Error loading custom models from storage:', e);
  }
  return [];
};
