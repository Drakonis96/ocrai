import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reprocessPage } from '../services/geminiService';

const createJsonResponse = (payload: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: vi.fn().mockResolvedValue(payload),
}) as unknown as Response;

describe('geminiService reprocessPage', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn(async () => createJsonResponse({ blocks: [] }));
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
    ).resolves.toEqual([]);

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
});