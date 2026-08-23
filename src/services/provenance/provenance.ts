import { db, type ProvenanceEntry } from '../../db';

export const GENESIS_HASH = '0'.repeat(64);

export interface ProvenancePayload {
  id: string;
  projectId: string;
  filePath: string;
  beforeHash: string;
  afterHash: string;
  model: string;
  provider: string;
  messageId: string;
  rationale: string;
  timestamp: number;
  prevEntryHash: string;
}

export interface RecordProvenanceParams {
  projectId: string;
  filePath: string;
  beforeContent?: string | null;
  afterContent?: string | null;
  beforeHash?: string;
  afterHash?: string;
  model?: string;
  provider?: string;
  messageId?: string;
  rationale?: string;
  timestamp?: number;
  id?: string;
  testResult?: import('../../db').ProvenanceTestResult;
}

export interface ProvenanceVerificationResult {
  valid: boolean;
  totalEntries: number;
  error?: string;
  brokenEntryId?: string;
  brokenIndex?: number;
}

/**
 * Computes a standard SHA-256 hex digest for any string input.
 */
export async function sha256Hex(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const buffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Deterministically serializes an entry's core fields for cryptographic hashing.
 */
export function serializeProvenancePayload(entry: Omit<ProvenanceEntry, 'entryHash'>): string {
  const payload: ProvenancePayload = {
    id: entry.id,
    projectId: entry.projectId,
    filePath: entry.filePath,
    beforeHash: entry.beforeHash,
    afterHash: entry.afterHash,
    model: entry.model ?? '',
    provider: entry.provider ?? '',
    messageId: entry.messageId ?? '',
    rationale: entry.rationale ?? '',
    timestamp: entry.timestamp,
    prevEntryHash: entry.prevEntryHash
  };
  return JSON.stringify(payload);
}

/**
 * Computes the tamper-evident SHA-256 entry hash over all payload fields and prevEntryHash.
 */
export async function computeEntryHash(entry: Omit<ProvenanceEntry, 'entryHash'>): Promise<string> {
  const serialized = serializeProvenancePayload(entry);
  return sha256Hex(serialized);
}

/**
 * Orders a list of provenance entries based on the hash chain pointers.
 */
export function orderProvenanceChain(entries: ProvenanceEntry[]): ProvenanceEntry[] {
  if (entries.length <= 1) return [...entries];

  const prevMap = new Map<string, ProvenanceEntry>();
  for (const entry of entries) {
    prevMap.set(entry.prevEntryHash, entry);
  }

  const entryHashes = new Set(entries.map(e => e.entryHash));
  let current = entries.find(e => e.prevEntryHash === GENESIS_HASH);
  if (!current) {
    current = entries.find(e => !entryHashes.has(e.prevEntryHash));
  }

  if (!current) {
    return [...entries].sort((a, b) => a.timestamp - b.timestamp);
  }

  const ordered: ProvenanceEntry[] = [];
  const visited = new Set<string>();

  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    ordered.push(current);
    current = prevMap.get(current.entryHash);
  }

  // Append any disconnected entries (e.g. if tampering disrupted the chain)
  if (ordered.length < entries.length) {
    for (const e of entries) {
      if (!visited.has(e.id)) {
        ordered.push(e);
      }
    }
  }

  return ordered;
}

/**
 * Retrieves all provenance ledger entries for a given project in chain order.
 */
export async function getProvenanceEntries(projectId: string): Promise<ProvenanceEntry[]> {
  const rawEntries = await db.provenanceEntries.where('projectId').equals(projectId).toArray();
  return orderProvenanceChain(rawEntries);
}

/**
 * Retrieves the latest provenance entry in the chain for a given project.
 */
export async function getLatestProvenanceEntry(projectId: string): Promise<ProvenanceEntry | null> {
  const entries = await getProvenanceEntries(projectId);
  if (entries.length === 0) return null;
  return entries[entries.length - 1];
}

/**
 * Records an applied patch in the tamper-evident provenance ledger.
 */
