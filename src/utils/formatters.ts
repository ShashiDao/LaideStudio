/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Formats a byte count as a short human-readable size string (e.g. "512 B",
 * "2.3 KB", "1.4 MB"). Caps at MB since callers use this for individual
 * file sizes, not aggregate project totals.
 *
 * Previously duplicated (byte-for-byte identical formatting logic) across
 * TerminalPanel.tsx, FileTree.tsx, and ImageViewerModal.tsx.
 *
 * Note: for aggregate/project-level totals (which need a GB tier and
 * trims trailing ".0"), see `formatBytes` in `utils/projectStats.ts` —
 * that one is intentionally left separate since unifying them would
 * change its display output.
 */
export function formatByteSize(bytes: number): string {
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
