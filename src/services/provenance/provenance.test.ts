// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '../../db';
import {
  GENESIS_HASH,
  sha256Hex,
  serializeProvenancePayload,
  computeEntryHash,
  recordProvenanceEntry,
  getProvenanceEntries,
  getLatestProvenanceEntry,
  verifyProvenanceChain,
  attachTestResultToEntry,
  runBackgroundTestsForProvenance
} from './provenance';

describe('Provenance Ledger Service', () => {
  const projectId = 'proj-provenance-test';
  const otherProjectId = 'proj-other-test';

  beforeEach(async () => {
    await db.provenanceEntries.clear();
  });

  describe('sha256Hex & serializeProvenancePayload', () => {
    it('computes known standard SHA-256 digests', async () => {
      // Known NIST SHA-256 for empty string:
      const emptyHash = await sha256Hex('');
      expect(emptyHash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');

      // Known digest for "hello world"
      const hwHash = await sha256Hex('hello world');
      expect(hwHash).toBe('b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9');
    });

    it('serializes provenance payloads deterministically', () => {
      const payloadStr1 = serializeProvenancePayload({
        id: 'entry-1',
        projectId: 'proj-1',
        filePath: '/src/App.tsx',
        beforeHash: 'aaa',
        afterHash: 'bbb',
        model: 'claude-3-5-sonnet',
        provider: 'anthropic',
        messageId: 'msg-1',
        rationale: 'Refactor UI',
        timestamp: 1000,
        prevEntryHash: GENESIS_HASH
      });

      const payloadStr2 = serializeProvenancePayload({
        id: 'entry-1',
        projectId: 'proj-1',
        filePath: '/src/App.tsx',
        beforeHash: 'aaa',
        afterHash: 'bbb',
        model: 'claude-3-5-sonnet',
        provider: 'anthropic',
        messageId: 'msg-1',
        rationale: 'Refactor UI',
        timestamp: 1000,
        prevEntryHash: GENESIS_HASH
      });

      expect(payloadStr1).toBe(payloadStr2);
      const parsed = JSON.parse(payloadStr1);
      expect(parsed.id).toBe('entry-1');
      expect(parsed.prevEntryHash).toBe(GENESIS_HASH);
    });
  });

  describe('Chain construction & recording', () => {
    it('records genesis entry when table is empty for project', async () => {
      const entry = await recordProvenanceEntry({
        projectId,
        filePath: '/src/main.ts',
        beforeContent: 'const a = 1;',
        afterContent: 'const a = 2;',
        model: 'gpt-4o',
        provider: 'openai',
        messageId: 'tool-call-1',
        rationale: 'Increment variable'
      });

      expect(entry.id).toBeDefined();
      expect(entry.projectId).toBe(projectId);
      expect(entry.filePath).toBe('/src/main.ts');
      expect(entry.prevEntryHash).toBe(GENESIS_HASH);
      expect(entry.beforeHash).toBe(await sha256Hex('const a = 1;'));
      expect(entry.afterHash).toBe(await sha256Hex('const a = 2;'));
      expect(entry.model).toBe('gpt-4o');
      expect(entry.provider).toBe('openai');
      expect(entry.entryHash).toBe(await computeEntryHash(entry));

      const storedEntries = await getProvenanceEntries(projectId);
      expect(storedEntries).toHaveLength(1);
      expect(storedEntries[0].entryHash).toBe(entry.entryHash);
    });

    it('builds a cryptographic hash chain across sequential entries', async () => {
      const e1 = await recordProvenanceEntry({
        projectId,
        filePath: '/src/a.ts',
        beforeContent: '',
        afterContent: 'export const a = 1;',
        model: 'gemini-1.5-pro',
        provider: 'google',
        rationale: 'Create a.ts'
      });

      const e2 = await recordProvenanceEntry({
        projectId,
        filePath: '/src/b.ts',
        beforeContent: '',
        afterContent: 'export const b = 2;',
        model: 'gemini-1.5-pro',
        provider: 'google',
        rationale: 'Create b.ts'
      });

      const e3 = await recordProvenanceEntry({
        projectId,
        filePath: '/src/a.ts',
        beforeContent: 'export const a = 1;',
        afterContent: 'export const a = 100;',
        model: 'gemini-1.5-pro',
        provider: 'google',
        rationale: 'Update a.ts'
      });

      expect(e1.prevEntryHash).toBe(GENESIS_HASH);
      expect(e2.prevEntryHash).toBe(e1.entryHash);
      expect(e3.prevEntryHash).toBe(e2.entryHash);

      const latest = await getLatestProvenanceEntry(projectId);
      expect(latest?.id).toBe(e3.id);
      expect(latest?.entryHash).toBe(e3.entryHash);

      const all = await getProvenanceEntries(projectId);
      expect(all).toHaveLength(3);
      expect(all[0].id).toBe(e1.id);
      expect(all[1].id).toBe(e2.id);
      expect(all[2].id).toBe(e3.id);
    });

    it('isolates provenance chains between different projects', async () => {
      const projA1 = await recordProvenanceEntry({
        projectId,
        filePath: '/src/index.ts',
        beforeContent: '',
        afterContent: 'console.log("projA");'
      });

      const projB1 = await recordProvenanceEntry({
        projectId: otherProjectId,
        filePath: '/src/index.ts',
        beforeContent: '',
        afterContent: 'console.log("projB");'
      });

      const projA2 = await recordProvenanceEntry({
        projectId,
        filePath: '/src/index.ts',
        beforeContent: 'console.log("projA");',
        afterContent: 'console.log("projA modified");'
      });

      expect(projA1.prevEntryHash).toBe(GENESIS_HASH);
      expect(projB1.prevEntryHash).toBe(GENESIS_HASH);
      expect(projA2.prevEntryHash).toBe(projA1.entryHash);

      const entriesA = await getProvenanceEntries(projectId);
      const entriesB = await getProvenanceEntries(otherProjectId);

      expect(entriesA).toHaveLength(2);
      expect(entriesB).toHaveLength(1);

      const verifyA = await verifyProvenanceChain(projectId);
      const verifyB = await verifyProvenanceChain(otherProjectId);

      expect(verifyA.valid).toBe(true);
      expect(verifyB.valid).toBe(true);
    });
  });

  describe('Verification utility & tamper detection', () => {
    it('verifies empty chain as valid', async () => {
      const result = await verifyProvenanceChain(projectId);
      expect(result.valid).toBe(true);
      expect(result.totalEntries).toBe(0);
    });

    it('verifies a valid unbroken chain of entries', async () => {
      await recordProvenanceEntry({
        projectId,
        filePath: '/file1.ts',
        beforeContent: '1',
        afterContent: '2'
      });
      await recordProvenanceEntry({
        projectId,
        filePath: '/file2.ts',
        beforeContent: '3',
        afterContent: '4'
      });

      const res = await verifyProvenanceChain(projectId);
      expect(res.valid).toBe(true);
      expect(res.totalEntries).toBe(2);
      expect(res.error).toBeUndefined();
    });

    it('detects tampering when an entry content hash is altered', async () => {
      const e1 = await recordProvenanceEntry({
        projectId,
        filePath: '/file1.ts',
        beforeContent: '1',
        afterContent: '2',
        model: 'gpt-4o'
      });
      await recordProvenanceEntry({
        projectId,
        filePath: '/file2.ts',
        beforeContent: '3',
        afterContent: '4',
        model: 'gpt-4o'
      });

      // Tamper with e1's afterHash directly in Dexie
      await db.provenanceEntries.update(e1.id, {
        afterHash: '0000000000000000000000000000000000000000000000000000000000000000'
      });

      const res = await verifyProvenanceChain(projectId);
      expect(res.valid).toBe(false);
      expect(res.brokenEntryId).toBe(e1.id);
      expect(res.brokenIndex).toBe(0);
      expect(res.error).toMatch(/Tampering detected/i);
    });

    it('detects tampering when an entry metadata (model/rationale) is altered', async () => {
      await recordProvenanceEntry({
        projectId,
        filePath: '/file1.ts',
        beforeContent: '1',
        afterContent: '2',
        model: 'claude-3-5-sonnet',
        rationale: 'Original rationale'
      });
      const e2 = await recordProvenanceEntry({
        projectId,
        filePath: '/file2.ts',
        beforeContent: '3',
        afterContent: '4',
        model: 'claude-3-5-sonnet',
        rationale: 'Second rationale'
      });

      // Tamper with e2's model metadata
      await db.provenanceEntries.update(e2.id, {
        model: 'malicious-injected-model'
      });

      const res = await verifyProvenanceChain(projectId);
      expect(res.valid).toBe(false);
      expect(res.brokenEntryId).toBe(e2.id);
      expect(res.brokenIndex).toBe(1);
      expect(res.error).toMatch(/Tampering detected/i);
    });

    it('detects tampering when prevEntryHash pointer is modified', async () => {
      await recordProvenanceEntry({
        projectId,
        filePath: '/file1.ts',
        beforeContent: '1',
        afterContent: '2'
      });
      const e2 = await recordProvenanceEntry({
        projectId,
        filePath: '/file2.ts',
        beforeContent: '3',
        afterContent: '4'
      });

      // Mutate e2's prevEntryHash to point to an arbitrary hash
      const fakePrevHash = 'deadbeef'.repeat(8);
      // Even if attacker also recomputes e2's entryHash with the fake prevEntryHash:
      const tamperedE2 = {
        ...e2,
        prevEntryHash: fakePrevHash
      };
      const recomputedHash = await computeEntryHash(tamperedE2);
      await db.provenanceEntries.put({
        ...tamperedE2,
        entryHash: recomputedHash
      });

      const res = await verifyProvenanceChain(projectId);
      expect(res.valid).toBe(false);
      expect(res.error).toMatch(/Chain broken|Genesis link invalid/i);
    });

    it('detects tampering when genesis entry has invalid prevEntryHash', async () => {
      const e1 = await recordProvenanceEntry({
        projectId,
        filePath: '/file1.ts',
        beforeContent: '1',
        afterContent: '2'
      });

      const tamperedE1 = {
        ...e1,
        prevEntryHash: 'not-genesis-hash'.padEnd(64, '0')
      };
      const recomputedHash = await computeEntryHash(tamperedE1);
      await db.provenanceEntries.put({
        ...tamperedE1,
        entryHash: recomputedHash
      });

      const res = await verifyProvenanceChain(projectId);
      expect(res.valid).toBe(false);
      expect(res.error).toMatch(/Genesis link invalid/i);
    });

    it('detects when an intermediate entry is deleted from the chain', async () => {
      await recordProvenanceEntry({
        projectId,
        filePath: '/file1.ts',
        beforeContent: '1',
        afterContent: '2'
      });
      const e2 = await recordProvenanceEntry({
        projectId,
        filePath: '/file2.ts',
        beforeContent: '3',
        afterContent: '4'
      });
      await recordProvenanceEntry({
        projectId,
        filePath: '/file3.ts',
        beforeContent: '5',
        afterContent: '6'
      });

      // Delete e2
      await db.provenanceEntries.delete(e2.id);

      const res = await verifyProvenanceChain(projectId);
      expect(res.valid).toBe(false);
      expect(res.error).toMatch(/Chain broken/i);
    });

    it('attaches test result to entry and updates in Dexie', async () => {
      const entry = await recordProvenanceEntry({
        projectId,
        filePath: '/src/utils.ts',
        beforeContent: 'a',
        afterContent: 'b'
      });

      expect(entry.testResult).toBeUndefined();

      await attachTestResultToEntry(entry.id, {
        passed: 3,
        failed: 0,
        total: 3,
        status: 'passed',
        output: '3 passed'
      });

      const updated = await db.provenanceEntries.get(entry.id);
      expect(updated?.testResult?.status).toBe('passed');
      expect(updated?.testResult?.passed).toBe(3);

      // Verify cryptographic chain validity remains intact
      const verification = await verifyProvenanceChain(projectId);
      expect(verification.valid).toBe(true);
    });

    it('runs background tests for project provenance entries with no test files gracefully', async () => {
      const entry = await recordProvenanceEntry({
        projectId,
        filePath: '/src/main.ts',
        beforeContent: '',
        afterContent: 'console.log(1);'
      });

      const result = await runBackgroundTestsForProvenance(projectId, [entry.id]);
      expect(result).not.toBeNull();
      expect(result?.status).toBe('no_tests');

      const updated = await db.provenanceEntries.get(entry.id);
      expect(updated?.testResult?.status).toBe('no_tests');
    });
  });
});
