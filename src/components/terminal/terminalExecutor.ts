import { 
  createFile, 
  writeFile, 
  deleteFile, 
  deleteFolder, 
  renameFile,
  isValidFilePath
} from '../../services/fs/vfs';
import { runProjectTests } from '../../services/bundler/testRunner';
import { detectBundledProject } from '../../services/bundler/entryDetection';
import { formatByteSize } from '../../utils/formatters';
import {
  computeSha256,
  findLockfile,
  serializeLockfile,
  getCanonicalVendorPath,
  LOCKFILE_PATH
} from '../../services/bundler/lockfile';
import {
  type CommandExecutionContext,
  type TerminalOutputItem,
  ALLOWED_COMMANDS,
  resolvePath,
  extractRedirection,
  tokenize,
  getCommandManual
} from './terminalTypes';

export async function executeTerminalCommand(
  rawCommand: string, 
  context: CommandExecutionContext
): Promise<void> {
  const {
    projectId,
    files,
    cwd,
    setCwd,
    env,
    setEnv,
    cmdHistory,
    setCmdHistory,
    addOutput,
    setHistory,
    setIsRunning,
    dirExists,
    getDirEntries,
    onFilesChanged,
    onOpenBisect,
    setActiveFileId,
    theme,
    toggleTheme
  } = context;

  const trimmed = rawCommand.trim();
  if (!trimmed) return;

  // Record in history
  setCmdHistory(prev => [...prev, trimmed]);
  addOutput('cmd', trimmed, { cwd });

  // Extract redirection (> or >>) safely only outside quoted strings
  const { commandStr, redirectMode, redirectFile } = extractRedirection(trimmed);

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

  const command = tokens[0]?.toLowerCase() || '';
  const args = tokens.slice(1);

  // If a command input line doesn't match an explicit allowed operation alias,
  // safely reject the execution loop entirely and output standard honest error.
  if (!ALLOWED_COMMANDS.has(command)) {
    addOutput('stderr', `laide: '${command || trimmed}' isn't available in this browser-based shell — type 'help' to see what is`);
    return;
  }

  // Clean and validate target redirection filename if present
  let targetRedirectFile = redirectFile;
  if ((targetRedirectFile.startsWith('"') && targetRedirectFile.endsWith('"')) ||
      (targetRedirectFile.startsWith("'") && targetRedirectFile.endsWith("'"))) {
    targetRedirectFile = targetRedirectFile.slice(1, -1).trim();
  }

  if (targetRedirectFile) {
    if (!isValidFilePath(resolvePath(cwd, targetRedirectFile)) || /[\r\n\t]/.test(targetRedirectFile)) {
      addOutput('stderr', `laide: syntax error near unexpected token '${targetRedirectFile}'`);
      return;
    }
  }

  setIsRunning(true);

  try {
    let outputText = '';
    let outputType: TerminalOutputItem['type'] = 'stdout';

    switch (command) {
      case 'capabilities': {
        outputText = `LAIDE Virtual Shell — Execution Model & Capabilities:

✅ REAL EXECUTION:
  • Virtual File System (VFS): File commands (ls, cd, pwd, cat, head, tail, touch, mkdir, rm, cp, mv, grep, find, wc, stat, tree) operate directly on your real project files stored in IndexedDB.
  • JavaScript Execution: 'node', 'eval', and 'run' execute real JavaScript inside an isolated Web Worker sandbox (sandboxRunner.ts) with memory limits and execution timeout guards.
  • In-Browser Bundler & Build: 'build' / 'npm run build' compiles TypeScript/React code directly in the browser via WebAssembly ESBuild.
  • In-Browser Test Runner: 'test' / 'npm test' runs real test suites using an in-browser Vitest runner shim.
  • Offline Dependency Vendoring: 'npm vendor' downloads verified ESM packages to /vendor and enforces SHA-256 integrity hashes in /.laide/lockfile.json.

⚠️ SIMULATED / NOT SUPPORTED:
  • No Arbitrary Native Binaries: Native executables (gcc, python, bash, rustc, etc.) cannot run in this client-side browser sandbox.
  • No Real npm / pip Registry Client: Full package installation from npm/PyPI registries is not present — use 'npm vendor <pkg>' or package.json dependencies bundled via esm.sh.
  • No Real POSIX Kernel: All shell commands are sandboxed JavaScript utilities running directly in your browser.

📋 SUPPORTED COMMAND SET:
  • File Operations : ls, cd, pwd, cat, head, tail, touch, mkdir, rm, cp, mv, grep, find, wc, stat, tree, open, code, edit
  • Dev & Build     : npm, test, vitest, build, pkg, vendor, lockfile, lock, node, eval, run, bisect, git
  • Shell & Utility : capabilities, help, echo, env, export, date, whoami, uname, uptime, theme, history, clear, cls, reset`;
        break;
      }

      case 'help': {
        if (args[0]) {
          const topic = args[0].toLowerCase();
          outputText = getCommandManual(topic);
        } else {
          outputText = `LAIDE Virtual Shell — Browser-Based Execution Environment

ℹ️ ENVIRONMENT & CAPABILITIES (Type 'capabilities' for full details)
  • Real VFS file operations on IndexedDB project files
  • Real JavaScript execution in isolated Web Worker sandbox (sandboxRunner.ts)
  • In-browser WebAssembly ESBuild & Vitest test runner
  • No arbitrary binary execution or live npm/pip registry client

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
  npm test | test        Run test suite with in-browser Vitest shim
  npm run build | build  Run WebAssembly ESBuild bundler & compute stats
  npm ls | pkg           List package.json dependencies
  npm vendor <pkg>       Vendor dependency into /vendor/<pkg>.js (0 network calls)
  npm update-lock [pkg]  Accept upstream updates & update lockfile integrity hash
  node [-e code | file]  Execute JS in isolated Web Worker sandbox (sandboxRunner.ts)
  eval | run "<code>"    Evaluate JS snippet in isolated Web Worker sandbox
  code | open <file>     Open file directly in Code Editor
  bisect [testName]      Run automated git bisect across provenance history
  git status             Show project VCS status
  git diff [file]        Inspect file changes

🛠 UTILITIES & SHELL
  capabilities           Explain real vs. simulated execution model
  echo [text] [> file]   Print text or redirect to file
  env                    Display environment variables
  export KEY=VAL         Set environment variable
  date                   Print current date and time
  whoami                 Print active user
  uname [-a]             Print browser sandbox environment info (simulated)
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
            const size = formatByteSize(new Blob([f.content]).size).padStart(8, ' ');
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
  Size: ${size} bytes (${formatByteSize(size)})  Lines: ${lines}  Words: ${words}
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

      case 'bisect': {
        const targetTest = args.join(' ').trim();
        if (onOpenBisect) {
          onOpenBisect(targetTest || undefined);
          outputType = 'info';
          outputText = `Opening Bisection Finder${targetTest ? ` for test "${targetTest}"` : ''}...`;
        } else {
          outputType = 'stderr';
          outputText = 'Bisection finder is unavailable in current mode.';
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
          const hasFailed = !result.includes('Failed: 0') && result.includes('Failed:');
          outputType = hasFailed ? 'stderr' : 'success';
          if (hasFailed && onOpenBisect) {
            outputText += '\n💡 Tip: Type "bisect" or open Project Actions > "Find What Broke This" to binary search provenance history and isolate regressions.';
          }
        } else if (sub === 'bisect') {
          const targetTest = args.slice(1).join(' ').trim();
          if (onOpenBisect) {
            onOpenBisect(targetTest || undefined);
            outputType = 'info';
            outputText = `Opening Bisection Finder${targetTest ? ` for test "${targetTest}"` : ''}...`;
          } else {
            outputType = 'stderr';
            outputText = 'Bisection finder is unavailable in current mode.';
          }
        } else if (sub === 'run' && args[1] === 'build' || sub === 'build') {
          addOutput('info', 'Building project with ESBuild WebAssembly bundler...');
          const projectInfo = detectBundledProject(files);
          const entryPoint = projectInfo.entryPoint || '/src/main.tsx';
          
          const start = performance.now();
          try {
            const { bundle } = await import('../../services/bundler/bundler');
            const bundleCode = await bundle(files, entryPoint, (status) => {
              addOutput('info', `  › ${status}`);
            });
            const duration = ((performance.now() - start) / 1000).toFixed(2);
            const bundleBytes = new Blob([bundleCode]).size;
            
            outputText = `✨ Build succeeded in ${duration}s!
  Entry point: ${entryPoint}
  Bundle size: ${formatByteSize(bundleBytes)} (${bundleBytes.toLocaleString()} bytes)
  Files bundled: ${files.length}`;
            outputType = 'success';
          } catch (err: unknown) {
            outputType = 'stderr';
            const msg = err instanceof Error ? err.message : String(err);
            outputText = `Build failed: ${msg}`;
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
            } catch (e: unknown) {
              outputType = 'stderr';
              const msg = e instanceof Error ? e.message : String(e);
              outputText = `npm ls: failed to parse package.json (${msg})`;
            }
          }
        } else if (sub === 'vendor') {
          const pkgArg = args.slice(1).join(' ').trim();
          if (!pkgArg) {
            outputType = 'stderr';
            outputText = 'npm vendor: missing package operand. Usage: npm vendor <package-name>';
          } else if (!projectId) {
            outputType = 'stderr';
            outputText = 'npm vendor: no active project open';
          } else {
            addOutput('info', `📦 Vendoring package "${pkgArg}"...`);
            let pkgName = pkgArg;
            let requestedVersion = '';
            if (pkgArg.startsWith('@')) {
              const atIdx = pkgArg.indexOf('@', 1);
              if (atIdx !== -1) {
                pkgName = pkgArg.slice(0, atIdx);
                requestedVersion = pkgArg.slice(atIdx + 1);
              }
            } else {
              const atIdx = pkgArg.indexOf('@');
              if (atIdx !== -1) {
                pkgName = pkgArg.slice(0, atIdx);
                requestedVersion = pkgArg.slice(atIdx + 1);
              }
            }

            if (!requestedVersion) {
              const pkgJsonFile = files.find(f => f.path === '/package.json');
              if (pkgJsonFile) {
                try {
                  const parsed = JSON.parse(pkgJsonFile.content);
                  requestedVersion = parsed.dependencies?.[pkgName] || parsed.devDependencies?.[pkgName] || '';
                } catch (e) {
                  console.warn('Failed to parse package.json for requested version:', e);
                }
              }
            }

            const targetUrl = requestedVersion
              ? `https://esm.sh/${pkgName}@${requestedVersion}`
              : `https://esm.sh/${pkgName}`;

            try {
              const res = await fetch(targetUrl);
              if (!res.ok) {
                throw new Error(`Failed to fetch ${targetUrl} (Status ${res.status}: ${res.statusText})`);
              }
              const fetchedCode = await res.text();
              const hash = await computeSha256(fetchedCode);
              const vendorPath = getCanonicalVendorPath(pkgName);

              const existingFile = files.find(f => f.path === vendorPath);
              if (existingFile) {
                await writeFile(existingFile.id, fetchedCode);
              } else {
                await createFile(projectId, vendorPath, fetchedCode);
              }

              const { file: existingLockfileFile, lockfile } = findLockfile(files);
              lockfile.dependencies[pkgName] = {
                specifier: pkgName,
                url: targetUrl,
                integrity: hash,
                lockedAt: Date.now(),
                vendored: true,
                vendorPath
              };
              const serializedLock = serializeLockfile(lockfile);

              if (existingLockfileFile && existingLockfileFile.id) {
                await writeFile(existingLockfileFile.id, serializedLock);
              } else {
                await createFile(projectId, LOCKFILE_PATH, serializedLock);
              }

              onFilesChanged?.();
              outputType = 'success';
              outputText = `📦 Successfully vendored "${pkgName}"!
  Source: ${targetUrl}
  Saved to: ${vendorPath} (${formatByteSize(new Blob([fetchedCode]).size)})
  Integrity: ${hash}
  Lockfile: updated ${LOCKFILE_PATH}
✨ Future builds will resolve "${pkgName}" locally with 0 network calls.`;
            } catch (err: unknown) {
              outputType = 'stderr';
              const msg = err instanceof Error ? err.message : String(err);
              outputText = `npm vendor failed: ${msg}`;
            }
          }
        } else if (sub === 'update-lock' || sub === 'lock' || sub === 'lockfile') {
          const pkgArg = args.slice(1).join(' ').trim();
          if (!projectId) {
            outputType = 'stderr';
            outputText = 'npm update-lock: no active project open';
          } else {
            const { file: existingLockfileFile, lockfile } = findLockfile(files);
            const pkgJsonFile = files.find(f => f.path === '/package.json');
            let pkgObj: Record<string, unknown> = {};
            if (pkgJsonFile) {
              try {
                pkgObj = JSON.parse(pkgJsonFile.content);
              } catch (e) {
                console.warn('Failed to parse package.json during update-lock:', e);
              }
            }
            const allDeps: Record<string, string> = {
              ...((pkgObj.dependencies as Record<string, string>) || {}),
              ...((pkgObj.devDependencies as Record<string, string>) || {})
            };

            const targets = pkgArg ? [pkgArg] : Object.keys(allDeps);
            if (targets.length === 0 && Object.keys(lockfile.dependencies).length === 0) {
              outputType = 'stderr';
              outputText = 'npm update-lock: No dependencies declared in package.json or lockfile.';
            } else {
              addOutput('info', `🔒 Updating integrity locks for ${targets.length} dependenc${targets.length === 1 ? 'y' : 'ies'}...`);
              const updatedList: string[] = [];

              for (const target of targets) {
                const version = allDeps[target] || '';
                const targetUrl = version ? `https://esm.sh/${target}@${version}` : `https://esm.sh/${target}`;
                try {
                  const res = await fetch(targetUrl);
                  if (res.ok) {
                    const text = await res.text();
                    const hash = await computeSha256(text);
                    lockfile.dependencies[target] = {
                      specifier: target,
                      url: targetUrl,
                      integrity: hash,
                      lockedAt: Date.now()
                    };
                    updatedList.push(`${target} (${hash.slice(0, 15)}...)`);
                  }
                } catch (e: unknown) {
                  console.warn(`Failed fetching ${targetUrl} during lock update:`, e);
                }
              }

              const serializedLock = serializeLockfile(lockfile);
              if (existingLockfileFile && existingLockfileFile.id) {
                await writeFile(existingLockfileFile.id, serializedLock);
              } else {
                await createFile(projectId, LOCKFILE_PATH, serializedLock);
              }

              onFilesChanged?.();
              outputType = 'success';
              outputText = `🔒 Lockfile updated at ${LOCKFILE_PATH}
Updated dependencies (${updatedList.length}):
${updatedList.map(u => `  ✔ ${u}`).join('\n')}`;
            }
          }
        } else {
          outputType = 'stderr';
          outputText = `npm: unsupported command: "${sub}". Try "npm test", "npm run build", "npm vendor <pkg>", or "npm ls".`;
        }
        break;
      }

      case 'vendor': {
        const pkgArg = args.join(' ').trim();
        if (!pkgArg) {
          outputType = 'stderr';
          outputText = 'vendor: missing package operand. Usage: vendor <package-name>';
        } else if (!projectId) {
          outputType = 'stderr';
          outputText = 'vendor: no active project open';
        } else {
          addOutput('info', `📦 Vendoring package "${pkgArg}"...`);
          let pkgName = pkgArg;
          let requestedVersion = '';
          if (pkgArg.startsWith('@')) {
            const atIdx = pkgArg.indexOf('@', 1);
            if (atIdx !== -1) {
              pkgName = pkgArg.slice(0, atIdx);
              requestedVersion = pkgArg.slice(atIdx + 1);
            }
          } else {
            const atIdx = pkgArg.indexOf('@');
            if (atIdx !== -1) {
              pkgName = pkgArg.slice(0, atIdx);
              requestedVersion = pkgArg.slice(atIdx + 1);
            }
          }

          if (!requestedVersion) {
            const pkgJsonFile = files.find(f => f.path === '/package.json');
            if (pkgJsonFile) {
              try {
                const parsed = JSON.parse(pkgJsonFile.content);
                requestedVersion = parsed.dependencies?.[pkgName] || parsed.devDependencies?.[pkgName] || '';
              } catch (e) {
                console.warn('Failed to parse package.json during vendor command:', e);
              }
            }
          }

          const targetUrl = requestedVersion
            ? `https://esm.sh/${pkgName}@${requestedVersion}`
            : `https://esm.sh/${pkgName}`;

          try {
            const res = await fetch(targetUrl);
            if (!res.ok) {
              throw new Error(`Failed to fetch ${targetUrl} (Status ${res.status}: ${res.statusText})`);
            }
            const fetchedCode = await res.text();
            const hash = await computeSha256(fetchedCode);
            const vendorPath = getCanonicalVendorPath(pkgName);

            const existingFile = files.find(f => f.path === vendorPath);
            if (existingFile) {
              await writeFile(existingFile.id, fetchedCode);
            } else {
              await createFile(projectId, vendorPath, fetchedCode);
            }

            const { file: existingLockfileFile, lockfile } = findLockfile(files);
            lockfile.dependencies[pkgName] = {
              specifier: pkgName,
              url: targetUrl,
              integrity: hash,
              lockedAt: Date.now(),
              vendored: true,
              vendorPath
            };
            const serializedLock = serializeLockfile(lockfile);

            if (existingLockfileFile && existingLockfileFile.id) {
              await writeFile(existingLockfileFile.id, serializedLock);
            } else {
              await createFile(projectId, LOCKFILE_PATH, serializedLock);
            }

            onFilesChanged?.();
            outputType = 'success';
            outputText = `📦 Successfully vendored "${pkgName}"!
  Source: ${targetUrl}
  Saved to: ${vendorPath} (${formatByteSize(new Blob([fetchedCode]).size)})
  Integrity: ${hash}
  Lockfile: updated ${LOCKFILE_PATH}
✨ Future builds will resolve "${pkgName}" locally with 0 network calls.`;
          } catch (err: unknown) {
            outputType = 'stderr';
            const msg = err instanceof Error ? err.message : String(err);
            outputText = `vendor failed: ${msg}`;
          }
        }
        break;
      }

      case 'lockfile':
      case 'lock': {
        const action = args[0]?.toLowerCase();
        const pkgArg = (action === 'update' ? args.slice(1).join(' ') : args.join(' ')).trim();
        if (!projectId) {
          outputType = 'stderr';
          outputText = 'lockfile: no active project open';
        } else {
          const { file: existingLockfileFile, lockfile } = findLockfile(files);
          if (!action || action === 'show' || action === 'list' || action === 'status') {
            const depKeys = Object.keys(lockfile.dependencies);
            if (depKeys.length === 0) {
              outputText = `No dependencies currently locked in ${LOCKFILE_PATH}. Run "lockfile update" or "npm run build" to generate locks.`;
            } else {
              const lines = [`Lockfile (${LOCKFILE_PATH}) — ${depKeys.length} locked packages:`];
              for (const key of depKeys) {
                const entry = lockfile.dependencies[key];
                lines.push(`  • ${entry.specifier}: ${entry.integrity} (${entry.vendored ? 'vendored' : 'esm.sh'})`);
              }
              outputText = lines.join('\n');
            }
            outputType = 'info';
          } else if (action === 'update' || action === 'refresh') {
            const pkgJsonFile = files.find(f => f.path === '/package.json');
            let pkgObj: Record<string, unknown> = {};
            if (pkgJsonFile) {
              try {
                pkgObj = JSON.parse(pkgJsonFile.content);
              } catch (e) {
                console.warn('Failed to parse package.json during lockfile update:', e);
              }
            }
            const allDeps: Record<string, string> = {
              ...((pkgObj.dependencies as Record<string, string>) || {}),
              ...((pkgObj.devDependencies as Record<string, string>) || {})
            };

            const targets = pkgArg ? [pkgArg] : Object.keys(allDeps);
            addOutput('info', `🔒 Updating integrity locks for ${targets.length} dependenc${targets.length === 1 ? 'y' : 'ies'}...`);
            const updatedList: string[] = [];

            for (const target of targets) {
              const version = allDeps[target] || '';
              const targetUrl = version ? `https://esm.sh/${target}@${version}` : `https://esm.sh/${target}`;
              try {
                const res = await fetch(targetUrl);
                if (res.ok) {
                  const text = await res.text();
                  const hash = await computeSha256(text);
                  lockfile.dependencies[target] = {
                    specifier: target,
                    url: targetUrl,
                    integrity: hash,
                    lockedAt: Date.now()
                  };
                  updatedList.push(`${target} (${hash.slice(0, 15)}...)`);
                }
              } catch (e: unknown) {
                console.warn(`Failed fetching ${targetUrl} during lock update:`, e);
              }
            }

            const serializedLock = serializeLockfile(lockfile);
            if (existingLockfileFile && existingLockfileFile.id) {
              await writeFile(existingLockfileFile.id, serializedLock);
            } else {
              await createFile(projectId, LOCKFILE_PATH, serializedLock);
            }

            onFilesChanged?.();
            outputType = 'success';
            outputText = `🔒 Lockfile updated at ${LOCKFILE_PATH}
Updated dependencies (${updatedList.length}):
${updatedList.map(u => `  ✔ ${u}`).join('\n')}`;
          } else {
            outputType = 'stderr';
            outputText = `lockfile: unknown action "${action}". Try "lockfile list" or "lockfile update [pkg]".`;
          }
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
            outputText = 'Welcome to JS Sandbox (Isolated Web Worker Runtime)\nAmbient globals (IndexedDB, fetch, caches, importScripts) are disabled.\nType "node -e <code>", "node <file>", or "eval <code>" to run snippets.';
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

        // Strip non-transferable data from files for worker serialization
        const serializableFiles = files.map(f => ({
          id: f.id,
          projectId: f.projectId,
          path: f.path,
          content: f.content,
          updatedAt: f.updatedAt
        }));

        const { runNodeCodeSandbox } = await import('../../services/bundler/sandboxRunner');
        const result = await runNodeCodeSandbox(codeToRun, env, serializableFiles);
        outputType = result.outputType === 'stderr' ? 'stderr' : 'success';
        outputText = result.outputText;
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
          outputText = 'LAIDE Browser Sandbox 1.0.0 (simulated environment; WebAssembly/Worker VFS)';
        } else {
          outputText = 'LAIDE-Browser-Shell (simulated environment)';
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
        outputText = `laide: '${command}' isn't available in this browser-based shell — type 'help' to see what is`;
        break;
      }
    }

    // Handle file redirection only on success (outputType !== 'stderr') and valid target
    if (targetRedirectFile && projectId && outputType !== 'stderr') {
      const dest = resolvePath(cwd, targetRedirectFile);
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

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    addOutput('stderr', `Execution error: ${msg}`);
  } finally {
    setIsRunning(false);
  }
}
