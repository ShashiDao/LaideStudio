
import type { CommandExecutionContext, TerminalOutputItem } from '../terminalTypes';
import type { TerminalCommandHandler } from '../commandTypes';

export const SHELL_COMMANDS = new Set([
  'capabilities', 'help', 'clear', 'cls', 'bisect', 'echo', 'env', 'export', 'date', 'whoami', 'uname', 'uptime', 'theme', 'history', 'reset',
]);

export const executeShellCommand: TerminalCommandHandler = async (command, args, commandStr, context) => {
  const { env, setEnv, cmdHistory, setCmdHistory, setHistory, setIsRunning, onOpenBisect, theme, toggleTheme } = context;
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
      return { stop: true };
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
      return { stop: true };
    }
    default:
      return {};
  }
  return { outputText, outputType };
};
