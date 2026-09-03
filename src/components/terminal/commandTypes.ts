import type { CommandExecutionContext, TerminalOutputItem } from './terminalTypes';

export type TerminalCommandResult = {
  outputText?: string;
  outputType?: TerminalOutputItem['type'];
  stop?: boolean;
};

export type TerminalCommandHandler = (
  command: string,
  args: string[],
  commandStr: string,
  context: CommandExecutionContext,
) => Promise<TerminalCommandResult> | TerminalCommandResult;
