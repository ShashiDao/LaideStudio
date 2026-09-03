import type { CommandExecutionContext } from '../terminalTypes';

export const findFile = (context: CommandExecutionContext, path: string) =>
  context.files.find(file => file.path === path);
