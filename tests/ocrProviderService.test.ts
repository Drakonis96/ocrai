import { describe, expect, it, vi } from 'vitest';
import {
  autodetectLmStudioModels,
  autodetectOllamaModels,
  requestStructuredOutputFromLmStudio,
  requestStructuredOutputFromOllama,
} from '../services/ocrProviderService.js';

const createJsonResponse = (payload: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  statusText: status === 200 ? 'OK' : 'Error',
  json: vi.fn().mockResolvedValue(payload),
}) as unknown as Response;

describe('ocrProviderService', () => {
  it('autodetects installed LM Studio models', async () => {
    const fetchMock = vi.fn(async () => createJsonResponse({
      data: [
        {
          id: 'qwen2.5-vl-7b-instruct',
          displayName: 'Qwen 2.5 VL 7B',
          type: 'vlm',
          arch: 'qwen2_vl',
          state: 'loaded',
        },
      ],
    }));

    await expect(autodetectLmStudioModels({ host: '127.0.0.1', port: 1234 }, fetchMock)).resolves.toEqual([
      {
        id: 'qwen2.5-vl-7b-instruct',
        name: 'Qwen 2.5 VL 7B',
        description: 'VLM • qwen2_vl • loaded',
        provider: 'lmstudio',
        isCustom: false,
        isAutodetected: true,
      },
    ]);

    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:1234/api/v0/models');
  });

  it('autodetects installed Ollama models', async () => {
    const fetchMock = vi.fn(async () => createJsonResponse({
      models: [
        {
          name: 'llama3.2-vision:11b',
          model: 'llama3.2-vision:11b',
          details: {
            parameter_size: '11B',
            family: 'llama',
          },
        },
      ],
    }));

    await expect(autodetectOllamaModels({ host: '127.0.0.1', port: 11434 }, fetchMock)).resolves.toEqual([
      {
        id: 'llama3.2-vision:11b',
        name: 'llama3.2-vision:11b',
        description: '11B • llama',
        provider: 'ollama',
        isCustom: false,
        isAutodetected: true,
      },
    ]);

    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:11434/api/tags');
  });

  it('requests structured OCR output from LM Studio using the OpenAI-compatible API', async () => {
    const fetchMock = vi.fn(async () => createJsonResponse({
      choices: [
        {
          message: {
            content: '```json\n{"blocks":[{"text":"Detected text"}]}\n```',
          },
        },
      ],
    }));

    const responseSchema = {
      type: 'object',
      properties: {
        blocks: {
          type: 'array',
        },
      },
      required: ['blocks'],
      additionalProperties: false,
    };

    await expect(requestStructuredOutputFromLmStudio({
      connection: { host: '127.0.0.1', port: 1234 },
      modelName: 'qwen2.5-vl-7b-instruct',
      prompt: 'Extract the text from this page.',
      responseSchema,
      image: { base64Image: 'YWJj', mimeType: 'image/png' },
      fetchImpl: fetchMock,
    })).resolves.toEqual({
      blocks: [{ text: 'Detected text' }],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:1234/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(requestBody.model).toBe('qwen2.5-vl-7b-instruct');
    expect(requestBody.response_format.type).toBe('json_schema');
    expect(requestBody.messages[0].content).toEqual([
      { type: 'text', text: 'Extract the text from this page.' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,YWJj' } },
    ]);
  });

  it('requests structured OCR output from Ollama using the local chat API', async () => {
    const fetchMock = vi.fn(async () => createJsonResponse({
      message: {
        content: '{"blocks":[{"text":"Detected by Ollama"}]}',
      },
    }));

    const responseSchema = {
      type: 'object',
      properties: {
        blocks: {
          type: 'array',
        },
      },
      required: ['blocks'],
      additionalProperties: false,
    };

    await expect(requestStructuredOutputFromOllama({
      connection: { host: '127.0.0.1', port: 11434 },
      modelName: 'llama3.2-vision:11b',
      prompt: 'Extract the text from this page.',
      responseSchema,
      image: { base64Image: 'YWJj', mimeType: 'image/png' },
      fetchImpl: fetchMock,
    })).resolves.toEqual({
      blocks: [{ text: 'Detected by Ollama' }],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:11434/api/chat',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(requestBody.model).toBe('llama3.2-vision:11b');
    expect(requestBody.format).toEqual(responseSchema);
    expect(requestBody.messages).toEqual([
      {
        role: 'user',
        content: 'Extract the text from this page.',
        images: ['YWJj'],
      },
    ]);
    expect(requestBody.stream).toBe(false);
  });
});
