import type { TerminalCommandHandler } from '../commandTypes';
import { executeFileNavigationCommand, FILE_NAVIGATION_COMMANDS } from './fileNavigationCommands';
import { executeFileContentCommand, FILE_CONTENT_COMMANDS } from './fileContentCommands';
import { executeFileMutationCommand, FILE_MUTATION_COMMANDS } from './fileMutationCommands';
import { executeFileSearchCommand, FILE_SEARCH_COMMANDS } from './fileSearchCommands';
import { executeFileEditorCommand, FILE_EDITOR_COMMANDS } from './fileEditorCommands';

const FILE_COMMAND_HANDLERS: Array<readonly [Set<string>, TerminalCommandHandler]> = [
  [FILE_NAVIGATION_COMMANDS, executeFileNavigationCommand],
  [FILE_CONTENT_COMMANDS, executeFileContentCommand],
  [FILE_MUTATION_COMMANDS, executeFileMutationCommand],
  [FILE_SEARCH_COMMANDS, executeFileSearchCommand],
  [FILE_EDITOR_COMMANDS, executeFileEditorCommand],
];

export const FILE_COMMANDS = new Set(
  FILE_COMMAND_HANDLERS.flatMap(([commands]) => [...commands]),
);

export const executeFileCommand: TerminalCommandHandler = async (
  command,
  args,
  commandStr,
  context,
) => {
  const handler = FILE_COMMAND_HANDLERS.find(([commands]) => commands.has(command))?.[1];
  return handler
    ? handler(command, args, commandStr, context)
    : {};
};
