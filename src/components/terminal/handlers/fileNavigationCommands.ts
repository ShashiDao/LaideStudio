import { resolvePath } from '../terminalTypes';
import type { TerminalCommandHandler } from '../commandTypes';

export const FILE_NAVIGATION_COMMANDS = new Set(['pwd', 'cd']);
export const FILENAVIGATION_COMMANDS = FILE_NAVIGATION_COMMANDS;

export const executeFileNavigationCommand: TerminalCommandHandler = async (command, args, _commandStr, context) => {
  if (!FILENAVIGATION_COMMANDS.has(command)) return {};
  const { cwd, setCwd, dirExists } = context;
  switch (command) {
    case 'pwd':
      return { outputText: cwd };

    
    case 'cd': {
      const target = args[0] || '/';
    
      if (target === '~' || target === '/') {
        setCwd('/');
        return { outputText: '' };
      }
    
      if (target === '..') {
        const parts = cwd.split('/').filter(Boolean);
        parts.pop();
        setCwd('/' + parts.join('/'));
        return { outputText: '' };
      }
    
      const resolved = resolvePath(cwd, target);
      if (dirExists(resolved)) {
        setCwd(resolved);
        return { outputText: '' };
      }
    
      return {
        outputType: 'stderr',
        outputText: `cd: no such file or directory: ${target}`,
      };
    }
    default:
      return {};
  }
};
