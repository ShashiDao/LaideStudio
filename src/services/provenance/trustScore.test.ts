import { describe, it, expect } from 'vitest';
import type { ProvenanceEntry } from '../../db';
import { calculateFileTrustScore, calculateProjectTrustScore, generateTrustMarkdownReport } from './trustScore';
import { GENESIS_HASH, computeEntryHash } from './provenance';

describe('Trust Score Calculation Service', () => {
  it('calculates 100% score (Grade A+) for purely human-written files', () => {
    const filePath = '/src/human.ts';
    const content = 'export const a = 1;\nexport const b = 2;\nexport const c = 3;\n';
    const entries: ProvenanceEntry[] = [];

    const result = calculateFileTrustScore(filePath, content, entries, true);
    expect(result.score).toBe(100);
    expect(result.grade).toBe('A+');
    expect(result.aiLines).toBe(0);
    expect(result.humanLines).toBe(4);
    expect(result.aiRatio).toBe(0);
    expect(result.highlights).toContain('100% human-authored / pristine origin.');
  });

  it('calculates 100% score for AI-written files with passed tests', () => {
    const filePath = '/src/aiVerified.ts';
    const content = 'console.log("hello");\nconsole.log("world");';
    const entry: ProvenanceEntry = {
      id: 'e1',
      projectId: 'p1',
      filePath,
      model: 'claude-3-7-sonnet',
      provider: 'anthropic',
      beforeHash: '0000',
      afterHash: '1111',
      entryHash: 'hash-e1',
      prevEntryHash: GENESIS_HASH,
      timestamp: 1000,
      afterContent: content,
      testResult: {
        status: 'passed',
        passed: 10,
        failed: 0,
        total: 10,
        durationMs: 150
      }
    };

    const result = calculateFileTrustScore(filePath, content, [entry], true);
    expect(result.score).toBe(100);
    expect(result.grade).toBe('A+');
    expect(result.verifiedAiLines).toBe(2);
    expect(result.failingAiLines).toBe(0);
    expect(result.modelAttributions[0].model).toBe('claude-3-7-sonnet');
    expect(result.modelAttributions[0].testPassRate).toBe(100);
  });

  it('penalizes trust score when tests failed at patch time', () => {
    const filePath = '/src/aiFailing.ts';
    const content = 'function broken() {\n  return false;\n}';
    const entry: ProvenanceEntry = {
      id: 'e2',
      projectId: 'p1',
      filePath,
      model: 'gpt-4o',
      provider: 'openai',
      beforeHash: '0000',
      afterHash: '2222',
      entryHash: 'hash-e2',
      prevEntryHash: GENESIS_HASH,
      timestamp: 2000,
      afterContent: content,
      testResult: {
        status: 'failed',
        passed: 2,
        failed: 3,
        total: 5,
        durationMs: 200,
        failedTests: ['renders correctly', 'handles submit']
      }
    };

    const result = calculateFileTrustScore(filePath, content, [entry], true);
    expect(result.score).toBeLessThan(50);
    expect(result.grade).toBe('F');
    expect(result.failingAiLines).toBe(3);
    expect(result.riskFactors.some(r => r.includes('authored during a failing test run'))).toBe(true);
  });

  it('assigns 85 score to untested AI code', () => {
    const filePath = '/src/untested.ts';
    const content = 'const x = 100;';
    const entry: ProvenanceEntry = {
      id: 'e3',
      projectId: 'p1',
      filePath,
      model: 'gemini-2.5-pro',
      provider: 'google',
      beforeHash: '0000',
      afterHash: '3333',
      entryHash: 'hash-e3',
      prevEntryHash: GENESIS_HASH,
      timestamp: 3000,
      afterContent: content
    };

    const result = calculateFileTrustScore(filePath, content, [entry], true);
    expect(result.score).toBe(85);
    expect(result.grade).toBe('B');
    expect(result.untestedAiLines).toBe(1);
  });

  it('drastically lowers trust score if cryptographic chain is broken', () => {
    const filePath = '/src/tampered.ts';
    const content = 'const secure = true;';
    const entry: ProvenanceEntry = {
      id: 'e4',
      projectId: 'p1',
      filePath,
      model: 'claude-3-7-sonnet',
      provider: 'anthropic',
      beforeHash: '0000',
      afterHash: '4444',
      entryHash: 'hash-e4',
      prevEntryHash: GENESIS_HASH,
      timestamp: 4000,
      afterContent: content,
      testResult: { status: 'passed', passed: 5, failed: 0, total: 5, durationMs: 100 }
    };

    const result = calculateFileTrustScore(filePath, content, [entry], false);
    expect(result.score).toBeLessThanOrEqual(10);
    expect(result.grade).toBe('F');
    expect(result.riskFactors).toContain('Cryptographic ledger integrity check failed — possible tampering detected.');
  });

  it('computes project-wide trust score, model distribution, and PR markdown report', async () => {
    const file1 = { path: '/src/f1.ts', content: 'const a = 1;\nconst b = 2;' };
    const file2 = { path: '/src/f2.ts', content: 'const c = 3;\nconst d = 4;' };

    const rawE1: Omit<ProvenanceEntry, 'entryHash'> = {
      id: 'e1',
      projectId: 'p1',
      filePath: '/src/f1.ts',
      model: 'claude-3-7-sonnet',
      provider: 'anthropic',
      beforeHash: '00',
      afterHash: '01',
      prevEntryHash: GENESIS_HASH,
      timestamp: 1000
    };
    const e1Hash = await computeEntryHash(rawE1);
    const e1: ProvenanceEntry = {
      ...rawE1,
      entryHash: e1Hash,
      afterContent: file1.content,
      testResult: { status: 'passed', passed: 4, failed: 0, total: 4, durationMs: 50 }
    };

    const rawE2: Omit<ProvenanceEntry, 'entryHash'> = {
      id: 'e2',
      projectId: 'p1',
      filePath: '/src/f2.ts',
      model: 'gemini-2.5-pro',
      provider: 'google',
      beforeHash: '01',
      afterHash: '02',
      prevEntryHash: e1Hash,
      timestamp: 2000
    };
    const e2Hash = await computeEntryHash(rawE2);
    const e2: ProvenanceEntry = {
      ...rawE2,
      entryHash: e2Hash,
      afterContent: file2.content,
      testResult: { status: 'passed', passed: 6, failed: 0, total: 6, durationMs: 60 }
    };

    const projectTrust = await calculateProjectTrustScore('p1', [file1, file2], [e1, e2]);

    expect(projectTrust.overallScore).toBe(100);
    expect(projectTrust.overallGrade).toBe('A+');
    expect(projectTrust.chainIntegrity.valid).toBe(true);
    expect(projectTrust.modelDistribution.length).toBe(2);
    expect(projectTrust.totalAiLines).toBe(4);
    expect(projectTrust.overallTestPassRate).toBe(100);

    const md = generateTrustMarkdownReport(projectTrust);
    expect(md).toContain('## 🛡️ AI Provenance & Trust Report');
    expect(md).toContain('claude-3-7-sonnet');
    expect(md).toContain('gemini-2.5-pro');
    expect(md).toContain('/src/f1.ts');
    expect(md).toContain('/src/f2.ts');
  });
});
