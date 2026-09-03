import { createFile, writeFile, isValidFilePath } from '../../services/fs/vfs';
import {
  type CommandExecutionContext,
  type TerminalOutputItem,
  ALLOWED_COMMANDS,
  resolvePath,
  extractRedirection,
  tokenize,
} from './terminalTypes';
import type { TerminalCommandHandler } from './commandTypes';
import { executeFileCommand, FILE_COMMANDS } from './handlers/fileCommands';
import { executeProjectCommand, PROJECT_COMMANDS } from './handlers/projectCommands';
import { executeDependencyCommand, DEPENDENCY_COMMANDS } from './handlers/dependencyCommands';
import { executeRuntimeCommand, RUNTIME_COMMANDS } from './handlers/runtimeCommands';
import { executeGitCommand, GIT_COMMANDS } from './handlers/gitCommands';
import { executeShellCommand, SHELL_COMMANDS } from './handlers/shellCommands';

const COMMAND_HANDLERS: Array<readonly [Set<string>, TerminalCommandHandler]> = [
  [FILE_COMMANDS, executeFileCommand],
  [PROJECT_COMMANDS, executeProjectCommand],
  [DEPENDENCY_COMMANDS, executeDependencyCommand],
  [RUNTIME_COMMANDS, executeRuntimeCommand],
  [GIT_COMMANDS, executeGitCommand],
  [SHELL_COMMANDS, executeShellCommand],
];

function findCommandHandler(command: string): TerminalCommandHandler | undefined {
  return COMMAND_HANDLERS.find(([commands]) => commands.has(command))?.[1];
}

function normalizeRedirectTarget(target: string): string {
  if (
    (target.startsWith('"') && target.endsWith('"')) ||
    (target.startsWith("'") && target.endsWith("'"))
  ) {
    return target.slice(1, -1).trim();
  }
  return target;
}

async function writeRedirectedOutput(
  context: CommandExecutionContext,
  targetPath: string,
  mode: 'append' | 'overwrite',
  outputText: string,
): Promise<void> {
  if (!context.projectId) return;

  const destination = resolvePath(context.cwd, targetPath);
  const existing = context.files.find(file => file.path === destination);

  if (existing) {
    const content = mode === 'append'
      ? `${existing.content}\n${outputText}`
      : outputText;
    await writeFile(existing.id, content);
  } else {
    await createFile(context.projectId, destination, outputText);
  }

  context.onFilesChanged?.();
}

export async function executeTerminalCommand(
  rawCommand: string,
  context: CommandExecutionContext,
): Promise<void> {
  const trimmed = rawCommand.trim();
  if (!trimmed) return;

  context.setCmdHistory(prev => [...prev, trimmed]);
  context.addOutput('cmd', trimmed, { cwd: context.cwd });

  const { commandStr, redirectMode, redirectFile } = extractRedirection(trimmed);
  let tokens = tokenize(commandStr);
  if (tokens.length === 0) return;

  tokens = tokens.map(token => {
    if (!token.startsWith('$')) return token;
    const value = context.env[token.slice(1)];
    return value !== undefined ? value : '';
  });

  const command = tokens[0]?.toLowerCase() || '';
  const args = tokens.slice(1);

  if (!ALLOWED_COMMANDS.has(command)) {
    context.addOutput(
      'stderr',
      `laide: '${command || trimmed}' isn't available in this browser-based shell — type 'help' to see what is`,
    );
    return;
  }

  const targetRedirectFile = normalizeRedirectTarget(redirectFile);
  if (
    targetRedirectFile &&
    (!isValidFilePath(resolvePath(context.cwd, targetRedirectFile)) ||
      /[\r\n\t]/.test(targetRedirectFile))
  ) {
    context.addOutput('stderr', `laide: syntax error near unexpected token '${targetRedirectFile}'`);
    return;
  }

  context.setIsRunning(true);

  try {
    const handler = findCommandHandler(command);
    if (!handler) {
      context.addOutput('stderr', `laide: no handler registered for '${command}'`);
      return;
    }

    const result = await handler(command, args, commandStr, context);
    const outputText = result.outputText ?? '';
    const outputType: TerminalOutputItem['type'] = result.outputType ?? 'stdout';

    if (result.stop) {
      return;
    }

    if (targetRedirectFile && context.projectId && outputType !== 'stderr') {
      await writeRedirectedOutput(context, targetRedirectFile, redirectMode, outputText);
      return;
    }

    if (outputText) {
      context.addOutput(outputType, outputText);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    context.addOutput('stderr', `Execution error: ${message}`);
  } finally {
    context.setIsRunning(false);
  }
}
