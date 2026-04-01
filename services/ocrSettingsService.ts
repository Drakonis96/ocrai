import type { OcrModel, OcrProvider, OcrSettings } from '../utils/modelStorage';

const OCR_SETTINGS_API_BASE = '/api/ocr-settings';

interface AutodetectModelsResponse {
  models: OcrModel[];
  settings: OcrSettings;
}

const parseOcrSettings = async (response: Response): Promise<OcrSettings> => {
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error || 'Failed to load OCR settings');
  }

  return response.json();
};

const parseAutodetectResponse = async (response: Response): Promise<AutodetectModelsResponse> => {
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error || 'Failed to autodetect models');
  }

  return response.json();
};

export const getOcrSettings = async (): Promise<OcrSettings> => {
  const response = await fetch(OCR_SETTINGS_API_BASE);
  return parseOcrSettings(response);
};

export const updateOcrSettings = async (settings: OcrSettings): Promise<OcrSettings> => {
  const response = await fetch(OCR_SETTINGS_API_BASE, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(settings),
  });

  return parseOcrSettings(response);
};

export const autodetectProviderModels = async (
  provider: OcrProvider,
  settings?: OcrSettings
): Promise<AutodetectModelsResponse> => {
  const response = await fetch(`/api/ocr-providers/${provider}/models/autodetect`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: settings ? JSON.stringify(settings) : undefined,
  });

  return parseAutodetectResponse(response);
};
