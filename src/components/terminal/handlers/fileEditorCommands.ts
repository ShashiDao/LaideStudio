import { resolvePath } from '../terminalTypes';
import { findFile } from './fileCommandUtils';
import type { TerminalCommandHandler } from '../commandTypes';

export const FILE_EDITOR_COMMANDS = new Set(['open', 'code', 'edit']);
export const FILEEDITOR_COMMANDS = FILE_EDITOR_COMMANDS;

export const executeFileEditorCommand: TerminalCommandHandler = async (command, args, _commandStr, context) => {
  if (!FILEEDITOR_COMMANDS.has(command)) return {};
  const { cwd, setActiveFileId } = context;
  switch (command) {
    
    case 'open':
    case 'code':
    case 'edit': {
      if (!args.length) {
        return { outputType: 'stderr', outputText: `${command}: missing file operand` };
      }
    
      const found = findFile(context, resolvePath(cwd, args[0]));
      if (!found) {
        return { outputType: 'stderr', outputText: `${command}: file not found: ${args[0]}` };
      }
    
      setActiveFileId(found.id);
      return {
        outputType: 'success',
        outputText: `Opened ${found.path} in Code Editor.`,
      };
    }
    default:
      return {};
  }
};
