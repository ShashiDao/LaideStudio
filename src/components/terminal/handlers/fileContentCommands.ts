import { formatByteSize } from '../../../utils/formatters';
import { resolvePath } from '../terminalTypes';
import { findFile } from './fileCommandUtils';
import type { TerminalCommandHandler } from '../commandTypes';

export const FILECONTENT_COMMANDS = new Set(['ls', 'cat', 'head', 'tail']);

export const executeFileContentCommand: TerminalCommandHandler = async (command, args, _commandStr, context) => {
  if (!FILECONTENT_COMMANDS.has(command)) return {};
  const { files, cwd, env, getDirEntries, dirExists } = context;
  switch (command) {
    
    case 'ls': {
      const isLong = args.some(arg => arg.includes('l'));
      const isAll = args.some(arg => arg.includes('a'));
      const targetDir = args.find(arg => !arg.startsWith('-')) || cwd;
      const resolved = resolvePath(cwd, targetDir);
    
      if (!dirExists(resolved)) {
        return {
          outputType: 'stderr',
          outputText: `ls: cannot access '${targetDir}': No such file or directory`,
        };
      }
    
      const { folders, files: dirFiles } = getDirEntries(resolved);
    
      if (!isLong) {
        const items: string[] = isAll ? ['.', '..'] : [];
        folders.forEach(folder => items.push(`${folder}/`));
        dirFiles.forEach(file => items.push(file.path.split('/').pop() || file.path));
        return { outputText: items.join('   ') };
      }
    
      const lines: string[] = [
        `total ${folders.length + dirFiles.length + (isAll ? 2 : 0)}`,
      ];
    
      if (isAll) {
        lines.push(`drwxr-xr-x  1 ${env.USER || 'dev'} dev      0 Aug 22 18:00 .`);
        lines.push(`drwxr-xr-x  1 ${env.USER || 'dev'} dev      0 Aug 22 18:00 ..`);
      }
    
      folders.forEach(folder => {
        lines.push(`drwxr-xr-x  1 ${env.USER || 'dev'} dev      0 Aug 22 18:00 ${folder}/`);
      });
    
      dirFiles.forEach(file => {
        const fileName = file.path.split('/').pop() || file.path;
        const size = formatByteSize(new Blob([file.content]).size).padStart(8, ' ');
        lines.push(`-rw-r--r--  1 ${env.USER || 'dev'} dev ${size} Aug 22 18:00 ${fileName}`);
      });
    
      return { outputText: lines.join('\n') };
    }

    
    case 'cat': {
      if (args.length === 0) {
        return { outputType: 'stderr', outputText: 'cat: missing file operand' };
      }
    
      const showLineNumbers = args.includes('-n');
      const contents: string[] = [];
    
      for (const rawFile of args.filter(arg => arg !== '-n')) {
        const found = findFile(context, resolvePath(cwd, rawFile));
        if (!found) {
          contents.push(`cat: ${rawFile}: No such file or directory`);
        } else if (showLineNumbers) {
          contents.push(
            found.content
              .split('\n')
              .map((line, index) => `${(index + 1).toString().padStart(4, ' ')} | ${line}`)
              .join('\n'),
          );
        } else {
          contents.push(found.content);
        }
      }
    
      return { outputText: contents.join('\n') };
    }

    
    case 'head':

    case 'tail': {
      let lineCount = 10;
      let fileArg = '';
    
      for (let index = 0; index < args.length; index += 1) {
        if (args[index] === '-n' && args[index + 1]) {
          lineCount = parseInt(args[index + 1], 10) || 10;
          index += 1;
        } else if (!args[index].startsWith('-')) {
          fileArg = args[index];
        }
      }
    
      if (!fileArg) {
        return { outputType: 'stderr', outputText: `${command}: missing file operand` };
      }
    
      const found = findFile(context, resolvePath(cwd, fileArg));
      if (!found) {
        return {
          outputType: 'stderr',
          outputText: `${command}: cannot open '${fileArg}': No such file or directory`,
        };
      }
    
      const lines = found.content.split('\n');
      return {
        outputText:
          command === 'head'
            ? lines.slice(0, lineCount).join('\n')
            : lines.slice(-lineCount).join('\n'),
      };
    }
    default:
      return {};
  }
};
