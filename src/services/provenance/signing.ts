import { db, type ProvenanceEntry } from '../../db';
import { getPersistentSession } from '../security/session';
import { encryptData, decryptData, arrayBufferToBase64, base64ToArrayBuffer } from '../security/crypto';
import {
  getProvenanceEntries,
  verifyProvenanceChain,
  GENESIS_HASH
} from './provenance';
import {
  calculateProjectTrustScore,
  calculateFileTrustScore,
  generateTrustMarkdownReport,
  type TrustGrade,
  type ModelAttribution
} from './trustScore';
import { listFiles } from '../fs/vfs';

export const PROVENANCE_SIGNING_ALGORITHM = 'ECDSA-P256-SHA256';
const SECURE_TOKEN_PRIVATE_KEY = 'provenance_signing_private_key';
const SECURE_TOKEN_PUBLIC_KEY = 'provenance_signing_public_key';
const LEGACY_UNWRAPPED_KEY_KEY = 'laide_prov_priv_unwrapped';

let ephemeralSigningKeyPair: CryptoKeyPair | null = null;
let ephemeralPublicJwk: JsonWebKey | null = null;

export interface SignedProvenanceArtifact {
  $schema: string;
  version: string;
  exportedAt: number;
  projectId: string;
  projectName: string;
  algorithm: string;
  publicKey: JsonWebKey;
  signature: string;
  summary: {
    totalEntries: number;
    genesisHash: string;
    headHash: string;
    overallTrustScore: number;
    overallGrade: TrustGrade;
    aiRatio: number;
    totalAiLines: number;
    totalHumanLines: number;
    overallTestPassRate: number;
    modelDistribution: ModelAttribution[];
  };
  markdownSummary: string;
  entries: ProvenanceEntry[];
}

export interface SignedProvenanceVerificationResult {
  valid: boolean;
  signatureValid: boolean;
  chainValid: boolean;
  totalEntries: number;
  headHash?: string;
  algorithm?: string;
  error?: string;
  brokenEntryId?: string;
  brokenIndex?: number;
  details?: {
    verifiedAt: number;
    projectId?: string;
    projectName?: string;
    overallTrustScore?: number;
    overallGrade?: TrustGrade;
  };
}

export interface DiffProvenanceSummary {
  projectId: string;
  projectName: string;
  baseLabel?: string;
  totalFilesChanged: number;
  totalLinesChanged: number;
  aiLinesChanged: number;
  humanLinesChanged: number;
  aiRatio: number;
  verifiedAiLines: number;
  failingAiLines: number;
  untestedAiLines: number;
  testPassRate: number;
  modelsUsed: Array<{ model: string; provider: string; lines: number; percentage: number }>;
  chainValid: boolean;
  markdown: string;
}

export interface FileTrustHistoryPoint {
  timestamp: number;
  entryId: string;
  score: number;
  grade: TrustGrade;
  model?: string;
  provider?: string;
  testStatus: 'passed' | 'failed' | 'untested';
  linesChanged: number;
  rationale?: string;
}

export interface FileTrustProgression {
  filePath: string;
  currentScore: number;
  currentGrade: TrustGrade;
  initialScore: number;
  initialGrade: TrustGrade;
  scoreDelta: number;
  trend: 'improving' | 'steady' | 'degrading';
  history: FileTrustHistoryPoint[];
}

export function buildCanonicalProvenancePayload(params: {
  projectId: string;
  exportedAt: number;
  algorithm: string;
  genesisHash: string;
  headHash: string;
  totalEntries: number;
  entryHashes: string[];
}): string {
  return JSON.stringify({
    algorithm: params.algorithm,
    entryHashes: params.entryHashes,
    exportedAt: params.exportedAt,
    genesisHash: params.genesisHash,
    headHash: params.headHash,
    projectId: params.projectId,
    totalEntries: params.totalEntries
  });
}

export async function getActiveVaultAesKey(): Promise<CryptoKey | null> {
  try {
    const session = await getPersistentSession();
    if (!session) return null;
    return session.aesKey;
  } catch {
    return null;
  }
}

