import type { WorkspaceOverlay } from './overlay';
import type { BuildVerificationResult } from '../../bundler/buildRunner';
import { verifyBuildFromOverlay } from '../../bundler/buildRunner';
import { runTestsDetailedFromOverlay } from '../../bundler/testRunner';
import { detectBundledProject } from '../../bundler/entryDetection';
import type { ProvenanceTestResult } from '../../../db';

export type CandidateVerificationStatus = 'passed' | 'failed' | 'unavailable';

export interface CandidateVerificationResult {
  success: boolean;
  status?: CandidateVerificationStatus;
  error?: string;
  output?: string;
  buildResult?: BuildVerificationResult;
  testResult?: ProvenanceTestResult;
  skippedWorkerVerification?: boolean;
}

export type CandidateVerifier = (overlay: WorkspaceOverlay) => Promise<CandidateVerificationResult>;

export type VerificationKind = 'build' | 'tests' | 'mixed' | 'unknown';

export interface VerificationEvidence {
  kind: VerificationKind;
  summary: string;
  affectedFiles?: string[];
  outputSnippet?: string;
}

export const MAX_FAILURE_EVIDENCE_CHARS = 1200;

/**
 * Normalizes free-form verification errors and diagnostic outputs into a concise,
 * bounded payload suitable for injecting into the agent repair prompt.
 */
export function normalizeVerificationEvidence(
  result: CandidateVerificationResult,
  maxChars: number = MAX_FAILURE_EVIDENCE_CHARS
): {
  evidence: VerificationEvidence;
  formattedText: string;
} {
  let kind: VerificationKind = 'unknown';
  const hasFailedBuild = Boolean(result.buildResult && !result.buildResult.success);
  const hasFailedTests = Boolean(
    result.testResult &&
    (result.testResult.failed > 0 || result.testResult.status === 'failed' || result.testResult.status === 'error')
  );

  if (hasFailedBuild && hasFailedTests) {
    kind = 'mixed';
  } else if (hasFailedBuild) {
    kind = 'build';
  } else if (hasFailedTests) {
    kind = 'tests';
  } else if (result.error && /build|bundle|syntaxerror|compil/i.test(result.error)) {
    kind = 'build';
  } else if (result.error && /test|spec|assert|expect/i.test(result.error)) {
    kind = 'tests';
  }

  let summary: string;
  if (kind === 'build') {
    summary = result.buildResult?.error || result.error || 'Candidate build verification failed.';
  } else if (kind === 'tests') {
    summary = result.testResult?.error || result.error || `${result.testResult?.failed ?? 0} test(s) failed.`;
  } else if (kind === 'mixed') {
    summary = 'Both build compilation and test suite checks failed on candidate workspace.';
  } else {
    summary = result.error || 'Candidate verification failed.';
  }

  const affectedFiles: string[] = [];
  if (result.testResult?.failedTests && result.testResult.failedTests.length > 0) {
    for (const t of result.testResult.failedTests) {
      if (t && !affectedFiles.includes(t)) {
        affectedFiles.push(t);
      }
    }
  }
  if (result.buildResult?.entryPoint && !affectedFiles.includes(result.buildResult.entryPoint)) {
    affectedFiles.push(result.buildResult.entryPoint);
  }

  let rawOutput = (result.output || result.buildResult?.output || result.testResult?.output || '').trim();
  if (rawOutput === summary.trim()) {
    rawOutput = '';
  }

  const parts: string[] = [
    `Verification Kind: ${kind}`,
    `Summary: ${summary.trim()}`
  ];

  if (affectedFiles.length > 0) {
    parts.push(`Affected Files / Tests:\n${affectedFiles.map(f => `• ${f}`).join('\n')}`);
  }

  if (rawOutput) {
    parts.push(`Diagnostic Details:\n${rawOutput}`);
  }

  let fullFormatted = parts.join('\n\n');

  if (fullFormatted.length > maxChars) {
    const truncationNotice = '\n\n... [Output truncated to preserve context bounds]';
    const allowedLength = Math.max(100, maxChars - truncationNotice.length);
    fullFormatted = fullFormatted.slice(0, allowedLength) + truncationNotice;
  }

  return {
    evidence: {
      kind,
      summary,
      affectedFiles: affectedFiles.length > 0 ? affectedFiles : undefined,
      outputSnippet: rawOutput ? rawOutput.slice(0, maxChars) : undefined
    },
    formattedText: fullFormatted
  };
}

/**
 * Runs candidate verification against a candidate WorkspaceOverlay.
 * Guarantees that:
 * 1. Build verification runs against the candidate overlay without touching canonical VFS.
 * 2. Test verification runs against the candidate overlay without touching canonical VFS.
 * 3. In non-worker environments without a mock worker, safely fails closed as 'unavailable'.
 */
export async function verifyCandidateOverlay(
  overlay: WorkspaceOverlay,
  options?: {
    checkBuild?: boolean;
    checkTests?: boolean;
    onProgress?: (status: string) => void;
  }
): Promise<CandidateVerificationResult> {
  if (!overlay || typeof overlay.materialize !== 'function') {
    return {
      success: false,
      status: 'failed',
      error: 'Missing WorkspaceOverlay: verifyCandidateOverlay requires a valid WorkspaceOverlay instance.',
      output: 'Verification aborted: missing WorkspaceOverlay.'
    };
  }

  const files = await overlay.materialize();

  // 1. Determine if build verification is needed
  const checkBuild = options?.checkBuild !== false;
  let isBundled = false;
  if (checkBuild) {
    const projectInfo = detectBundledProject(files);
    isBundled = projectInfo.isBundled;
  }

  // 2. Determine if test verification is needed
  const checkTests = options?.checkTests !== false;
  let hasTestFiles = false;
  if (checkTests) {
    hasTestFiles = files.some(f =>
      (f.path.includes('.test.') || f.path.includes('.spec.')) &&
      (f.path.endsWith('.ts') || f.path.endsWith('.tsx') || f.path.endsWith('.js') || f.path.endsWith('.jsx'))
    );
  }

  // In non-browser environments without Worker, if worker-based checks are required,
  // fail closed as unavailable; unavailable verification MUST NOT be treated as a pass.
  if ((isBundled || hasTestFiles) && typeof Worker === 'undefined') {
    return {
      success: false,
      status: 'unavailable',
      error: 'Candidate verification unavailable: Web Worker is unavailable in this environment.',
      output: 'Candidate verification unavailable: Web Worker is unavailable in this environment.',
      skippedWorkerVerification: true
    };
  }

  // 1. Build Verification (if project is bundled)
  if (isBundled) {
    const buildResult = await verifyBuildFromOverlay(overlay, options?.onProgress);
    if (!buildResult.success) {
      return {
        success: false,
        status: 'failed',
        error: buildResult.error || buildResult.output || 'Candidate build verification failed.',
        output: buildResult.output,
        buildResult
      };
    }
  }

  // 2. Test Verification (if project has test files)
  if (hasTestFiles) {
    const testResult = await runTestsDetailedFromOverlay(overlay);
    if (testResult.failed > 0 || testResult.status === 'failed' || testResult.status === 'error') {
      const failureReason = testResult.error || testResult.output || `${testResult.failed} test(s) failed.`;
      return {
        success: false,
        status: 'failed',
        error: failureReason,
        output: testResult.output,
        testResult
      };
    }
  }

  return {
    success: true,
    status: 'passed',
    output: 'Candidate verification succeeded: all candidate checks passed.'
  };
}
