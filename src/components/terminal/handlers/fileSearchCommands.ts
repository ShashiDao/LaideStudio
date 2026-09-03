import { formatByteSize } from '../../../utils/formatters';
import { resolvePath } from '../terminalTypes';
import { findFile } from './fileCommandUtils';
import type { TerminalCommandHandler } from '../commandTypes';

export const FILESEARCH_COMMANDS = new Set(['grep', 'find', 'wc', 'stat', 'tree']);

export const executeFileSearchCommand: TerminalCommandHandler = async (command, _args, _commandStr, context) => {
  if (!FILESEARCH_COMMANDS.has(command)) return {};
  const { files, cwd, getDirEntries, dirExists } = context;
  switch (command) {
    
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
    
      if (!queryTokens.length) {
        return { outputType: 'stderr', outputText: 'grep: missing pattern' };
      }
    
      const pattern = queryTokens[0];
      const targetFile = queryTokens[1];
      const regex = new RegExp(
        pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        caseInsensitive ? 'i' : '',
      );
      const searchTargets = targetFile
        ? files.filter(file => file.path === resolvePath(cwd, targetFile))
        : files;
    
      if (targetFile && !searchTargets.length) {
        return {
          outputType: 'stderr',
          outputText: `grep: ${targetFile}: No such file or directory`,
        };
      }
    
      const results: string[] = [];
      let matchCount = 0;
    
      for (const file of searchTargets) {
        file.content.split('\n').forEach((line, index) => {
          const matched = regex.test(line);
          if ((matched && !invert) || (!matched && invert)) {
            matchCount += 1;
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
    
      for (let index = 0; index < args.length; index += 1) {
        if (args[index] === '-name' && args[index + 1]) {
          namePattern = args[index + 1];
          index += 1;
        } else if (!args[index].startsWith('-')) {
          targetDir = args[index];
        }
      }
    
      const resolved = resolvePath(cwd, targetDir);
      const matchedFiles = files.filter(file => {
        if (resolved !== '/' && !file.path.startsWith(`${resolved}/`) && file.path !== resolved) {
          return false;
        }
        if (!namePattern) return true;
        return (file.path.split('/').pop() || '').includes(namePattern.replace(/\*/g, ''));
      });
    
      return { outputText: matchedFiles.map(file => file.path).join('\n') };
    }

    
    case 'wc': {
      const flags = args.filter(arg => arg.startsWith('-'));
      const fileArgs = args.filter(arg => !arg.startsWith('-'));
      const countLines = !flags.length || flags.some(flag => flag.includes('l'));
      const countWords = !flags.length || flags.some(flag => flag.includes('w'));
      const countChars = !flags.length || flags.some(flag => flag.includes('c'));
      const targetFiles = fileArgs.length
        ? files.filter(file => fileArgs.some(arg => resolvePath(cwd, arg) === file.path))
        : files;
    
      if (fileArgs.length && !targetFiles.length) {
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
        const parts: string[] = [];
        if (countLines) parts.push(totalL.toString().padStart(6, ' '));
        if (countWords) parts.push(totalW.toString().padStart(6, ' '));
        if (countChars) parts.push(totalC.toString().padStart(8, ' '));
        parts.push(' total');
        rows.push(parts.join(''));
      }
    
      return { outputText: rows.join('\n') };
    }

    
    case 'stat': {
      if (!args.length) {
        return { outputType: 'stderr', outputText: 'stat: missing operand' };
      }
    
      const found = findFile(context, resolvePath(cwd, args[0]));
      if (!found) {
        return {
          outputType: 'stderr',
          outputText: `stat: cannot stat '${args[0]}': No such file or directory`,
        };
      }
    
      const size = new Blob([found.content]).size;
      const lines = found.content.split('\n').length;
      const words = found.content.trim() ? found.content.trim().split(/\s+/).length : 0;
    
      return {
        outputText: `  File: ${found.path}\n  Size: ${size} bytes (${formatByteSize(size)})  Lines: ${lines}  Words: ${words}\n  Type: Regular File\n Inode: ${found.id}\nModify: ${new Date(found.updatedAt || Date.now()).toISOString()}\nAccess: 0644/-rw-r--r--`,
      };
    }

    
    case 'tree': {
      const levelIndex = args.indexOf('-L');
      const maxLevel = levelIndex !== -1 ? parseInt(args[levelIndex + 1], 10) || 10 : 10;
      const targetDir = args.find(
        arg => !arg.startsWith('-') && !Number.isInteger(Number(arg)),
      ) || cwd;
      const resolved = resolvePath(cwd, targetDir);
    
      if (!dirExists(resolved)) {
        return {
          outputType: 'stderr',
          outputText: `tree: '${targetDir}': No such file or directory`,
        };
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
          index += 1;
          dirCount += 1;
          const isLast = index === total;
          lines.push(`${prefix}${isLast ? '└── ' : '├── '}${folder}/`);
          const nextPath = currentPath === '/' ? `/${folder}` : `${currentPath}/${folder}`;
          lines.push(...renderTree(nextPath, prefix + (isLast ? '    ' : '│   '), level + 1));
        }
    
        for (const file of dirFiles) {
          index += 1;
          fileCount += 1;
          lines.push(`${prefix}${index === total ? '└── ' : '├── '}${file.path.split('/').pop() || file.path}`);
        }
    
        return lines;
      };
    
      return {
        outputText: [
          resolved,
          ...renderTree(resolved),
          `\n${dirCount} directories, ${fileCount} files`,
        ].join('\n'),
      };
    }
    default:
      return {};
  }
};
