import type { PatchDefinition } from '../patchSchema';
import type { FileItem } from '../../../db';

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}

export function detectConflicts(patches: PatchDefinition[], currentFiles: FileItem[]): void {
  const currentFilesMap = new Map(currentFiles.map(f => [f.path, f.content]));

  for (const patch of patches) {
    const currentContent = currentFilesMap.get(patch.path);
    
    if (patch.type === 'create') {
      if (currentContent !== undefined) {
        throw new ConflictError(`File ${patch.path} already exists and conflicts with create patch.`);
      }
    } else if (patch.type === 'delete' || patch.type === 'replace' || patch.type === 'append') {
      if (currentContent === undefined) {
        throw new ConflictError(`File ${patch.path} does not exist for patch type ${patch.type}.`);
      }
      
      // If the patch assumes a specific oldContent, ensure it matches current.
      // Not all patch architectures require oldContent to be strictly equivalent to the entire file, 
      // but in our schema 'replace' and 'delete' often supply oldContent as the base.
      if (patch.oldContent !== undefined) {
        if (patch.oldContent !== currentContent) {
          throw new ConflictError(`File ${patch.path} has been modified since the base revision, causing a conflict.`);
        }
      }
    }
  }
}
