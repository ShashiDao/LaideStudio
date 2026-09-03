import { createFile, writeFile } from '../../../services/fs/vfs';
import { formatByteSize } from '../../../utils/formatters';
import { resolvePath, type CommandExecutionContext } from '../terminalTypes';
import type { TerminalCommandHandler } from '../commandTypes';

export const FILE_COMMANDS = new Set([
  'pwd',
  'cd',
  'ls',
  'cat',
  'head',
  'tail',
  'touch',
  'mkdir',
  'grep',
  'find',
  'wc',
  'stat',
  'tree',
  'open',
  'code',
  'edit',
]);

const findFile = (context: CommandExecutionContext, path: string) =>
  context.files.find(file => file.path === path);

export const executeFileCommand: TerminalCommandHandler = async (command, args, _commandStr, context) => {
  if (!FILE_COMMANDS.has(command)) return {};

  const { files, cwd, projectId, env, setCwd, dirExists, getDirEntries, onFilesChanged, setActiveFileId } = context;

  switch (command) {
    case 'pwd': return { outputText: cwd };
    case 'cd': {
      const target = args[0] || '/';
      if (target === '~' || target === '/') { setCwd('/'); return { outputText: '' }; }
      if (target === '..') {
        const parts = cwd.split('/').filter(Boolean); parts.pop(); setCwd('/' + parts.join('/')); return { outputText: '' };
      }
      const resolved = resolvePath(cwd, target);
      if (dirExists(resolved)) { setCwd(resolved); return { outputText: '' }; }
      return { outputType: 'stderr', outputText: `cd: no such file or directory: ${target}` };
    }
    case 'ls': {
      const isLong = args.some(arg => arg.includes('l'));
      const isAll = args.some(arg => arg.includes('a'));
      const targetDir = args.find(arg => !arg.startsWith('-')) || cwd;
      const resolved = resolvePath(cwd, targetDir);
      if (!dirExists(resolved)) return { outputType: 'stderr', outputText: `ls: cannot access '${targetDir}': No such file or directory` };
      const { folders, files: dirFiles } = getDirEntries(resolved);
      if (!isLong) {
        const items: string[] = isAll ? ['.', '..'] : [];
        folders.forEach(folder => items.push(`${folder}/`));
        dirFiles.forEach(file => items.push(file.path.split('/').pop() || file.path));
        return { outputText: items.join('   ') };
      }
      const lines: string[] = [`total ${folders.length + dirFiles.length + (isAll ? 2 : 0)}`];
      if (isAll) {
        lines.push(`drwxr-xr-x  1 ${env.USER || 'dev'} dev      0 Aug 22 18:00 .`);
        lines.push(`drwxr-xr-x  1 ${env.USER || 'dev'} dev      0 Aug 22 18:00 ..`);
      }
      folders.forEach(folder => lines.push(`drwxr-xr-x  1 ${env.USER || 'dev'} dev      0 Aug 22 18:00 ${folder}/`));
      dirFiles.forEach(file => {
        const fileName = file.path.split('/').pop() || file.path;
        const size = formatByteSize(new Blob([file.content]).size).padStart(8, ' ');
        lines.push(`-rw-r--r--  1 ${env.USER || 'dev'} dev ${size} Aug 22 18:00 ${fileName}`);
      });
      return { outputText: lines.join('\n') };
    }
    case 'cat': {
      if (args.length === 0) return { outputType: 'stderr', outputText: 'cat: missing file operand' };
      const showLineNumbers = args.includes('-n');
      const contents: string[] = [];
      for (const rawFile of args.filter(arg => arg !== '-n')) {
        const found = findFile(context, resolvePath(cwd, rawFile));
        if (!found) contents.push(`cat: ${rawFile}: No such file or directory`);
        else if (showLineNumbers) contents.push(found.content.split('\n').map((line, i) => `${(i + 1).toString().padStart(4, ' ')} | ${line}`).join('\n'));
        else contents.push(found.content);
      }
      return { outputText: contents.join('\n') };
    }
    case 'head':
    case 'tail': {
      let lineCount = 10, fileArg = '';
      for (let i = 0; i < args.length; i++) {
        if (args[i] === '-n' && args[i + 1]) { lineCount = parseInt(args[i + 1], 10) || 10; i++; }
        else if (!args[i].startsWith('-')) fileArg = args[i];
      }
      if (!fileArg) return { outputType: 'stderr', outputText: `${command}: missing file operand` };
      const found = findFile(context, resolvePath(cwd, fileArg));
      if (!found) return { outputType: 'stderr', outputText: `${command}: cannot open '${fileArg}': No such file or directory` };
      const lines = found.content.split('\n');
      return { outputText: command === 'head' ? lines.slice(0, lineCount).join('\n') : lines.slice(-lineCount).join('\n') };
    }
    case 'touch': {
      if (args.length === 0) return { outputType: 'stderr', outputText: 'touch: missing file operand' };
      if (!projectId) return { outputType: 'stderr', outputText: 'touch: no active project open' };
      for (const rawFile of args) {
        const resolved = resolvePath(cwd, rawFile);
        const existing = findFile(context, resolved);
        if (existing) await writeFile(existing.id, existing.content); else await createFile(projectId, resolved, '');
      }
      onFilesChanged?.(); return { outputText: '' };
    }
    case 'mkdir': {
      if (args.length === 0) return { outputType: 'stderr', outputText: 'mkdir: missing operand' };
      if (!projectId) return { outputType: 'stderr', outputText: 'mkdir: no active project open' };
      for (const dir of args.filter(arg => arg !== '-p')) {
        const resolved = resolvePath(cwd, dir);
        const keepPath = `${resolved.endsWith('/') ? resolved : `${resolved}/`}.gitkeep`;
        if (!files.some(file => file.path === keepPath)) await createFile(projectId, keepPath, '');
      }
      onFilesChanged?.(); return { outputText: '' };
    }
    case 'grep': {
      let caseInsensitive = false, showLineNum = false, invert = false, countOnly = false;
      const queryTokens: string[] = [];
      for (const arg of args) {
        if (arg === '-i') caseInsensitive = true; else if (arg === '-n') showLineNum = true; else if (arg === '-v') invert = true; else if (arg === '-c') countOnly = true; else queryTokens.push(arg);
      }
      if (!queryTokens.length) return { outputType: 'stderr', outputText: 'grep: missing pattern' };
      const pattern = queryTokens[0], targetFile = queryTokens[1];
      const regex = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), caseInsensitive ? 'i' : '');
      const searchTargets = targetFile ? files.filter(file => file.path === resolvePath(cwd, targetFile)) : files;
      if (targetFile && !searchTargets.length) return { outputType: 'stderr', outputText: `grep: ${targetFile}: No such file or directory` };
      const results: string[] = []; let matchCount = 0;
      for (const file of searchTargets) file.content.split('\n').forEach((line, index) => {
        const matched = regex.test(line);
        if ((matched && !invert) || (!matched && invert)) {
          matchCount++;
          if (!countOnly) results.push(`${searchTargets.length > 1 ? `${file.path}:` : ''}${showLineNum ? `${index + 1}:` : ''}${line}`);
        }
      });
      return { outputText: countOnly ? matchCount.toString() : results.join('\n') };
    }
    case 'find': {
      let targetDir = cwd, namePattern = '';
      for (let i = 0; i < args.length; i++) {
        if (args[i] === '-name' && args[i + 1]) { namePattern = args[i + 1]; i++; } else if (!args[i].startsWith('-')) targetDir = args[i];
      }
      const resolved = resolvePath(cwd, targetDir);
      const matchedFiles = files.filter(file => {
        if (resolved !== '/' && !file.path.startsWith(`${resolved}/`) && file.path !== resolved) return false;
        if (!namePattern) return true;
        return (file.path.split('/').pop() || '').includes(namePattern.replace(/\*/g, ''));
      });
      return { outputText: matchedFiles.map(file => file.path).join('\n') };
    }
    case 'wc': {
      const flags = args.filter(arg => arg.startsWith('-')), fileArgs = args.filter(arg => !arg.startsWith('-'));
      const countLines = !flags.length || flags.some(flag => flag.includes('l'));
      const countWords = !flags.length || flags.some(flag => flag.includes('w'));
      const countChars = !flags.length || flags.some(flag => flag.includes('c'));
      const targetFiles = fileArgs.length ? files.filter(file => fileArgs.some(arg => resolvePath(cwd, arg) === file.path)) : files;
      if (fileArgs.length && !targetFiles.length) return { outputType: 'stderr', outputText: 'wc: no matching files found' };
      const rows: string[] = []; let totalL = 0, totalW = 0, totalC = 0;
      for (const file of targetFiles) {
        const lines = file.content ? file.content.split('\n').length : 0, words = file.content.trim() ? file.content.trim().split(/\s+/).length : 0, chars = new Blob([file.content]).size;
        totalL += lines; totalW += words; totalC += chars;
        const parts: string[] = [];
        if (countLines) parts.push(lines.toString().padStart(6, ' ')); if (countWords) parts.push(words.toString().padStart(6, ' ')); if (countChars) parts.push(chars.toString().padStart(8, ' '));
        parts.push(` ${file.path}`); rows.push(parts.join(''));
      }
      if (targetFiles.length > 1) {
        const parts: string[] = []; if (countLines) parts.push(totalL.toString().padStart(6, ' ')); if (countWords) parts.push(totalW.toString().padStart(6, ' ')); if (countChars) parts.push(totalC.toString().padStart(8, ' '));
        parts.push(' total'); rows.push(parts.join(''));
      }
      return { outputText: rows.join('\n') };
    }
    case 'stat': {
      if (!args.length) return { outputType: 'stderr', outputText: 'stat: missing operand' };
      const found = findFile(context, resolvePath(cwd, args[0]));
      if (!found) return { outputType: 'stderr', outputText: `stat: cannot stat '${args[0]}': No such file or directory` };
      const size = new Blob([found.content]).size, lines = found.content.split('\n').length, words = found.content.trim() ? found.content.trim().split(/\s+/).length : 0;
      return { outputText: `  File: ${found.path}\n  Size: ${size} bytes (${formatByteSize(size)})  Lines: ${lines}  Words: ${words}\n  Type: Regular File\n Inode: ${found.id}\nModify: ${new Date(found.updatedAt || Date.now()).toISOString()}\nAccess: 0644/-rw-r--r--` };
    }
    case 'tree': {
      const levelIndex = args.indexOf('-L'), maxLevel = levelIndex !== -1 ? parseInt(args[levelIndex + 1], 10) || 10 : 10;
      const targetDir = args.find(arg => !arg.startsWith('-') && !Number.isInteger(Number(arg))) || cwd, resolved = resolvePath(cwd, targetDir);
      if (!dirExists(resolved)) return { outputType: 'stderr', outputText: `tree: '${targetDir}': No such file or directory` };
      let dirCount = 0, fileCount = 0;
      const renderTree = (currentPath: string, prefix = '', level = 0): string[] => {
        if (level >= maxLevel) return [];
        const { folders, files: dirFiles } = getDirEntries(currentPath), total = folders.length + dirFiles.length, lines: string[] = [];
        let index = 0;
        for (const folder of folders) { index++; dirCount++; const isLast = index === total; lines.push(`${prefix}${isLast ? '└── ' : '├── '}${folder}/`); const nextPath = currentPath === '/' ? `/${folder}` : `${currentPath}/${folder}`; lines.push(...renderTree(nextPath, prefix + (isLast ? '    ' : '│   '), level + 1)); }
        for (const file of dirFiles) { index++; fileCount++; lines.push(`${prefix}${index === total ? '└── ' : '├── '}${file.path.split('/').pop() || file.path}`); }
        return lines;
      };
      return { outputText: [resolved, ...renderTree(resolved), `\n${dirCount} directories, ${fileCount} files`].join('\n') };
    }
    case 'open':
    case 'code':
    case 'edit': {
      if (!args.length) return { outputType: 'stderr', outputText: `${command}: missing file operand` };
      const found = findFile(context, resolvePath(cwd, args[0]));
      if (!found) return { outputType: 'stderr', outputText: `${command}: file not found: ${args[0]}` };
      setActiveFileId(found.id); return { outputType: 'success', outputText: `Opened ${found.path} in Code Editor.` };
    }
    default: return {};
  }
};
