import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { 
  Terminal, 
  Trash2, 
  Copy, 
  Check, 
  CornerDownLeft, 
  RotateCcw, 
  Play, 
  CheckCircle2, 
  XCircle, 
  Folder, 
  FileText, 
  HelpCircle, 
  Sparkles,
  Loader2
} from 'lucide-react';
import type { FileItem } from '../db';
import { useAppStore } from '../store';
import { 
  createFile, 
  writeFile, 
  deleteFile, 
  deleteFolder, 
  renameFile 
} from '../services/fs/vfs';
import { runProjectTests } from '../services/bundler/testRunner';
import { bundle } from '../services/bundler/bundler';
import { detectBundledProject } from '../services/bundler/entryDetection';

export interface TerminalOutputItem {
  id: string;
  type: 'cmd' | 'stdout' | 'stderr' | 'info' | 'success' | 'system' | 'custom';
  text: string;
  cwd?: string;
  timestamp: number;
  interactiveFiles?: Array<{ path: string; id?: string }>;
}

const COMMAND_LIST = [
  'help',
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
  'npm test',
  'test',
  'vitest',
  'npm run build',
  'build',
  'npm list',
  'npm ls',
  'pkg',
  'node',
  'eval',
  'run',
  'git status',
  'git diff',
  'env',
  'export',
  'date',
  'whoami',
  'uname',
  'uptime',
  'theme',
  'history',
  'reset'
];

