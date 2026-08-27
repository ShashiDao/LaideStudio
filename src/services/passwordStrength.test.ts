import { describe, it, expect } from 'vitest';
import { getStrength } from './passwordStrength';

describe('Password Strength Estimator (zxcvbn-style)', () => {
  it('returns score 0 for empty strings', () => {
    const res = getStrength('');
    expect(res.score).toBe(0);
    expect(res.label).toBe('');
    expect(res.entropy).toBe(0);
  });

  it('marks passphrases under 10 characters as Weak regardless of complexity', () => {
    expect(getStrength('1234').label).toBe('Weak');
    expect(getStrength('1234').score).toBe(1);
    expect(getStrength('abcd').label).toBe('Weak');
    expect(getStrength('A1!b#9x').label).toBe('Weak');
    expect(getStrength('123456789').label).toBe('Weak');
  });

  it('catches repeated single characters even if >= 10 chars', () => {
    const res = getStrength('aaaaaaaaaaaa'); // 12 chars
    expect(res.score).toBe(1);
    expect(res.label).toBe('Weak');
    expect(res.patternsDetected.some((p) => p.includes('Repeated character'))).toBe(true);
  });

  it('catches repeated substrings (e.g. repeated patterns)', () => {
    const res = getStrength('abcabcabcabc'); // 12 chars
    expect(res.score).toBe(1);
    expect(res.label).toBe('Weak');
    expect(res.patternsDetected.some((p) => p.includes('Repeated pattern'))).toBe(true);
  });

  it('catches common dictionary passwords and leet-speak variations', () => {
    const res1 = getStrength('passwordpassword');
    expect(res1.score).toBe(1);
    expect(res1.label).toBe('Weak');
    expect(res1.patternsDetected.some((p) => p.includes('Dictionary word') || p.includes('Repeated'))).toBe(true);

    const resLeet = getStrength('p@ssw0rd!admin');
    expect(resLeet.score).toBeLessThanOrEqual(2);
    expect(resLeet.patternsDetected.some((p) => p.includes('Dictionary word'))).toBe(true);
  });

  it('catches sequential runs (numbers, alphabets)', () => {
    const resNum = getStrength('12345678901234');
    expect(resNum.score).toBe(1);
    expect(resNum.label).toBe('Weak');

    const resAlpha = getStrength('abcdefghijklmn');
    expect(resAlpha.score).toBe(1);
    expect(resAlpha.label).toBe('Weak');
    expect(resAlpha.patternsDetected.some((p) => p.includes('Sequence'))).toBe(true);
  });

  it('catches spatial keyboard patterns', () => {
    const res = getStrength('qwertyuiopasdf');
    expect(res.score).toBe(1);
    expect(res.label).toBe('Weak');
    expect(res.patternsDetected.some((p) => p.includes('Keyboard row pattern'))).toBe(true);
  });

  it('rates multi-word Diceware passphrases as Good or Strong', () => {
    const res = getStrength('correct-horse-battery-staple');
    expect(res.score).toBeGreaterThanOrEqual(3);
    expect(['Good', 'Strong']).toContain(res.label);
    expect(res.entropy).toBeGreaterThan(30);
  });

  it('rates complex randomized passphrases as Strong', () => {
    const res = getStrength('C0mpl3x!P@ssphrase#2026');
    expect(res.score).toBe(4);
    expect(res.label).toBe('Strong');
  });

  it('provides helpful warnings and suggestions for detected patterns', () => {
    const res = getStrength('administrator123');
    expect(res.warning).toBeDefined();
    expect(res.suggestions?.length).toBeGreaterThan(0);
  });
});
