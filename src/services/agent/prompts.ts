import { binaryExtensions } from '../fs/zipExport';
import { formatSkillsForPrompt, type Skill } from './skills';
import { formatSessionMemoryForPrompt, type SessionMemoryItem } from './sessionMemory';

export const SUGGESTION_PROMPTS = {
  WHAT_IS_IN_PROJECT: "What's in this project?",
  EXPLAIN_LAST_ERROR: "Explain the last error",
  ADD_INDEX_HTML: "Add an index.html",
  SCAFFOLD_STARTER: "Scaffold a starter webpage",
  ADD_README: "Add a README.md",
  ADD_COMPONENT: "Add a new interactive component",
  ADD_TAILWIND: "Add responsive styling with Tailwind CSS",
} as const;

export const DEFAULT_MANIFEST_EXCLUDE_PATTERNS: string[] = [
  'package-lock.json',
  'bun.lock',
  'yarn.lock',
  '.gitignore',
  '.env.example',
  ...binaryExtensions,
];

export function isPathExcludedFromManifest(
  filePath: string,
  excludePatterns: string[] = DEFAULT_MANIFEST_EXCLUDE_PATTERNS
): boolean {
  const lowerPath = filePath.toLowerCase();
  const filename = lowerPath.split('/').pop() || lowerPath;

  return excludePatterns.some((pattern) => {
    const p = pattern.toLowerCase();
    if (filename === p) {
      return true;
    }
    if (binaryExtensions.includes(p)) {
      return lowerPath.endsWith(p);
    }
    if (p.startsWith('*.')) {
      return lowerPath.endsWith(p.slice(1));
    }
    return lowerPath.endsWith(`/${p}`) || lowerPath === p;
  });
}

export const BASE_SYSTEM_PROMPT = `You are a Senior Frontend Engineer assisting in building a web application in LAIDE Studio.
You have access to tools to inspect and modify the virtual filesystem:
- read_file: Read the full content of any file in the workspace
- list_directory: List files and folders at a specified directory path
- search_code: Search across files using text or regex queries
- write_file: Propose creating, replacing, appending, or deleting files via structured patches

Instructions:
1. Workspace Context: You are provided with a lightweight <file_manifest> containing file paths and their byte sizes. Use the 'read_file' tool whenever you need to read the contents of a specific file.
2. File Modifications: Never print large raw code blocks in chat messages for file creation or modification. Always use the 'write_file' tool with valid structured patch parameters (path, type: 'create' | 'replace' | 'append' | 'delete', and rationale).
3. Be concise and helpful in conversation while proposing clean, idiomatic code via tool calls.`;

export function buildFileManifest(files: Array<{ path: string; content: string }>): string {
  if (files.length === 0) {
    return '<file_manifest>\n(Empty workspace - no files)\n</file_manifest>';
  }
  const encoder = new TextEncoder();
  const lines = files.map(f => {
    const bytes = encoder.encode(f.content).length;
    return `${f.path} (${bytes} bytes)`;
  });
  return `<file_manifest>\n${lines.join('\n')}\n</file_manifest>`;
}

export function buildSystemPrompt(
  files: Array<{ path: string; content: string }>, 
  customInstructions?: string,
  skills?: Skill[] | string,
  sessionMemory?: SessionMemoryItem[] | string
): string {
  const custom = customInstructions?.trim()
    ? `\n\n<custom_instructions>\n${customInstructions.trim()}\n</custom_instructions>`
    : '';

  let skillsText = '';
  if (typeof skills === 'string') {
    skillsText = skills.trim();
  } else if (Array.isArray(skills) && skills.length > 0) {
    skillsText = formatSkillsForPrompt(skills).trim();
  }

  const skillsBlock = skillsText
    ? `\n\n<skills>\n${skillsText}\n</skills>`
    : '';

  let sessionMemoryText = '';
  if (typeof sessionMemory === 'string') {
    sessionMemoryText = sessionMemory.trim();
  } else if (Array.isArray(sessionMemory) && sessionMemory.length > 0) {
    sessionMemoryText = formatSessionMemoryForPrompt(sessionMemory).trim();
  }

  const sessionMemoryBlock = sessionMemoryText
    ? `\n\n<session_memory>\n${sessionMemoryText}\n</session_memory>`
    : '';

  const manifest = buildFileManifest(files);
  return `${BASE_SYSTEM_PROMPT}${custom}${skillsBlock}${sessionMemoryBlock}\n\n${manifest}`;
}
