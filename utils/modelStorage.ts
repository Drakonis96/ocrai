export interface GeminiModel {
  id: string;
  name: string;
  description: string;
  isCustom?: boolean;
}

export const DEFAULT_MODEL_ID = 'gemini-flash-lite-latest';

export const DEFAULT_MODELS: GeminiModel[] = [
  { id: DEFAULT_MODEL_ID, name: 'Gemini Flash Lite Latest', description: 'Cheapest' },
  { id: 'gemini-flash-latest', name: 'Gemini Flash Latest', description: 'Balanced' },
];

export const getPreferredDefaultModelId = (
  models: Array<Pick<GeminiModel, 'id'>> = DEFAULT_MODELS
) => models.find((model) => model.id === DEFAULT_MODEL_ID)?.id ?? models[0]?.id ?? DEFAULT_MODEL_ID;

const API_BASE = '/api/models';

const parseModels = async (response: Response): Promise<GeminiModel[]> => {
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error || 'Failed to load models');
  }

  return response.json();
};

export const getModels = async (): Promise<GeminiModel[]> => {
  try {
    const response = await fetch(API_BASE);
    return await parseModels(response);
  } catch (error) {
    console.error('Error loading models:', error);
    return DEFAULT_MODELS;
  }
};

export const addModel = async (model: GeminiModel): Promise<GeminiModel[]> => {
  const response = await fetch(API_BASE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(model),
  });

  return parseModels(response);
};

export const removeModel = async (modelId: string): Promise<GeminiModel[]> => {
  const response = await fetch(`${API_BASE}/${encodeURIComponent(modelId)}`, {
    method: 'DELETE',
  });

  return parseModels(response);
};
