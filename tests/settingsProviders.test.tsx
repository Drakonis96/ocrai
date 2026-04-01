// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsModal from '../components/SettingsModal';
import type { OcrProvider, OcrSettings } from '../utils/modelStorage';

const MODELS = [
  { id: 'gemini-flash-lite-latest', name: 'Gemini Flash Lite Latest', description: 'Cheapest', provider: 'gemini' },
  { id: 'qwen2.5-vl-7b', name: 'Qwen 2.5 VL 7B', description: 'Autodetected from LM Studio', provider: 'lmstudio', isAutodetected: true },
  { id: 'llama3.2-vision:11b', name: 'Llama 3.2 Vision 11B', description: 'Autodetected from Ollama', provider: 'ollama', isAutodetected: true },
] as const;

const BASE_SETTINGS: OcrSettings = {
  provider: 'gemini',
  selectedModelId: 'gemini-flash-lite-latest',
  lmStudio: { host: '127.0.0.1', port: 1234 },
  ollama: { host: '127.0.0.1', port: 11434 },
};

const renderModal = async (
  root: Root,
  overrides: Partial<React.ComponentProps<typeof SettingsModal>> = {}
) => {
  await act(async () => {
    root.render(
      <SettingsModal
        isOpen
        activeTab="models"
        onTabChange={vi.fn()}
        onClose={vi.fn()}
        models={[...MODELS]}
        ocrSettings={BASE_SETTINGS}
        prompts={[]}
        availableLabels={[]}
        labelingSettings={{ autoLabelDocuments: false }}
        onAddModel={vi.fn(async () => {})}
        onRemoveModel={vi.fn(async () => {})}
        onAutodetectProviderModels={vi.fn(async () => {})}
        onUpdateOcrSettings={vi.fn(async () => {})}
        onCreatePrompt={vi.fn(async () => {})}
        onUpdatePrompt={vi.fn(async () => {})}
        onDeletePrompt={vi.fn(async () => {})}
        onCreateLabel={vi.fn(async () => {})}
        onDeleteLabel={vi.fn(async () => {})}
        onUpdateLabelingSettings={vi.fn(async () => {})}
        {...overrides}
      />
    );
  });
};

const setInputValue = (element: HTMLInputElement | HTMLSelectElement, value: string) => {
  const prototype = element instanceof HTMLSelectElement
    ? window.HTMLSelectElement.prototype
    : window.HTMLInputElement.prototype;
  const valueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  valueSetter?.call(element, value);
  element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
};

const getInput = <T extends HTMLElement>(container: HTMLElement, selector: string) => {
  const element = container.querySelector(selector) as T | null;
  expect(element).not.toBeNull();
  return element as T;
};

const clickButtonByLabel = async (container: HTMLElement, label: string) => {
  const button = container.querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement | null;
  expect(button).not.toBeNull();
  await act(async () => {
    button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};

const clickProviderAutodetectButton = async (container: HTMLElement, providerTitle: string) => {
  const title = Array.from(container.querySelectorAll('h4'))
    .find((element) => element.textContent?.trim() === providerTitle) as HTMLHeadingElement | undefined;
  expect(title).toBeDefined();
  const button = title?.parentElement?.parentElement?.querySelector('button') as HTMLButtonElement | null;
  expect(button).not.toBeNull();
  await act(async () => {
    button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};

describe('Settings OCR providers', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  it('saves the selected OCR provider, model and local endpoints', async () => {
    const onUpdateOcrSettings = vi.fn(async () => {});

    await renderModal(root, { onUpdateOcrSettings });

    const providerSelect = getInput<HTMLSelectElement>(container, 'select[aria-label="OCR provider"]');
    const modelSelect = getInput<HTMLSelectElement>(container, 'select[aria-label="Default OCR model"]');
    const lmStudioHost = getInput<HTMLInputElement>(container, 'input[aria-label="LM Studio host"]');
    const lmStudioPort = getInput<HTMLInputElement>(container, 'input[aria-label="LM Studio port"]');
    const ollamaHost = getInput<HTMLInputElement>(container, 'input[aria-label="Ollama host"]');
    const ollamaPort = getInput<HTMLInputElement>(container, 'input[aria-label="Ollama port"]');

    await act(async () => {
      setInputValue(providerSelect, 'lmstudio');
      setInputValue(modelSelect, 'qwen2.5-vl-7b');
      setInputValue(lmStudioHost, 'localhost');
      setInputValue(lmStudioPort, '1235');
      setInputValue(ollamaHost, '192.168.1.20');
      setInputValue(ollamaPort, '11435');
    });

    await clickButtonByLabel(container, 'Save OCR settings');

    expect(onUpdateOcrSettings).toHaveBeenCalledWith({
      provider: 'lmstudio',
      selectedModelId: 'qwen2.5-vl-7b',
      lmStudio: { host: 'localhost', port: 1235 },
      ollama: { host: '192.168.1.20', port: 11435 },
    });
  });

  it('passes the current draft settings when autodetecting local models', async () => {
    const onAutodetectProviderModels = vi.fn(async (_provider: OcrProvider, _settings?: OcrSettings) => {});

    await renderModal(root, { onAutodetectProviderModels });

    const lmStudioHost = getInput<HTMLInputElement>(container, 'input[aria-label="LM Studio host"]');
    const lmStudioPort = getInput<HTMLInputElement>(container, 'input[aria-label="LM Studio port"]');
    const ollamaHost = getInput<HTMLInputElement>(container, 'input[aria-label="Ollama host"]');
    const ollamaPort = getInput<HTMLInputElement>(container, 'input[aria-label="Ollama port"]');

    await act(async () => {
      setInputValue(lmStudioHost, '10.0.0.5');
      setInputValue(lmStudioPort, '4321');
      setInputValue(ollamaHost, 'ollama.local');
      setInputValue(ollamaPort, '12000');
    });

    await clickProviderAutodetectButton(container, 'LM Studio');
    await clickProviderAutodetectButton(container, 'Ollama');

    expect(onAutodetectProviderModels).toHaveBeenNthCalledWith(1, 'lmstudio', {
      provider: 'gemini',
      selectedModelId: 'gemini-flash-lite-latest',
      lmStudio: { host: '10.0.0.5', port: 4321 },
      ollama: { host: 'ollama.local', port: 12000 },
    });
    expect(onAutodetectProviderModels).toHaveBeenNthCalledWith(2, 'ollama', {
      provider: 'gemini',
      selectedModelId: 'gemini-flash-lite-latest',
      lmStudio: { host: '10.0.0.5', port: 4321 },
      ollama: { host: 'ollama.local', port: 12000 },
    });
  });
});
