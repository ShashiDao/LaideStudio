import type { FileItem } from '../../db';
import { bundle } from './bundler';
import { detectBundledProject } from './entryDetection';
import type { WorkspaceOverlay } from '../agent/workspace/overlay';

export interface BuildVerificationResult {
  success: boolean;
  entryPoint?: string;
  output: string;
  error?: string;
}

/**
 * Runs build/bundle verification against an explicit array of project files
 * using the project's entry point detection and pure bundler pipeline.
 * Does NOT access canonical VFS.
 */
export async function verifyProjectBuild(
  files: FileItem[],
  onProgress?: (status: string) => void
): Promise<BuildVerificationResult> {
  const projectInfo = detectBundledProject(files);

  if (!projectInfo.entryPoint) {
    const errorMsg = `No valid entry point found. Expected one of: ${projectInfo.expectedEntries.join(', ')}`;
    return {
      success: false,
      error: errorMsg,
      output: `Build verification failed: ${errorMsg}`
    };
  }

  try {
    const bundledCode = await bundle(files, projectInfo.entryPoint, onProgress);
    return {
      success: true,
      entryPoint: projectInfo.entryPoint,
      output: `Build verification succeeded: Project bundled successfully with entry point ${projectInfo.entryPoint} (${bundledCode.length} bytes generated).`
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      entryPoint: projectInfo.entryPoint,
      error: msg,
      output: `Build verification failed: ${msg}`
    };
  }
}

/**
 * Runs build/bundle verification against candidate files materialized
 * from the active WorkspaceOverlay.
 * Guarantees that verification compiles the candidate workspace
 * without mutating or falling back to canonical VFS.
 */
export async function verifyBuildFromOverlay(
  overlay: WorkspaceOverlay,
  onProgress?: (status: string) => void
): Promise<BuildVerificationResult> {
  if (!overlay || typeof overlay.materialize !== 'function') {
    throw new Error('Missing WorkspaceOverlay: verifyBuildFromOverlay requires a valid WorkspaceOverlay instance.');
  }
  const files = await overlay.materialize();
  return verifyProjectBuild(files, onProgress);
}
