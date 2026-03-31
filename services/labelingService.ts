import { LabelingSettings } from '../types';

const LABELS_API_BASE = '/api/labels';
const LABELING_SETTINGS_API_BASE = '/api/labeling-settings';

const parseLabels = async (response: Response): Promise<string[]> => {
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error || 'Failed to load labels');
  }

  return response.json();
};

const parseLabelingSettings = async (response: Response): Promise<LabelingSettings> => {
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error || 'Failed to load labeling settings');
  }

  return response.json();
};

export const getLabels = async (): Promise<string[]> => {
  try {
    const response = await fetch(LABELS_API_BASE);
    return await parseLabels(response);
  } catch (error) {
    console.error('Failed to fetch labels', error);
    return [];
  }
};

export const createLabel = async (labelName: string): Promise<string[]> => {
  const response = await fetch(LABELS_API_BASE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name: labelName }),
  });

  return parseLabels(response);
};

export const deleteLabel = async (labelName: string): Promise<string[]> => {
  const response = await fetch(`${LABELS_API_BASE}/${encodeURIComponent(labelName)}`, {
    method: 'DELETE',
  });

  return parseLabels(response);
};

export const getLabelingSettings = async (): Promise<LabelingSettings> => {
  try {
    const response = await fetch(LABELING_SETTINGS_API_BASE);
    return await parseLabelingSettings(response);
  } catch (error) {
    console.error('Failed to fetch labeling settings', error);
    return { autoLabelDocuments: false };
  }
};

export const updateLabelingSettings = async (settings: LabelingSettings): Promise<LabelingSettings> => {
  const response = await fetch(LABELING_SETTINGS_API_BASE, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(settings),
  });

  return parseLabelingSettings(response);
};
