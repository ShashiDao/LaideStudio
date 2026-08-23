// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import { KeyboardShortcutsModal } from './KeyboardShortcutsModal';

describe('KeyboardShortcutsModal Component', () => {
  afterEach(() => {
    cleanup();
  });

  it('does not render when isOpen is false', () => {
    const { container } = render(
      <KeyboardShortcutsModal isOpen={false} onClose={() => {}} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders modal content with shortcuts when isOpen is true', () => {
    const { container } = render(
      <KeyboardShortcutsModal isOpen={true} onClose={() => {}} />
    );

    expect(container.querySelector('#shortcuts-modal-title')?.textContent).toContain('Keyboard Shortcuts');
    expect(screen.getByText(/Toggle \/ Switch to Files \(FileTree\) tab/i)).toBeDefined();
    expect(screen.getByText(/Toggle \/ Switch to Terminal tab/i)).toBeDefined();
    expect(screen.getByText(/Quick open & focus file search/i)).toBeDefined();
  });

  it('calls onClose when close icon button is clicked', () => {
    let closed = false;
    const { container } = render(
      <KeyboardShortcutsModal isOpen={true} onClose={() => { closed = true; }} />
    );

    const closeBtn = container.querySelector('button[aria-label="Close shortcuts dialog"]') as HTMLButtonElement;
    expect(closeBtn).toBeDefined();
    fireEvent.click(closeBtn);
    expect(closed).toBe(true);
  });

  it('calls onClose when Done button is clicked', () => {
    let closed = false;
    const { container } = render(
      <KeyboardShortcutsModal isOpen={true} onClose={() => { closed = true; }} />
    );

    const doneBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.trim() === 'Done');
    expect(doneBtn).toBeDefined();
    if (doneBtn) fireEvent.click(doneBtn);
    expect(closed).toBe(true);
  });

  it('calls onClose when backdrop is clicked', () => {
    let closed = false;
    const { container } = render(
      <KeyboardShortcutsModal isOpen={true} onClose={() => { closed = true; }} />
    );

    const backdrop = container.querySelector('[role="dialog"]') as HTMLElement;
    fireEvent.click(backdrop);
    expect(closed).toBe(true);
  });
});
