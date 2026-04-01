import { afterEach, describe, expect, it, vi } from 'vitest';
import { autodetectProviderModels, getOcrSettings, updateOcrSettings } from '../services/ocrSettingsService';
import type { OcrSettings } from '../utils/modelStorage';

const SETTINGS: OcrSettings = {
  provider: 'lmstudio',
  selectedModelId: 'qwen2.5-vl-7b',
  lmStudio: { host: '127.0.0.1', port: 1234 },
  ollama: { host: '127.0.0.1', port: 11434 },
};

describe('ocrSettingsService', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads OCR settings from the backend', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => SETTINGS,
    } as Response)));

    await expect(getOcrSettings()).resolves.toEqual(SETTINGS);
    expect(fetch).toHaveBeenCalledWith('/api/ocr-settings');
  });

  it('persists OCR settings changes', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => SETTINGS,
    } as Response)));

    await expect(updateOcrSettings(SETTINGS)).resolves.toEqual(SETTINGS);

    expect(fetch).toHaveBeenCalledWith('/api/ocr-settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(SETTINGS),
    });
  });

  it('sends the current settings draft when autodetecting provider models', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        models: [],
        settings: SETTINGS,
      }),
    } as Response)));

    await expect(autodetectProviderModels('lmstudio', SETTINGS)).resolves.toEqual({
      models: [],
      settings: SETTINGS,
    });

    expect(fetch).toHaveBeenCalledWith('/api/ocr-providers/lmstudio/models/autodetect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(SETTINGS),
    });
  });
});
