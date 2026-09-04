import { db, type Skill } from '../../db';
import { countTokensForText } from '../usage/tokenSpend';

export type { Skill };

export const DEFAULT_SEEDED_SKILLS: Array<Omit<Skill, 'id' | 'createdAt' | 'updatedAt'>> = [
  {
    name: 'Tailwind conventions used in this repo',
    description: 'Guidelines and utility classes for styling components with Tailwind CSS in this repository',
    keywords: ['tailwind', 'css', 'style', 'styling', 'theme', 'responsive', 'colors', 'layout', 'ui'],
    content: `### Tailwind CSS Styling Conventions
- **Direct Utilities**: Always use Tailwind utility classes directly in the \`className\` prop. Never write custom \`.css\` files or inline style attributes.
- **Color Tokens**: Use the theme's semantic colors:
  - Backgrounds: \`bg-bg\`, \`bg-surface\`, \`bg-surface-elevated\`
  - Text: \`text-text\`, \`text-muted\`, \`text-accent\`, \`text-oxide\` (destructive/danger), \`text-moss\` (success/healthy)
  - Borders: \`border-border\`, \`border-border/50\`, \`border-accent/40\`
- **Responsive Design**: Follow Tailwind mobile-first conventions (\`sm:\`, \`md:\`, \`lg:\`). Mobile touch targets must be at least 44px (\`min-h-[44px]\`).
- **Spacing Math**: Ensure container outer padding (\`p-4\` or \`p-5\`) equals or exceeds inner child gap spacing. For buttons, horizontal padding should be approximately 2x vertical padding (\`px-3 py-1.5\`).`
  },
  {
    name: 'How to write a Vitest test here',
    description: 'Guidelines, patterns, and conventions for authoring Vitest unit and integration tests in this project',
    keywords: ['vitest', 'test', 'testing', 'spec', 'assert', 'expect', 'mock', 'suite', 'unit'],
    content: `### Vitest Testing Conventions
- **Test Setup & Imports**: Use Vitest APIs from \`vitest\`:
  \`import { describe, it, expect, vi, beforeEach } from 'vitest';\`
  Colocate test files next to source code as \`*.test.ts\` or \`*.test.tsx\`.
- **IndexedDB & Dexie**: For tests that interact with Dexie or IndexedDB:
  Include \`// @vitest-environment happy-dom\` and \`import 'fake-indexeddb/auto';\` at top of test.
  Always clear tables in \`beforeEach\` (e.g. \`await db.skills.clear();\`).
- **Mocking & Isolation**: Mock external APIs and adapters cleanly with \`vi.fn()\` or \`vi.spyOn()\`. Always call \`vi.restoreAllMocks()\` in \`beforeEach\` or \`afterEach\`.
- **Determinism**: Never use real network calls, timers with unbounded durations, or unmocked cryptographical randomness that breaks assertions.`
  },
  {
    name: 'VFS patches and workspace overlay safety',
    description: 'How to safely manipulate project files via workspace overlay patches and verification gates',
    keywords: ['vfs', 'patch', 'write_file', 'filesystem', 'overlay', 'verifier', 'gate', 'safe'],
    content: `### VFS Patches & Workspace Overlay Safety
- **Never Mutate Disk Directly**: Agents must propose changes using the \`write_file\` tool, which routes edits through the \`WorkspaceOverlay\` verification pipeline.
- **Patch Types**:
  - \`create\`: Creates a brand-new file with full \`newContent\`.
  - \`replace\`: Replaces existing file content when matching \`oldContent\` or entire content.
  - \`append\`: Appends content to the end of a file.
  - \`delete\`: Removes a file.
- **Normalization**: File paths must be normalized absolute-style paths starting with \`/\` (e.g., \`/src/components/MyComponent.tsx\`).
- **Rationale**: Every patch must include a concise \`rationale\` explaining the purpose and scope of the edit.`
  }
];

export const DEFAULT_SKILLS_TOKEN_BUDGET = 1500;

export function formatSingleSkill(skill: Skill): string {
  const desc = skill.description ? `*${skill.description.trim()}*\n` : '';
  return `### Skill: ${skill.name}\n${desc}${skill.content.trim()}`;
}

export function formatSkillsForPrompt(skills: Skill[]): string {
  if (!skills || skills.length === 0) return '';
  return skills.map(formatSingleSkill).join('\n\n');
}