async function getOrCreateEphemeralSigningKeys(): Promise<{
  privateKey: CryptoKey;
  publicKey: CryptoKey;
  publicJwk: JsonWebKey;
}> {
  if (!ephemeralSigningKeyPair || !ephemeralPublicJwk) {
    ephemeralSigningKeyPair = await crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign', 'verify']
    );
    ephemeralPublicJwk = await crypto.subtle.exportKey('jwk', ephemeralSigningKeyPair.publicKey);
  }

  return {
    privateKey: ephemeralSigningKeyPair.privateKey,
    publicKey: ephemeralSigningKeyPair.publicKey,
    publicJwk: ephemeralPublicJwk
  };
}

/**
 * Retrieves or generates an ECDSA P-256 signing keypair.
 * Durable private-key persistence requires an unlocked vault. When the vault is
 * unavailable, signing uses an in-memory keypair that is never written to storage.
 */
export async function getOrCreateProvenanceSigningKeys(customAesKey?: CryptoKey | null): Promise<{
  privateKey: CryptoKey;
  publicKey: CryptoKey;
  publicJwk: JsonWebKey;
}> {
  const aesKey = customAesKey !== undefined ? customAesKey : await getActiveVaultAesKey();

  // Remove the legacy plaintext private key from prior versions. Never read it.
  localStorage.removeItem(LEGACY_UNWRAPPED_KEY_KEY);

  if (!aesKey) {
    return getOrCreateEphemeralSigningKeys();
  }

  const existingPubToken = await db.secureTokens.get(SECURE_TOKEN_PUBLIC_KEY);
  const existingPrivToken = await db.secureTokens.get(SECURE_TOKEN_PRIVATE_KEY);

  if (existingPubToken && existingPrivToken) {
    try {
      const publicJwk: JsonWebKey = JSON.parse(existingPubToken.encryptedValue);
      const decrypted = await decryptData(aesKey, existingPrivToken.encryptedValue);
      const privateJwk: JsonWebKey = JSON.parse(decrypted);

      const privateKey = await crypto.subtle.importKey(
        'jwk',
        privateJwk,
        { name: 'ECDSA', namedCurve: 'P-256' },
        true,
        ['sign']
      );
      const publicKey = await crypto.subtle.importKey(
        'jwk',
        publicJwk,
        { name: 'ECDSA', namedCurve: 'P-256' },
        true,
        ['verify']
      );
      return { privateKey, publicKey, publicJwk };
    } catch (err) {
      console.warn('Failed to load existing signing keys, regenerating:', err);
    }
  }

  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify']
  );

  const publicJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
  const privateJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);
  const encryptedPriv = await encryptData(aesKey, JSON.stringify(privateJwk));

  await db.secureTokens.put({
    key: SECURE_TOKEN_PUBLIC_KEY,
    encryptedValue: JSON.stringify(publicJwk)
  });
  await db.secureTokens.put({
    key: SECURE_TOKEN_PRIVATE_KEY,
    encryptedValue: encryptedPriv
  });

  ephemeralSigningKeyPair = null;
  ephemeralPublicJwk = null;

  return {
    privateKey: keyPair.privateKey,
    publicKey: keyPair.publicKey,
    publicJwk
  };
}

export async function signCanonicalPayload(
  canonicalString: string,
  privateKey: CryptoKey
): Promise<string> {
  const enc = new TextEncoder();
  const signatureBuffer = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    enc.encode(canonicalString)
  );
  return arrayBufferToBase64(signatureBuffer);
}

