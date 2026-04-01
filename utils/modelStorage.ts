export type OcrProvider = 'gemini' | 'lmstudio' | 'ollama';

export interface OcrModel {
  id: string;
  name: string;
  description: string;
  provider?: OcrProvider;
  isCustom?: boolean;
  isAutodetected?: boolean;
}

export type GeminiModel = OcrModel;

export interface OcrProviderConnection {
  host: string;
  port: number;
}

export interface OcrSettings {
  provider: OcrProvider;
  selectedModelId: string;
  lmStudio: OcrProviderConnection;
  ollama: OcrProviderConnection;
}

export const OCR_PROVIDER_LABELS: Record<OcrProvider, string> = {
  gemini: 'Gemini',
  lmstudio: 'LM Studio',
  ollama: 'Ollama',
};

export const DEFAULT_PROVIDER: OcrProvider = 'gemini';
export const DEFAULT_MODEL_ID = 'gemini-flash-lite-latest';

export const DEFAULT_MODELS: OcrModel[] = [
  { id: DEFAULT_MODEL_ID, name: 'Gemini Flash Lite Latest', description: 'Cheapest', provider: 'gemini' },
  { id: 'gemini-flash-latest', name: 'Gemini Flash Latest', description: 'Balanced', provider: 'gemini' },
];

export const DEFAULT_OCR_SETTINGS: OcrSettings = {
  provider: DEFAULT_PROVIDER,
  selectedModelId: DEFAULT_MODEL_ID,
  lmStudio: {
    host: '127.0.0.1',
    port: 1234,
  },
  ollama: {
    host: '127.0.0.1',
    port: 11434,
  },
};

const API_BASE = '/api/models';

const parseModels = async (response: Response): Promise<OcrModel[]> => {
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error || 'Failed to load models');
  }

  return response.json();
};

export const getProviderModels = (
  models: OcrModel[],
  provider: OcrProvider
) => models.filter((model) => (model.provider ?? DEFAULT_PROVIDER) === provider);

export const sortModelsForPreferredSelection = (
  models: OcrModel[],
  preferredModelId?: string
) => {
  if (!preferredModelId) {
    return models;
  }

  const preferredIndex = models.findIndex((model) => model.id === preferredModelId);
  if (preferredIndex <= 0) {
    return models;
  }

  const nextModels = [...models];
  const [preferredModel] = nextModels.splice(preferredIndex, 1);
  nextModels.unshift(preferredModel);
  return nextModels;
};

export const getPreferredDefaultModelId = (
  models: Array<Pick<OcrModel, 'id'>> = DEFAULT_MODELS,
  preferredModelId?: string
) => {
  if (preferredModelId && models.some((model) => model.id === preferredModelId)) {
    return preferredModelId;
  }

  return models.find((model) => model.id === DEFAULT_MODEL_ID)?.id ?? models[0]?.id ?? DEFAULT_MODEL_ID;
};

export const getModels = async (): Promise<OcrModel[]> => {
  try {
    const response = await fetch(API_BASE);
    return await parseModels(response);
  } catch (error) {
    console.error('Error loading models:', error);
    return DEFAULT_MODELS;
  }
};

export const addModel = async (model: OcrModel): Promise<OcrModel[]> => {
  const response = await fetch(API_BASE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(model),
  });

  return parseModels(response);
};

export const removeModel = async (modelId: string, provider?: OcrProvider): Promise<OcrModel[]> => {
  const searchParams = new URLSearchParams();
  if (provider) {
    searchParams.set('provider', provider);
  }

  const suffix = searchParams.toString() ? `?${searchParams}` : '';
  const response = await fetch(`${API_BASE}/${encodeURIComponent(modelId)}${suffix}`, {
    method: 'DELETE',
  });

  return parseModels(response);
};
