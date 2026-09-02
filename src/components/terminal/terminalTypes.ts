import type { FileItem } from '../../db';

export interface TerminalOutputItem {
  id: string;
  type: 'cmd' | 'stdout' | 'stderr' | 'info' | 'success' | 'system' | 'custom';
  text: string;
  cwd?: string;
  timestamp: number;
  interactiveFiles?: Array<{ path: string; id?: string }>;
}

export const ALLOWED_COMMANDS = new Set([
  'help',
  'capabilities',
  'clear',
  'cls',
  'pwd',
  'cd',
  'ls',
  'cat',
  'head',
  'tail',
  'echo',
  'touch',
  'mkdir',
  'rm',
  'cp',
  'mv',
  'grep',
  'find',
  'wc',
  'stat',
  'tree',
  'open',
  'code',
  'edit',
  'bisect',
  'npm',
  'test',
  'vitest',
  'build',
  'pkg',
  'vendor',
  'lockfile',
  'lock',
  'node',
  'eval',
  'run',
  'git',
  'env',
  'export',
  'date',
  'whoami',
  'uname',
  'uptime',
  'theme',
  'history',
  'reset'
]);

export const COMMAND_LIST = Array.from(ALLOWED_COMMANDS);

export function normalizePath(path: string): string {
  if (!path.startsWith('/')) path = '/' + path;
  const segments = path.split('/').filter(Boolean);
  const stack: string[] = [];
  for (const seg of segments) {
    if (seg === '.') continue;
    if (seg === '..') {
      stack.pop();
    } else {
      stack.push(seg);
    }
  }
  return '/' + stack.join('/');
}

export function resolvePath(cwd: string, target: string): string {
  if (!target || target === '~' || target === '/') return '/';
  if (target.startsWith('/')) return normalizePath(target);
  return normalizePath(cwd + (cwd.endsWith('/') ? '' : '/') + target);
}

export function extractRedirection(input: string): { commandStr: string; redirectMode: 'write' | 'append' | null; redirectFile: string } {
  let inQuotes = false;
  let quoteChar = '';
  let redirectIndex = -1;
  let redirectMode: 'write' | 'append' | null = null;
  let opLength = 0;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if ((ch === '"' || ch === "'") && (!inQuotes || quoteChar === ch)) {
      if (inQuotes) {
        inQuotes = false;
        quoteChar = '';
      } else {
        inQuotes = true;
        quoteChar = ch;
      }
    } else if (!inQuotes) {
      if (input.slice(i, i + 2) === '>>') {
        redirectIndex = i;
        redirectMode = 'append';
        opLength = 2;
        break;
      } else if (ch === '>') {
        redirectIndex = i;
        redirectMode = 'write';
        opLength = 1;
        break;
      }
    }
  }

  if (redirectIndex !== -1 && redirectMode) {
    const cmdPart = input.slice(0, redirectIndex).trim();
    const targetPart = input.slice(redirectIndex + opLength).trim();
    return {
      commandStr: cmdPart,
      redirectMode,
      redirectFile: targetPart
    };
  }

  return {
    commandStr: input,
    redirectMode: null,
    redirectFile: ''
  };
}

export function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let inQuotes = false;
  let quoteChar = '';

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if ((ch === '"' || ch === "'") && (!inQuotes || quoteChar === ch)) {
      if (inQuotes) {
        inQuotes = false;
        quoteChar = '';
      } else {
        inQuotes = true;
        quoteChar = ch;
      }
    } else if (/\s/.test(ch) && !inQuotes) {
      if (current.length > 0) {
        tokens.push(current);
        current = '';
      }
    } else {
      current += ch;
    }
  }
  if (current.length > 0) {
    tokens.push(current);
  }
  return tokens;
}

export function getCommandManual(cmd: string): string {
  switch (cmd) {
    case 'capabilities':
      return `Usage: capabilities
Displays an honest, transparent breakdown of what is real (VFS files, isolated worker JS execution, WebAssembly ESBuild) vs. what is simulated in this browser environment.`;
    case 'grep':
      return `Usage: grep [-i] [-n] [-v] [-c] <pattern> [file]
Options:
  -i  Case-insensitive search
  -n  Print line number with output lines
  -v  Invert match (select non-matching lines)
  -c  Only print a count of matching lines`;
    case 'ls':
      return `Usage: ls [-l] [-a] [dir]
Options:
  -l  Use long listing format (permissions, size, date)
  -a  Include hidden/dot files (. and ..)`;
    case 'tree':
      return `Usage: tree [-L level] [dir]
Options:
  -L  Max display depth of the directory tree`;
    case 'npm':
      return `Usage: npm <test|run build|list|vendor|update-lock>
Commands:
  test               Execute test suites with in-browser Vitest runner
  run build          Compile project bundle with WebAssembly ESBuild
  list | ls          Show package.json dependency tree
  vendor <pkg>       Vendor dependency locally into /vendor/<pkg>.js (0 network calls)
  update-lock [pkg]  Accept upstream updates and refresh lockfile integrity hash`;
    case 'vendor':
      return `Usage: vendor <pkg>
Downloads and verifies dependency bytes, saving to /vendor/<pkg>.js and updating /.laide/lockfile.json for offline bundling with 0 network calls.`;
    case 'lockfile':
      return `Usage: lockfile [update [pkg]]
Inspects or updates dependency integrity SHA-256 hashes in /.laide/lockfile.json.`;
    default:
      return `Command "${cmd}": Refer to general "help" for syntax and flags.`;
  }
}

export function getDirEntries(files: FileItem[], dirPath: string): { folders: string[]; files: FileItem[] } {
  const targetDir = normalizePath(dirPath);
  const prefix = targetDir === '/' ? '/' : targetDir + '/';
  
  const directFolders = new Set<string>();
  const directFiles: FileItem[] = [];

  for (const f of files) {
    if (!f.path.startsWith(prefix) && !(targetDir === '/' && f.path.startsWith('/'))) {
      continue;
    }
    const relative = targetDir === '/' ? f.path.slice(1) : f.path.slice(prefix.length);
    if (!relative) continue;

    const slashIndex = relative.indexOf('/');
    if (slashIndex === -1) {
      directFiles.push(f);
    } else {
      const folderName = relative.slice(0, slashIndex);
      directFolders.add(folderName);
    }
  }

  return {
    folders: Array.from(directFolders).sort(),
    files: directFiles.sort((a, b) => a.path.localeCompare(b.path))
  };
}

export function dirExists(files: FileItem[], dirPath: string): boolean {
  const normalized = normalizePath(dirPath);
  if (normalized === '/') return true;
  const prefix = normalized + '/';
  return files.some(f => f.path === normalized || f.path.startsWith(prefix));
}

export interface CommandExecutionContext {
  projectId?: string;
  files: FileItem[];
  cwd: string;
  setCwd: (newCwd: string) => void;
  env: Record<string, string>;
  setEnv: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  cmdHistory: string[];
  setCmdHistory: React.Dispatch<React.SetStateAction<string[]>>;
  addOutput: (type: TerminalOutputItem['type'], text: string, extra?: Partial<TerminalOutputItem>) => void;
  setHistory: React.Dispatch<React.SetStateAction<TerminalOutputItem[]>>;
  setIsRunning: (running: boolean) => void;
  dirExists: (dirPath: string) => boolean;
  getDirEntries: (dirPath: string) => { folders: string[]; files: FileItem[] };
  onFilesChanged?: () => void;
  onOpenBisect?: (testName?: string) => void;
  setActiveFileId: (id: string | null) => void;
  theme: string;
  toggleTheme: () => void;
}
