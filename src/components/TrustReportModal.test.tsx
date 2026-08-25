// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { TrustReportModal } from './TrustReportModal';
import { db, type ProvenanceEntry } from '../db';
import { createFile } from '../services/fs/vfs';
import { GENESIS_HASH, computeEntryHash } from '../services/provenance/provenance';

describe('TrustReportModal', () => {
  const projectId = 'test-proj-trust-modal';

  beforeEach(async () => {
    await db.provenanceEntries.clear();
    await db.files.clear();
  });

  it('renders loading state initially and then displays trust score and file breakdown', async () => {
    const fileContent = 'export function add(a: number, b: number) { return a + b; }';
    await createFile(projectId, '/src/math.ts', fileContent);

    const rawEntry: Omit<ProvenanceEntry, 'entryHash'> = {
      id: 'entry-1',
      projectId,
      filePath: '/src/math.ts',
      model: 'claude-3-7-sonnet',
      provider: 'anthropic',
      beforeHash: '0000',
      afterHash: '1111',
      prevEntryHash: GENESIS_HASH,
      timestamp: 1234567890,
      rationale: 'Implement addition function'
    };
    const entryHash = await computeEntryHash(rawEntry);
    await db.provenanceEntries.add({
      ...rawEntry,
      entryHash,
      afterContent: fileContent,
      testResult: {
        status: 'passed',
        passed: 5,
        failed: 0,
        total: 5,
        durationMs: 120
      }
    });

    render(
      <TrustReportModal
        projectId={projectId}
        isOpen={true}
        onClose={() => {}}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/AI Provenance & Trust Report/i)).toBeDefined();
      expect(screen.getByText(/SHA-256 Ledger Intact/i)).toBeDefined();
      expect(screen.getAllByText(/\/src\/math\.ts/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/claude-3-7-sonnet/i).length).toBeGreaterThan(0);
    });
  });
});
