import { describe, expect, it } from 'vitest';
import type { FileItem } from '../db';
import { reconcileFileSelection } from './useFileOperations';

const file = (id: string, path = `/${id}.ts`): FileItem => ({
  id,
  projectId: 'project-1',
  path,
  content: '',
  createdAt: 1,
  updatedAt: 1,
});

describe('reconcileFileSelection', () => {
  it('keeps active and open files that still exist', () => {
    expect(reconcileFileSelection([file('a'), file('b')], {
      openFileIds: ['a', 'b'],
      activeFileId: 'b',
    })).toEqual({ openFileIds: ['a', 'b'], activeFileId: 'b' });
  });

  it('removes deleted files from open tabs and falls back to the last surviving tab', () => {
    expect(reconcileFileSelection([file('a')], {
      openFileIds: ['a', 'b'],
      activeFileId: 'b',
    })).toEqual({ openFileIds: ['a'], activeFileId: 'a' });
  });

  it('clears selection when the durable VFS is empty', () => {
    expect(reconcileFileSelection([], {
      openFileIds: ['a', 'b'],
      activeFileId: 'b',
    })).toEqual({ openFileIds: [], activeFileId: null });
  });

  it('preserves tab ordering while pruning missing files', () => {
    expect(reconcileFileSelection([file('b'), file('d')], {
      openFileIds: ['a', 'b', 'c', 'd'],
      activeFileId: 'c',
    })).toEqual({ openFileIds: ['b', 'd'], activeFileId: 'd' });
  });
});
