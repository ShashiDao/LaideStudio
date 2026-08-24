import { db } from '../../db';
import { listFiles } from './vfs';
import { binaryExtensions } from './zipExport';

/**
 * Maps file extension to a Markdown code fence language identifier.
 */
export function getLanguageForPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'ts':
      return 'typescript';
    case 'tsx':
      return 'tsx';
    case 'js':
    case 'mjs':
    case 'cjs':
      return 'javascript';
    case 'jsx':
      return 'jsx';
    case 'json':
      return 'json';
    case 'html':
    case 'htm':
      return 'html';
    case 'css':
      return 'css';
    case 'scss':
    case 'sass':
      return 'scss';
    case 'less':
      return 'less';
    case 'md':
    case 'markdown':
      return 'markdown';
    case 'py':
      return 'python';
    case 'rb':
      return 'ruby';
    case 'rs':
      return 'rust';
    case 'go':
      return 'go';
    case 'java':
      return 'java';
    case 'c':
    case 'h':
      return 'c';
    case 'cpp':
    case 'hpp':
    case 'cc':
      return 'cpp';
    case 'cs':
      return 'csharp';
    case 'php':
      return 'php';
    case 'sh':
    case 'bash':
    case 'zsh':
      return 'bash';
    case 'sql':
      return 'sql';
    case 'yaml':
    case 'yml':
      return 'yaml';
    case 'xml':
    case 'svg':
      return 'xml';
    case 'toml':
      return 'toml';
    case 'graphql':
    case 'gql':
      return 'graphql';
    case 'dockerfile':
      return 'dockerfile';
    default:
      return '';
  }
}

/**
 * Determines a safe markdown code fence that won't clash with backticks in the content.
 */
export function getSafeCodeFence(content: string): string {
  const backtickMatches = content.match(/`+/g);
  if (!backtickMatches) return '```';
  
  let maxBackticks = 2;
  for (const match of backtickMatches) {
    if (match.length > maxBackticks) {
      maxBackticks = match.length;
    }
  }
  return '`'.repeat(Math.max(3, maxBackticks + 1));
}

interface TreeNode {
  name: string;
  isFile: boolean;
  children: Map<string, TreeNode>;
}

/**
 * Builds an ASCII directory tree representation for a list of file paths.
 */
export function buildAsciiTree(filePaths: string[]): string {
  if (filePaths.length === 0) return '.\n└── (empty project)';

  const root: TreeNode = { name: '.', isFile: false, children: new Map() };

  // Sort paths alphabetically
  const sortedPaths = [...filePaths].sort();

  for (const filePath of sortedPaths) {
    const parts = filePath.replace(/^\//, '').split('/').filter(Boolean);
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isFile = i === parts.length - 1;

      if (!current.children.has(part)) {
        current.children.set(part, {
          name: part,
          isFile,
          children: new Map(),
        });
      }
      current = current.children.get(part)!;
    }
  }

  const lines: string[] = ['.'];

  function traverse(node: TreeNode, prefix: string) {
    const entries = Array.from(node.children.values()).sort((a, b) => {
      // Directories first, then files, then alphabetical
      if (!a.isFile && b.isFile) return -1;
      if (a.isFile && !b.isFile) return 1;
      return a.name.localeCompare(b.name);
    });

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const isLast = i === entries.length - 1;
      const connector = isLast ? '└── ' : '├── ';
      const childPrefix = isLast ? '    ' : '│   ';

      lines.push(`${prefix}${connector}${entry.name}${entry.isFile ? '' : '/'}`);
      if (!entry.isFile) {
        traverse(entry, prefix + childPrefix);
      }
    }
  }

  traverse(root, '');
  return lines.join('\n');
}

/**
 * Generates formatted single Markdown documentation for an entire project.
 */
export async function generateProjectMarkdown(projectId: string): Promise<string> {
  const project = await db.projects.get(projectId);
  const files = await listFiles(projectId);

  const projectName = project?.name || 'Project';
  const createdDate = project?.createdAt ? new Date(project.createdAt).toUTCString() : new Date().toUTCString();
  const updatedDate = project?.updatedAt ? new Date(project.updatedAt).toUTCString() : new Date().toUTCString();

  // Sort files: root files or alphabetical
  const sortedFiles = [...files].sort((a, b) => a.path.localeCompare(b.path));
  const filePaths = sortedFiles.map(f => f.path);

  const asciiTree = buildAsciiTree(filePaths);

  let totalLinesOfCode = 0;
  let textFileCount = 0;
  let binaryFileCount = 0;

  for (const file of sortedFiles) {
    const isBinary = binaryExtensions.some(ext => file.path.toLowerCase().endsWith(ext));
    if (isBinary) {
      binaryFileCount++;
    } else {
      textFileCount++;
      totalLinesOfCode += file.content.split('\n').length;
    }
  }

  const sections: string[] = [];

  // Header & Metadata
  sections.push(`# ${projectName} — Project Documentation

Generated on **${new Date().toUTCString()}**

| Metric | Value |
| :--- | :--- |
| **Project Name** | \`${projectName}\` |
| **Total Files** | ${files.length} (${textFileCount} text, ${binaryFileCount} binary) |
| **Total Lines of Code** | ~${totalLinesOfCode.toLocaleString()} lines |
| **Created** | ${createdDate} |
| **Last Modified** | ${updatedDate} |
`);

  // Project Structure Tree
  sections.push(`## 📁 Project Structure

\`\`\`text
${asciiTree}
\`\`\`
`);

  // Table of Contents
  sections.push(`## 📑 Table of Contents

${sortedFiles.map(f => {
  const cleanPath = f.path.startsWith('/') ? f.path.slice(1) : f.path;
  const anchor = cleanPath.toLowerCase().replace(/[^a-z0-9_-]/g, '');
  return `- [\`${cleanPath}\`](#${anchor})`;
}).join('\n')}
`);

  // File Code Blocks
  sections.push(`## 📄 Source Files
`);

  for (const file of sortedFiles) {
    const cleanPath = file.path.startsWith('/') ? file.path.slice(1) : file.path;
    const anchor = cleanPath.toLowerCase().replace(/[^a-z0-9_-]/g, '');
    const ext = file.path.split('.').pop()?.toLowerCase();
    const isBinary = binaryExtensions.some(b => file.path.toLowerCase().endsWith(b));
    const lang = getLanguageForPath(file.path);

    sections.push(`<a id="${anchor}"></a>
### \`${cleanPath}\`
`);

    if (isBinary) {
      const byteLen = Math.round((file.content.length * 3) / 4);
      sections.push(`> *[Binary Asset: ${ext?.toUpperCase()} file — approximately ${(byteLen / 1024).toFixed(1)} KB]*\n`);
    } else {
      const fence = getSafeCodeFence(file.content);
      sections.push(`${fence}${lang}\n${file.content}\n${fence}\n`);
    }
  }

  return sections.join('\n');
}

/**
 * Generates and prepares a downloadable Markdown file blob for the project.
 */
export async function exportProjectAsMarkdown(projectId: string): Promise<{
  filename: string;
  blob: Blob;
  content: string;
}> {
  const project = await db.projects.get(projectId);
  const projectName = project?.name || 'project';
  const content = await generateProjectMarkdown(projectId);
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const filename = `${projectName.toLowerCase().replace(/[^a-z0-9_-]+/g, '_')}_docs.md`;

  return { filename, blob, content };
}
