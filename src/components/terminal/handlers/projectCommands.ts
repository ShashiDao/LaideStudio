import { createFile, writeFile } from '../../../services/fs/vfs';
import { runProjectTests } from '../../../services/bundler/testRunner';
import { detectBundledProject } from '../../../services/bundler/entryDetection';
import { formatByteSize } from '../../../utils/formatters';
import { computeSha256, findLockfile, serializeLockfile, getCanonicalVendorPath, LOCKFILE_PATH } from '../../../services/bundler/lockfile';
import type { CommandExecutionContext, TerminalOutputItem } from '../terminalTypes';
import type { TerminalCommandHandler } from '../commandTypes';

export const PROJECT_COMMANDS = new Set([
  'npm', 'test', 'vitest', 'build',
]);

export const executeProjectCommand: TerminalCommandHandler = async (command, args, commandStr, context) => {
  const { files, projectId, addOutput, onFilesChanged, onOpenBisect } = context;
  let outputText = '';
  let outputType: TerminalOutputItem['type'] = 'stdout';
  switch (command) {
    
    case 'npm':
    case 'test':
    case 'vitest':
    case 'build': {
      const sub = command === 'npm' ? (args[0] || '').toLowerCase() : command;
    
      if (sub === 'test' || sub === 'vitest') {
        addOutput('info', 'Running project tests via sandbox runner...');
        const result = await runProjectTests(files);
        outputText = result;
        const hasFailed = !result.includes('Failed: 0') && result.includes('Failed:');
        outputType = hasFailed ? 'stderr' : 'success';
        if (hasFailed && onOpenBisect) {
          outputText += '\n💡 Tip: Type "bisect" or open Project Actions > "Find What Broke This" to binary search provenance history and isolate regressions.';
        }
      } else if (sub === 'bisect') {
        const targetTest = args.slice(1).join(' ').trim();
        if (onOpenBisect) {
          onOpenBisect(targetTest || undefined);
          outputType = 'info';
          outputText = `Opening Bisection Finder${targetTest ? ` for test "${targetTest}"` : ''}...`;
        } else {
          outputType = 'stderr';
          outputText = 'Bisection finder is unavailable in current mode.';
        }
      } else if ((sub === 'run' && args[1] === 'build') || sub === 'build') {
        addOutput('info', 'Building project with ESBuild WebAssembly bundler...');
        const projectInfo = detectBundledProject(files);
        const entryPoint = projectInfo.entryPoint || '/src/main.tsx';
        const start = performance.now();
    
        try {
          const { bundle } = await import('../../services/bundler/bundler');
          const bundleCode = await bundle(files, entryPoint, status => {
            addOutput('info', `  › ${status}`);
          });
          const duration = ((performance.now() - start) / 1000).toFixed(2);
          const bundleBytes = new Blob([bundleCode]).size;
          outputText = `✨ Build succeeded in ${duration}s!
      Entry point: ${entryPoint}
      Bundle size: ${formatByteSize(bundleBytes)} (${bundleBytes.toLocaleString()} bytes)
      Files bundled: ${files.length}`;
          outputType = 'success';
        } catch (err: unknown) {
          outputType = 'stderr';
          const msg = err instanceof Error ? err.message : String(err);
          outputText = `Build failed: ${msg}`;
        }
      } else if (sub === 'ls' || sub === 'list' || sub === 'pkg') {
        const pkgFile = files.find(file => file.path === '/package.json');
        if (!pkgFile) {
          outputType = 'stderr';
          outputText = 'npm ls: package.json not found';
        } else {
          try {
            const pkg = JSON.parse(pkgFile.content);
            const lines = [`${pkg.name || 'laide-project'}@${pkg.version || '1.0.0'}`];
            if (pkg.dependencies && Object.keys(pkg.dependencies).length > 0) {
              lines.push('├── dependencies:');
              for (const [name, version] of Object.entries(pkg.dependencies)) lines.push(`│   ├── ${name}@${version}`);
            }
            if (pkg.devDependencies && Object.keys(pkg.devDependencies).length > 0) {
              lines.push('└── devDependencies:');
              for (const [name, version] of Object.entries(pkg.devDependencies)) lines.push(`    ├── ${name}@${version}`);
            }
            outputText = lines.join('\n');
          } catch (err: unknown) {
            outputType = 'stderr';
            const msg = err instanceof Error ? err.message : String(err);
            outputText = `npm ls: failed to parse package.json (${msg})`;
          }
        }
      } else if (sub === 'vendor') {
        const pkgArg = args.slice(1).join(' ').trim();
        if (!pkgArg) {
          outputType = 'stderr';
          outputText = 'npm vendor: missing package operand. Usage: npm vendor <package-name>';
        } else if (!projectId) {
          outputType = 'stderr';
          outputText = 'npm vendor: no active project open';
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
                console.warn('Failed to parse package.json for requested version:', err);
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
            lockfile.dependencies[pkgName] = {
              specifier: pkgName,
              url: targetUrl,
              integrity: hash,
              lockedAt: Date.now(),
              vendored: true,
              vendorPath,
            };
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
            outputText = `npm vendor failed: ${msg}`;
          }
        }
      } else if (sub === 'update-lock' || sub === 'lock' || sub === 'lockfile') {
        const pkgArg = args.slice(1).join(' ').trim();
        if (!projectId) {
          outputType = 'stderr';
          outputText = 'npm update-lock: no active project open';
        } else {
          const { file: existingLockfileFile, lockfile } = findLockfile(files);
          const pkgJsonFile = files.find(file => file.path === '/package.json');
          let pkgObj: Record<string, unknown> = {};
          if (pkgJsonFile) {
            try {
              pkgObj = JSON.parse(pkgJsonFile.content);
            } catch (err) {
              console.warn('Failed to parse package.json during update-lock:', err);
            }
          }
          const allDeps: Record<string, string> = {
            ...((pkgObj.dependencies as Record<string, string>) || {}),
            ...((pkgObj.devDependencies as Record<string, string>) || {}),
          };
          const targets = pkgArg ? [pkgArg] : Object.keys(allDeps);
          if (targets.length === 0 && Object.keys(lockfile.dependencies).length === 0) {
            outputType = 'stderr';
            outputText = 'npm update-lock: No dependencies declared in package.json or lockfile.';
          } else {
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
          }
        }
      } else {
        outputType = 'stderr';
        outputText = `npm: unsupported command: "${sub}". Try "npm test", "npm run build", "npm vendor <pkg>", or "npm ls".`;
      }
      break;
    }
    default:
      return {};
  }
  return { outputText, outputType };
};
