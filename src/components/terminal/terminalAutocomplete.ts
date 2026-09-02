import type { FileItem } from '../../db';
import { COMMAND_LIST, resolvePath, getDirEntries, type TerminalOutputItem } from './terminalTypes';

export interface AutocompleteParams {
  input: string;
  cwd: string;
  files: FileItem[];
  setInput: (val: string) => void;
  addOutput: (type: TerminalOutputItem['type'], text: string) => void;
}

export function handleTerminalAutocomplete({
  input,
  cwd,
  files,
  setInput,
  addOutput
}: AutocompleteParams): void {
  const trimmedLeft = input.trimStart();
  if (!trimmedLeft) return;

  const parts = trimmedLeft.split(' ');
  const firstWord = parts[0]?.toLowerCase() || '';

  // 1. Completing the main command (first token)
  if (parts.length <= 1) {
    const prefix = firstWord;
    const matches = COMMAND_LIST.filter(c => c.startsWith(prefix));
    if (matches.length === 1) {
      setInput(matches[0] + ' ');
    } else if (matches.length > 1) {
      let lcp = matches[0];
      for (let i = 1; i < matches.length; i++) {
        while (!matches[i].startsWith(lcp)) {
          lcp = lcp.slice(0, -1);
          if (!lcp) break;
        }
      }
      if (lcp.length > prefix.length) {
        setInput(lcp);
      }
      addOutput('info', matches.join('   '));
    }
    return;
  }

  // 2. Completing subcommands for multi-token commands (npm, git, theme)
  if (firstWord === 'npm') {
    const npmSubcommands = ['test', 'run build', 'run', 'ls', 'list', 'pkg', 'bisect'];
    if (parts.length === 2) {
      const subPrefix = parts[1].toLowerCase();
      const matches = npmSubcommands.filter(s => s.startsWith(subPrefix));
      if (matches.length === 1) {
        setInput(`npm ${matches[0]} `);
        return;
      } else if (matches.length > 1) {
        let lcp = matches[0];
        for (let i = 1; i < matches.length; i++) {
          while (!matches[i].startsWith(lcp)) {
            lcp = lcp.slice(0, -1);
            if (!lcp) break;
          }
        }
        if (lcp.length > subPrefix.length) {
          setInput(`npm ${lcp} `);
        }
        addOutput('info', matches.join('   '));
        return;
      }
    } else if (parts.length === 3 && parts[1].toLowerCase() === 'run') {
      const runTargets = ['build', 'dev', 'test'];
      const runPrefix = parts[2].toLowerCase();
      const matches = runTargets.filter(t => t.startsWith(runPrefix));
      if (matches.length === 1) {
        setInput(`npm run ${matches[0]} `);
        return;
      } else if (matches.length > 1) {
        addOutput('info', matches.join('   '));
        return;
      }
    }
  }

  if (firstWord === 'git' && parts.length === 2) {
    const gitSubcommands = ['status', 'diff', 'log', 'branch', 'checkout', 'commit', 'add'];
    const subPrefix = parts[1].toLowerCase();
    const matches = gitSubcommands.filter(s => s.startsWith(subPrefix));
    if (matches.length === 1) {
      setInput(`git ${matches[0]} `);
      return;
    } else if (matches.length > 1) {
      let lcp = matches[0];
      for (let i = 1; i < matches.length; i++) {
        while (!matches[i].startsWith(lcp)) {
          lcp = lcp.slice(0, -1);
          if (!lcp) break;
        }
      }
      if (lcp.length > subPrefix.length) {
        setInput(`git ${lcp} `);
      }
      addOutput('info', matches.join('   '));
      return;
    }
  }

  if (firstWord === 'theme' && parts.length === 2) {
    const themeSubcommands = ['oled', 'paper'];
    const subPrefix = parts[1].toLowerCase();
    const matches = themeSubcommands.filter(s => s.startsWith(subPrefix));
    if (matches.length === 1) {
      setInput(`theme ${matches[0]} `);
      return;
    } else if (matches.length > 1) {
      addOutput('info', matches.join('   '));
      return;
    }
  }

  // 3. Completing file or folder paths in the VFS
  const lastToken = parts[parts.length - 1];
  let parentDir: string;
  let filePrefix: string;
  const lastSlash = lastToken.lastIndexOf('/');

  if (lastSlash !== -1) {
    const dirPart = lastToken.substring(0, lastSlash);
    parentDir = resolvePath(cwd, dirPart || '/');
    filePrefix = lastToken.substring(lastSlash + 1);
  } else {
    parentDir = cwd;
    filePrefix = lastToken;
  }

  const entries = getDirEntries(files, parentDir);
  const folderCandidates = entries.folders.map(f => ({ name: f + '/', isDir: true }));
  const fileCandidates = entries.files.map(f => ({ name: f.path.split('/').pop() || '', isDir: false }));
  const allCandidates = [...folderCandidates, ...fileCandidates];

  const matched = allCandidates.filter(c => c.name.toLowerCase().startsWith(filePrefix.toLowerCase()));

  if (matched.length === 1) {
    const match = matched[0];
    const pathPrefix = lastSlash !== -1 ? lastToken.substring(0, lastSlash + 1) : '';
    parts[parts.length - 1] = pathPrefix + match.name + (match.isDir ? '' : ' ');
    setInput(parts.join(' '));
  } else if (matched.length > 1) {
    const pathPrefix = lastSlash !== -1 ? lastToken.substring(0, lastSlash + 1) : '';
    let lcp = matched[0].name;
    for (let i = 1; i < matched.length; i++) {
      while (!matched[i].name.toLowerCase().startsWith(lcp.toLowerCase())) {
        lcp = lcp.slice(0, -1);
        if (!lcp) break;
      }
    }
    if (lcp.length > filePrefix.length) {
      parts[parts.length - 1] = pathPrefix + lcp;
      setInput(parts.join(' '));
    }
    addOutput('info', matched.map(m => m.name).join('   '));
  }
}
