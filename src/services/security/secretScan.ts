export interface SecretMatch {
  file: string;
  line: number;
  pattern: string;
  preview: string;
}

const PATTERNS = [
  { name: 'Anthropic API key', regex: /sk-ant-[a-zA-Z0-9_-]{20,}/g },
  { name: 'OpenAI API key', regex: /sk-(proj-)?[a-zA-Z0-9]{20,}/g },
  { name: 'Google API key', regex: /AIza[0-9A-Za-z\-_]{35}/g },
  { name: 'GitHub token', regex: /gh[pousr]_[A-Za-z0-9]{36,}/g },
  { name: 'Generic secret assignment', regex: /(API|SECRET|PRIVATE|ACCESS)_?(KEY|TOKEN)\s*[:=]\s*['"][A-Za-z0-9\-_/+]{16,}['"]/gi },
];

const ENV_FILE = /(^|\/)\.env(\..+)?$/i;
const redact = (s: string) => s.length <= 8 ? '••••••••' : s.slice(0, 4) + '…' + s.slice(-4);

export function scanFilesForSecrets(files: { path: string; content: string }[]): SecretMatch[] {
  const findings: SecretMatch[] = [];
  for (const f of files) {
    if (ENV_FILE.test(f.path)) {
      findings.push({ file: f.path, line: 0, pattern: '.env file', preview: '(entire file)' });
      continue;
    }
    if (f.content.length > 2_000_000) continue;
    for (const pat of PATTERNS) {
      pat.regex.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = pat.regex.exec(f.content)) !== null) {
        const line = f.content.slice(0, m.index).split('\n').length;
        findings.push({ file: f.path, line, pattern: pat.name, preview: redact(m[0]) });
      }
    }
  }
  return findings;
}
