import type { FileItem } from '../../db';
import { binaryExtensions } from '../fs/zipExport';

export interface SearchMatch {
  lineNumber: number; // 1-indexed
  columnNumber: number; // 1-indexed
  lineContent: string;
  matchText: string;
  matchLength: number;
  matchStartInLine: number; // 0-indexed offset within lineContent
}

export interface FileSearchResult {
  file: FileItem;
  filePath: string;
  fileName: string;
  matches: SearchMatch[];
}

export interface ProjectSearchOptions {
  query: string;
  isRegex?: boolean;
  isCaseSensitive?: boolean;
  isWholeWord?: boolean;
  includePattern?: string; // e.g. "*.tsx, src/**"
  excludePattern?: string; // e.g. "*.lock, *.min.js"
  maxResults?: number;
}

export interface ProjectSearchSummary {
  results: FileSearchResult[];
  totalMatches: number;
  totalFiles: number;
  durationMs: number;
  error?: string | null;
}

const ADDITIONAL_BINARY_EXTENSIONS = [
  '.wasm', '.pdf', '.mp3', '.mp4', '.ogg', '.wav', 
  '.woff', '.woff2', '.ttf', '.eot', '.otf', '.bin', '.dat'
];

/**
 * Checks if a file path represents a binary or non-text asset
 */
export function isBinaryFilePath(path: string): boolean {
  const lower = path.toLowerCase();
  if (binaryExtensions.some(ext => lower.endsWith(ext))) return true;
  if (ADDITIONAL_BINARY_EXTENSIONS.some(ext => lower.endsWith(ext))) return true;
  return false;
}

/**
 * Checks if a file path matches glob / wildcard patterns
 * Supports comma-separated filters, `*`, `**`, and `!` negation
 */
export function matchesGlobFilter(filePath: string, includePattern?: string, excludePattern?: string): boolean {
  const normPath = filePath.startsWith('/') ? filePath.slice(1) : filePath;
  const fileName = normPath.split('/').pop() || '';

  // Check exclude pattern first
  if (excludePattern && excludePattern.trim()) {
    const excludePatterns = excludePattern.split(',').map(p => p.trim()).filter(Boolean);
    for (const pat of excludePatterns) {
      if (testSingleGlob(normPath, fileName, pat)) {
        return false;
      }
    }
  }

  // Check include pattern
  if (includePattern && includePattern.trim()) {
    const includePatterns = includePattern.split(',').map(p => p.trim()).filter(Boolean);
    if (includePatterns.length > 0) {
      let matchedAny = false;
      for (const pat of includePatterns) {
        if (testSingleGlob(normPath, fileName, pat)) {
          matchedAny = true;
          break;
        }
      }
      if (!matchedAny) return false;
    }
  }

  return true;
}

function testSingleGlob(normPath: string, fileName: string, pattern: string): boolean {
  const isNeg = pattern.startsWith('!');
  const cleanPat = isNeg ? pattern.slice(1).trim() : pattern;
  const pat = cleanPat.startsWith('/') ? cleanPat.slice(1) : cleanPat;
  if (!pat) return false;

  // Convert glob to regex
  // 1. replace '.' with '\.' etc
  // 2. replace '**' with '.*'
  // 3. replace '*' with '[^/]*'
  // 4. replace '?' with '.'
  const escaped = pat
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '__DOUBLE_STAR__')
    .replace(/\*/g, '[^/]*')
    .replace(/__DOUBLE_STAR__/g, '.*')
    .replace(/\?/g, '.');

  const reg = new RegExp(`^${escaped}$`, 'i');
  // Match either full normalized path or just filename
  const matched = reg.test(normPath) || reg.test(fileName);
  return isNeg ? !matched : matched;
}

/**
 * Searches across all text files in the project
 */
export function searchProjectFiles(
  files: FileItem[],
  options: ProjectSearchOptions
): ProjectSearchSummary {
  const startTime = performance.now();
  const {
    query,
    isRegex = false,
    isCaseSensitive = false,
    isWholeWord = false,
    includePattern = '',
    excludePattern = '',
    maxResults = 1000
  } = options;

  if (!query || query.trim() === '') {
    return {
      results: [],
      totalMatches: 0,
      totalFiles: 0,
      durationMs: Math.round(performance.now() - startTime),
      error: null
    };
  }

  let searchRegex: RegExp;
  try {
    let flags = 'g';
    if (!isCaseSensitive) flags += 'i';

    let patternStr = query;
    if (!isRegex) {
      // Escape special characters in literal search
      patternStr = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    if (isWholeWord) {
      patternStr = `\\b${patternStr}\\b`;
    }

    searchRegex = new RegExp(patternStr, flags);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Invalid Regular Expression';
    return {
      results: [],
      totalMatches: 0,
      totalFiles: 0,
      durationMs: Math.round(performance.now() - startTime),
      error: errorMsg
    };
  }

  const results: FileSearchResult[] = [];
  let totalMatches = 0;

  for (const file of files) {
    if (totalMatches >= maxResults) break;
    if (isBinaryFilePath(file.path)) continue;
    if (!matchesGlobFilter(file.path, includePattern, excludePattern)) continue;

    const fileMatches: SearchMatch[] = [];
    const lines = file.content.split(/\r?\n/);

    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      if (totalMatches >= maxResults) break;
      const lineContent = lines[lineIdx];
      
      // Reset regex index before running on line
      searchRegex.lastIndex = 0;
      let match: RegExpExecArray | null;

      while ((match = searchRegex.exec(lineContent)) !== null) {
        const matchLength = match[0].length;
        if (matchLength === 0) {
          // Prevent infinite loop on 0-length regex matches (e.g. empty lookahead)
          searchRegex.lastIndex++;
          continue;
        }

        const matchStartInLine = match.index;
        const columnNumber = matchStartInLine + 1; // 1-indexed
        const lineNumber = lineIdx + 1; // 1-indexed

        fileMatches.push({
          lineNumber,
          columnNumber,
          lineContent,
          matchText: match[0],
          matchLength,
          matchStartInLine
        });

        totalMatches++;
        if (totalMatches >= maxResults) break;
      }
    }

    if (fileMatches.length > 0) {
      const parts = file.path.split('/').filter(Boolean);
      const fileName = parts.pop() || file.path;

      results.push({
        file,
        filePath: file.path,
        fileName,
        matches: fileMatches
      });
    }
  }

  return {
    results,
    totalMatches,
    totalFiles: results.length,
    durationMs: Math.round(performance.now() - startTime),
    error: null
  };
}
