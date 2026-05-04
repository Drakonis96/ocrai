import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reprocessPage } from '../services/geminiService';

const createJsonResponse = (payload: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  text: vi.fn().mockResolvedValue(JSON.stringify(payload)),
  headers: {
    get: vi.fn((name: string) => (name.toLowerCase() === 'content-type' ? 'application/json' : null)),
  },
  json: vi.fn().mockResolvedValue(payload),
}) as unknown as Response;

const createTextResponse = (body: string, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  text: vi.fn().mockResolvedValue(body),
  headers: {
    get: vi.fn((name: string) => (name.toLowerCase() === 'content-type' ? 'text/html; charset=utf-8' : null)),
  },
}) as unknown as Response;

describe('geminiService reprocessPage', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn(async () => createJsonResponse({ accepted: true }, 202));
  });

  it('includes splitColumns in the page reprocess request payload', async () => {
    const fetchMock = vi.mocked(globalThis.fetch);

    await expect(
      reprocessPage(
        'doc-1',
        2,
        'model-a',
        'gemini',
        'manual',
        'English',
        'Extract only tables',
        false,
        true
      )
    ).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/reprocess-page',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const requestBody = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
    expect(requestBody).toMatchObject({
      docId: 'doc-1',
      pageIndex: 2,
      modelName: 'model-a',
      modelProvider: 'gemini',
      processingMode: 'manual',
      targetLanguage: 'English',
      customPrompt: 'Extract only tables',
      removeReferences: false,
      splitColumns: true,
    });
  });

  it('surfaces a useful error when the server returns HTML instead of JSON', async () => {
    globalThis.fetch = vi.fn(async () => createTextResponse('<!DOCTYPE html><html><body>Not Found</body></html>', 404));

    await expect(reprocessPage('doc-1', 2)).rejects.toMatchObject({
      message: 'Server returned HTML instead of JSON while reprocessing page (status 404). Check that the API route is reachable and your session is still valid.',
      responseStatus: 404,
      responseFormat: 'html',
      responseBody: '<!DOCTYPE html><html><body>Not Found</body></html>',
    });
  });
});