// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import React from 'react';
import { render } from '@testing-library/react';
import axe from 'axe-core';
import { AiBlameSidePanel } from '../editor/EditorAiBlame';
import { TerminalPanel } from '../terminal/TerminalPanel';
import { PatchReviewSheet } from '../chat/PatchReviewSheet';
import { useAppStore } from '../../store';
import { db } from '../../db';

describe('Accessibility Hygiene Pass (axe-core)', () => {
  beforeEach(async () => {
    await db.projects.clear();
    await db.files.clear();
    await db.snapshots.clear();
    await db.provenanceEntries.clear();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('audits AiBlameSidePanel with axe-core', async () => {
    const { container } = render(
      <AiBlameSidePanel
        isOpen={true}
        onClose={vi.fn()}
        activeLineNumber={5}
        activeEntry={{
          id: 'prov-1',
          projectId: 'p-1',
          filePath: '/src/App.tsx',
          beforeHash: 'aaa',
          afterHash: 'bbb',
          model: 'claude-3-5-sonnet',
          provider: 'anthropic',
          rationale: 'Fix navigation bar bug',
          timestamp: Date.now(),
          prevEntryHash: '0'.repeat(64),
          entryHash: 'entry-1234567890abcdef',
          testResult: {
            passed: 4,
            failed: 0,
            total: 4,
            status: 'passed'
          }
        }}
        totalAiLines={10}
        totalDocLines={50}
        theme="oled"
        onOpenBisect={vi.fn()}
        onOpenTrustReport={vi.fn()}
      />
    );

    const results = await axe.run(container, {
      rules: {
        // In happy-dom/jsdom, color-contrast checks can be disabled or handled gracefully since styles aren't computed identically to real browsers
        'color-contrast': { enabled: false }
      }
    });

    console.log('AiBlameSidePanel axe violations:', results.violations.length, results.violations.map(v => ({ id: v.id, help: v.help, nodes: v.nodes.length })));
    expect(results.violations.length).toBe(0);
  });

  it('audits TerminalPanel with axe-core', async () => {
    const { container } = render(
      <TerminalPanel
        projectId="test-proj"
        files={[]}
      />
    );

    const results = await axe.run(container, {
      rules: {
        'color-contrast': { enabled: false }
      }
    });

    console.log('TerminalPanel axe violations:', results.violations.length, results.violations.map(v => ({ id: v.id, help: v.help, nodes: v.nodes.length })));
    expect(results.violations.length).toBe(0);
  });

  it('audits PatchReviewSheet with axe-core', async () => {
    useAppStore.getState().setIsPatchReviewOpen(true);
    useAppStore.getState().setPendingPatches([
      {
        path: '/src/App.tsx',
        type: 'replace',
        oldContent: 'const a = 1;\n',
        newContent: 'const a = 2;\n',
        rationale: 'Update variable value'
      }
    ]);

    const { container } = render(
      <PatchReviewSheet projectId="test-proj" />
    );

    const results = await axe.run(container, {
      rules: {
        'color-contrast': { enabled: false }
      }
    });

    console.log('PatchReviewSheet axe violations:', results.violations.length, results.violations.map(v => ({ id: v.id, help: v.help, nodes: v.nodes.length })));
    expect(results.violations.length).toBe(0);
  });

  it('closes PatchReviewSheet on Escape key', async () => {
    useAppStore.getState().setIsPatchReviewOpen(true);
    useAppStore.getState().setPendingPatches([
      {
        path: '/src/App.tsx',
        type: 'replace',
        oldContent: 'const a = 1;\n',
        newContent: 'const a = 2;\n',
        rationale: 'Update variable value'
      }
    ]);

    render(<PatchReviewSheet projectId="test-proj" />);
    expect(useAppStore.getState().isPatchReviewOpen).toBe(true);

    // Press Escape
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(useAppStore.getState().isPatchReviewOpen).toBe(false);
  });

  it('traps Tab focus inside open PatchReviewSheet', async () => {
    useAppStore.getState().setIsPatchReviewOpen(true);
    useAppStore.getState().setPendingPatches([
      {
        path: '/src/App.tsx',
        type: 'replace',
        oldContent: 'const a = 1;\n',
        newContent: 'const a = 2;\n',
        rationale: 'Update variable'
      }
    ]);

    const { container } = render(<PatchReviewSheet projectId="test-proj" />);
    const buttons = container.querySelectorAll('button');
    expect(buttons.length).toBeGreaterThan(1);

    const firstButton = buttons[0];
    const lastButton = buttons[buttons.length - 1];

    // Focus last button and press Tab -> should wrap to first button
    lastButton.focus();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: false, bubbles: true }));
    // In happy-dom event dispatching, focus trap prevents default and focuses firstButton
    expect(document.activeElement).toBe(firstButton);

    // Focus first button and press Shift+Tab -> should wrap to last button
    firstButton.focus();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }));
    expect(document.activeElement).toBe(lastButton);
  });
});
