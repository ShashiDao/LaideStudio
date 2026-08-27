import type { FileItem } from '../db';

export interface LanguageStat {
  language: string;
  extension: string;
  filesCount: number;
  linesOfCode: number;
  bytes: number;
  percentage: number;
  color: string;
}

export interface ProjectMetadata {
  totalFiles: number;
  totalLines: number;
  totalBytes: number;
  dominantLanguage: string;
  languages: LanguageStat[];
}

const LANGUAGE_COLOR_MAP: Record<string, { name: string; color: string }> = {
  ts: { name: 'TypeScript (Vanilla)', color: '#3178c6' },
  tsx: { name: 'TypeScript (React)', color: '#2b7489' },
  js: { name: 'JavaScript (Vanilla)', color: '#f7df1e' },
  jsx: { name: 'JavaScript (React)', color: '#e34c26' },
  json: { name: 'JSON', color: '#cbcb41' },
  css: { name: 'CSS', color: '#563d7c' },
  scss: { name: 'SCSS', color: '#c6538c' },
  html: { name: 'HTML', color: '#e34f26' },
  md: { name: 'Markdown', color: '#083fa1' },
  py: { name: 'Python', color: '#3572A5' },
  rs: { name: 'Rust', color: '#dea584' },
  go: { name: 'Go', color: '#00ADD8' },
  sql: { name: 'SQL', color: '#e38c00' },
  sh: { name: 'Shell', color: '#89e051' },
  bash: { name: 'Bash', color: '#89e051' },
  yaml: { name: 'YAML', color: '#cb171e' },
  yml: { name: 'YAML', color: '#cb171e' },
  toml: { name: 'TOML', color: '#9c4221' },
  svg: { name: 'SVG', color: '#ff9900' },
  xml: { name: 'XML', color: '#0060ac' },
  txt: { name: 'Text', color: '#8b949e' },
};

const DEFAULT_COLOR = '#a0aec0';

export function calculateProjectMetadata(files: FileItem[]): ProjectMetadata {
  if (!files || files.length === 0) {
    return {
      totalFiles: 0,
      totalLines: 0,
      totalBytes: 0,
      dominantLanguage: 'None',
      languages: []
    };
  }

  let totalLines = 0;
  let totalBytes = 0;
  const langMap: Record<string, { name: string; color: string; filesCount: number; linesOfCode: number; bytes: number }> = {};

  for (const file of files) {
    const rawContent = file.content || '';
    const bytes = new Blob([rawContent]).size;
    totalBytes += bytes;

    // Calculate lines
    const lineCount = rawContent ? rawContent.split(/\r\n|\r|\n/).length : 0;
    totalLines += lineCount;

    // Detect language extension
    const parts = file.path.split('.');
    const ext = parts.length > 1 ? parts.pop()!.toLowerCase() : 'txt';
    const langInfo = LANGUAGE_COLOR_MAP[ext] || {
      name: ext ? ext.toUpperCase() : 'Other',
      color: DEFAULT_COLOR
    };

    const key = langInfo.name;
    if (!langMap[key]) {
      langMap[key] = {
        name: key,
        color: langInfo.color,
        filesCount: 0,
        linesOfCode: 0,
        bytes: 0
      };
    }

    langMap[key].filesCount += 1;
    langMap[key].linesOfCode += lineCount;
    langMap[key].bytes += bytes;
  }

  const languages: LanguageStat[] = Object.values(langMap)
    .map(item => {
      const percentage = totalLines > 0 
        ? Math.round((item.linesOfCode / totalLines) * 1000) / 10 
        : Math.round((item.filesCount / files.length) * 1000) / 10;
      return {
        language: item.name,
        extension: item.name.toLowerCase(),
        filesCount: item.filesCount,
        linesOfCode: item.linesOfCode,
        bytes: item.bytes,
        percentage,
        color: item.color
      };
    })
    .sort((a, b) => b.linesOfCode - a.linesOfCode);

  const dominantLanguage = languages.length > 0 ? languages[0].language : 'None';

  return {
    totalFiles: files.length,
    totalLines,
    totalBytes,
    dominantLanguage,
    languages
  };
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
