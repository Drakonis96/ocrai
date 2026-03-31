// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsModal from '../components/SettingsModal';

const MODELS = [
  { id: 'gemini-flash-lite-latest', name: 'Gemini Flash Lite Latest', description: 'Cheapest' },
];

describe('Settings labeling tab', () => {
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

  it('exposes the Labeling tab alongside the AI tab', async () => {
    const onTabChange = vi.fn();

    await act(async () => {
      root.render(
        <SettingsModal
          isOpen
          activeTab="models"
          onTabChange={onTabChange}
          onClose={vi.fn()}
          models={MODELS}
          prompts={[]}
          availableLabels={[]}
          labelingSettings={{ autoLabelDocuments: false }}
          onAddModel={vi.fn(async () => {})}
          onRemoveModel={vi.fn(async () => {})}
          onCreatePrompt={vi.fn(async () => {})}
          onUpdatePrompt={vi.fn(async () => {})}
          onDeletePrompt={vi.fn(async () => {})}
          onCreateLabel={vi.fn(async () => {})}
          onDeleteLabel={vi.fn(async () => {})}
          onUpdateLabelingSettings={vi.fn(async () => {})}
        />
      );
    });

    expect(container.textContent).toContain('AI');
    expect(container.textContent).toContain('Labeling');

    const labelingTabButton = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === 'Labeling') as HTMLButtonElement | undefined;
    expect(labelingTabButton).toBeDefined();

    await act(async () => {
      labelingTabButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onTabChange).toHaveBeenCalledWith('labeling');
  });

  it('creates labels and updates the automatic labeling setting', async () => {
    const onCreateLabel = vi.fn(async () => {});
    const onUpdateLabelingSettings = vi.fn(async () => {});

    await act(async () => {
      root.render(
        <SettingsModal
          isOpen
          activeTab="labeling"
          onTabChange={vi.fn()}
          onClose={vi.fn()}
          models={MODELS}
          prompts={[]}
          availableLabels={['Finance']}
          labelingSettings={{ autoLabelDocuments: true }}
          onAddModel={vi.fn(async () => {})}
          onRemoveModel={vi.fn(async () => {})}
          onCreatePrompt={vi.fn(async () => {})}
          onUpdatePrompt={vi.fn(async () => {})}
          onDeletePrompt={vi.fn(async () => {})}
          onCreateLabel={onCreateLabel}
          onDeleteLabel={vi.fn(async () => {})}
          onUpdateLabelingSettings={onUpdateLabelingSettings}
        />
      );
    });

    const automaticLabelingCheckbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
    expect(automaticLabelingCheckbox?.checked).toBe(true);

    await act(async () => {
      automaticLabelingCheckbox?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onUpdateLabelingSettings).toHaveBeenCalledWith({ autoLabelDocuments: false });

    const labelInput = container.querySelector('input[placeholder="Label name"]') as HTMLInputElement | null;
    expect(labelInput).not.toBeNull();

    await act(async () => {
      if (labelInput) {
        const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        valueSetter?.call(labelInput, 'Urgent');
        labelInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });

    const addLabelButton = container.querySelector('button[aria-label="Add label"]') as HTMLButtonElement | null;
    expect(addLabelButton?.disabled).toBe(false);

    await act(async () => {
      addLabelButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onCreateLabel).toHaveBeenCalledWith('Urgent');
  });
});