export async function verifySignedProvenanceArtifact(
  artifact: SignedProvenanceArtifact
): Promise<SignedProvenanceVerificationResult> {
  if (!artifact || typeof artifact !== 'object') {
    return {
      valid: false,
      signatureValid: false,
      chainValid: false,
      totalEntries: 0,
      error: 'Invalid artifact: payload is not a valid JSON object'
    };
  }

  const {
    projectId,
    exportedAt,
    algorithm,
    publicKey: publicJwk,
    signature,
    summary,
    entries
  } = artifact;

  if (!publicJwk || !signature || !Array.isArray(entries)) {
    return {
      valid: false,
      signatureValid: false,
      chainValid: false,
      totalEntries: entries?.length || 0,
      error: 'Invalid artifact structure: missing publicKey, signature, or entries array'
    };
  }

  const headHash = entries.length > 0 ? entries[entries.length - 1].entryHash : (summary?.headHash || GENESIS_HASH);
  const genesisHash = entries.length > 0 ? entries[0].prevEntryHash : GENESIS_HASH;

  let signatureValid: boolean;
  try {
    const cryptoPublicKey = await crypto.subtle.importKey(
      'jwk',
      publicJwk,
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['verify']
    );

    const canonicalString = buildCanonicalProvenancePayload({
      projectId,
      exportedAt,
      algorithm: algorithm || PROVENANCE_SIGNING_ALGORITHM,
      genesisHash,
      headHash,
      totalEntries: entries.length,
      entryHashes: entries.map(e => e.entryHash)
    });

    signatureValid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      cryptoPublicKey,
      base64ToArrayBuffer(signature),
      new TextEncoder().encode(canonicalString)
    );
  } catch (err) {
    return {
      valid: false,
      signatureValid: false,
      chainValid: false,
      totalEntries: entries.length,
      headHash,
      algorithm,
      error: `Cryptographic signature parsing failed: ${err instanceof Error ? err.message : String(err)}`
    };
  }

  if (!signatureValid) {
    return {
      valid: false,
      signatureValid: false,
      chainValid: false,
      totalEntries: entries.length,
      headHash,
      algorithm,
      error: 'Cryptographic signature verification failed: signature does not match public key or artifact payload was altered.'
    };
  }

  const chainResult = await verifyProvenanceChain(entries);
  if (!chainResult.valid) {
    return {
      valid: false,
      signatureValid: true,
      chainValid: false,
      totalEntries: entries.length,
      headHash,
      algorithm,
      brokenIndex: chainResult.brokenIndex,
      brokenEntryId: chainResult.brokenEntryId,
      error: `Hash chain verification failed: ${chainResult.error}`
    };
  }

  return {
    valid: true,
    signatureValid: true,
    chainValid: true,
    totalEntries: entries.length,
    headHash,
    algorithm,
    details: {
      verifiedAt: Date.now(),
      projectId,
      projectName: artifact.projectName,
      overallTrustScore: summary?.overallTrustScore,
      overallGrade: summary?.overallGrade
    }
  };
}

export async function exportSignedProvenanceProof(
  projectId: string,
  customAesKey?: CryptoKey | null
): Promise<{
  artifact: SignedProvenanceArtifact;
  jsonString: string;
  markdownSummary: string;
}> {
  const [project, entries, files] = await Promise.all([
    db.projects.get(projectId),
    getProvenanceEntries(projectId),
    listFiles(projectId)
  ]);

  const projectName = project?.name || 'Untitled Project';
  const exportedAt = Date.now();
  const trustScore = await calculateProjectTrustScore(projectId, files, entries);
  const markdownSummary = generateTrustMarkdownReport(trustScore);
  const headHash = entries.length > 0 ? entries[entries.length - 1].entryHash : GENESIS_HASH;
  const genesisHash = entries.length > 0 ? entries[0].prevEntryHash : GENESIS_HASH;
  const { privateKey, publicJwk } = await getOrCreateProvenanceSigningKeys(customAesKey);

  const canonicalString = buildCanonicalProvenancePayload({
    projectId,
    exportedAt,
    algorithm: PROVENANCE_SIGNING_ALGORITHM,
    genesisHash,
    headHash,
    totalEntries: entries.length,
    entryHashes: entries.map(e => e.entryHash)
  });

  const signature = await signCanonicalPayload(canonicalString, privateKey);

  const artifact: SignedProvenanceArtifact = {
    $schema: 'https://laide.dev/schemas/provenance-proof-v1.json',
    version: '1.0.0',
    exportedAt,
    projectId,
    projectName,
    algorithm: PROVENANCE_SIGNING_ALGORITHM,
    publicKey: publicJwk,
    signature,
    summary: {
      totalEntries: entries.length,
      genesisHash,
      headHash,
      overallTrustScore: trustScore.overallScore,
      overallGrade: trustScore.overallGrade,
      aiRatio: trustScore.aiRatio,
      totalAiLines: trustScore.totalAiLines,
      totalHumanLines: trustScore.totalHumanLines,
      overallTestPassRate: trustScore.overallTestPassRate,
      modelDistribution: trustScore.modelDistribution
    },
    markdownSummary,
    entries
  };

  const jsonString = JSON.stringify(artifact, null, 2);
  return { artifact, jsonString, markdownSummary };
}

