import { FileSystemItem } from '../types';

// Use relative path so Vite proxy handles it in dev, and it works in prod (same origin)
const API_BASE = '/api/documents';

export const getAllItems = async (): Promise<FileSystemItem[]> => {
  const response = await fetch(API_BASE);
  if (!response.ok) {
    throw new Error('Failed to fetch items');
  }
  return response.json();
};

export const saveItem = async (item: FileSystemItem, startProcessing: boolean = false): Promise<FileSystemItem> => {
  const body = { ...item, startProcessing };
  const response = await fetch(API_BASE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to save item: ${response.status} ${response.statusText} - ${errorText}`);
  }
  return response.json();
};

export const deleteItem = async (id: string): Promise<void> => {
  const response = await fetch(`${API_BASE}/${id}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw new Error('Failed to delete item');
  }
};

export const nukeDB = async (keepFolders: boolean = false): Promise<void> => {
  const items = await getAllItems();
  for (const item of items) {
    if (keepFolders && item.type === 'folder') {
      continue;
    }
    await deleteItem(item.id);
  }
};
