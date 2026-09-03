import { createFile, writeFile, deleteFile, deleteFolder, renameFile } from '../../../services/fs/vfs';
import { resolvePath } from '../terminalTypes';
import { findFile } from './fileCommandUtils';
import type { TerminalCommandHandler } from '../commandTypes';

export const FILEMUTATION_COMMANDS = new Set(['touch', 'mkdir', 'rm', 'cp', 'mv']);

export const executeFileMutationCommand: TerminalCommandHandler = async (command, args, commandStr, context) => {
  if (!FILEMUTATION_COMMANDS.has(command)) return {};
  const { files, cwd, projectId, onFilesChanged } = context;
  switch (command) {
    
    case 'touch': {
      if (args.length === 0) {
        return { outputType: 'stderr', outputText: 'touch: missing file operand' };
      }
    
      if (!projectId) {
        return { outputType: 'stderr', outputText: 'touch: no active project open' };
      }
    
      for (const rawFile of args) {
        const resolved = resolvePath(cwd, rawFile);
        const existing = findFile(context, resolved);
        if (existing) {
          await writeFile(existing.id, existing.content);
        } else {
          await createFile(projectId, resolved, '');
        }
      }
    
      onFilesChanged?.();
      return { outputText: '' };
    }

    
    case 'mkdir': {
      if (args.length === 0) {
        return { outputType: 'stderr', outputText: 'mkdir: missing operand' };
      }
    
      if (!projectId) {
        return { outputType: 'stderr', outputText: 'mkdir: no active project open' };
      }
    
      for (const dir of args.filter(arg => arg !== '-p')) {
        const resolved = resolvePath(cwd, dir);
        const keepPath = `${resolved.endsWith('/') ? resolved : `${resolved}/`}.gitkeep`;
        if (!files.some(file => file.path === keepPath)) {
          await createFile(projectId, keepPath, '');
        }
      }
    
      onFilesChanged?.();
      return { outputText: '' };
    }

    
    case 'rm': {
      if (args.length === 0) {
        return { outputType: 'stderr', outputText: 'rm: missing operand' };
      }
    
      if (!projectId) {
        return { outputType: 'stderr', outputText: 'rm: no active project open' };
      }
    
      const isRecursive = args.some(arg => arg === '-r' || arg === '-rf' || arg === '-fr');
      const targetPaths = args.filter(arg => !arg.startsWith('-'));
      const errors: string[] = [];
    
      for (const target of targetPaths) {
        const resolved = resolvePath(cwd, target);
        const fileMatch = findFile(context, resolved);
    
        if (fileMatch) {
          await deleteFile(fileMatch.id);
        } else if (isRecursive && dirExists(resolved)) {
          await deleteFolder(projectId, resolved);
        } else {
          errors.push(`rm: cannot remove '${target}': No such file or directory`);
        }
      }
    
      onFilesChanged?.();
      return {
        outputType: errors.length ? 'stderr' : 'stdout',
        outputText: errors.join('\n'),
      };
    }

    
    case 'cp': {
      if (args.length < 2) {
        return {
          outputType: 'stderr',
          outputText: 'cp: missing destination file operand after source',
        };
      }
    
      if (!projectId) {
        return { outputType: 'stderr', outputText: 'cp: no active project open' };
      }
    
      const src = resolvePath(cwd, args[0]);
      const dest = resolvePath(cwd, args[1]);
      const srcFile = findFile(context, src);
    
      if (!srcFile) {
        return {
          outputType: 'stderr',
          outputText: `cp: cannot stat '${args[0]}': No such file or directory`,
        };
      }
    
      const destFile = findFile(context, dest);
      if (destFile) {
        await writeFile(destFile.id, srcFile.content);
      } else {
        await createFile(projectId, dest, srcFile.content);
      }
    
      onFilesChanged?.();
      return { outputText: '' };
    }

    
    case 'mv': {
      if (args.length < 2) {
        return {
          outputType: 'stderr',
          outputText: 'mv: missing destination file operand after source',
        };
      }
    
      if (!projectId) {
        return { outputType: 'stderr', outputText: 'mv: no active project open' };
      }
    
      const src = resolvePath(cwd, args[0]);
      const dest = resolvePath(cwd, args[1]);
      const srcFile = findFile(context, src);
    
      if (!srcFile) {
        return {
          outputType: 'stderr',
          outputText: `mv: cannot stat '${args[0]}': No such file or directory`,
        };
      }
    
      await renameFile(srcFile.id, dest);
      onFilesChanged?.();
      return { outputText: '' };
    }
    default:
      return {};
  }
};
