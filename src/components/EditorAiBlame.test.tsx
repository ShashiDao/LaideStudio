// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import type { ProvenanceEntry } from '../db';
import { 
  formatTimestamp, 
  formatTestStatus, 
  AiBlameSidePanel,
  createAiBlameHoverTooltip,
  createAiBlameCursorListener
} from './EditorAiBlame';

describe('EditorAiBlame Components & Utilities', () => {
  afterEach(() => {
    cleanup();
  });

  const sampleEntry: ProvenanceEntry = {
    id: 'prov-test-1',
    projectId: 'proj-1',
    filePath: '/src/App.tsx',
    beforeHash: 'abc',
    afterHash: 'def',
    model: 'gemini-1.5-flash',
    provider: 'google',
    rationale: 'Refactor navbar component layout',
    timestamp: 1724457600000,
    prevEntryHash: '0'.repeat(64),
    entryHash: 'entry-hash-1234567890abcdef',
    testResult: {
      passed: 5,
      failed: 0,
      total: 5,
      status: 'passed',
      output: '5 tests passed'
    }
  };

  it('formats timestamps accurately', () => {
    const formatted = formatTimestamp(1724457600000);
    expect(formatted).toBeDefined();
    expect(typeof formatted).toBe('string');
  });

  it('formats test status for passed, failed, error, and no_tests', () => {
    const passed = formatTestStatus({ passed: 10, failed: 0, total: 10, status: 'passed' });
    expect(passed.icon).toBe('passed');
    expect(passed.label).toContain('Passed (10/10 tests)');

    const failed = formatTestStatus({ 
      passed: 8, 
      failed: 2, 
      total: 10, 
      failedTests: ['auth check', 'cookie expired'], 
      status: 'failed' 
    });
    expect(failed.icon).toBe('failed');
    expect(failed.label).toContain('Failed (2/10)');
    expect(failed.details).toContain('auth check');

    const error = formatTestStatus({ passed: 0, failed: 0, total: 0, status: 'error', error: 'Syntax error' });
    expect(error.icon).toBe('error');
    expect(error.details).toBe('Syntax error');

    const noTests = formatTestStatus(undefined);
    expect(noTests.icon).toBe('no_tests');
  });

  it('renders nothing when AiBlameSidePanel is closed', () => {
    const { container } = render(
      <AiBlameSidePanel
        isOpen={false}
        onClose={vi.fn()}
        activeLineNumber={1}
        activeEntry={sampleEntry}
        totalAiLines={10}
        totalDocLines={20}
        theme="oled"
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders rich AI blame information when open with active entry', () => {
    const onClose = vi.fn();
    render(
      <AiBlameSidePanel
        isOpen={true}
        onClose={onClose}
        activeLineNumber={14}
        activeEntry={sampleEntry}
        totalAiLines={15}
        totalDocLines={30}
        theme="oled"
      />
    );

    expect(screen.getByRole('complementary', { name: 'AI Blame Inspector' })).toBeDefined();
    expect(screen.getByText('Line 14')).toBeDefined();
    expect(screen.getByText(/gemini-1.5-flash/i)).toBeDefined();
    expect(screen.getByText(/(google)/i)).toBeDefined();
    expect(screen.getByText(/Refactor navbar component layout/i)).toBeDefined();
    expect(screen.getByText(/Passed \(5\/5 tests\)/i)).toBeDefined();
    expect(screen.getByText('15 / 30 lines (50%)')).toBeDefined();

    const closeBtn = screen.getByLabelText('Close AI Blame Panel');
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalled();
  });

  it('renders manual notice when line has no AI entry', () => {
    render(
      <AiBlameSidePanel
        isOpen={true}
        onClose={vi.fn()}
        activeLineNumber={42}
        activeEntry={null}
        totalAiLines={5}
        totalDocLines={50}
        theme="paper"
      />
    );

    expect(screen.getByText('Line 42')).toBeDefined();
    expect(screen.getByText(/No AI provenance for line 42/i)).toBeDefined();
    expect(screen.getByText(/authored or modified manually/i)).toBeDefined();
  });

  it('creates CodeMirror hover tooltip and cursor listener extensions', () => {
    const getBlame = vi.fn((_line: number) => sampleEntry);
    const hoverExt = createAiBlameHoverTooltip(getBlame, 'oled');
    expect(hoverExt).toBeDefined();

    const onLineChange = vi.fn();
    const cursorExt = createAiBlameCursorListener(onLineChange, getBlame);
    expect(cursorExt).toBeDefined();
  });
});
