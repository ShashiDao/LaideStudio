import { listFiles } from '../fs/vfs';
import type { LLMTool } from '../llm/llmAdapter';
import { runProjectTests } from '../bundler/testRunner';
import { verifyBuildFromOverlay } from '../bundler/buildRunner';
import { type WorkspaceOverlay, AgentWorkspaceOverlay } from './workspace/overlay';

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
  },
  {
    name: 'build_project',
    description: 'Compiles and bundles the candidate project using esbuild to verify that there are no syntax, module resolution, or bundling errors.',
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
  overlay?: WorkspaceOverlay;
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

        const overlay = context?.overlay;
        const filePaths = overlay 
          ? await overlay.list('/') 
          : (await listFiles(projectId)).map(f => f.path);
        
        const prefix = path.endsWith('/') ? path : `${path}/`;
        const prefixLen = prefix === '/' ? 1 : prefix.length;
        
        const children = new Set<string>();
        
        for (const filePath of filePaths) {
          if (filePath.startsWith(prefix) || prefix === '/') {
            const relPath = prefix === '/' ? filePath.slice(1) : filePath.slice(prefixLen);
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
        
        const overlay = context?.overlay;
        if (overlay) {
          const content = await overlay.read(path);
          if (content === null) {
            return `Error: File not found: ${path}`;
          }
          return content;
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
        const type = (args.type as 'create' | 'replace' | 'append' | 'delete') || 'replace';
        const newContent = typeof args.newContent === 'string' ? args.newContent : '';
        const rationale = typeof args.rationale === 'string' && args.rationale.length > 0
          ? args.rationale
          : 'No rationale provided.';
        
        const pathValidation = validateProjectPath(path);
        if (!pathValidation.valid) {
          return pathValidation.error!;
        }

        const overlay = context?.overlay;
        if (!overlay) {
          console.warn(
            `[executeAgentTool] Warning: write_file invoked without a persistent WorkspaceOverlay in context for project "${projectId}". ` +
            `A transient overlay was instantiated; edits will NOT accumulate across tool calls unless a persistent run-level WorkspaceOverlay is provided.`
          );
        }
        const activeOverlay = overlay ?? new AgentWorkspaceOverlay(projectId, await listFiles(projectId));
        if (context && !context.overlay) {
          context.overlay = activeOverlay;
        }

        const metadata = {
          model: context?.model,
          provider: context?.provider,
          messageId: context?.messageId
        };

        if (type === 'delete') {
          await activeOverlay.delete(path, rationale);
          return `Successfully queued patch for ${path} in workspace overlay.`;
        }

        if (type === 'append') {
          const currentContent = await activeOverlay.read(path);
          const accumulated = currentContent !== null
            ? (currentContent.length === 0 || currentContent.endsWith('\n') ? currentContent + newContent : `${currentContent}\n${newContent}`)
            : newContent;
          await activeOverlay.write(path, accumulated, rationale, metadata);
          return `Successfully queued patch for ${path} in workspace overlay.`;
        }

        // 'create' or 'replace'
        await activeOverlay.write(path, newContent, rationale, metadata);
        return `Successfully queued patch for ${path} in workspace overlay.`;
      }
      
      case 'search_code': {
        const query = typeof args.query === 'string' ? args.query : '';
        if (!query) return `Error: Missing query parameter.`;
        
        const overlay = context?.overlay;
        const files: Array<{ path: string; content: string }> = overlay
          ? await overlay.materialize()
          : await listFiles(projectId);
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
      
      case 'run_tests':
      case 'verify_tests': {
        const overlay = context?.overlay;
        if (!overlay) {
          return `Error: Test verification failed. Missing active WorkspaceOverlay in execution context. Agent verification must run against a candidate overlay.`;
        }
        const files = await overlay.materialize();
        return await runProjectTests(files);
      }

      case 'build_project':
      case 'verify_build': {
        const overlay = context?.overlay;
        if (!overlay) {
          return `Error: Build verification failed. Missing active WorkspaceOverlay in execution context. Agent verification must run against a candidate overlay.`;
        }
        const buildResult = await verifyBuildFromOverlay(overlay);
        return buildResult.output;
      }

      default:
        return `Error: Unknown tool "${name}"`;
    }
  } catch (err: unknown) {
    return `Error executing tool ${name}: ${err instanceof Error ? err.message : String(err)}`;
  }
}