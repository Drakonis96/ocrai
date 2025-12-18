export enum BlockLabel {
  TITLE = 'TITLE',
  MAIN_TEXT = 'MAIN_TEXT',
  FOOTNOTE = 'FOOTNOTE',
  HEADER = 'HEADER',
  FOOTER = 'FOOTER',
  CAPTION = 'CAPTION',
  UNKNOWN = 'UNKNOWN'
}

export interface BoundingBox {
  ymin: number;
  xmin: number;
  ymax: number;
  xmax: number;
}

export interface TextBlock {
  id: string;
  text: string;
  label: BlockLabel;
  box_2d?: number[]; // [ymin, xmin, ymax, xmax] standard Gemini normalized
}

export interface PageData {
  pageNumber: number;
  imageUrl: string; // Base64 data URL
  blocks: TextBlock[];
  status: 'pending' | 'processing' | 'completed' | 'error';
}

export type FileSystemItemType = 'file' | 'folder';

export interface FileSystemItem {
  id: string;
  name: string; // filename for files, folder name for folders
  type: FileSystemItemType;
  parentId: string | null; // null for root/home
  createdAt: number;
}

export interface DocumentData extends FileSystemItem {
  type: 'file';
  uploadDate: number; // Keep for compatibility, same as createdAt
  pages: PageData[];
  status: 'uploading' | 'processing' | 'ready' | 'error';
  modelUsed: string;
  processingMode?: 'ocr' | 'translation' | 'manual';
  targetLanguage?: string;
  customPrompt?: string;
  removeReferences?: boolean;
  // Progress tracking
  totalPages: number;
  processedPages: number;
  // Persisted user edits
  savedText?: string;
}

export interface FolderData extends FileSystemItem {
  type: 'folder';
}

export enum AppView {
  UPLOAD = 'UPLOAD',
  DASHBOARD = 'DASHBOARD',
  EDITOR = 'EDITOR',
}

export interface ProcessingOptions {
  model: string;
  processingMode: 'ocr' | 'translation' | 'manual';
  targetLanguage?: string;
  customPrompt?: string;
  removeReferences?: boolean;
}
