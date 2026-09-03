// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from '../store';
import { resetProjectScopedState } from './useProjectActions';

describe('resetProjectScopedState', () => {
  beforeEach(() => {
    const store = useAppStore.getState();
    store.setActiveFileId(null);
    store.setOpenFileIds([]);
    store.setExpandedFolderPaths([]);
    store.clearPendingPatches();
    store.setLastBuildError(null);
    store.setLastPreviewScreenshot(null);
  });

  it('clears stale project-scoped UI state on project switch', () => {
    const store = useAppStore.getState();
    store.setOpenFileIds(['old-file', 'another-old-file']);
    store.setActiveFileId('old-file');
    store.setExpandedFolderPaths(['/src', '/components']);
    store.setLastBuildError('old build failure');
    store.setLastPreviewScreenshot({
      data: 'old-image',
      mediaType: 'image/png',
      timestamp: 1,
    });

    resetProjectScopedState(store.setActiveFileId, new Set(['new-file']));

    const next = useAppStore.getState();
    expect(next.openFileIds).toEqual([]);
    expect(next.activeFileId).toBeNull();
    expect(next.expandedFolderPaths).toEqual([]);
    expect(next.pendingPatches).toEqual([]);
    expect(next.isPatchReviewOpen).toBe(false);
    expect(next.lastBuildError).toBeNull();
    expect(next.lastPreviewScreenshot).toBeNull();
  });

  it('preserves file selections that belong to the newly active project', () => {
    const store = useAppStore.getState();
    store.setOpenFileIds(['new-file', 'old-file']);
    store.setActiveFileId('new-file');

    resetProjectScopedState(store.setActiveFileId, new Set(['new-file']));

    const next = useAppStore.getState();
    expect(next.openFileIds).toEqual(['new-file']);
    expect(next.activeFileId).toBe('new-file');
  });
});
