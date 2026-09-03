
import type { CommandExecutionContext, TerminalOutputItem } from '../terminalTypes';
import type { TerminalCommandHandler } from '../commandTypes';

export const GIT_COMMANDS = new Set([
  'git',
]);

export const executeGitCommand: TerminalCommandHandler = async (command, args, commandStr, context) => {
  const { files, cwd } = context;
  let outputText = '';
  let outputType: TerminalOutputItem['type'] = 'stdout';
  switch (command) {
    
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
    default:
      return {};
  }
  return { outputText, outputType };
};
