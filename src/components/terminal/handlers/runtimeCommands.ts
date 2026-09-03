import { runNodeCodeSandbox } from '../../../services/bundler/sandboxRunner';
import type { TerminalOutputItem } from '../terminalTypes';
import type { TerminalCommandHandler } from '../commandTypes';

export const RUNTIME_COMMANDS = new Set([
  'node', 'eval', 'run',
]);

export const executeRuntimeCommand: TerminalCommandHandler = async (command, args, commandStr, context) => {
  const { files, env } = context;
  let outputText = '';
  let outputType: TerminalOutputItem['type'] = 'stdout';
  switch (command) {
    
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
    default:
      return {};
  }
  return { outputText, outputType };
};
