import type { WorkspaceOverlay } from './overlay';
import type { BuildVerificationResult } from '../../bundler/buildRunner';
import { verifyBuildFromOverlay } from '../../bundler/buildRunner';
import { runTestsDetailedFromOverlay } from '../../bundler/testRunner';
import { detectBundledProject } from '../../bundler/entryDetection';
import type { ProvenanceTestResult } from '../../../db';

export interface CandidateVerificationResult {
  success: boolean;
  error?: string;
  output?: string;
  buildResult?: BuildVerificationResult;
  testResult?: ProvenanceTestResult;
  skippedWorkerVerification?: boolean;
}

export type CandidateVerifier = (overlay: WorkspaceOverlay) => Promise<CandidateVerificationResult>;

/**
 * Runs candidate verification against a candidate WorkspaceOverlay.
 * Guarantees that:
 * 1. Build verification runs against the candidate overlay without touching canonical VFS.
 * 2. Test verification runs against the candidate overlay without touching canonical VFS.
 * 3. In non-worker environments without a mock worker, safely notes worker absence.
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
      error: 'Missing WorkspaceOverlay: verifyCandidateOverlay requires a valid WorkspaceOverlay instance.',
      output: 'Verification aborted: missing WorkspaceOverlay.'
    };
  }

  // In non-browser test environments without Worker mocked,
  // skip worker-based build/test execution unless a custom mock or worker is present.
  if (typeof Worker === 'undefined') {
    return {
      success: true,
      output: 'Candidate verification skipped: Web Worker is unavailable in this environment.',
      skippedWorkerVerification: true
    };
  }

  const files = await overlay.materialize();

  // 1. Build Verification (if project is bundled)
  const checkBuild = options?.checkBuild !== false;
  if (checkBuild) {
    const projectInfo = detectBundledProject(files);
    if (projectInfo.isBundled) {
      const buildResult = await verifyBuildFromOverlay(overlay, options?.onProgress);
      if (!buildResult.success) {
        return {
          success: false,
          error: buildResult.error || buildResult.output || 'Candidate build verification failed.',
          output: buildResult.output,
          buildResult
        };
      }
    }
  }

  // 2. Test Verification (if project has test files)
  const checkTests = options?.checkTests !== false;
  if (checkTests) {
    const hasTestFiles = files.some(f =>
      (f.path.includes('.test.') || f.path.includes('.spec.')) &&
      (f.path.endsWith('.ts') || f.path.endsWith('.tsx') || f.path.endsWith('.js') || f.path.endsWith('.jsx'))
    );
    if (hasTestFiles) {
      const testResult = await runTestsDetailedFromOverlay(overlay);
      if (testResult.failed > 0 || testResult.status === 'failed' || testResult.status === 'error') {
        const failureReason = testResult.error || testResult.output || `${testResult.failed} test(s) failed.`;
        return {
          success: false,
          error: failureReason,
          output: testResult.output,
          testResult
        };
      }
    }
  }

  return {
    success: true,
    output: 'Candidate verification succeeded: all candidate checks passed.'
  };
}