export async function generateDiffProvenanceSummary(
  projectId: string,
  options: {
    sinceTimestamp?: number;
    specificEntryIds?: string[];
  } = {}
): Promise<DiffProvenanceSummary> {
  const [project, allEntries, files] = await Promise.all([
    db.projects.get(projectId),
    getProvenanceEntries(projectId),
    listFiles(projectId)
  ]);

  const projectName = project?.name || 'Untitled Project';
  let diffEntries = allEntries;
  if (options.specificEntryIds && options.specificEntryIds.length > 0) {
    const idSet = new Set(options.specificEntryIds);
    diffEntries = allEntries.filter(e => idSet.has(e.id));
  } else if (options.sinceTimestamp) {
    diffEntries = allEntries.filter(e => e.timestamp >= options.sinceTimestamp);
  }

  const chainIntegrity = await verifyProvenanceChain(allEntries);
  const affectedFiles = new Set(diffEntries.map(e => e.filePath));
  let aiLinesChanged = 0;
  let verifiedAiLines = 0;
  let failingAiLines = 0;
  let untestedAiLines = 0;
  const modelStats = new Map<string, { model: string; provider: string; lines: number }>();

  for (const entry of diffEntries) {
    const beforeLen = entry.beforeContent ? entry.beforeContent.split('\n').length : 0;
    const afterLen = entry.afterContent ? entry.afterContent.split('\n').length : 0;
    const approxLines = Math.max(1, Math.abs(afterLen - beforeLen) || afterLen || 1);
    aiLinesChanged += approxLines;

    const mKey = `${entry.model || 'Unknown'}::${entry.provider || 'unknown'}`;
    const cur = modelStats.get(mKey) || {
      model: entry.model || 'Unknown',
      provider: entry.provider || 'unknown',
      lines: 0
    };
    cur.lines += approxLines;
    modelStats.set(mKey, cur);

    if (entry.testResult?.status === 'passed') {
      verifiedAiLines += approxLines;
    } else if (entry.testResult?.status === 'failed' || entry.testResult?.status === 'error') {
      failingAiLines += approxLines;
    } else {
      untestedAiLines += approxLines;
    }
  }

  let totalAffectedFileLines = 0;
  for (const file of files) {
    if (affectedFiles.has(file.path)) {
      totalAffectedFileLines += file.content.split('\n').length;
    }
  }

  const humanLinesChanged = Math.max(0, totalAffectedFileLines - aiLinesChanged);
  const totalLinesChanged = Math.max(aiLinesChanged, totalAffectedFileLines);
  const aiRatio = totalLinesChanged > 0 ? aiLinesChanged / totalLinesChanged : 0;
  const testedTotal = verifiedAiLines + failingAiLines;
  const testPassRate = testedTotal > 0 ? Math.round((verifiedAiLines / testedTotal) * 100) : 100;
  const modelsUsed = Array.from(modelStats.values()).map(m => ({
    model: m.model,
    provider: m.provider,
    lines: m.lines,
    percentage: aiLinesChanged > 0 ? Math.round((m.lines / aiLinesChanged) * 100) : 0
  })).sort((a, b) => b.lines - a.lines);

  const lines: string[] = [];
  const pctAi = Math.round(aiRatio * 100);
  const pctHuman = 100 - pctAi;
  lines.push(`### 🤖 AI Provenance & Changeset Summary`);
  lines.push(``);
  lines.push(`> **Attribution:** ${pctAi}% AI-authored (${aiLinesChanged} lines) / ${pctHuman}% Human (${humanLinesChanged} lines) across ${affectedFiles.size} modified file${affectedFiles.size === 1 ? '' : 's'}.`);
  lines.push(`> **Test Backing:** ${testPassRate}% of AI changes verified by passing test runs at patch creation.`);
  lines.push(`> **Ledger Hash Chain:** ${chainIntegrity.valid ? '✅ Cryptographically Verified (SHA-256)' : '⚠️ Integrity Warning'}`);
  lines.push(``);
  if (modelsUsed.length > 0) {
    lines.push(`| Model | Provider | Changed Lines | % of AI Changes |`);
    lines.push(`| :--- | :--- | :--- | :--- |`);
    for (const m of modelsUsed) {
      lines.push(`| \`${m.model}\` | ${m.provider} | ${m.lines} | ${m.percentage}% |`);
    }
    lines.push(``);
  }
  lines.push(`**Independent Reviewer Verification:**`);
  lines.push(`To verify cryptographic signature & tamper-proof hash chain locally:`);
  lines.push('```bash');
  lines.push('node public/verify-provenance.js <path-to-proof.json>');
  lines.push('```');

  return {
    projectId,
    projectName,
    totalFilesChanged: affectedFiles.size,
    totalLinesChanged,
    aiLinesChanged,
    humanLinesChanged,
    aiRatio,
    verifiedAiLines,
    failingAiLines,
    untestedAiLines,
    testPassRate,
    modelsUsed,
    chainValid: chainIntegrity.valid,
    markdown: lines.join('\n')
  };
}

