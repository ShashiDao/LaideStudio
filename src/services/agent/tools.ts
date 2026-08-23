import { listFiles } from '../fs/vfs';
import { useAppStore } from '../../store';
import type { LLMTool } from '../llm/llmAdapter';
import { runProjectTests } from '../bundler/testRunner';

export const AGENT_TOOLS: LLMTool[] = [
  {
    name: 'list_directory',
    description: 'Lists the contents of a directory. Use this to explore the project structure.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'The directory path to list (e.g. "/", "/src").' }
      },
      required: ['path']
    }
  },
  {
    name: 'read_file',
    description: 'Reads the contents of a file.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'The full path to the file to read (e.g. "/src/App.tsx").' }
      },
      required: ['path']
    }
  },
  {
    name: 'write_file',
    description: 'Proposes a patch to a file. Overwrites if it exists. Creates it if it does not.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'The full path to the file to write (e.g. "/src/App.tsx").' },
        type: { type: 'string', enum: ['replace', 'append', 'create', 'delete'], description: 'Type of patch' },
        oldContent: { type: 'string', description: 'The original content (optional).' },
        newContent: { type: 'string', description: 'The new content to write.' },
        rationale: { type: 'string', description: 'Why this patch is being made.' }
      },
      required: ['path', 'type', 'newContent', 'rationale']
    }
  },
  {
    name: 'search_code',
    description: 'Searches for a specific string or pattern across all files in the project.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The text to search for.' }
      },
      required: ['query']
    }
  },
  {
    name: 'run_tests',
    description: 'Executes the project\'s Vitest suite in an isolated Web Worker and returns test results.',
    parameters: {
      type: 'object',
      properties: {},
      required: []
    }
  }
];

export function validateProjectPath(path: string): { valid: boolean; error?: string } {
  if (!path || typeof path !== 'string') {
    return { valid: false, error: "Error: Invalid path. Path must be a non-empty string." };
  }
  if (!path.startsWith('/')) {
    return { valid: false, error: "Error: Invalid path. Must start with '/'" };
  }
  // Check for path traversal segments ('..' as a path segment, e.g. /../, /a/../b, /foo/..)
  const segments = path.split('/');
  if (segments.some(seg => seg === '..')) {
    return { valid: false, error: "Error: Invalid path. Path traversal ('..') is not permitted." };
  }
  if (path.includes('\0')) {
    return { valid: false, error: "Error: Invalid path. Contains null bytes." };
  }
  return { valid: true };
}

export interface ToolExecutionContext {
  model?: string;
  provider?: string;
  messageId?: string;
}

export async function executeAgentTool(
  name: string, 
  argsStr: string, 
  projectId: string,
  context?: ToolExecutionContext
): Promise<string> {
  let args: Record<string, unknown>;
  try {
    args = JSON.parse(argsStr);
  } catch (e: unknown) {
    return `Error: Failed to parse tool arguments: ${e instanceof Error ? e.message : String(e)}`;
  }

  try {
    switch (name) {
      case 'list_directory': {
        const path = typeof args.path === 'string' ? args.path : '/';
        const pathValidation = validateProjectPath(path);
        if (!pathValidation.valid) {
          return pathValidation.error!;
        }

        const files = await listFiles(projectId);
        
        const prefix = path.endsWith('/') ? path : `${path}/`;
        const prefixLen = prefix === '/' ? 1 : prefix.length;
        
        const children = new Set<string>();
        
        for (const f of files) {
          if (f.path.startsWith(prefix) || prefix === '/') {
            const relPath = prefix === '/' ? f.path.slice(1) : f.path.slice(prefixLen);
            if (relPath.includes('/')) {
              children.add(relPath.split('/')[0] + '/');
            } else if (relPath.length > 0) {
              children.add(relPath);
            }
          }
        }
        
        if (children.size === 0) {
          return `Directory is empty or does not exist.`;
        }
        
        return Array.from(children).sort().join('\n');
      }
      
      case 'read_file': {
        const path = typeof args.path === 'string' ? args.path : '';
        if (!path) return `Error: Missing path parameter.`;
        const pathValidation = validateProjectPath(path);
        if (!pathValidation.valid) {
          return pathValidation.error!;
        }
        
        const files = await listFiles(projectId);
        const file = files.find(f => f.path === path);
        
        if (!file) {
          return `Error: File not found: ${path}`;
        }
        return file.content;
      }
      
      case 'write_file': {
        const path = typeof args.path === 'string' ? args.path : '';
        const type = (args.type as 'create' | 'replace' | 'delete') || 'replace';
        const oldContent = typeof args.oldContent === 'string' ? args.oldContent : undefined;
        const newContent = typeof args.newContent === 'string' ? args.newContent : '';
        const rationale = typeof args.rationale === 'string' ? args.rationale : undefined;
        
        const pathValidation = validateProjectPath(path);
        if (!pathValidation.valid) {
          return pathValidation.error!;
        }
        
        let resolvedOldContent = oldContent;
        if (!resolvedOldContent && type === 'delete') {
          const files = await listFiles(projectId);
          const existing = files.find(f => f.path === path);
          if (existing) {
            resolvedOldContent = existing.content;
          }
        }

        useAppStore.getState().addPendingPatch({ 
          path, 
          type, 
          oldContent: resolvedOldContent, 
          newContent, 
          rationale,
          model: context?.model,
          provider: context?.provider,
          messageId: context?.messageId
        });
        
        return `Successfully queued patch for ${path}. (Note: This is a pending patch and requires user review before taking effect in VFS).`;
      }
      
      case 'search_code': {
        const query = typeof args.query === 'string' ? args.query : '';
        if (!query) return `Error: Missing query parameter.`;
        
        const files = await listFiles(projectId);
        const results: string[] = [];
        
        for (const f of files) {
          if (f.content.includes(query)) {
            const lines = f.content.split('\n');
            for (let i = 0; i < lines.length; i++) {
              if (lines[i].includes(query)) {
                results.push(`${f.path}:${i + 1}: ${lines[i].trim()}`);
              }
            }
          }
        }
        
        if (results.length === 0) {
          return `No matches found for "${query}".`;
        }
        
        const maxResults = 100;
        const out = results.slice(0, maxResults).join('\n');
        return results.length > maxResults 
          ? out + `\n...and ${results.length - maxResults} more matches.`
          : out;
      }
      
      case 'run_tests': {
        const files = await listFiles(projectId);
        return await runProjectTests(files);
      }

      default:
        return `Error: Unknown tool "${name}"`;
    }
  } catch (err: unknown) {
    return `Error executing tool ${name}: ${err instanceof Error ? err.message : String(err)}`;
  }
}