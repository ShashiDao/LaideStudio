import {
  createFile,
  writeFile,
} from '../../../services/fs/vfs';
import { formatByteSize } from '../../../utils/formatters';
import type { CommandExecutionContext } from '../terminalTypes';
import type { TerminalCommandHandler } from '../commandTypes';

const findFile = (context: CommandExecutionContext, path: string) =>
  context.files.find(file => file.path === path);

export const executeFileCommand: TerminalCommandHandler = async (args, _commandStr, context) => {
  const { files, cwd, projectId, env, setCwd, dirExists, getDirEntries, onFilesChanged, setActiveFileId } = context;
  const command = context.__command;

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

      const resolved = context.resolvePath(cwd, target);
      if (dirExists(resolved)) {
        setCwd(resolved);
        return { outputText: '' };
      }
      return {
        outputType: 'stderr',
        outputText: `cd: no such file or directory: ${target}`,
      };
    }

    case 'ls': {
      const isLong = args.some(arg => arg.includes('l'));
      const isAll = args.some(arg => arg.includes('a'));
      const targetDir = args.find(arg => !arg.startsWith('-')) || cwd;
      const resolved = context.resolvePath(cwd, targetDir);

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

      const lines: string[] = [];
      const totalCount = folders.length + dirFiles.length + (isAll ? 2 : 0);
      lines.push(`total ${totalCount}`);
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
      const fileArgs = args.filter(arg => arg !== '-n');
      const contents: string[] = [];

      for (const rawFile of fileArgs) {
        const resolved = context.resolvePath(cwd, rawFile);
        const found = findFile(context, resolved);
        if (!found) {
          contents.push(`cat: ${rawFile}: No such file or directory`);
        } else if (showLineNumbers) {
          contents.push(found.content
            .split('\n')
            .map((line, index) => `${(index + 1).toString().padStart(4, ' ')} | ${line}`)
            .join('\n'));
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
      for (let index = 0; index < args.length; index++) {
        if (args[index] === '-n' && args[index + 1]) {
          lineCount = parseInt(args[index + 1], 10) || 10;
          index++;
        } else if (!args[index].startsWith('-')) {
          fileArg = args[index];
        }
      }

      if (!fileArg) {
        return { outputType: 'stderr', outputText: `${command}: missing file operand` };
      }
      const found = findFile(context, context.resolvePath(cwd, fileArg));
      if (!found) {
        return {
          outputType: 'stderr',
          outputText: `${command}: cannot open '${fileArg}': No such file or directory`,
        };
      }
      const lines = found.content.split('\n');
      return {
        outputText: command === 'head'
          ? lines.slice(0, lineCount).join('\n')
          : lines.slice(-lineCount).join('\n'),
      };
    }

    case 'touch': {
      if (args.length === 0) return { outputType: 'stderr', outputText: 'touch: missing file operand' };
      if (!projectId) return { outputType: 'stderr', outputText: 'touch: no active project open' };

      for (const rawFile of args) {
        const resolved = context.resolvePath(cwd, rawFile);
        const existing = findFile(context, resolved);
        if (existing) await writeFile(existing.id, existing.content);
        else await createFile(projectId, resolved, '');
      }
      onFilesChanged?.();
      return { outputText: '' };
    }

    case 'mkdir': {
      if (args.length === 0) return { outputType: 'stderr', outputText: 'mkdir: missing operand' };
      if (!projectId) return { outputType: 'stderr', outputText: 'mkdir: no active project open' };

      for (const dir of args.filter(arg => arg !== '-p')) {
        const resolved = context.resolvePath(cwd, dir);
        const keepPath = `${resolved.endsWith('/') ? resolved : `${resolved}/`}.gitkeep`;
        if (!files.some(file => file.path === keepPath)) {
          await createFile(projectId, keepPath, '');
        }
      }
      onFilesChanged?.();
      return { outputText: '' };
    }

    case 'grep': {
      let caseInsensitive = false;
      let showLineNum = false;
      let invert = false;
      let countOnly = false;
      const queryTokens: string[] = [];

      for (const arg of args) {
        if (arg === '-i') caseInsensitive = true;
        else if (arg === '-n') showLineNum = true;
        else if (arg === '-v') invert = true;
        else if (arg === '-c') countOnly = true;
        else queryTokens.push(arg);
      }
      if (queryTokens.length === 0) return { outputType: 'stderr', outputText: 'grep: missing pattern' };

      const pattern = queryTokens[0];
      const targetFile = queryTokens[1];
      const regex = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), caseInsensitive ? 'i' : '');
      const searchTargets = targetFile
        ? files.filter(file => file.path === context.resolvePath(cwd, targetFile))
        : files;

      if (targetFile && searchTargets.length === 0) {
        return { outputType: 'stderr', outputText: `grep: ${targetFile}: No such file or directory` };
      }

      const results: string[] = [];
      let matchCount = 0;
      for (const file of searchTargets) {
        file.content.split('\n').forEach((line, index) => {
          const matched = regex.test(line);
          if ((matched && !invert) || (!matched && invert)) {
            matchCount++;
            if (!countOnly) {
              const prefix = searchTargets.length > 1 ? `${file.path}:` : '';
              const linePrefix = showLineNum ? `${index + 1}:` : '';
              results.push(`${prefix}${linePrefix}${line}`);
            }
          }
        });
      }
      return { outputText: countOnly ? matchCount.toString() : results.join('\n') };
    }

    case 'find': {
      let targetDir = cwd;
      let namePattern = '';
      for (let index = 0; index < args.length; index++) {
        if (args[index] === '-name' && args[index + 1]) {
          namePattern = args[index + 1];
          index++;
        } else if (!args[index].startsWith('-')) {
          targetDir = args[index];
        }
      }
      const resolved = context.resolvePath(cwd, targetDir);
      const matchedFiles = files.filter(file => {
        if (resolved !== '/' && !file.path.startsWith(`${resolved}/`) && file.path !== resolved) return false;
        if (!namePattern) return true;
        const fileName = file.path.split('/').pop() || '';
        return fileName.includes(namePattern.replace(/\*/g, ''));
      });
      return { outputText: matchedFiles.map(file => file.path).join('\n') };
    }

    case 'wc': {
      const flags = args.filter(arg => arg.startsWith('-'));
      const fileArgs = args.filter(arg => !arg.startsWith('-'));
      const countLines = flags.length === 0 || flags.some(flag => flag.includes('l'));
      const countWords = flags.length === 0 || flags.some(flag => flag.includes('w'));
      const countChars = flags.length === 0 || flags.some(flag => flag.includes('c'));
      const targetFiles = fileArgs.length > 0
        ? files.filter(file => fileArgs.some(arg => context.resolvePath(cwd, arg) === file.path))
        : files;

      if (fileArgs.length > 0 && targetFiles.length === 0) {
        return { outputType: 'stderr', outputText: 'wc: no matching files found' };
      }

      const rows: string[] = [];
      let totalL = 0;
      let totalW = 0;
      let totalC = 0;
      for (const file of targetFiles) {
        const lines = file.content ? file.content.split('\n').length : 0;
        const words = file.content.trim() ? file.content.trim().split(/\s+/).length : 0;
        const chars = new Blob([file.content]).size;
        totalL += lines;
        totalW += words;
        totalC += chars;
        const parts: string[] = [];
        if (countLines) parts.push(lines.toString().padStart(6, ' '));
        if (countWords) parts.push(words.toString().padStart(6, ' '));
        if (countChars) parts.push(chars.toString().padStart(8, ' '));
        parts.push(` ${file.path}`);
        rows.push(parts.join(''));
      }
      if (targetFiles.length > 1) {
        const totalParts: string[] = [];
        if (countLines) totalParts.push(totalL.toString().padStart(6, ' '));
        if (countWords) totalParts.push(totalW.toString().padStart(6, ' '));
        if (countChars) totalParts.push(totalC.toString().padStart(8, ' '));
        totalParts.push(' total');
        rows.push(totalParts.join(''));
      }
      return { outputText: rows.join('\n') };
    }

    case 'stat': {
      if (args.length === 0) return { outputType: 'stderr', outputText: 'stat: missing operand' };
      const found = findFile(context, context.resolvePath(cwd, args[0]));
      if (!found) {
        return { outputType: 'stderr', outputText: `stat: cannot stat '${args[0]}': No such file or directory` };
      }
      const size = new Blob([found.content]).size;
      const lines = found.content.split('\n').length;
      const words = found.content.trim() ? found.content.trim().split(/\s+/).length : 0;
      const modified = new Date(found.updatedAt || Date.now()).toISOString();
      return {
        outputText: `  File: ${found.path}\n  Size: ${size} bytes (${formatByteSize(size)})  Lines: ${lines}  Words: ${words}\n  Type: Regular File\n Inode: ${found.id}\nModify: ${modified}\nAccess: 0644/-rw-r--r--`,
      };
    }

    case 'tree': {
      const levelIndex = args.indexOf('-L');
      const maxLevel = levelIndex !== -1 ? parseInt(args[levelIndex + 1], 10) || 10 : 10;
      const targetDir = args.find(arg => !arg.startsWith('-') && !Number.isInteger(Number(arg))) || cwd;
      const resolved = context.resolvePath(cwd, targetDir);
      if (!dirExists(resolved)) {
        return { outputType: 'stderr', outputText: `tree: '${targetDir}': No such file or directory` };
      }

      let dirCount = 0;
      let fileCount = 0;
      const renderTree = (currentPath: string, prefix = '', level = 0): string[] => {
        if (level >= maxLevel) return [];
        const { folders, files: dirFiles } = getDirEntries(currentPath);
        const total = folders.length + dirFiles.length;
        const lines: string[] = [];
        let index = 0;
        for (const folder of folders) {
          index++;
          dirCount++;
          const isLast = index === total;
          lines.push(`${prefix}${isLast ? '└── ' : '├── '}${folder}/`);
          const nextPath = currentPath === '/' ? `/${folder}` : `${currentPath}/${folder}`;
          lines.push(...renderTree(nextPath, prefix + (isLast ? '    ' : '│   '), level + 1));
        }
        for (const file of dirFiles) {
          index++;
          fileCount++;
          const isLast = index === total;
          const name = file.path.split('/').pop() || file.path;
          lines.push(`${prefix}${isLast ? '└── ' : '├── '}${name}`);
        }
        return lines;
      };
      return { outputText: [resolved, ...renderTree(resolved), `\n${dirCount} directories, ${fileCount} files`].join('\n') };
    }

    case 'open':
    case 'code':
    case 'edit': {
      if (args.length === 0) return { outputType: 'stderr', outputText: `${command}: missing file operand` };
      const found = findFile(context, context.resolvePath(cwd, args[0]));
      if (!found) return { outputType: 'stderr', outputText: `${command}: file not found: ${args[0]}` };
      setActiveFileId(found.id);
      return { outputType: 'success', outputText: `Opened ${found.path} in Code Editor.` };
    }

    default:
      return { outputText: undefined };
  }
};
