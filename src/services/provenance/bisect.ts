import { db, type FileItem, type ProvenanceEntry, type ProvenanceTestResult, type Snapshot } from '../../db';
import { runProjectTestsDetailed } from '../bundler/testRunner';
import { listFiles } from '../fs/vfs';
import { structuredPatch } from 'diff';

export interface BisectProgress {
  currentStep: number;
  totalEstimatedSteps: number;
  checkingIndex: number;
  totalEntries: number;
  entry?: ProvenanceEntry;
  statusText: string;
}

export interface BisectResult {
  found: boolean;
  offendingEntry?: ProvenanceEntry;
  offendingIndex?: number;
  previousEntry?: ProvenanceEntry;
  testName?: string;
  diff?: string;
  totalStepsRun: number;
  failedPriorToHistory?: boolean;
  reason?: string;
  testOutputAtOffendingPatch?: string;
}

export interface BisectOptions {
  projectId: string;
  testName?: string;
  testRunner?: (files: FileItem[]) => Promise<ProvenanceTestResult>;
  onProgress?: (progress: BisectProgress) => void;
  signal?: AbortSignal;
}

/**
 * Checks whether a given test result represents a failure for the specified test (or any failure if no specific test provided).
 */
export function isTestFailing(result: ProvenanceTestResult, testName?: string): boolean {
  if (result.status === 'error') return true;
  if (!testName) {
    return (result.failed ?? 0) > 0 || result.status === 'failed';
  }

  const normalizedTestName = testName.trim();
  
  if (result.failedTests && result.failedTests.length > 0) {
    return result.failedTests.some(
      ft => ft === normalizedTestName || ft.includes(normalizedTestName) || normalizedTestName.includes(ft)
    );
  }

  if (result.output) {
    const lines = result.output.split('\n');
    for (const line of lines) {
      if (line.includes(normalizedTestName)) {
        if (
          line.includes('❌') ||
          line.includes('FAIL') ||
          line.includes('Failed') ||
          line.includes('AssertionError') ||
          line.includes('error')
        ) {
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Reconstructs a historical snapshot copy of files in memory at entry index targetIndex without mutating live VFS.
 * targetIndex = -1: Codebase state before entry 0 (genesis before first AI patch).
 * targetIndex = k: Codebase state immediately after applying entry k.
 */
export function reconstructHistoricalFiles(
  currentFiles: FileItem[],
  entries: ProvenanceEntry[],
  targetIndex: number,
  snapshots?: Snapshot[]
): FileItem[] {
  // If targetIndex is at or beyond the latest entry, return clone of currentFiles
  if (targetIndex >= entries.length - 1 && entries.length > 0) {
    return currentFiles.map(f => ({ ...f }));
  }

  // Deep clone current in-memory files
  let files: FileItem[] = currentFiles.map(f => ({ ...f }));

  // Rewind entries from newest down to targetIndex + 1
  for (let i = entries.length - 1; i > targetIndex; i--) {
    const entry = entries[i];
    if (entry.beforeContent !== undefined && entry.beforeContent !== null) {
      if (entry.beforeContent === '') {
        // File was created in this entry; rewinding means deleting it from files
        files = files.filter(f => f.path !== entry.filePath);
      } else {
        const existing = files.find(f => f.path === entry.filePath);
        if (existing) {
          existing.content = entry.beforeContent;
        } else {
          files.push({
            id: `hist-${Math.random().toString(36).slice(2, 9)}`,
            projectId: entry.projectId,
            path: entry.filePath,
            content: entry.beforeContent,
            updatedAt: entry.timestamp
          });
        }
      }
    } else if (snapshots && snapshots.length > 0) {
      // Fallback: check if we have a full snapshot before/at this timestamp
      const candidateSnap = snapshots.find(s => s.createdAt <= entry.timestamp);
      if (candidateSnap?.fileSnapshotJson) {
        try {
          const parsed = JSON.parse(candidateSnap.fileSnapshotJson);
          if (Array.isArray(parsed)) {
            const snapFile = parsed.find((sf: any) => sf.path === entry.filePath);
            if (snapFile) {
              const existing = files.find(f => f.path === entry.filePath);
              if (existing) {
                existing.content = snapFile.content;
              } else {
                files.push({ ...snapFile });
              }
            }
          }
        } catch {
          // ignore snapshot parse errors
        }
      }
    }
  }

  return files;
}

/**
 * Computes a unified diff string between beforeContent and afterContent of an entry.
 */
export function formatEntryDiff(entry: ProvenanceEntry): string {
  const oldStr = entry.beforeContent ?? '';
  const newStr = entry.afterContent ?? '';
  const patchObj = structuredPatch(
    entry.filePath,
    entry.filePath,
    oldStr,
    newStr,
    'before patch',
    'after patch'
  );

  const lines: string[] = [];
  lines.push(`--- ${entry.filePath} (before)`);
  lines.push(`+++ ${entry.filePath} (after)`);

  for (const hunk of patchObj.hunks) {
    lines.push(`@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`);
    for (const line of hunk.lines) {
      lines.push(line);
    }
  }

  return lines.join('\n');
}

/**
 * Performs binary search (bisection) over the chronological provenance entries to find
 * the earliest AI patch after which the given test started failing.
 */
export async function bisectBrokenTest(options: BisectOptions): Promise<BisectResult> {
  const { projectId, testName, testRunner, onProgress, signal } = options;

  if (signal?.aborted) {
    throw new DOMException('Bisection was cancelled.', 'AbortError');
  }

  // 1. Fetch chronological provenance entries for this project
  const entries: ProvenanceEntry[] = await db.provenanceEntries
    .where('projectId')
    .equals(projectId)
    .sortBy('timestamp');

  if (!entries || entries.length === 0) {
    return {
      found: false,
      totalStepsRun: 0,
      testName,
      reason: 'No provenance history entries found for this project.'
    };
  }

  // 2. Fetch current files and snapshots
  const currentFiles = await listFiles(projectId);
  const snapshots = await db.snapshots
    .where('projectId')
    .equals(projectId)
    .sortBy('createdAt');

  const runner = testRunner || runProjectTestsDetailed;

  // 3. First verify if the test actually fails in the current codebase
  onProgress?.({
    currentStep: 1,
    totalEstimatedSteps: Math.ceil(Math.log2(entries.length)) + 2,
    checkingIndex: entries.length - 1,
    totalEntries: entries.length,
    entry: entries[entries.length - 1],
    statusText: 'Verifying test failure on current project state...'
  });

  const currentResult = await runner(currentFiles);
  if (signal?.aborted) throw new DOMException('Bisection was cancelled.', 'AbortError');

  if (!isTestFailing(currentResult, testName)) {
    return {
      found: false,
      totalStepsRun: 1,
      testName,
      reason: 'The specified test is currently passing in the live codebase.'
    };
  }

  // 4. Binary Search for the earliest failing patch
  // Range: low = 0 (oldest patch), high = entries.length - 1 (newest patch)
  let low = 0;
  let high = entries.length - 1;
  let stepCount = 1;
  const estimatedSteps = Math.ceil(Math.log2(entries.length)) + 2;

  while (low < high) {
    if (signal?.aborted) throw new DOMException('Bisection was cancelled.', 'AbortError');

    const mid = Math.floor((low + high) / 2);
    stepCount++;

    onProgress?.({
      currentStep: stepCount,
      totalEstimatedSteps: estimatedSteps,
      checkingIndex: mid,
      totalEntries: entries.length,
      entry: entries[mid],
      statusText: `Testing historical state after patch #${mid + 1} of ${entries.length} (${entries[mid].filePath})...`
    });

    const historicalFiles = reconstructHistoricalFiles(currentFiles, entries, mid, snapshots);
    const midResult = await runner(historicalFiles);

    if (signal?.aborted) throw new DOMException('Bisection was cancelled.', 'AbortError');

    if (isTestFailing(midResult, testName)) {
      // The test was already failing at mid. The earliest failure is at or before mid.
      high = mid;
    } else {
      // The test passed at mid. The breaking patch was introduced AFTER mid.
      low = mid + 1;
    }
  }

  // low === high is our candidate earliest breaking patch
  const offendingIndex = low;
  const offendingEntry = entries[offendingIndex];
  const previousEntry = offendingIndex > 0 ? entries[offendingIndex - 1] : undefined;

  // Let's check state before the first entry if offendingIndex is 0
  let failedPriorToHistory = false;
  if (offendingIndex === 0) {
    stepCount++;
    onProgress?.({
      currentStep: stepCount,
      totalEstimatedSteps: stepCount,
      checkingIndex: -1,
      totalEntries: entries.length,
      statusText: 'Checking codebase state before the first AI patch...'
    });

    const stateBeforeGenesis = reconstructHistoricalFiles(currentFiles, entries, -1, snapshots);
    const genesisResult = await runner(stateBeforeGenesis);
    if (isTestFailing(genesisResult, testName)) {
      failedPriorToHistory = true;
    }
  }

  // Re-run or get test output for the offending patch to surface exact error message
  const offendingFiles = reconstructHistoricalFiles(currentFiles, entries, offendingIndex, snapshots);
  const offendingTestRun = await runner(offendingFiles);

  const diff = formatEntryDiff(offendingEntry);

  return {
    found: true,
    offendingEntry,
    offendingIndex,
    previousEntry,
    testName,
    diff,
    totalStepsRun: stepCount,
    failedPriorToHistory,
    reason: failedPriorToHistory 
      ? 'Test failed even prior to the first AI patch in the provenance ledger.'
      : `Found breaking patch #${offendingIndex + 1} (${offendingEntry.filePath}) by ${offendingEntry.model || 'AI'}.`,
    testOutputAtOffendingPatch: offendingTestRun.output || offendingTestRun.error || 'Test failed'
  };
}
