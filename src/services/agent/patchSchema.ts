import { z } from 'zod';
import { structuredPatch } from 'diff';

export const patchTypeSchema = z.enum(['replace', 'append', 'create', 'delete']);

export const patchSchema = z.object({
  path: z.string(),
  type: patchTypeSchema,
  oldContent: z.string().optional(),
  newContent: z.string(),
  rationale: z.string()
});

export type PatchType = z.infer<typeof patchTypeSchema>;
export type PatchDefinition = z.infer<typeof patchSchema>;

export interface HunkLine {
  type: 'context' | 'added' | 'removed';
  content: string;
}

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: HunkLine[];
}

/**
 * Computes line-level hunks between oldContent and newContent for UI display.
 */
export function computeHunks(oldContent: string = '', newContent: string = ''): DiffHunk[] {
  const patch = structuredPatch('old', 'new', oldContent, newContent, '', '', { context: 3 });
  
  return patch.hunks.map(hunk => {
    const lines: HunkLine[] = hunk.lines.map(line => {
      if (line.startsWith('+')) {
        return { type: 'added', content: line.substring(1) };
      }
      if (line.startsWith('-')) {
        return { type: 'removed', content: line.substring(1) };
      }
      // Context lines typically start with a space, but might be empty if original line was empty
      return { 
        type: 'context', 
        content: line.startsWith(' ') ? line.substring(1) : line 
      };
    });

    return {
      oldStart: hunk.oldStart,
      oldLines: hunk.oldLines,
      newStart: hunk.newStart,
      newLines: hunk.newLines,
      lines
    };
  });
}
