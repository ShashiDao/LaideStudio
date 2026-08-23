import { diffLines, type Change } from 'diff';
import type { ProvenanceEntry } from '../../db';

export interface BlamedLine {
  lineNumber: number; // 1-indexed
  text: string;
  entry: ProvenanceEntry | null;
}

export interface FileBlameResult {
  blameMap: Map<number, ProvenanceEntry>;
  lines: BlamedLine[];
  hasAiHistory: boolean;
}

/**
 * Splits a text into lines, handling CRLF and LF.
 */
function splitIntoLines(text: string): string[] {
  if (!text) return [];
  const normalized = text.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  // If text ends with newline, split produces trailing empty string.
  // Standard editor line count treats "a\n" as 2 lines (line 1: "a", line 2: "")
  return lines;
}

/**
 * Computes line-by-line AI provenance attribution for a file.
 * Traces through historical patches and correlates lines to the specific AI entry that modified them.
 */
export function computeFileAiBlame(
  entries: ProvenanceEntry[],
  currentFileContent: string
): FileBlameResult {
  const blameMap = new Map<number, ProvenanceEntry>();
  const currentLines = splitIntoLines(currentFileContent);

  if (!entries || entries.length === 0) {
    const lines: BlamedLine[] = currentLines.map((text, idx) => ({
      lineNumber: idx + 1,
      text,
      entry: null
    }));
    return { blameMap, lines, hasAiHistory: false };
  }

  // Sort entries chronologically
  const sortedEntries = [...entries].sort((a, b) => a.timestamp - b.timestamp);

  // Track historical lines with their attributed provenance entry
  let historicalLines: Array<{ text: string; entry: ProvenanceEntry | null }> = [];

  for (const entry of sortedEntries) {
    const after = entry.afterContent;
    const before = entry.beforeContent;

    if (after !== undefined && after !== null) {
      if (before !== undefined && before !== null && historicalLines.length > 0) {
        // Step-by-step diff between current tracked state and entry.afterContent
        const prevText = historicalLines.map(l => l.text).join('\n');
        const changes: Change[] = diffLines(prevText, after);

        const newLines: Array<{ text: string; entry: ProvenanceEntry | null }> = [];
        let prevIdx = 0;

        for (const change of changes) {
          const changeLineCount = change.count || 0;
          const changeLines = splitIntoLines(change.value);
          // If diffLines returns trailing empty line due to newline, adjust
          const parts = change.value.endsWith('\n') ? changeLines.slice(0, -1) : changeLines;

          if (change.added) {
            for (const lineText of parts) {
              newLines.push({ text: lineText, entry });
            }
          } else if (change.removed) {
            prevIdx += (parts.length || changeLineCount);
          } else {
            // Unchanged: carry over previous blame
            for (let i = 0; i < parts.length; i++) {
              if (prevIdx < historicalLines.length) {
                newLines.push(historicalLines[prevIdx]);
                prevIdx++;
              } else {
                newLines.push({ text: parts[i], entry: null });
              }
            }
          }
        }
        historicalLines = newLines;
      } else {
        // Initial creation or no beforeContent: all lines attributed to this entry
        const afterLines = splitIntoLines(after);
        historicalLines = afterLines.map(text => ({ text, entry }));
      }
    } else {
      // Fallback if afterContent wasn't recorded: blame all existing historical lines to this latest entry
      if (historicalLines.length === 0 && currentLines.length > 0) {
        historicalLines = currentLines.map(text => ({ text, entry }));
      } else {
        historicalLines = historicalLines.map(l => ({ text: l.text, entry }));
      }
    }
  }

  // Now correlate historical lines with the current editor file content
  if (historicalLines.length > 0) {
    const histText = historicalLines.map(l => l.text).join('\n');
    if (histText === currentFileContent) {
      // Exact match: 1:1 attribution
      const lines: BlamedLine[] = [];
      for (let i = 0; i < currentLines.length; i++) {
        const entry = (i < historicalLines.length) ? historicalLines[i].entry : null;
        lines.push({
          lineNumber: i + 1,
          text: currentLines[i],
          entry
        });
        if (entry) {
          blameMap.set(i + 1, entry);
        }
      }
      return { blameMap, lines, hasAiHistory: blameMap.size > 0 };
    }

    // Diff between historical lines and current editor content
    const changes: Change[] = diffLines(histText, currentFileContent);
    const finalLines: BlamedLine[] = [];
    let histIdx = 0;
    let currentLineNum = 1;

    for (const change of changes) {
      const changeLines = splitIntoLines(change.value);
      const parts = change.value.endsWith('\n') ? changeLines.slice(0, -1) : changeLines;

      if (change.added) {
        // User typed new lines since last patch: no AI blame
        for (const lineText of parts) {
          finalLines.push({
            lineNumber: currentLineNum,
            text: lineText,
            entry: null
          });
          currentLineNum++;
        }
      } else if (change.removed) {
        histIdx += parts.length;
      } else {
        // Unchanged: preserve AI blame from history
        for (let i = 0; i < parts.length; i++) {
          const entry = (histIdx < historicalLines.length) ? historicalLines[histIdx].entry : null;
          finalLines.push({
            lineNumber: currentLineNum,
            text: parts[i],
            entry
          });
          if (entry) {
            blameMap.set(currentLineNum, entry);
          }
          histIdx++;
          currentLineNum++;
        }
      }
    }

    return { blameMap, lines: finalLines, hasAiHistory: blameMap.size > 0 };
  }

  // Fallback: If entries exist for this file, blame current lines to the latest entry
  const latestEntry = sortedEntries[sortedEntries.length - 1];
  const lines: BlamedLine[] = currentLines.map((text, idx) => {
    const lineNum = idx + 1;
    blameMap.set(lineNum, latestEntry);
    return {
      lineNumber: lineNum,
      text,
      entry: latestEntry
    };
  });

  return { blameMap, lines, hasAiHistory: true };
}

// Memoized LRU-style cache for zero typing lag
const blameCache = new Map<string, { key: string; result: FileBlameResult }>();
const MAX_CACHE_SIZE = 50;

/**
 * Retrieves cached file AI blame or computes and caches it.
 */
export function getFileAiBlameCached(
  filePath: string,
  entries: ProvenanceEntry[],
  currentContent: string
): FileBlameResult {
  const entriesKey = entries.map(e => `${e.id}:${e.entryHash}:${e.testResult?.status || 'none'}`).join('|');
  const cacheKey = `${filePath}:::${entriesKey}:::${currentContent.length}:::${currentContent.slice(0, 100)}:::${currentContent.slice(-100)}`;

  const cached = blameCache.get(filePath);
  if (cached && cached.key === cacheKey) {
    return cached.result;
  }

  const result = computeFileAiBlame(entries, currentContent);

  if (blameCache.size >= MAX_CACHE_SIZE) {
    const firstKey = blameCache.keys().next().value;
    if (firstKey) blameCache.delete(firstKey);
  }

  blameCache.set(filePath, { key: cacheKey, result });
  return result;
}

export function clearBlameCache(): void {
  blameCache.clear();
}
