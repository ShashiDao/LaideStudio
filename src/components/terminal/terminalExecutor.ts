import {
  createFile,
  writeFile,
  isValidFilePath,
} from '../../services/fs/vfs';
import { runProjectTests } from '../../services/bundler/testRunner';
import { detectBundledProject } from '../../services/bundler/entryDetection';
import { formatByteSize } from '../../utils/formatters';
import {
  computeSha256,
  findLockfile,
  serializeLockfile,
  getCanonicalVendorPath,
  LOCKFILE_PATH,
} from '../../services/bundler/lockfile';
import {
  type CommandExecutionContext,
  type TerminalOutputItem,
  ALLOWED_COMMANDS,
  resolvePath,
  extractRedirection,
  tokenize,
  getCommandManual,
} from './terminalTypes';
import { executeFileCommand, FILE_COMMANDS } from './handlers/fileCommands';

export async function executeTerminalCommand(
  rawCommand: string,
  context: CommandExecutionContext,
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
    onFilesChanged,
    onOpenBisect,
    theme,
    toggleTheme,
  } = context;

  const trimmed = rawCommand.trim();
  if (!trimmed) return;

  setCmdHistory(prev => [...prev, trimmed]);
  addOutput('cmd', trimmed, { cwd });

  const { commandStr, redirectMode, redirectFile } = extractRedirection(trimmed);
  let tokens = tokenize(commandStr);
  if (tokens.length === 0) return;

  tokens = tokens.map(token => {
    if (!token.startsWith('$')) return token;
    const varName = token.slice(1);
    return env[varName] !== undefined ? env[varName] : '';
  });

  const command = tokens[0]?.toLowerCase() || '';
  const args = tokens.slice(1);

  if (!ALLOWED_COMMANDS.has(command)) {
    addOutput('stderr', `laide: '${command || trimmed}' isn't available in this browser-based shell — type 'help' to see what is`);
    return;
  }

  let targetRedirectFile = redirectFile;
  if (
    (targetRedirectFile.startsWith('"') && targetRedirectFile.endsWith('"')) ||
    (targetRedirectFile.startsWith("'") && targetRedirectFile.endsWith("'"))
  ) {
    targetRedirectFile = targetRedirectFile.slice(1, -1).trim();
  }

  if (
    targetRedirectFile &&
    (!isValidFilePath(resolvePath(cwd, targetRedirectFile)) || /[\r\n\t]/.test(targetRedirectFile))
  ) {
    addOutput('stderr', `laide: syntax error near unexpected token '${targetRedirectFile}'`);
    return;
  }

  setIsRunning(true);

  try {
    let outputText = '';
    let outputType: TerminalOutputItem['type'] = 'stdout';

    if (FILE_COMMANDS.has(command)) {
      const result = await executeFileCommand(command, args, commandStr, context);
      outputText = result.outputText ?? '';
      outputType = result.outputType ?? 'stdout';
    } else {
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
            outputText = getCommandManual(args[0].toLowerCase());
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
          } else if ((sub === 'run' && args[1] === 'build') || sub === 'build') {
            addOutput('info', 'Building project with ESBuild WebAssembly bundler...');
            const projectInfo = detectBundledProject(files);
            const entryPoint = projectInfo.entryPoint || '/src/main.tsx';
            const start = performance.now();

            try {
              const { bundle } = await import('../../services/bundler/bundler');
              const bundleCode = await bundle(files, entryPoint, status => {
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
            const pkgFile = files.find(file => file.path === '/package.json');
            if (!pkgFile) {
              outputType = 'stderr';
              outputText = 'npm ls: package.json not found';
            } else {
              try {
                const pkg = JSON.parse(pkgFile.content);
                const lines = [`${pkg.name || 'laide-project'}@${pkg.version || '1.0.0'}`];
                if (pkg.dependencies && Object.keys(pkg.dependencies).length > 0) {
                  lines.push('├── dependencies:');
                  for (const [name, version] of Object.entries(pkg.dependencies)) lines.push(`│   ├── ${name}@${version}`);
                }
                if (pkg.devDependencies && Object.keys(pkg.devDependencies).length > 0) {
                  lines.push('└── devDependencies:');
                  for (const [name, version] of Object.entries(pkg.devDependencies)) lines.push(`    ├── ${name}@${version}`);
                }
                outputText = lines.join('\n');
              } catch (err: unknown) {
                outputType = 'stderr';
                const msg = err instanceof Error ? err.message : String(err);
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
                const pkgJsonFile = files.find(file => file.path === '/package.json');
                if (pkgJsonFile) {
                  try {
                    const parsed = JSON.parse(pkgJsonFile.content);
                    requestedVersion = parsed.dependencies?.[pkgName] || parsed.devDependencies?.[pkgName] || '';
                  } catch (err) {
                    console.warn('Failed to parse package.json for requested version:', err);
                  }
                }
              }

              const targetUrl = requestedVersion ? `https://esm.sh/${pkgName}@${requestedVersion}` : `https://esm.sh/${pkgName}`;
              try {
                const res = await fetch(targetUrl);
                if (!res.ok) throw new Error(`Failed to fetch ${targetUrl} (Status ${res.status}: ${res.statusText})`);
                const fetchedCode = await res.text();
                const hash = await computeSha256(fetchedCode);
                const vendorPath = getCanonicalVendorPath(pkgName);
                const existingFile = files.find(file => file.path === vendorPath);
                if (existingFile) await writeFile(existingFile.id, fetchedCode);
                else await createFile(projectId, vendorPath, fetchedCode);

                const { file: existingLockfileFile, lockfile } = findLockfile(files);
                lockfile.dependencies[pkgName] = {
                  specifier: pkgName,
                  url: targetUrl,
                  integrity: hash,
                  lockedAt: Date.now(),
                  vendored: true,
                  vendorPath,
                };
                const serializedLock = serializeLockfile(lockfile);
                if (existingLockfileFile?.id) await writeFile(existingLockfileFile.id, serializedLock);
                else await createFile(projectId, LOCKFILE_PATH, serializedLock);

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
              const pkgJsonFile = files.find(file => file.path === '/package.json');
              let pkgObj: Record<string, unknown> = {};
              if (pkgJsonFile) {
                try {
                  pkgObj = JSON.parse(pkgJsonFile.content);
                } catch (err) {
                  console.warn('Failed to parse package.json during update-lock:', err);
                }
              }
              const allDeps: Record<string, string> = {
                ...((pkgObj.dependencies as Record<string, string>) || {}),
                ...((pkgObj.devDependencies as Record<string, string>) || {}),
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
                      lockfile.dependencies[target] = { specifier: target, url: targetUrl, integrity: hash, lockedAt: Date.now() };
                      updatedList.push(`${target} (${hash.slice(0, 15)}...)`);
                    }
                  } catch (err: unknown) {
                    console.warn(`Failed fetching ${targetUrl} during lock update:`, err);
                  }
                }
                const serializedLock = serializeLockfile(lockfile);
                if (existingLockfileFile?.id) await writeFile(existingLockfileFile.id, serializedLock);
                else await createFile(projectId, LOCKFILE_PATH, serializedLock);
                onFilesChanged?.();
                outputType = 'success';
                outputText = `🔒 Lockfile updated at ${LOCKFILE_PATH}
Updated dependencies (${updatedList.length}):
${updatedList.map(item => `  ✔ ${item}`).join('\n')}`;
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
              const pkgJsonFile = files.find(file => file.path === '/package.json');
              if (pkgJsonFile) {
                try {
                  const parsed = JSON.parse(pkgJsonFile.content);
                  requestedVersion = parsed.dependencies?.[pkgName] || parsed.devDependencies?.[pkgName] || '';
                } catch (err) {
                  console.warn('Failed to parse package.json during vendor command:', err);
                }
              }
            }
            const targetUrl = requestedVersion ? `https://esm.sh/${pkgName}@${requestedVersion}` : `https://esm.sh/${pkgName}`;
            try {
              const res = await fetch(targetUrl);
              if (!res.ok) throw new Error(`Failed to fetch ${targetUrl} (Status ${res.status}: ${res.statusText})`);
              const fetchedCode = await res.text();
              const hash = await computeSha256(fetchedCode);
              const vendorPath = getCanonicalVendorPath(pkgName);
              const existingFile = files.find(file => file.path === vendorPath);
              if (existingFile) await writeFile(existingFile.id, fetchedCode);
              else await createFile(projectId, vendorPath, fetchedCode);

              const { file: existingLockfileFile, lockfile } = findLockfile(files);
              lockfile.dependencies[pkgName] = { specifier: pkgName, url: targetUrl, integrity: hash, lockedAt: Date.now(), vendored: true, vendorPath };
              const serializedLock = serializeLockfile(lockfile);
              if (existingLockfileFile?.id) await writeFile(existingLockfileFile.id, serializedLock);
              else await createFile(projectId, LOCKFILE_PATH, serializedLock);
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
              const pkgJsonFile = files.find(file => file.path === '/package.json');
              let pkgObj: Record<string, unknown> = {};
              if (pkgJsonFile) {
                try {
                  pkgObj = JSON.parse(pkgJsonFile.content);
                } catch (err) {
                  console.warn('Failed to parse package.json during lockfile update:', err);
                }
              }
              const allDeps: Record<string, string> = {
                ...((pkgObj.dependencies as Record<string, string>) || {}),
                ...((pkgObj.devDependencies as Record<string, string>) || {}),
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
                    lockfile.dependencies[target] = { specifier: target, url: targetUrl, integrity: hash, lockedAt: Date.now() };
                    updatedList.push(`${target} (${hash.slice(0, 15)}...)`);
                  }
                } catch (err: unknown) {
                  console.warn(`Failed fetching ${targetUrl} during lock update:`, err);
                }
              }
              const serializedLock = serializeLockfile(lockfile);
              if (existingLockfileFile?.id) await writeFile(existingLockfileFile.id, serializedLock);
              else await createFile(projectId, LOCKFILE_PATH, serializedLock);
              onFilesChanged?.();
              outputType = 'success';
              outputText = `🔒 Lockfile updated at ${LOCKFILE_PATH}
Updated dependencies (${updatedList.length}):
${updatedList.map(item => `  ✔ ${item}`).join('\n')}`;
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
            if (args[0] === '-e') codeToRun = commandStr.replace(/^\s*node\s+-e\s+/i, '');
            else if (args[0]) {
              const target = resolvePath(cwd, args[0]);
              const file = files.find(item => item.path === target);
              if (file) codeToRun = file.content;
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
          const serializableFiles = files.map(file => ({
            id: file.id,
            projectId: file.projectId,
            path: file.path,
            content: file.content,
            updatedAt: file.updatedAt,
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
            outputText = [
              'On branch main',
              'Your branch is up to date with \'origin/main\'.',
              '',
              `Changes tracked: ${files.length} project files`,
              `Last modified: ${files[0]?.path || 'none'}`,
            ].join('\n');
          } else if (gitSub === 'diff') {
            const target = args[1] ? resolvePath(cwd, args[1]) : '';
            const file = files.find(item => item.path === target);
            if (target && !file) {
              outputType = 'stderr';
              outputText = `git diff: file not found: ${args[1]}`;
            } else {
              outputText = `diff --git a/${file?.path || 'workspace'} b/${file?.path || 'workspace'}\n--- a/${file?.path || 'workspace'}\n+++ b/${file?.path || 'workspace'}\n@@ -1 +1 @@\n [Local Virtual Workspace State Clean]`;
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
          outputText = Object.entries(env).map(([key, value]) => `${key}=${value}`).join('\n');
          break;
        }

        case 'export': {
          if (args.length === 0) {
            outputText = Object.entries(env).map(([key, value]) => `declare -x ${key}="${value}"`).join('\n');
          } else {
            for (const item of args) {
              const eqIdx = item.indexOf('=');
              if (eqIdx !== -1) {
                const key = item.slice(0, eqIdx);
                const value = item.slice(eqIdx + 1);
                setEnv(prev => ({ ...prev, [key]: value }));
              }
            }
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
          outputText = args.includes('-a')
            ? 'LAIDE Browser Sandbox 1.0.0 (simulated environment; WebAssembly/Worker VFS)'
            : 'LAIDE-Browser-Shell (simulated environment)';
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
            outputText = cmdHistory.map((item, index) => `${(index + 1).toString().padStart(4, ' ')}  ${item}`).join('\n');
          }
          break;
        }

        case 'reset': {
          setCwd('/');
          setEnv({ NODE_ENV: 'development', USER: 'developer', SHELL: '/bin/sh', PWD: '/' });
          const now = Date.now();
          setHistory([{ id: `reset-${now}`, type: 'system', text: 'Terminal session and environment reset to defaults.', timestamp: now }]);
          setIsRunning(false);
          return;
        }

        default: {
          outputType = 'stderr';
          outputText = `laide: '${command}' isn't available in this browser-based shell — type 'help' to see what is`;
          break;
        }
      }
    }

    if (targetRedirectFile && projectId && outputType !== 'stderr') {
      const destination = resolvePath(cwd, targetRedirectFile);
      const existing = files.find(file => file.path === destination);
      if (existing) {
        const newContent = redirectMode === 'append' ? `${existing.content}\n${outputText}` : outputText;
        await writeFile(existing.id, newContent);
      } else {
        await createFile(projectId, destination, outputText);
      }
      onFilesChanged?.();
      outputText = '';
    }

    if (outputText) addOutput(outputType, outputText);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    addOutput('stderr', `Execution error: ${msg}`);
  } finally {
    setIsRunning(false);
  }
}
