// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import IconActionButton from '../components/IconActionButton';

describe('IconActionButton', () => {
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

  it('scopes label expansion to the button group instead of any outer generic group ancestor', async () => {
    await act(async () => {
      root.render(
        <div className="group">
          <IconActionButton icon={<span>i</span>} label="Example action" />
        </div>
      );
    });

    const button = container.querySelector('button');
    const label = button?.children.item(1) as HTMLSpanElement | null;

    expect(button?.className).toContain('group/icon-action');
    expect(label?.className).toContain('group-hover/icon-action:max-w-[10rem]');
    expect(label?.className).toContain('group-focus-within/icon-action:max-w-[10rem]');
    expect(label?.className).not.toContain('group-hover:max-w-[10rem]');
  });
});