export async function computeFileTrustHistory(
  projectId: string,
  filePath: string
): Promise<FileTrustProgression> {
  const allEntries = await getProvenanceEntries(projectId);
  const fileEntries = allEntries.filter(e => e.filePath === filePath);

  if (fileEntries.length === 0) {
    const files = await listFiles(projectId);
    const target = files.find(f => f.path === filePath);
    const content = target?.content || '';
    const score = calculateFileTrustScore(filePath, content, []);
    return {
      filePath,
      currentScore: score.score,
      currentGrade: score.grade,
      initialScore: score.score,
      initialGrade: score.grade,
      scoreDelta: 0,
      trend: 'steady',
      history: [{
        timestamp: Date.now(),
        entryId: 'genesis',
        score: score.score,
        grade: score.grade,
        testStatus: 'passed',
        linesChanged: score.totalLines,
        rationale: 'Initial file creation'
      }]
    };
  }

  const history: FileTrustHistoryPoint[] = [];
  const cumulativeEntries: ProvenanceEntry[] = [];

  for (const entry of fileEntries) {
    cumulativeEntries.push(entry);
    const content = entry.afterContent || '';
    const scoreResult = calculateFileTrustScore(filePath, content, cumulativeEntries);
    const beforeLines = entry.beforeContent ? entry.beforeContent.split('\n').length : 0;
    const afterLines = entry.afterContent ? entry.afterContent.split('\n').length : 0;
    const linesChanged = Math.max(1, Math.abs(afterLines - beforeLines) || afterLines || 1);
    const testStatus: 'passed' | 'failed' | 'untested' =
      entry.testResult?.status === 'passed' ? 'passed' :
      (entry.testResult?.status === 'failed' || entry.testResult?.status === 'error' ? 'failed' : 'untested');

    history.push({
      timestamp: entry.timestamp,
      entryId: entry.id,
      score: scoreResult.score,
      grade: scoreResult.grade,
      model: entry.model,
      provider: entry.provider,
      testStatus,
      linesChanged,
      rationale: entry.rationale
    });
  }

  const initialPoint = history[0];
  const currentPoint = history[history.length - 1];
  const scoreDelta = currentPoint.score - initialPoint.score;
  let trend: 'improving' | 'steady' | 'degrading' = 'steady';
  if (scoreDelta > 3) trend = 'improving';
  else if (scoreDelta < -3) trend = 'degrading';

  return {
    filePath,
    currentScore: currentPoint.score,
    currentGrade: currentPoint.grade,
    initialScore: initialPoint.score,
    initialGrade: initialPoint.grade,
    scoreDelta,
    trend,
    history
  };
}
