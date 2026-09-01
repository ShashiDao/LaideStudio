// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '../../db';
import { 
  recordProvenanceEntry
} from './provenance';
import {
  getOrCreateProvenanceSigningKeys,
  exportSignedProvenanceProof,
  verifySignedProvenanceArtifact,
  generateDiffProvenanceSummary,
  computeFileTrustHistory,
  buildCanonicalProvenancePayload,
  PROVENANCE_SIGNING_ALGORITHM,
  type SignedProvenanceArtifact
} from './signing';
import { importMasterKey } from '../security/crypto';

describe('Provenance Signing & Verification Service', () => {
  const projectId = 'proj-signed-prov-test';

  beforeEach(async () => {
    await db.provenanceEntries.clear();
    await db.secureTokens.clear();
    await db.projects.clear();
    await db.files.clear();
    localStorage.clear();

    await db.projects.put({
      id: projectId,
      name: 'Test Signed Project',
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
  });

  describe('ECDSA P-256 Keypair Management', () => {
    it('generates a valid ECDSA P-256 keypair on first use', async () => {
      const keys = await getOrCreateProvenanceSigningKeys();
      expect(keys.privateKey).toBeDefined();
      expect(keys.publicKey).toBeDefined();
      expect(keys.publicJwk).toBeDefined();
      expect(keys.publicJwk.kty).toBe('EC');
      expect(keys.publicJwk.crv).toBe('P-256');

      const pubToken = await db.secureTokens.get('provenance_signing_public_key');
      expect(pubToken).toBeDefined();
    });

    it('wraps private key inside vault AES key if vault session is active', async () => {
      // Simulate active vault master key
      const rawMasterBytes = new Uint8Array(64);
      rawMasterBytes.fill(42);
      const keyMaterial = await importMasterKey(rawMasterBytes);

      const keys = await getOrCreateProvenanceSigningKeys(keyMaterial.aesKey);
      expect(keys.privateKey).toBeDefined();

      const privToken = await db.secureTokens.get('provenance_signing_private_key');
      expect(privToken).toBeDefined();
      expect(privToken?.encryptedValue.startsWith('enc.v1.')).toBe(true);

      // Retrieving again should decrypt successfully with the same AES key
      const keys2 = await getOrCreateProvenanceSigningKeys(keyMaterial.aesKey);
      expect(keys2.publicJwk.x).toBe(keys.publicJwk.x);
    });
  });

  describe('Signed Artifact Export & Standalone Verification', () => {
    it('exports a signed provenance proof and verifies it successfully', async () => {
      // Seed files and provenance entries
      await db.files.put({
        id: 'f1',
        projectId,
        path: '/src/index.ts',
        content: 'export const hello = "world";\nexport const add = (a: number, b: number) => a + b;\n',
        updatedAt: Date.now()
      });

      const _e1 = await recordProvenanceEntry({
        projectId,
        filePath: '/src/index.ts',
        beforeContent: '',
        afterContent: 'export const hello = "world";',
        model: 'claude-3-5-sonnet',
        provider: 'anthropic',
        rationale: 'Initial setup',
        testResult: {
          passed: 5,
          failed: 0,
          total: 5,
          status: 'passed'
        }
      });

      const e2 = await recordProvenanceEntry({
        projectId,
        filePath: '/src/index.ts',
        beforeContent: 'export const hello = "world";',
        afterContent: 'export const hello = "world";\nexport const add = (a: number, b: number) => a + b;\n',
        model: 'gemini-1.5-pro',
        provider: 'google',
        rationale: 'Add math function',
        testResult: {
          passed: 6,
          failed: 0,
          total: 6,
          status: 'passed'
        }
      });

      const { artifact, jsonString, markdownSummary } = await exportSignedProvenanceProof(projectId);

      expect(artifact.version).toBe('1.0.0');
      expect(artifact.algorithm).toBe(PROVENANCE_SIGNING_ALGORITHM);
      expect(artifact.projectId).toBe(projectId);
      expect(artifact.entries).toHaveLength(2);
      expect(artifact.signature).toBeTruthy();
      expect(artifact.publicKey.crv).toBe('P-256');
      expect(artifact.summary.overallTrustScore).toBeGreaterThanOrEqual(90);
      expect(jsonString).toContain(artifact.signature);
      expect(markdownSummary).toContain('AI Provenance & Trust Report');

      // Verify the exported artifact
      const verifyResult = await verifySignedProvenanceArtifact(artifact);
      expect(verifyResult.valid).toBe(true);
      expect(verifyResult.signatureValid).toBe(true);
      expect(verifyResult.chainValid).toBe(true);
      expect(verifyResult.totalEntries).toBe(2);
      expect(verifyResult.headHash).toBe(e2.entryHash);
    });

    it('fails verification if cryptographic signature is forged or corrupted', async () => {
      await recordProvenanceEntry({
        projectId,
        filePath: '/src/main.ts',
        afterContent: 'console.log("hello");',
        model: 'gpt-4o'
      });

      const { artifact } = await exportSignedProvenanceProof(projectId);

      // Corrupt signature
      const tamperedArtifact: SignedProvenanceArtifact = {
        ...artifact,
        signature: 'AAAA' + artifact.signature.slice(4)
      };

      const result = await verifySignedProvenanceArtifact(tamperedArtifact);
      expect(result.valid).toBe(false);
      expect(result.signatureValid).toBe(false);
      expect(result.error).toContain('Cryptographic signature verification failed');
    });

    it('fails verification and identifies broken entry index if an entry in the ledger was altered', async () => {
      const _e1 = await recordProvenanceEntry({
        projectId,
        filePath: '/src/a.ts',
        afterContent: 'export const a = 1;',
        model: 'gpt-4o'
      });

      const e2 = await recordProvenanceEntry({
        projectId,
        filePath: '/src/b.ts',
        afterContent: 'export const b = 2;',
        model: 'claude-3-5-sonnet'
      });

      const _e3 = await recordProvenanceEntry({
        projectId,
        filePath: '/src/c.ts',
        afterContent: 'export const c = 3;',
        model: 'gemini-1.5-pro'
      });

      const { artifact } = await exportSignedProvenanceProof(projectId);

      // Tamper with entry index 1 (the middle entry)
      const tamperedEntries = JSON.parse(JSON.stringify(artifact.entries));
      tamperedEntries[1].model = 'malicious-injected-model';
      // Recalculate signature so signature passes but hash-chain detects entry tampering
      const { privateKey } = await getOrCreateProvenanceSigningKeys();
      const canonical = buildCanonicalProvenancePayload({
        projectId,
        exportedAt: artifact.exportedAt,
        algorithm: artifact.algorithm,
        genesisHash: tamperedEntries[0].prevEntryHash,
        headHash: tamperedEntries[2].entryHash,
        totalEntries: 3,
        entryHashes: tamperedEntries.map((e: any) => e.entryHash)
      });
      const newSig = await (await import('./signing')).signCanonicalPayload(canonical, privateKey);

      const tamperedArtifact: SignedProvenanceArtifact = {
        ...artifact,
        entries: tamperedEntries,
        signature: newSig
      };

      const result = await verifySignedProvenanceArtifact(tamperedArtifact);
      expect(result.valid).toBe(false);
      expect(result.chainValid).toBe(false);
      expect(result.brokenIndex).toBe(1);
      expect(result.brokenEntryId).toBe(e2.id);
      expect(result.error).toContain('Tampering detected at entry index 1');
    });

    it('works identically via the standalone dependency-free verifier script', async () => {
      // Import standalone script
      const standalone = await import('../../../public/verify-provenance.js');
      
      const _e1 = await recordProvenanceEntry({
        projectId,
        filePath: '/src/main.ts',
        afterContent: 'console.log("ready");',
        model: 'claude-3-5-sonnet'
      });

      const { artifact } = await exportSignedProvenanceProof(projectId);
      const res = await standalone.verifyProvenanceArtifact(artifact);
      expect(res.valid).toBe(true);
      expect(res.signatureValid).toBe(true);
      expect(res.chainValid).toBe(true);

      // Tamper with entry 0
      const tampered = JSON.parse(JSON.stringify(artifact));
      tampered.entries[0].afterHash = 'bad-hash-hex';
      const failRes = await standalone.verifyProvenanceArtifact(tampered);
      expect(failRes.valid).toBe(false);
      expect(failRes.brokenIndex).toBe(0);
    });
  });

  describe('PR Diff Summary & Trust Over Time', () => {
    it('generates a PR-ready diff summary with attribution and model breakdowns', async () => {
      await db.files.put({
        id: 'f1',
        projectId,
        path: '/src/feature.ts',
        content: 'line1\nline2\nline3\nline4\nline5\n',
        updatedAt: Date.now()
      });

      await recordProvenanceEntry({
        projectId,
        filePath: '/src/feature.ts',
        beforeContent: 'line1\n',
        afterContent: 'line1\nline2\nline3\nline4\nline5\n',
        model: 'claude-3-5-sonnet',
        provider: 'anthropic',
        testResult: {
          passed: 4,
          failed: 0,
          total: 4,
          status: 'passed'
        }
      });

      const summary = await generateDiffProvenanceSummary(projectId);
      expect(summary.totalFilesChanged).toBe(1);
      expect(summary.aiLinesChanged).toBeGreaterThan(0);
      expect(summary.testPassRate).toBe(100);
      expect(summary.modelsUsed).toHaveLength(1);
      expect(summary.modelsUsed[0].model).toBe('claude-3-5-sonnet');
      expect(summary.markdown).toContain('AI Provenance & Changeset Summary');
      expect(summary.markdown).toContain('claude-3-5-sonnet');
      expect(summary.markdown).toContain('node public/verify-provenance.js');
    });

    it('computes historical trust progression for a file over time', async () => {
      const _e1 = await recordProvenanceEntry({
        projectId,
        filePath: '/src/widget.ts',
        beforeContent: '',
        afterContent: 'export const x = 1;',
        model: 'gpt-4o',
        testResult: { passed: 0, failed: 2, total: 2, status: 'failed' }
      });

      const _e2 = await recordProvenanceEntry({
        projectId,
        filePath: '/src/widget.ts',
        beforeContent: 'export const x = 1;',
        afterContent: 'export const x = 2;\nexport const y = 3;',
        model: 'claude-3-5-sonnet',
        testResult: { passed: 5, failed: 0, total: 5, status: 'passed' }
      });

      const progression = await computeFileTrustHistory(projectId, '/src/widget.ts');
      expect(progression.filePath).toBe('/src/widget.ts');
      expect(progression.history).toHaveLength(2);
      expect(progression.history[0].testStatus).toBe('failed');
      expect(progression.history[1].testStatus).toBe('passed');
      expect(progression.currentScore).toBeGreaterThan(progression.initialScore);
      expect(progression.trend).toBe('improving');
    });
  });
});
