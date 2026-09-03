import { describe, it, expect } from 'vitest';
import { detectConflicts, ConflictError } from './conflictResolver';
import type { PatchDefinition } from '../patchSchema';
import type { FileItem } from '../../../db';

describe('ConflictResolver', () => {
  const currentFiles: FileItem[] = [
    { id: '1', projectId: 'p1', path: '/index.ts', content: 'console.log("Hello");', updatedAt: 1 },
    { id: '2', projectId: 'p1', path: '/utils.ts', content: 'const a = 1;', updatedAt: 1 }
  ];

  it('detects no conflicts for valid patches', () => {
    const patches: PatchDefinition[] = [
      { type: 'create', path: '/new.ts', newContent: 'new', rationale: 'test' },
      { type: 'replace', path: '/index.ts', oldContent: 'console.log("Hello");', newContent: 'updated', rationale: 'test' },
      { type: 'delete', path: '/utils.ts', oldContent: 'const a = 1;', newContent: '', rationale: 'test' }
    ];

    expect(() => detectConflicts(patches, currentFiles)).not.toThrow();
  });

  it('detects conflict when creating an existing file', () => {
    const patches: PatchDefinition[] = [
      { type: 'create', path: '/index.ts', newContent: 'new', rationale: 'test' }
    ];

    expect(() => detectConflicts(patches, currentFiles)).toThrowError(ConflictError);
  });

  it('detects conflict when replacing a non-existent file', () => {
    const patches: PatchDefinition[] = [
      { type: 'replace', path: '/missing.ts', oldContent: 'old', newContent: 'new', rationale: 'test' }
    ];

    expect(() => detectConflicts(patches, currentFiles)).toThrowError(ConflictError);
  });

  it('detects conflict when oldContent does not match current content', () => {
    const patches: PatchDefinition[] = [
      { type: 'replace', path: '/index.ts', oldContent: 'stale content', newContent: 'new', rationale: 'test' }
    ];

    expect(() => detectConflicts(patches, currentFiles)).toThrowError(ConflictError);
  });
});
