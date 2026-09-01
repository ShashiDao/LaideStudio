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
        theme="oled"
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
});
