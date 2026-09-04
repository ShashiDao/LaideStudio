// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../db';
import {
  seedDefaultSkills,
  matchSkills,
  formatSkillsForPrompt,
  formatSingleSkill,
  getMatchedSkillsForMessage,
  type Skill
} from './skills';

describe('Skills Library', () => {
  beforeEach(async () => {
    await db.skills.clear();
  });

  describe('seedDefaultSkills', () => {
    it('seeds 3 default example skills into IndexedDB when empty', async () => {
      const seeded = await seedDefaultSkills();
      expect(seeded).toHaveLength(3);
      expect(seeded.some(s => s.name.includes('Tailwind'))).toBe(true);
      expect(seeded.some(s => s.name.includes('Vitest'))).toBe(true);
      expect(seeded.some(s => s.name.includes('VFS'))).toBe(true);

      const inDb = await db.skills.toArray();
      expect(inDb).toHaveLength(3);
    });

    it('does not re-seed or duplicate skills if already seeded', async () => {
      await seedDefaultSkills();
      const secondCall = await seedDefaultSkills();
      expect(secondCall).toHaveLength(3);

      const inDb = await db.skills.toArray();
      expect(inDb).toHaveLength(3);
    });

    it('re-seeds and overwrites if force is true', async () => {
      await seedDefaultSkills();
      // Add a custom skill
      await db.skills.add({
        id: 'custom-1',
        name: 'Custom skill',
        description: 'Desc',
        keywords: ['custom'],
        content: 'content',
        createdAt: 1,
        updatedAt: 1
      });
      expect(await db.skills.count()).toBe(4);

      await seedDefaultSkills(true);
      expect(await db.skills.count()).toBe(3);
    });
  });

  describe('matchSkills', () => {
    const sampleSkills: Skill[] = [
      {
        id: 's-tailwind',
        name: 'Tailwind conventions used in this repo',
        description: 'Guidelines and utility classes for styling with Tailwind CSS',
        keywords: ['tailwind', 'css', 'style', 'styling', 'theme'],
        content: 'Use bg-bg and text-text.',
        createdAt: 100,
        updatedAt: 100
      },
      {
        id: 's-vitest',
        name: 'How to write a Vitest test here',
        description: 'Testing guidelines with Vitest',
        keywords: ['vitest', 'test', 'testing', 'spec', 'assert'],
        content: 'Use describe and it.',
        createdAt: 200,
        updatedAt: 200
      },
      {
        id: 's-vfs',
        name: 'VFS patches and workspace overlay safety',
        description: 'Safe filesystem overlay patches',
        keywords: ['vfs', 'patch', 'write_file', 'filesystem', 'overlay'],
        content: 'Always use write_file tool.',
        createdAt: 300,
        updatedAt: 300
      }
    ];

    it('matches skill by keyword in query', () => {
      const matches = matchSkills('How do I apply tailwind styles to this header?', sampleSkills);
      expect(matches.length).toBeGreaterThanOrEqual(1);
      expect(matches[0].id).toBe('s-tailwind');
    });

    it('matches skill by test terminology', () => {
      const matches = matchSkills('Write a vitest unit test for authentication', sampleSkills);
      expect(matches.length).toBeGreaterThanOrEqual(1);
      expect(matches[0].id).toBe('s-vitest');
    });

    it('matches skill by filesystem/vfs keywords', () => {
      const matches = matchSkills('Please write_file to create the new component patch', sampleSkills);
      expect(matches.length).toBeGreaterThanOrEqual(1);
      expect(matches[0].id).toBe('s-vfs');
    });

    it('returns empty array when no keywords or descriptions match', () => {
      const matches = matchSkills('Make a recipe for banana bread with chocolate chips', sampleSkills);
      expect(matches).toEqual([]);
    });

    it('returns empty array for empty or whitespace query', () => {
      expect(matchSkills('', sampleSkills)).toEqual([]);
      expect(matchSkills('   ', sampleSkills)).toEqual([]);
    });

    it('ranks higher match relevance first', () => {
      // Query matches both tailwind keywords and name heavily
      const matches = matchSkills('tailwind css styling guidelines', sampleSkills);
      expect(matches[0].id).toBe('s-tailwind');
    });

    it('respects token budgeting constraint and does not blow out context', () => {
      // Create skills with large content
      const largeSkills: Skill[] = [
        {
          id: 'large-1',
          name: 'Large Tailwind Guide',
          description: 'Tailwind styling guide',
          keywords: ['tailwind', 'css'],
          content: 'A'.repeat(800), // ~200 tokens
          createdAt: 100,
          updatedAt: 100
        },
        {
          id: 'large-2',
          name: 'Large CSS Theme Guide',
          description: 'Tailwind css theme guidelines',
          keywords: ['tailwind', 'css'],
          content: 'B'.repeat(800), // ~200 tokens
          createdAt: 100,
          updatedAt: 100
        }
      ];

      // A budget of 250 fits large-1 (~200 tokens) but excludes large-2 (combined ~400 tokens)
      const matches = matchSkills('tailwind css guide', largeSkills, { maxTokens: 250 });
      expect(matches.length).toBe(1);
      expect(matches[0].id).toBe('large-1');

      // A budget of 50 cannot fit either 200-token skill
      const tinyMatches = matchSkills('tailwind css guide', largeSkills, { maxTokens: 50 });
      expect(tinyMatches.length).toBe(0);
    });
  });

  describe('formatSkillsForPrompt', () => {
    it('formats skills into markdown representation', () => {
      const skill: Skill = {
        id: 's1',
        name: 'Test Skill',
        description: 'Test Description',
        keywords: ['test'],
        content: 'Markdown instructions line 1\nLine 2',
        createdAt: 100,
        updatedAt: 100
      };

      const single = formatSingleSkill(skill);
      expect(single).toContain('### Skill: Test Skill');
      expect(single).toContain('*Test Description*');
      expect(single).toContain('Markdown instructions line 1');

      const formatted = formatSkillsForPrompt([skill]);
      expect(formatted).toBe(single);
    });

    it('returns empty string for empty skill array', () => {
      expect(formatSkillsForPrompt([])).toBe('');
    });
  });

  describe('getMatchedSkillsForMessage', () => {
    it('automatically seeds database if empty and returns matched skills', async () => {
      expect(await db.skills.count()).toBe(0);
      const matches = await getMatchedSkillsForMessage('Please style this card with tailwind');
      expect(matches.length).toBeGreaterThanOrEqual(1);
      expect(matches.some(m => m.keywords.includes('tailwind'))).toBe(true);
      expect(await db.skills.count()).toBe(3);
    });
  });
});