function normalizePath(path: string): string {
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

function resolvePath(cwd: string, target: string): string {
  if (!target || target === '~' || target === '/') return '/';
  if (target.startsWith('/')) return normalizePath(target);
  return normalizePath(cwd + (cwd.endsWith('/') ? '' : '/') + target);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function tokenize(input: string): string[] {
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
    } else if (ch === ' ' && !inQuotes) {
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

export function TerminalPanel({
  projectId,
  files = [],
  onFilesChanged
}: {
  projectId?: string;
  files: FileItem[];
  onFilesChanged?: () => void;
}) {
  const { setActiveFileId, addToast, theme, toggleTheme } = useAppStore();
  const [cwd, setCwd] = useState<string>('/');
  const [input, setInput] = useState<string>('');
  const [history, setHistory] = useState<TerminalOutputItem[]>(() => [
    {
      id: 'welcome-1',
      type: 'system',
      text: `LAIDE Sandbox Terminal v1.0.0 [Ready]
Type "help" for a list of available commands or click quick actions below.`,
      timestamp: Date.now()
    }
  ]);
  const [cmdHistory, setCmdHistory] = useState<string[]>([]);
  const [historyPointer, setHistoryPointer] = useState<number>(-1);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [env, setEnv] = useState<Record<string, string>>({
    NODE_ENV: 'development',
    USER: 'developer',
    SHELL: '/bin/sh',
    PWD: '/'
  });
  const [copied, setCopied] = useState<boolean>(false);

  const terminalEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [history, scrollToBottom]);

  // Keep PWD in sync with cwd
  useEffect(() => {
    setEnv(prev => ({ ...prev, PWD: cwd }));
  }, [cwd]);

  const addOutput = useCallback((
    type: TerminalOutputItem['type'], 
    text: string, 
    extra?: Partial<TerminalOutputItem>
  ) => {
    const item: TerminalOutputItem = {
      id: 'out-' + Math.random().toString(36).substring(2, 9),
      type,
      text,
      timestamp: Date.now(),
      ...extra
    };
    setHistory(prev => [...prev, item]);
  }, []);

  // Directory listing helper for current VFS state
  const getDirEntries = useCallback((dirPath: string) => {
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
  }, [files]);

  // Check if directory exists in VFS
  const dirExists = useCallback((dirPath: string): boolean => {
    const normalized = normalizePath(dirPath);
    if (normalized === '/') return true;
    const prefix = normalized + '/';
    return files.some(f => f.path === normalized || f.path.startsWith(prefix));
  }, [files]);

  // Autocomplete support
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (cmdHistory.length === 0) return;
      const nextIndex = historyPointer === -1 
        ? cmdHistory.length - 1 
        : Math.max(0, historyPointer - 1);
      setHistoryPointer(nextIndex);
      setInput(cmdHistory[nextIndex] || '');
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyPointer === -1) return;
      const nextIndex = historyPointer + 1;
      if (nextIndex >= cmdHistory.length) {
        setHistoryPointer(-1);
        setInput('');
      } else {
        setHistoryPointer(nextIndex);
        setInput(cmdHistory[nextIndex]);
      }
    } else if (e.key === 'Tab') {
      e.preventDefault();
      handleAutocomplete();
    } else if (e.key === 'l' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      setHistory([]);
    }
  };

  const handleAutocomplete = () => {
    const trimmed = input.trimStart();
    if (!trimmed) return;

    const parts = trimmed.split(' ');
    if (parts.length <= 1) {
      // Autocomplete command
      const prefix = parts[0].toLowerCase();
      const matches = COMMAND_LIST.filter(c => c.startsWith(prefix));
      if (matches.length === 1) {
        setInput(matches[0] + ' ');
      } else if (matches.length > 1) {
        addOutput('info', matches.join('   '));
      }
    } else {
      // Autocomplete file or folder in current cwd
      const lastToken = parts[parts.length - 1];
      const resolved = resolvePath(cwd, lastToken);
      const parentDir = resolved.includes('/') ? resolved.substring(0, resolved.lastIndexOf('/')) || '/' : cwd;
      const filePrefix = resolved.substring(resolved.lastIndexOf('/') + 1);

      const entries = getDirEntries(parentDir);
      const candidates = [
        ...entries.folders.map(f => f + '/'),
        ...entries.files.map(f => f.path.split('/').pop() || '')
      ].filter(item => item.toLowerCase().startsWith(filePrefix.toLowerCase()));

      if (candidates.length === 1) {
        parts[parts.length - 1] = (lastToken.includes('/') ? lastToken.substring(0, lastToken.lastIndexOf('/') + 1) : '') + candidates[0];
        setInput(parts.join(' '));
      } else if (candidates.length > 1) {
        addOutput('info', candidates.join('   '));
      }
    }
  };

  const executeCommand = async (rawCommand: string) => {
    const trimmed = rawCommand.trim();
    if (!trimmed) return;

    // Record in history
    setCmdHistory(prev => [...prev, trimmed]);
    setHistoryPointer(-1);
    addOutput('cmd', trimmed, { cwd });
    setInput('');

    // Check for output redirection (> or >>)
    let commandStr = trimmed;
    let redirectMode: 'write' | 'append' | null = null;
    let redirectFile = '';

    if (commandStr.includes('>>')) {
      const parts = commandStr.split('>>');
      commandStr = parts[0].trim();
      redirectMode = 'append';
      redirectFile = parts[1].trim();
    } else if (commandStr.includes('>')) {
      const parts = commandStr.split('>');
      commandStr = parts[0].trim();
      redirectMode = 'write';
      redirectFile = parts[1].trim();
    }

    // Tokenize
    let tokens = tokenize(commandStr);
    if (tokens.length === 0) return;

    // Variable expansion ($VAR)
    tokens = tokens.map(t => {
      if (t.startsWith('$')) {
        const varName = t.slice(1);
        return env[varName] !== undefined ? env[varName] : '';
      }
      return t;
    });

    const command = tokens[0].toLowerCase();
    const args = tokens.slice(1);

    setIsRunning(true);

    try {
      let outputText = '';
      let outputType: TerminalOutputItem['type'] = 'stdout';

      switch (command) {
        case 'help': {
          if (args[0]) {
            const topic = args[0].toLowerCase();
            outputText = getCommandManual(topic);
          } else {
            outputText = `LAIDE Virtual Shell — Available Commands:

📁 FILE SYSTEM
  ls [-l|-a|-h] [dir]    List directory contents
  cd [dir]               Change current working directory
  pwd                    Print current working directory
  cat [-n] <file...>     Display content of files
  head [-n N] <file>     Print first N lines (default 10)
  tail [-n N] <file>     Print last N lines (default 10)
  touch <file...>        Create empty file(s) or update timestamp
  mkdir [-p] <dir...>    Create directory folder
  rm [-r|-rf] <path...>  Remove file(s) or folder(s)
  cp <src> <dest>        Copy a file to destination
  mv <src> <dest>        Move / rename file or folder
  grep [-i|-n|-v] <pat>  Search text across files
  find [dir] [-name pat] Search files and folders recursively
  wc [-l|-w|-c] [files]  Count lines, words, and characters
  stat <file>            Display detailed file statistics
  tree [dir] [-L level]  Print tree diagram of files

⚡ DEV & BUILD TOOLS
  npm test | test        Run test suite with Vitest shim
  npm run build | build  Run ESBuild bundler & compute stats
  npm ls | pkg           List package.json dependencies
  node -e "<code>"       Execute JavaScript safely in sandbox
  eval | run "<code>"    Evaluate JS code snippet
  code | open <file>     Open file directly in Code Editor
  git status             Show project VCS status
  git diff [file]        Inspect file changes

🛠 UTILITIES & SHELL
  echo [text] [> file]   Print text or redirect to file
  env                    Display environment variables
  export KEY=VAL         Set environment variable
  date                   Print current date and time
  whoami                 Print active user
  uname [-a]             Print sandbox system kernel details
  uptime                 Print session duration
  theme [oled|paper]     Toggle or set interface theme
  history [-c]           Show command history
  clear | cls            Clear terminal screen
  reset                  Reset shell state and environment

Tip: Use Tab for autocomplete, ↑/↓ for command history, Ctrl+L to clear.`;
          }
          break;
        }

        case 'clear':
        case 'cls': {
          setHistory([]);
          setIsRunning(false);
          return;
        }

        case 'pwd': {
          outputText = cwd;
          break;
        }

        case 'cd': {
          const target = args[0] || '/';
          if (target === '~' || target === '/') {
            setCwd('/');
            outputText = '';
          } else if (target === '..') {
            const parts = cwd.split('/').filter(Boolean);
            parts.pop();
            const newCwd = '/' + parts.join('/');
            setCwd(newCwd);
            outputText = '';
          } else {
            const resolved = resolvePath(cwd, target);
            if (dirExists(resolved)) {
              setCwd(resolved);
              outputText = '';
            } else {
              outputType = 'stderr';
              outputText = `cd: no such file or directory: ${target}`;
            }
          }
          break;
        }

        case 'ls': {
          const isLong = args.some(a => a.includes('l'));
          const isAll = args.some(a => a.includes('a'));
          const targetDir = args.find(a => !a.startsWith('-')) || cwd;
          const resolved = resolvePath(cwd, targetDir);

          if (!dirExists(resolved)) {
            outputType = 'stderr';
            outputText = `ls: cannot access '${targetDir}': No such file or directory`;
            break;
          }

          const { folders, files: dirFiles } = getDirEntries(resolved);
          
          if (isLong) {
            const lines: string[] = [];
            const totalCount = folders.length + dirFiles.length + (isAll ? 2 : 0);
            lines.push(`total ${totalCount}`);
            if (isAll) {
              lines.push(`drwxr-xr-x  1 ${env.USER || 'dev'} dev      0 Aug 22 18:00 .`);
              lines.push(`drwxr-xr-x  1 ${env.USER || 'dev'} dev      0 Aug 22 18:00 ..`);
            }
            for (const f of folders) {
              lines.push(`drwxr-xr-x  1 ${env.USER || 'dev'} dev      0 Aug 22 18:00 ${f}/`);
            }
            for (const f of dirFiles) {
              const fileName = f.path.split('/').pop() || f.path;
              const size = formatBytes(new Blob([f.content]).size).padStart(8, ' ');
              lines.push(`-rw-r--r--  1 ${env.USER || 'dev'} dev ${size} Aug 22 18:00 ${fileName}`);
            }
            outputText = lines.join('\n');
          } else {
            const allItems: string[] = [];
            if (isAll) {
              allItems.push('.', '..');
            }
            folders.forEach(f => allItems.push(f + '/'));
            dirFiles.forEach(f => allItems.push(f.path.split('/').pop() || f.path));
            outputText = allItems.join('   ');
          }
          break;
        }

        case 'cat': {
          if (args.length === 0) {
            outputType = 'stderr';
            outputText = 'cat: missing file operand';
            break;
          }

          const showLineNumbers = args.includes('-n');
          const fileArgs = args.filter(a => a !== '-n');

          const contents: string[] = [];
          for (const rawFile of fileArgs) {
            const resolved = resolvePath(cwd, rawFile);
            const found = files.find(f => f.path === resolved);
            if (!found) {
              contents.push(`cat: ${rawFile}: No such file or directory`);
            } else if (showLineNumbers) {
              const lines = found.content.split('\n');
              const numbered = lines.map((l, i) => `${(i + 1).toString().padStart(4, ' ')} | ${l}`).join('\n');
              contents.push(numbered);
            } else {
              contents.push(found.content);
            }
          }
          outputText = contents.join('\n');
          break;
        }

        case 'head': {
          let lineCount = 10;
          let fileArg = '';
          for (let i = 0; i < args.length; i++) {
            if (args[i] === '-n' && args[i + 1]) {
              lineCount = parseInt(args[i + 1], 10) || 10;
              i++;
            } else if (!args[i].startsWith('-')) {
              fileArg = args[i];
            }
          }

          if (!fileArg) {
            outputType = 'stderr';
            outputText = 'head: missing file operand';
            break;
          }

          const resolved = resolvePath(cwd, fileArg);
          const found = files.find(f => f.path === resolved);
          if (!found) {
            outputType = 'stderr';
            outputText = `head: cannot open '${fileArg}': No such file or directory`;
          } else {
            const lines = found.content.split('\n');
            outputText = lines.slice(0, lineCount).join('\n');
          }
          break;
        }

        case 'tail': {
          let lineCount = 10;
          let fileArg = '';
          for (let i = 0; i < args.length; i++) {
            if (args[i] === '-n' && args[i + 1]) {
              lineCount = parseInt(args[i + 1], 10) || 10;
              i++;
            } else if (!args[i].startsWith('-')) {
              fileArg = args[i];
            }
          }

          if (!fileArg) {
            outputType = 'stderr';
            outputText = 'tail: missing file operand';
            break;
          }

          const resolved = resolvePath(cwd, fileArg);
          const found = files.find(f => f.path === resolved);
          if (!found) {
            outputType = 'stderr';
            outputText = `tail: cannot open '${fileArg}': No such file or directory`;
          } else {
            const lines = found.content.split('\n');
            outputText = lines.slice(-lineCount).join('\n');
          }
          break;
        }

        case 'touch': {
          if (args.length === 0) {
            outputType = 'stderr';
            outputText = 'touch: missing file operand';
            break;
          }
          if (!projectId) {
            outputType = 'stderr';
            outputText = 'touch: no active project open';
            break;
          }

          for (const rawFile of args) {
            const resolved = resolvePath(cwd, rawFile);
            const existing = files.find(f => f.path === resolved);
            if (existing) {
              await writeFile(existing.id, existing.content);
            } else {
              await createFile(projectId, resolved, '');
            }
          }
          onFilesChanged?.();
          outputText = '';
          break;
        }

        case 'mkdir': {
          if (args.length === 0) {
            outputType = 'stderr';
            outputText = 'mkdir: missing operand';
            break;
          }
          if (!projectId) {
            outputType = 'stderr';
            outputText = 'mkdir: no active project open';
            break;
          }

          const targetDirs = args.filter(a => a !== '-p');
          for (const dir of targetDirs) {
            const resolved = resolvePath(cwd, dir);
            const keepPath = (resolved.endsWith('/') ? resolved : resolved + '/') + '.gitkeep';
            if (!files.some(f => f.path === keepPath)) {
              await createFile(projectId, keepPath, '');
            }
          }
          onFilesChanged?.();
          outputText = '';
          break;
        }

        case 'rm': {
          if (args.length === 0) {
            outputType = 'stderr';
            outputText = 'rm: missing operand';
            break;
          }
          if (!projectId) {
            outputType = 'stderr';
            outputText = 'rm: no active project open';
            break;
          }

          const isRecursive = args.some(a => a === '-r' || a === '-rf' || a === '-fr');
          const targetPaths = args.filter(a => !a.startsWith('-'));

          for (const target of targetPaths) {
            const resolved = resolvePath(cwd, target);
            const fileMatch = files.find(f => f.path === resolved);
            if (fileMatch) {
              await deleteFile(fileMatch.id);
            } else if (isRecursive && dirExists(resolved)) {
              await deleteFolder(projectId, resolved);
            } else {
              outputType = 'stderr';
              outputText += `rm: cannot remove '${target}': No such file or directory\n`;
            }
          }
          onFilesChanged?.();
          outputText = outputText.trim();
          break;
        }

        case 'cp': {
          if (args.length < 2) {
            outputType = 'stderr';
            outputText = 'cp: missing destination file operand after source';
            break;
          }
          if (!projectId) {
            outputType = 'stderr';
            outputText = 'cp: no active project open';
            break;
          }

          const src = resolvePath(cwd, args[0]);
          const dest = resolvePath(cwd, args[1]);
          const srcFile = files.find(f => f.path === src);
          if (!srcFile) {
            outputType = 'stderr';
            outputText = `cp: cannot stat '${args[0]}': No such file or directory`;
            break;
          }

          const destFile = files.find(f => f.path === dest);
          if (destFile) {
            await writeFile(destFile.id, srcFile.content);
          } else {
            await createFile(projectId, dest, srcFile.content);
          }
          onFilesChanged?.();
          outputText = '';
          break;
        }

        case 'mv': {
          if (args.length < 2) {
            outputType = 'stderr';
            outputText = 'mv: missing destination file operand after source';
            break;
          }
          if (!projectId) {
            outputType = 'stderr';
            outputText = 'mv: no active project open';
            break;
          }

          const src = resolvePath(cwd, args[0]);
          const dest = resolvePath(cwd, args[1]);
          const srcFile = files.find(f => f.path === src);
          if (!srcFile) {
            outputType = 'stderr';
            outputText = `mv: cannot stat '${args[0]}': No such file or directory`;
            break;
          }

          await renameFile(srcFile.id, dest);
          onFilesChanged?.();
          outputText = '';
          break;
        }

        case 'grep': {
          let caseInsensitive = false;
          let showLineNum = false;
          let invert = false;
          let countOnly = false;
          const queryTokens: string[] = [];

          for (const arg of args) {
            if (arg === '-i') caseInsensitive = true;
            else if (arg === '-n') showLineNum = true;
            else if (arg === '-v') invert = true;
            else if (arg === '-c') countOnly = true;
            else queryTokens.push(arg);
          }

          if (queryTokens.length === 0) {
            outputType = 'stderr';
            outputText = 'grep: missing pattern';
            break;
          }

          const pattern = queryTokens[0];
          const targetFile = queryTokens[1];
          const regex = new RegExp(
            pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 
            caseInsensitive ? 'i' : ''
          );

          const searchTargets = targetFile 
            ? files.filter(f => f.path === resolvePath(cwd, targetFile))
            : files;

          if (targetFile && searchTargets.length === 0) {
            outputType = 'stderr';
            outputText = `grep: ${targetFile}: No such file or directory`;
            break;
          }

          const results: string[] = [];
          let matchCount = 0;

          for (const file of searchTargets) {
            const lines = file.content.split('\n');
            lines.forEach((line, idx) => {
              const matched = regex.test(line);
              if ((matched && !invert) || (!matched && invert)) {
                matchCount++;
                if (!countOnly) {
                  const prefix = searchTargets.length > 1 ? `${file.path}:` : '';
                  const linePrefix = showLineNum ? `${idx + 1}:` : '';
                  results.push(`${prefix}${linePrefix}${line}`);
                }
              }
            });
          }

          outputText = countOnly ? matchCount.toString() : results.join('\n');
          break;
        }

        case 'find': {
          let targetDir = cwd;
          let namePattern = '';

          for (let i = 0; i < args.length; i++) {
            if (args[i] === '-name' && args[i + 1]) {
              namePattern = args[i + 1];
              i++;
            } else if (!args[i].startsWith('-')) {
              targetDir = args[i];
            }
          }

          const resolved = resolvePath(cwd, targetDir);
          const matchedFiles = files.filter(f => {
            if (resolved !== '/' && !f.path.startsWith(resolved + '/') && f.path !== resolved) {
              return false;
            }
            if (namePattern) {
              const fileName = f.path.split('/').pop() || '';
              return fileName.includes(namePattern.replace(/\*/g, ''));
            }
            return true;
          });

          outputText = matchedFiles.map(f => f.path).join('\n');
          break;
        }

        case 'wc': {
          const flags = args.filter(a => a.startsWith('-'));
          const fileArgs = args.filter(a => !a.startsWith('-'));
          const countLines = flags.length === 0 || flags.some(f => f.includes('l'));
          const countWords = flags.length === 0 || flags.some(f => f.includes('w'));
          const countChars = flags.length === 0 || flags.some(f => f.includes('c'));

          const targetFiles = fileArgs.length > 0 
            ? files.filter(f => fileArgs.some(a => resolvePath(cwd, a) === f.path))
            : files;

          if (fileArgs.length > 0 && targetFiles.length === 0) {
            outputType = 'stderr';
            outputText = 'wc: no matching files found';
            break;
          }

          const rows: string[] = [];
          let totalL = 0, totalW = 0, totalC = 0;

          for (const f of targetFiles) {
            const l = f.content ? f.content.split('\n').length : 0;
            const w = f.content.trim() ? f.content.trim().split(/\s+/).length : 0;
            const c = new Blob([f.content]).size;
            totalL += l; totalW += w; totalC += c;

            const parts: string[] = [];
            if (countLines) parts.push(l.toString().padStart(6, ' '));
            if (countWords) parts.push(w.toString().padStart(6, ' '));
            if (countChars) parts.push(c.toString().padStart(8, ' '));
            parts.push(` ${f.path}`);
            rows.push(parts.join(''));
          }

          if (targetFiles.length > 1) {
            const totalParts: string[] = [];
            if (countLines) totalParts.push(totalL.toString().padStart(6, ' '));
            if (countWords) totalParts.push(totalW.toString().padStart(6, ' '));
            if (countChars) totalParts.push(totalC.toString().padStart(8, ' '));
            totalParts.push(' total');
            rows.push(totalParts.join(''));
          }

          outputText = rows.join('\n');
          break;
        }

        case 'stat': {
          if (args.length === 0) {
            outputType = 'stderr';
            outputText = 'stat: missing operand';
            break;
          }

          const resolved = resolvePath(cwd, args[0]);
          const found = files.find(f => f.path === resolved);
          if (!found) {
            outputType = 'stderr';
            outputText = `stat: cannot stat '${args[0]}': No such file or directory`;
          } else {
            const size = new Blob([found.content]).size;
            const lines = found.content.split('\n').length;
            const words = found.content.trim() ? found.content.trim().split(/\s+/).length : 0;
            const modified = new Date(found.updatedAt || Date.now()).toISOString();

            outputText = `  File: ${found.path}
  Size: ${size} bytes (${formatBytes(size)})  Lines: ${lines}  Words: ${words}
  Type: Regular File
 Inode: ${found.id}
Modify: ${modified}
Access: 0644/-rw-r--r--`;
          }
          break;
        }

        case 'tree': {
          const maxLevel = args.includes('-L') ? parseInt(args[args.indexOf('-L') + 1], 10) || 10 : 10;
          const targetDir = args.find(a => !a.startsWith('-') && !Number.isInteger(Number(a))) || cwd;
          const resolved = resolvePath(cwd, targetDir);

          if (!dirExists(resolved)) {
            outputType = 'stderr';
            outputText = `tree: '${targetDir}': No such file or directory`;
            break;
          }

          let dirCount = 0;
          let fileCount = 0;

          const renderTree = (currentPath: string, prefix = '', level = 0): string[] => {
            if (level >= maxLevel) return [];
            const { folders, files: dFiles } = getDirEntries(currentPath);
            const total = folders.length + dFiles.length;
            const lines: string[] = [];

            let index = 0;
            for (const f of folders) {
              index++;
              dirCount++;
              const isLast = index === total;
              const connector = isLast ? '└── ' : '├── ';
              lines.push(`${prefix}${connector}${f}/`);
              const nextPrefix = prefix + (isLast ? '    ' : '│   ');
              const nextDir = currentPath === '/' ? `/${f}` : `${currentPath}/${f}`;
              lines.push(...renderTree(nextDir, nextPrefix, level + 1));
            }

            for (const file of dFiles) {
              index++;
              fileCount++;
              const isLast = index === total;
              const connector = isLast ? '└── ' : '├── ';
              const name = file.path.split('/').pop() || file.path;
              lines.push(`${prefix}${connector}${name}`);
            }

            return lines;
          };

          const treeLines = [resolved, ...renderTree(resolved)];
          treeLines.push(`\n${dirCount} directories, ${fileCount} files`);
          outputText = treeLines.join('\n');
          break;
        }

        case 'open':
        case 'code':
        case 'edit': {
          if (args.length === 0) {
            outputType = 'stderr';
            outputText = `${command}: missing file operand`;
            break;
          }

          const resolved = resolvePath(cwd, args[0]);
          const found = files.find(f => f.path === resolved);
          if (!found) {
            outputType = 'stderr';
            outputText = `${command}: file not found: ${args[0]}`;
          } else {
            setActiveFileId(found.id);
            outputType = 'success';
            outputText = `Opened ${found.path} in Code Editor.`;
          }
          break;
        }

        case 'npm':
        case 'test':
        case 'vitest':
        case 'build': {
          const sub = command === 'npm' ? (args[0] || '').toLowerCase() : command;
          
          if (sub === 'test' || sub === 'vitest') {
            addOutput('info', 'Running project tests via sandbox runner...');
            const result = await runProjectTests(files);
            outputText = result;
            outputType = result.includes('Failed: 0') || !result.includes('Failed:') ? 'success' : 'stderr';
          } else if (sub === 'run' && args[1] === 'build' || sub === 'build') {
            addOutput('info', 'Building project with ESBuild WebAssembly bundler...');
            const projectInfo = detectBundledProject(files);
            const entryPoint = projectInfo.entryPoint || '/src/main.tsx';
            
            const start = performance.now();
            try {
              const bundleCode = await bundle(files, entryPoint, (status) => {
                addOutput('info', `  › ${status}`);
              });
              const duration = ((performance.now() - start) / 1000).toFixed(2);
              const bundleBytes = new Blob([bundleCode]).size;
              
              outputText = `✨ Build succeeded in ${duration}s!
  Entry point: ${entryPoint}
  Bundle size: ${formatBytes(bundleBytes)} (${bundleBytes.toLocaleString()} bytes)
  Files bundled: ${files.length}`;
              outputType = 'success';
            } catch (err: any) {
              outputType = 'stderr';
              outputText = `Build failed: ${err.message || String(err)}`;
            }
          } else if (sub === 'ls' || sub === 'list' || sub === 'pkg') {
            const pkgFile = files.find(f => f.path === '/package.json');
            if (!pkgFile) {
              outputType = 'stderr';
              outputText = 'npm ls: package.json not found';
            } else {
              try {
                const pkg = JSON.parse(pkgFile.content);
                const lines = [`${pkg.name || 'laide-project'}@${pkg.version || '1.0.0'}`];
                if (pkg.dependencies && Object.keys(pkg.dependencies).length > 0) {
                  lines.push('├── dependencies:');
                  for (const [k, v] of Object.entries(pkg.dependencies)) {
                    lines.push(`│   ├── ${k}@${v}`);
                  }
                }
                if (pkg.devDependencies && Object.keys(pkg.devDependencies).length > 0) {
                  lines.push('└── devDependencies:');
                  for (const [k, v] of Object.entries(pkg.devDependencies)) {
                    lines.push(`    ├── ${k}@${v}`);
                  }
                }
                outputText = lines.join('\n');
              } catch (e: any) {
                outputType = 'stderr';
                outputText = `npm ls: failed to parse package.json (${e.message})`;
              }
            }
          } else {
            outputType = 'stderr';
            outputText = `npm: unsupported command: "${sub}". Try "npm test", "npm run build", or "npm ls".`;
          }
          break;
        }

        case 'node':
        case 'eval':
        case 'run': {
          let codeToRun = '';
          if (command === 'node') {
            if (args[0] === '-e') {
              codeToRun = commandStr.replace(/^\s*node\s+-e\s+/i, '');
            } else if (args[0]) {
              const target = resolvePath(cwd, args[0]);
              const f = files.find(file => file.path === target);
              if (f) codeToRun = f.content;
              else {
                outputType = 'stderr';
                outputText = `node: cannot find module '${args[0]}'`;
                break;
              }
            } else {
              outputText = 'Welcome to Node.js / JS Sandbox v20.x (Browser WASM)\nType "node -e <code>" or "eval <code>" to run snippets.';
              break;
            }
          } else {
            codeToRun = commandStr.replace(/^\s*(eval|run)\s+/i, '');
          }

          if (!codeToRun.trim()) {
            outputType = 'stderr';
            outputText = `${command}: missing code expression`;
            break;
          }

          const capturedLogs: string[] = [];
          const fakeConsole = {
            log: (...msgs: any[]) => capturedLogs.push(msgs.map(m => typeof m === 'object' ? JSON.stringify(m, null, 2) : String(m)).join(' ')),
            warn: (...msgs: any[]) => capturedLogs.push('[warn] ' + msgs.join(' ')),
            error: (...msgs: any[]) => capturedLogs.push('[error] ' + msgs.join(' ')),
            info: (...msgs: any[]) => capturedLogs.push('[info] ' + msgs.join(' '))
          };

          try {
            const runner = new Function('console', 'env', 'files', `
              "use strict";
              ${codeToRun}
            `);
            const evalResult = runner(fakeConsole, env, files);
            if (evalResult !== undefined) {
              capturedLogs.push(typeof evalResult === 'object' ? JSON.stringify(evalResult, null, 2) : String(evalResult));
            }
            outputText = capturedLogs.join('\n') || '[Process completed with exit code 0]';
          } catch (err: any) {
            outputType = 'stderr';
            outputText = `${capturedLogs.join('\n') ? capturedLogs.join('\n') + '\n' : ''}Error: ${err.message || String(err)}`;
          }
          break;
        }

        case 'git': {
          const gitSub = (args[0] || '').toLowerCase();
          if (gitSub === 'status') {
            const lines = [
              'On branch main',
              'Your branch is up to date with \'origin/main\'.',
              '',
              `Changes tracked: ${files.length} project files`,
              `Last modified: ${files[0]?.path || 'none'}`
            ];
            outputText = lines.join('\n');
          } else if (gitSub === 'diff') {
            const target = args[1] ? resolvePath(cwd, args[1]) : '';
            const f = files.find(file => file.path === target);
            if (target && !f) {
              outputType = 'stderr';
              outputText = `git diff: file not found: ${args[1]}`;
            } else {
              outputText = `diff --git a/${f?.path || 'workspace'} b/${f?.path || 'workspace'}\n--- a/${f?.path || 'workspace'}\n+++ b/${f?.path || 'workspace'}\n@@ -1 +1 @@\n [Local Virtual Workspace State Clean]`;
            }
          } else {
            outputText = `git: '${gitSub}' is simulated. Use "git status" or "git diff".`;
          }
          break;
        }

        case 'echo': {
          outputText = commandStr.replace(/^\s*echo\s*/i, '');
          if ((outputText.startsWith('"') && outputText.endsWith('"')) || (outputText.startsWith("'") && outputText.endsWith("'"))) {
            outputText = outputText.slice(1, -1);
          }
          break;
        }

        case 'env': {
          const lines = Object.entries(env).map(([k, v]) => `${k}=${v}`);
          outputText = lines.join('\n');
          break;
        }

        case 'export': {
          if (args.length === 0) {
            outputText = Object.entries(env).map(([k, v]) => `declare -x ${k}="${v}"`).join('\n');
          } else {
            for (const item of args) {
              const eqIdx = item.indexOf('=');
              if (eqIdx !== -1) {
                const key = item.slice(0, eqIdx);
                const val = item.slice(eqIdx + 1);
                setEnv(prev => ({ ...prev, [key]: val }));
              }
            }
            outputText = '';
          }
          break;
        }

        case 'date': {
          outputText = new Date().toUTCString();
          break;
        }

        case 'whoami': {
          outputText = env.USER || 'developer';
          break;
        }

        case 'uname': {
          if (args.includes('-a')) {
            outputText = 'LAIDE-OS 1.0.0 WebAssembly-Sandbox x86_64 Browser-VFS GNU/Linux';
          } else {
            outputText = 'LAIDE-OS';
          }
          break;
        }

        case 'uptime': {
          const seconds = Math.floor(performance.now() / 1000);
          const mins = Math.floor(seconds / 60);
          const hrs = Math.floor(mins / 60);
          outputText = `up ${hrs} hours, ${mins % 60} mins, ${seconds % 60} secs, 1 user, load average: 0.05, 0.02, 0.00`;
          break;
        }

        case 'theme': {
          if (args[0] === 'oled' || args[0] === 'paper') {
            if (theme !== args[0]) toggleTheme();
            outputText = `Theme set to: ${args[0]}`;
          } else {
            toggleTheme();
            outputText = `Theme switched to: ${theme === 'oled' ? 'paper' : 'oled'}`;
          }
          break;
        }

        case 'history': {
          if (args.includes('-c')) {
            setCmdHistory([]);
            outputText = 'Command history cleared.';
          } else {
            outputText = cmdHistory.map((c, i) => `${(i + 1).toString().padStart(4, ' ')}  ${c}`).join('\n');
          }
          break;
        }

        case 'reset': {
          setCwd('/');
          setEnv({
            NODE_ENV: 'development',
            USER: 'developer',
            SHELL: '/bin/sh',
            PWD: '/'
          });
          const now = Date.now();
          setHistory([
            {
              id: `reset-${now}`,
              type: 'system',
              text: 'Terminal session and environment reset to defaults.',
              timestamp: now
            }
          ]);
          setIsRunning(false);
          return;
        }

        default: {
          outputType = 'stderr';
          outputText = `command not found: "${command}". Type "help" to see available commands.`;
          break;
        }
      }

      // Handle file redirection if outputText exists
      if (redirectFile && projectId) {
        const dest = resolvePath(cwd, redirectFile);
        const existing = files.find(f => f.path === dest);
        if (existing) {
          const newContent = redirectMode === 'append' ? existing.content + '\n' + outputText : outputText;
          await writeFile(existing.id, newContent);
        } else {
          await createFile(projectId, dest, outputText);
        }
        onFilesChanged?.();
        outputText = '';
      }

      if (outputText) {
        addOutput(outputType, outputText);
      }

    } catch (err: any) {
      addOutput('stderr', `Execution error: ${err.message || String(err)}`);
    } finally {
      setIsRunning(false);
    }
  };

  const handleCopyLogs = () => {
    const raw = history.map(h => {
      if (h.type === 'cmd') return `dev@laide:${h.cwd || '~'}$ ${h.text}`;
      return h.text;
    }).join('\n');

    navigator.clipboard.writeText(raw).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      addToast('Terminal output copied to clipboard', 'info');
    });
  };

  const getCommandManual = (cmd: string): string => {
    switch (cmd) {
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
        return `Usage: npm <test|run build|list>
Commands:
  test       Execute test suites with in-browser Vitest runner
  run build  Compile project bundle with WebAssembly ESBuild
  list       Show package.json dependency tree`;
      default:
        return `Command "${cmd}": Refer to general "help" for syntax and flags.`;
    }
  };

  return (
    <div 
      role="region" 
      aria-label="Sandbox Terminal"
      className="flex-1 flex flex-col h-full bg-bg text-text overflow-hidden font-mono select-text"
      onClick={() => inputRef.current?.focus()}
    >
      {/* Top Terminal Strip Header */}
      <div 
        className="h-9 shrink-0 bg-surface border-b border-border px-3 flex items-center justify-between text-xs font-mono"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex items-center gap-1.5 px-2 py-0.5 bg-surface-elevated border border-border rounded text-[11px] text-accent">
            <Terminal size={12} className="shrink-0" />
            <span className="font-bold tracking-tight">TERMINAL</span>
          </div>
          
          <div className="flex items-center gap-1 text-[11px] text-muted truncate">
            <Folder size={11} className="text-moss/80 shrink-0" />
            <span className="truncate font-mono text-text/80">{cwd}</span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {isRunning ? (
            <div className="flex items-center gap-1.5 px-2 py-0.5 bg-accent/10 border border-accent/30 rounded text-[10px] text-accent font-medium">
              <Loader2 size={10} className="animate-spin" />
              <span>RUNNING</span>
            </div>
          ) : (
            <div className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] text-moss font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-moss animate-pulse" />
              <span>ONLINE</span>
            </div>
          )}

          <button
            onClick={handleCopyLogs}
            className="p-1 text-muted hover:text-text rounded hover:bg-surface-elevated transition-colors cursor-pointer"
            title="Copy Terminal Logs"
            aria-label="Copy Terminal Logs"
          >
            {copied ? <Check size={13} className="text-moss" /> : <Copy size={13} />}
          </button>

          <button
            onClick={() => setHistory([])}
            className="p-1 text-muted hover:text-oxide rounded hover:bg-surface-elevated transition-colors cursor-pointer"
            title="Clear Screen (Ctrl+L)"
            aria-label="Clear Screen"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* Quick Action Chips Bar */}
      <div 
        className="px-3 py-1.5 bg-surface-elevated/40 border-b border-border/60 flex items-center gap-1.5 overflow-x-auto scrollbar-none shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="text-[10px] text-muted/70 uppercase tracking-wider shrink-0 mr-1">Quick:</span>
        <button
          onClick={() => executeCommand('npm test')}
          disabled={isRunning}
          className="px-2 py-0.5 bg-surface border border-border hover:border-accent/40 rounded text-[10px] text-text hover:text-accent flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50 shrink-0"
        >
          <Play size={9} className="text-moss" />
          <span>npm test</span>
        </button>
        <button
          onClick={() => executeCommand('npm run build')}
          disabled={isRunning}
          className="px-2 py-0.5 bg-surface border border-border hover:border-accent/40 rounded text-[10px] text-text hover:text-accent flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50 shrink-0"
        >
          <Sparkles size={9} className="text-accent" />
          <span>npm run build</span>
        </button>
        <button
          onClick={() => executeCommand('tree')}
          disabled={isRunning}
          className="px-2 py-0.5 bg-surface border border-border hover:border-accent/40 rounded text-[10px] text-text hover:text-accent flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50 shrink-0"
        >
          <span>tree</span>
        </button>
        <button
          onClick={() => executeCommand('ls -la')}
          disabled={isRunning}
          className="px-2 py-0.5 bg-surface border border-border hover:border-accent/40 rounded text-[10px] text-text hover:text-accent flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50 shrink-0"
        >
          <span>ls -la</span>
        </button>
        <button
          onClick={() => executeCommand('help')}
          disabled={isRunning}
          className="px-2 py-0.5 bg-surface border border-border hover:border-accent/40 rounded text-[10px] text-text hover:text-accent flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50 shrink-0"
        >
          <HelpCircle size={9} className="text-muted" />
          <span>help</span>
        </button>
      </div>

      {/* Main Terminal Output Area */}
      <div 
        className="flex-1 p-3 overflow-y-auto overflow-x-hidden space-y-1.5 scrollbar-thin text-xs"
        role="log"
        aria-live="polite"
      >
        {history.map((item) => {
          if (item.type === 'cmd') {
            return (
              <div key={item.id} className="flex items-start gap-1.5 pt-1 text-xs">
                <span className="text-moss font-semibold shrink-0">dev@laide</span>
                <span className="text-muted shrink-0">:</span>
                <span className="text-accent font-semibold shrink-0">{item.cwd || '~'}$</span>
                <span className="text-text font-bold break-all">{item.text}</span>
              </div>
            );
          }

          if (item.type === 'stderr') {
            return (
              <div key={item.id} className="text-oxide/90 whitespace-pre-wrap font-mono text-[11px] pl-2 border-l-2 border-oxide/40 break-words">
                {item.text}
              </div>
            );
          }

          if (item.type === 'success') {
            return (
              <div key={item.id} className="text-moss whitespace-pre-wrap font-mono text-[11px] pl-2 border-l-2 border-moss/50 break-words">
                {item.text}
              </div>
            );
          }

          if (item.type === 'info') {
            return (
              <div key={item.id} className="text-accent/90 whitespace-pre-wrap font-mono text-[11px] pl-2 border-l-2 border-accent/40 break-words">
                {item.text}
              </div>
            );
          }

          if (item.type === 'system') {
            return (
              <div key={item.id} className="p-2.5 rounded bg-surface border border-border/80 text-muted text-[11px] whitespace-pre-wrap font-mono leading-relaxed">
                {item.text}
              </div>
            );
          }

          return (
            <div key={item.id} className="text-text/90 whitespace-pre-wrap font-mono text-[11px] break-words">
              {item.text}
            </div>
          );
        })}
        <div ref={terminalEndRef} />
      </div>

      {/* Interactive Command Input Prompt */}
      <div 
        className="p-2.5 bg-surface border-t border-border flex items-center gap-2 shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-1 shrink-0 select-none text-xs">
          <span className="text-moss font-bold hidden xs:inline">dev@laide:</span>
          <span className="text-accent font-bold">{cwd === '/' ? '~' : cwd}$</span>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            executeCommand(input);
          }}
          className="flex-1 flex items-center gap-1.5"
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isRunning}
            placeholder={isRunning ? 'Executing command...' : 'Type a command (e.g. "help", "npm test", "ls -la")...'}
            aria-label="Terminal command input"
            className="flex-1 bg-transparent text-text font-mono text-xs focus:outline-none placeholder:text-muted/50"
            autoFocus
            autoComplete="off"
            spellCheck={false}
          />

          <button
            type="submit"
            disabled={!input.trim() || isRunning}
            className="p-1.5 rounded bg-accent/15 text-accent hover:bg-accent hover:text-accent-text-on disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
            aria-label="Run command"
            title="Run command (Enter)"
          >
            <CornerDownLeft size={13} />
          </button>
        </form>
      </div>
    </div>
  );
}
