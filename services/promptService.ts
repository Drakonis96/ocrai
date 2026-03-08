import { PromptPreset } from '../types';

const API_BASE = '/api/prompts';

const parsePrompts = async (response: Response): Promise<PromptPreset[]> => {
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error || 'Failed to load prompts');
  }

  return response.json();
};

export const getPrompts = async (): Promise<PromptPreset[]> => {
  try {
    const response = await fetch(API_BASE);
    return await parsePrompts(response);
  } catch (error) {
    console.error('Failed to fetch prompts', error);
    return [];
  }
};

export const createPrompt = async (prompt: Pick<PromptPreset, 'name' | 'prompt'>): Promise<PromptPreset[]> => {
  const response = await fetch(API_BASE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(prompt),
  });

  return parsePrompts(response);
};

export const updatePrompt = async (
  promptId: string,
  prompt: Pick<PromptPreset, 'name' | 'prompt'>
): Promise<PromptPreset[]> => {
  const response = await fetch(`${API_BASE}/${encodeURIComponent(promptId)}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(prompt),
  });

  return parsePrompts(response);
};

export const deletePrompt = async (promptId: string): Promise<PromptPreset[]> => {
  const response = await fetch(`${API_BASE}/${encodeURIComponent(promptId)}`, {
    method: 'DELETE',
  });

  return parsePrompts(response);
};
