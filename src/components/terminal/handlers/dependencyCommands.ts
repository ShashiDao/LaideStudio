import { createFile, writeFile } from '../../../services/fs/vfs';
import { formatByteSize } from '../../../utils/formatters';
import { computeSha256, findLockfile, serializeLockfile, getCanonicalVendorPath, LOCKFILE_PATH } from '../../../services/bundler/lockfile';
import type { TerminalOutputItem } from '../terminalTypes';
import type { TerminalCommandHandler } from '../commandTypes';

export const DEPENDENCY_COMMANDS = new Set([
  'vendor', 'lockfile', 'lock',
]);
export const DEPENDENCIES_COMMANDS = DEPENDENCY_COMMANDS;

export const executeDependencyCommand: TerminalCommandHandler = async (command, args, commandStr, context) => {
  const { files, projectId, addOutput, onFilesChanged } = context;
  let outputText: string;
  let outputType: TerminalOutputItem['type'];
  switch (command) {
    
    case 'vendor': {
      const pkgArg = args.join(' ').trim();
      if (!pkgArg) {
        outputType = 'stderr';
        outputText = 'vendor: missing package operand. Usage: vendor <package-name>';
      } else if (!projectId) {
        outputType = 'stderr';
        outputText = 'vendor: no active project open';
      } else {
        addOutput('info', `📦 Vendoring package "${pkgArg}"...`);
        let pkgName = pkgArg;
        let requestedVersion = '';
        if (pkgArg.startsWith('@')) {
          const atIdx = pkgArg.indexOf('@', 1);
          if (atIdx !== -1) {
            pkgName = pkgArg.slice(0, atIdx);
            requestedVersion = pkgArg.slice(atIdx + 1);
          }
        } else {
          const atIdx = pkgArg.indexOf('@');
          if (atIdx !== -1) {
            pkgName = pkgArg.slice(0, atIdx);
            requestedVersion = pkgArg.slice(atIdx + 1);
          }
        }
        if (!requestedVersion) {
          const pkgJsonFile = files.find(file => file.path === '/package.json');
          if (pkgJsonFile) {
            try {
              const parsed = JSON.parse(pkgJsonFile.content);
              requestedVersion = parsed.dependencies?.[pkgName] || parsed.devDependencies?.[pkgName] || '';
            } catch (err) {
              console.warn('Failed to parse package.json during vendor command:', err);
            }
          }
        }
        const targetUrl = requestedVersion ? `https://esm.sh/${pkgName}@${requestedVersion}` : `https://esm.sh/${pkgName}`;
        try {
          const res = await fetch(targetUrl);
          if (!res.ok) throw new Error(`Failed to fetch ${targetUrl} (Status ${res.status}: ${res.statusText})`);
          const fetchedCode = await res.text();
          const hash = await computeSha256(fetchedCode);
          const vendorPath = getCanonicalVendorPath(pkgName);
          const existingFile = files.find(file => file.path === vendorPath);
          if (existingFile) await writeFile(existingFile.id, fetchedCode);
          else await createFile(projectId, vendorPath, fetchedCode);
    
          const { file: existingLockfileFile, lockfile } = findLockfile(files);
          lockfile.dependencies[pkgName] = { specifier: pkgName, url: targetUrl, integrity: hash, lockedAt: Date.now(), vendored: true, vendorPath };
          const serializedLock = serializeLockfile(lockfile);
          if (existingLockfileFile?.id) await writeFile(existingLockfileFile.id, serializedLock);
          else await createFile(projectId, LOCKFILE_PATH, serializedLock);
          onFilesChanged?.();
          outputType = 'success';
          outputText = `📦 Successfully vendored "${pkgName}"!
      Source: ${targetUrl}
      Saved to: ${vendorPath} (${formatByteSize(new Blob([fetchedCode]).size)})
      Integrity: ${hash}
      Lockfile: updated ${LOCKFILE_PATH}
    ✨ Future builds will resolve "${pkgName}" locally with 0 network calls.`;
        } catch (err: unknown) {
          outputType = 'stderr';
          const msg = err instanceof Error ? err.message : String(err);
          outputText = `vendor failed: ${msg}`;
        }
      }
      break;
    }
    
    case 'lockfile':
    case 'lock': {
      const action = args[0]?.toLowerCase();
      const pkgArg = (action === 'update' ? args.slice(1).join(' ') : args.join(' ')).trim();
      if (!projectId) {
        outputType = 'stderr';
        outputText = 'lockfile: no active project open';
      } else {
        const { file: existingLockfileFile, lockfile } = findLockfile(files);
        if (!action || action === 'show' || action === 'list' || action === 'status') {
          const depKeys = Object.keys(lockfile.dependencies);
          if (depKeys.length === 0) {
            outputText = `No dependencies currently locked in ${LOCKFILE_PATH}. Run "lockfile update" or "npm run build" to generate locks.`;
          } else {
            const lines = [`Lockfile (${LOCKFILE_PATH}) — ${depKeys.length} locked packages:`];
            for (const key of depKeys) {
              const entry = lockfile.dependencies[key];
              lines.push(`  • ${entry.specifier}: ${entry.integrity} (${entry.vendored ? 'vendored' : 'esm.sh'})`);
            }
            outputText = lines.join('\n');
          }
          outputType = 'info';
        } else if (action === 'update' || action === 'refresh') {
          const pkgJsonFile = files.find(file => file.path === '/package.json');
          let pkgObj: Record<string, unknown> = {};
          if (pkgJsonFile) {
            try {
              pkgObj = JSON.parse(pkgJsonFile.content);
            } catch (err) {
              console.warn('Failed to parse package.json during lockfile update:', err);
            }
          }
          const allDeps: Record<string, string> = {
            ...((pkgObj.dependencies as Record<string, string>) || {}),
            ...((pkgObj.devDependencies as Record<string, string>) || {}),
          };
          const targets = pkgArg ? [pkgArg] : Object.keys(allDeps);
          addOutput('info', `🔒 Updating integrity locks for ${targets.length} dependenc${targets.length === 1 ? 'y' : 'ies'}...`);
          const updatedList: string[] = [];
          for (const target of targets) {
            const version = allDeps[target] || '';
            const targetUrl = version ? `https://esm.sh/${target}@${version}` : `https://esm.sh/${target}`;
            try {
              const res = await fetch(targetUrl);
              if (res.ok) {
                const text = await res.text();
                const hash = await computeSha256(text);
                lockfile.dependencies[target] = { specifier: target, url: targetUrl, integrity: hash, lockedAt: Date.now() };
                updatedList.push(`${target} (${hash.slice(0, 15)}...)`);
              }
            } catch (err: unknown) {
              console.warn(`Failed fetching ${targetUrl} during lock update:`, err);
            }
          }
          const serializedLock = serializeLockfile(lockfile);
          if (existingLockfileFile?.id) await writeFile(existingLockfileFile.id, serializedLock);
          else await createFile(projectId, LOCKFILE_PATH, serializedLock);
          onFilesChanged?.();
          outputType = 'success';
          outputText = `🔒 Lockfile updated at ${LOCKFILE_PATH}
    Updated dependencies (${updatedList.length}):
    ${updatedList.map(item => `  ✔ ${item}`).join('\n')}`;
        } else {
          outputType = 'stderr';
          outputText = `lockfile: unknown action "${action}". Try "lockfile list" or "lockfile update [pkg]".`;
        }
      }
      break;
    }
    default:
      return {};
  }
  return { outputText, outputType };
};

export const executeDependenciesCommand = executeDependencyCommand;