export interface MatchSkillsOptions {
  maxTokens?: number;
  minScore?: number;
}

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'for', 'with', 'this', 'that', 'from',
  'into', 'when', 'will', 'you', 'your', 'are', 'was', 'were', 'how',
  'what', 'can', 'could', 'should', 'here', 'there', 'have', 'has', 'had',
  'is', 'it', 'to', 'in', 'on', 'at', 'by', 'of', 'do', 'does', 'did', 'make', 'please'
]);

/**
 * Keyword/substring-matches user message against skill descriptions and keywords,
 * ranks top matches, and budgets their combined size with tokenSpend utilities.
 */
export function matchSkills(
  query: string,
  allSkills: Skill[],
  options?: MatchSkillsOptions
): Skill[] {
  if (!query || !query.trim() || allSkills.length === 0) {
    return [];
  }

  const normalizedQuery = query.toLowerCase().trim();
  const queryTokens = normalizedQuery
    .split(/[\s,.;:!?_/\-()[\]{}'"`]+/)
    .filter(t => t.length > 1 && !STOP_WORDS.has(t));

  const scored: Array<{ skill: Skill; score: number }> = [];

  for (const skill of allSkills) {
    let score = 0;
    const skillNameLower = skill.name.toLowerCase();
    const skillDescLower = skill.description.toLowerCase();
    const skillKeywords = skill.keywords.map(k => k.toLowerCase().trim()).filter(Boolean);

    // 1. Keyword matching (highest weight)
    for (const kw of skillKeywords) {
      if (kw.includes(' ')) {
        if (normalizedQuery.includes(kw)) {
          score += 15;
        }
      } else {
        if (queryTokens.includes(kw) || new RegExp(`(^|\\W)${kw}($|\\W)`).test(normalizedQuery)) {
          score += 15;
        }
      }
    }

    // 2. Name matching
    if (normalizedQuery.includes(skillNameLower)) {
      score += 20;
    } else {
      const nameTokens = skillNameLower
        .split(/[\s,.;:!?_/\-()[\]{}'"`]+/)
        .filter(t => t.length > 2 && !STOP_WORDS.has(t));
      for (const nt of nameTokens) {
        if (queryTokens.includes(nt)) {
          score += 6;
        }
      }
    }

    // 3. Description matching
    const descTokens = skillDescLower
      .split(/[\s,.;:!?_/\-()[\]{}'"`]+/)
      .filter(t => t.length > 2 && !STOP_WORDS.has(t));
    for (const dt of descTokens) {
      if (queryTokens.includes(dt)) {
        score += 3;
      }
    }

    const minScore = options?.minScore ?? 1;
    if (score >= minScore) {
      scored.push({ skill, score });
    }
  }

  // Rank by match score descending, then by recency descending
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.skill.updatedAt - a.skill.updatedAt;
  });

  // Token budgeting so skills cannot blow out context
  const maxTokens = options?.maxTokens ?? DEFAULT_SKILLS_TOKEN_BUDGET;
  const selectedSkills: Skill[] = [];
  let accumulatedTokens = 0;

  for (const { skill } of scored) {
    const formatted = formatSingleSkill(skill);
    const tokens = countTokensForText(formatted);

    if (accumulatedTokens + tokens <= maxTokens) {
      selectedSkills.push(skill);
      accumulatedTokens += tokens;
    } else {
      break;
    }
  }

  return selectedSkills;
}

/**
 * Seeds default skills into IndexedDB if table is empty or if forced.
 */
export async function seedDefaultSkills(force = false): Promise<Skill[]> {
  try {
    const existingCount = await db.skills.count();
    if (existingCount > 0 && !force) {
      return await db.skills.toArray();
    }

    const now = Date.now();
    const seeded: Skill[] = DEFAULT_SEEDED_SKILLS.map((skill, index) => ({
      id: `skill-seed-${index + 1}-${crypto.randomUUID().slice(0, 8)}`,
      name: skill.name,
      description: skill.description,
      keywords: skill.keywords,
      content: skill.content,
      createdAt: now,
      updatedAt: now,
    }));

    if (force && existingCount > 0) {
      await db.skills.clear();
    }

    await db.skills.bulkAdd(seeded);
    return seeded;
  } catch (err) {
    console.warn('Failed to seed default skills:', err);
    return [];
  }
}

/**
 * Retrieves matched skills for a given user turn prompt, budgeting token spend.
 */
export async function getMatchedSkillsForMessage(
  message: string,
  options?: MatchSkillsOptions
): Promise<Skill[]> {
  try {
    let allSkills = await db.skills.toArray();
    if (allSkills.length === 0) {
      allSkills = await seedDefaultSkills();
    }
    return matchSkills(message, allSkills, options);
  } catch (err) {
    console.warn('Failed to match skills for message:', err);
    return [];
  }
}