export async function recordProvenanceEntry(params: RecordProvenanceParams): Promise<ProvenanceEntry> {
  const beforeHash = params.beforeHash ?? await sha256Hex(params.beforeContent ?? '');
  const afterHash = params.afterHash ?? await sha256Hex(params.afterContent ?? '');

  const latestEntry = await getLatestProvenanceEntry(params.projectId);
  const prevEntryHash = latestEntry ? latestEntry.entryHash : GENESIS_HASH;

  const id = params.id || (typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `prov-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`);
  const timestamp = params.timestamp ?? Date.now();

  const entryWithoutHash: Omit<ProvenanceEntry, 'entryHash'> = {
    id,
    projectId: params.projectId,
    filePath: params.filePath,
    beforeHash,
    afterHash,
    model: params.model,
    provider: params.provider,
    messageId: params.messageId,
    rationale: params.rationale,
    timestamp,
    prevEntryHash
  };

  const entryHash = await computeEntryHash(entryWithoutHash);
  const fullEntry: ProvenanceEntry = {
    ...entryWithoutHash,
    entryHash,
    beforeContent: params.beforeContent ?? undefined,
    afterContent: params.afterContent ?? undefined,
    testResult: params.testResult
  };

  await db.provenanceEntries.add(fullEntry);
  return fullEntry;
}

/**
 * Attaches a test result to a specific provenance entry in the database.
 */
export async function attachTestResultToEntry(
  entryId: string,
  testResult: import('../../db').ProvenanceTestResult
): Promise<void> {
  await db.provenanceEntries.update(entryId, { testResult });
}

/**
 * Runs the project test suite in the background and attaches the test result to the specified provenance entry IDs.
 */
export async function runBackgroundTestsForProvenance(
  projectId: string,
  entryIds: string[]
): Promise<import('../../db').ProvenanceTestResult | null> {
  if (!entryIds || entryIds.length === 0) return null;
  try {
    const files = await db.files.where('projectId').equals(projectId).toArray();
    const { runProjectTestsDetailed } = await import('../bundler/testRunner');
    const testResult = await runProjectTestsDetailed(files);

    for (const entryId of entryIds) {
      await db.provenanceEntries.update(entryId, { testResult });
    }
    return testResult;
  } catch (err) {
    console.warn('Background test runner for provenance failed:', err);
    return null;
  }
}

/**
 * Verifies the integrity of a project's provenance hash chain.
 * Walks the chain, verifies each previous hash link, and recomputes all SHA-256 entry hashes.
 */
export async function verifyProvenanceChain(
  projectIdOrEntries: string | ProvenanceEntry[]
): Promise<ProvenanceVerificationResult> {
  let entries: ProvenanceEntry[];
  if (typeof projectIdOrEntries === 'string') {
    entries = await getProvenanceEntries(projectIdOrEntries);
  } else {
    entries = orderProvenanceChain(projectIdOrEntries);
  }

  if (!entries || entries.length === 0) {
    return {
      valid: true,
      totalEntries: 0
    };
  }

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];

    // 1. Verify genesis or previous link
    if (i === 0) {
      if (entry.prevEntryHash !== GENESIS_HASH && entry.prevEntryHash !== '') {
        return {
          valid: false,
          totalEntries: entries.length,
          brokenEntryId: entry.id,
          brokenIndex: 0,
          error: `Genesis link invalid at index 0 (${entry.filePath}): prevEntryHash '${entry.prevEntryHash}' does not match expected genesis '${GENESIS_HASH}'`
        };
      }
    } else {
      const prev = entries[i - 1];
      if (entry.prevEntryHash !== prev.entryHash) {
        return {
          valid: false,
          totalEntries: entries.length,
          brokenEntryId: entry.id,
          brokenIndex: i,
          error: `Chain broken at entry index ${i} (${entry.filePath}): prevEntryHash '${entry.prevEntryHash}' does not match prior entryHash '${prev.entryHash}'`
        };
      }
    }

    // 2. Recompute and verify entry's own hash
    const expectedHash = await computeEntryHash(entry);
    if (expectedHash !== entry.entryHash) {
      return {
        valid: false,
        totalEntries: entries.length,
        brokenEntryId: entry.id,
        brokenIndex: i,
        error: `Tampering detected at entry index ${i} (${entry.filePath}): stored entryHash '${entry.entryHash}' does not match computed '${expectedHash}'`
      };
    }
  }

  return {
    valid: true,
    totalEntries: entries.length
  };
}
