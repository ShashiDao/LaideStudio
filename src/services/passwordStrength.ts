import { BIP39_WORDS } from './bip39Words';

export interface StrengthResult {
  score: 0 | 1 | 2 | 3 | 4;
  label: '' | 'Weak' | 'Fair' | 'Good' | 'Strong';
  color: string;
  entropy: number;
  guesses: number;
  guessesLog10: number;
  warning?: string;
  suggestions?: string[];
  patternsDetected: string[];
}

const COMMON_PASSWORDS = [
  'password', 'passphrase', '123456', '12345678', '123456789', '1234567890',
  'qwerty', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm', 'admin', 'administrator',
  'welcome', 'letmein', 'monkey', 'dragon', 'football', 'master', 'sunshine',
  'princess', 'chelsea', 'shadow', 'superman', 'trustno1', 'secret', 'superuser',
  'default', 'access', 'guest', 'system', 'root', 'testing', 'hello', 'iloveyou',
  'starwars', 'freedom', 'whatever', 'ninja', 'baseball', 'superstar', 'mustang',
  'matrix', 'phoenix', 'cookie', 'killer', 'masterkey', 'security', 'orange',
  'apple', 'google', 'github', 'laide', 'studio', 'workspace', 'session', 'project',
  'login', 'pass', 'test', 'demo', 'sample', 'foobar', 'hunter2', 'batman',
  'charlie', 'jessica', 'michael', 'thomas', 'daniel', 'robert', 'david', 'james',
];

const BIP39_SET = new Set<string>(BIP39_WORDS.map((w) => w.toLowerCase()));
const COMMON_SET = new Set<string>(COMMON_PASSWORDS.map((w) => w.toLowerCase()));

// Keyboard row maps for spatial walk detection
const KEYBOARD_ROWS = [
  '`1234567890-=',
  'qwertyuiop[]\\',
  'asdfghjkl;\'',
  'zxcvbnm,./',
];

const LEET_MAP: Record<string, string> = {
  '@': 'a',
  '4': 'a',
  '8': 'b',
  '3': 'e',
  '1': 'l',
  '!': 'i',
  '|': 'l',
  '0': 'o',
  '5': 's',
  '$': 's',
  '7': 't',
  '+': 't',
  '2': 'z',
};

function unLeet(str: string): string {
  return str
    .toLowerCase()
    .split('')
    .map((c) => LEET_MAP[c] || c)
    .join('');
}

interface Match {
  type: 'dictionary' | 'repeat' | 'sequence' | 'spatial' | 'date';
  start: number;
  end: number;
  token: string;
  guesses: number;
  description: string;
}

/**
 * Detects dictionary matches (Common passwords, BIP39 words, reversed words, leet-transformed).
 */
function findDictionaryMatches(password: string): Match[] {
  const matches: Match[] = [];
  const lower = password.toLowerCase();
  const unLeeted = unLeet(password);
  const len = password.length;

  for (let start = 0; start < len; start++) {
    for (let end = start + 3; end <= len; end++) {
      const token = password.slice(start, end);
      const tokenLower = lower.slice(start, end);
      const tokenUnleeted = unLeeted.slice(start, end);
      const tokenReversed = tokenLower.split('').reverse().join('');

      let matchedWord = '';
      let isCommon = false;
      let isReversed = false;
      let isLeeted = false;

      if (COMMON_SET.has(tokenLower)) {
        matchedWord = tokenLower;
        isCommon = true;
      } else if (BIP39_SET.has(tokenLower)) {
        matchedWord = tokenLower;
      } else if (COMMON_SET.has(tokenUnleeted) || BIP39_SET.has(tokenUnleeted)) {
        matchedWord = tokenUnleeted;
        isLeeted = true;
        isCommon = COMMON_SET.has(tokenUnleeted);
      } else if (COMMON_SET.has(tokenReversed) || BIP39_SET.has(tokenReversed)) {
        matchedWord = tokenReversed;
        isReversed = true;
        isCommon = COMMON_SET.has(tokenReversed);
      }

      if (matchedWord) {
        const baseGuesses = isCommon ? 500 : 2048;
        // Adjust for case variations
        const hasUpper = /[A-Z]/.test(token);
        const hasLower = /[a-z]/.test(token);
        let caseFactor = 1;
        if (hasUpper && hasLower) {
          caseFactor = token[0] === token[0].toUpperCase() && token.slice(1) === token.slice(1).toLowerCase() ? 2 : 4;
        } else if (hasUpper) {
          caseFactor = 2;
        }

        const leetFactor = isLeeted ? 4 : 1;
        const revFactor = isReversed ? 2 : 1;

        const guesses = baseGuesses * caseFactor * leetFactor * revFactor;
        matches.push({
          type: 'dictionary',
          start,
          end,
          token,
          guesses,
          description: `Dictionary word "${matchedWord}"${isLeeted ? ' (l33t)' : ''}${isReversed ? ' (reversed)' : ''}`,
        });
      }
    }
  }

  return matches;
}

/**
 * Detects consecutive character repeats (e.g. "aaaaa") and repeated substrings (e.g. "abcabc", "passpass").
 */
function findRepeatMatches(password: string): Match[] {
  const matches: Match[] = [];
  const len = password.length;

  // Single character repeat (e.g., "aaaa")
  const singleCharRegex = /(.)\1{2,}/g;
  let singleMatch;
  while ((singleMatch = singleCharRegex.exec(password)) !== null) {
    const token = singleMatch[0];
    const char = singleMatch[1];
    matches.push({
      type: 'repeat',
      start: singleMatch.index,
      end: singleMatch.index + token.length,
      token,
      guesses: (char ? 26 : 10) * token.length,
      description: `Repeated character '${char}'`,
    });
  }

  // Multi-character substring repeats (e.g. "123123", "passwordpassword")
  for (let subLen = 2; subLen <= Math.floor(len / 2); subLen++) {
    for (let start = 0; start <= len - subLen * 2; start++) {
      const sub = password.slice(start, start + subLen);
      let count = 1;
      let nextStart = start + subLen;
      while (nextStart + subLen <= len && password.slice(nextStart, nextStart + subLen) === sub) {
        count++;
        nextStart += subLen;
      }

      if (count >= 2) {
        const token = password.slice(start, nextStart);
        // Base pattern guesses: search if sub is in dictionary/common, else calculate based on pool
        const subLower = sub.toLowerCase();
        let baseGuesses: number;
        if (COMMON_SET.has(subLower)) {
          baseGuesses = 500;
        } else if (BIP39_SET.has(subLower)) {
          baseGuesses = 2048;
        } else {
          baseGuesses = Math.min(10000, Math.pow(poolSize(sub), Math.min(subLen, 3)));
        }

        matches.push({
          type: 'repeat',
          start,
          end: nextStart,
          token,
          guesses: baseGuesses * count,
          description: `Repeated pattern "${sub}" x${count}`,
        });
      }
    }
  }

  return matches;
}

/**
 * Detects numeric and alphabetic sequences (e.g. "12345", "98765", "abcdef", "fedcba").
 */
function findSequenceMatches(password: string): Match[] {
  const matches: Match[] = [];
  const len = password.length;
  if (len < 3) return matches;

  let seqStart = 0;
  let seqDelta = 0;

  for (let i = 1; i < len; i++) {
    const prevCode = password.charCodeAt(i - 1);
    const currCode = password.charCodeAt(i);
    const delta = currCode - prevCode;

    if (i === 1 || (delta !== seqDelta && delta !== 0)) {
      if (i - seqStart >= 3 && Math.abs(seqDelta) === 1) {
        const token = password.slice(seqStart, i);
        matches.push({
          type: 'sequence',
          start: seqStart,
          end: i,
          token,
          guesses: (delta > 0 ? 26 : 52) * token.length,
          description: `Sequence "${token}"`,
        });
      }
      seqStart = i - 1;
      seqDelta = delta;
    }

    if (i === len - 1) {
      if (len - seqStart >= 3 && Math.abs(seqDelta) === 1) {
        const token = password.slice(seqStart, len);
        matches.push({
          type: 'sequence',
          start: seqStart,
          end: len,
          token,
          guesses: 26 * token.length,
          description: `Sequence "${token}"`,
        });
      }
    }
  }

  return matches;
}

/**
 * Detects spatial keyboard patterns (e.g. "qwerty", "asdfgh", "1qaz").
 */
function findSpatialMatches(password: string): Match[] {
  const matches: Match[] = [];
  const lower = password.toLowerCase();

  KEYBOARD_ROWS.forEach((row) => {
    for (let start = 0; start <= row.length - 3; start++) {
      for (let end = start + 3; end <= row.length; end++) {
        const forward = row.slice(start, end);
        const backward = forward.split('').reverse().join('');

        let idx = lower.indexOf(forward);
        while (idx !== -1) {
          matches.push({
            type: 'spatial',
            start: idx,
            end: idx + forward.length,
            token: password.slice(idx, idx + forward.length),
            guesses: KEYBOARD_ROWS.length * 8 * forward.length,
            description: `Keyboard row pattern "${forward}"`,
          });
          idx = lower.indexOf(forward, idx + 1);
        }

        let bIdx = lower.indexOf(backward);
        while (bIdx !== -1) {
          matches.push({
            type: 'spatial',
            start: bIdx,
            end: bIdx + backward.length,
            token: password.slice(bIdx, bIdx + backward.length),
            guesses: KEYBOARD_ROWS.length * 8 * backward.length * 2,
            description: `Reversed keyboard row pattern "${backward}"`,
          });
          bIdx = lower.indexOf(backward, bIdx + 1);
        }
      }
    }
  });

  return matches;
}

/**
 * Detects date patterns like YYYY, YYYYMMDD, MM/DD/YYYY.
 */
function findDateMatches(password: string): Match[] {
  const matches: Match[] = [];
  const dateRegex = /(19\d{2}|20\d{2})[-/.]?(0[1-9]|1[0-2])[-/.]?(0[1-9]|[12]\d|3[01])|(0[1-9]|1[0-2])[-/.]?(0[1-9]|[12]\d|3[01])[-/.]?(19\d{2}|20\d{2})|(19\d{2}|20\d{2})/g;
  let match;
  while ((match = dateRegex.exec(password)) !== null) {
    const token = match[0];
    matches.push({
      type: 'date',
      start: match.index,
      end: match.index + token.length,
      token,
      guesses: 365 * 120, // ~43,800 guesses
      description: `Date pattern "${token}"`,
    });
  }
  return matches;
}

function poolSize(str: string): number {
  let pool = 0;
  if (/[a-z]/.test(str)) pool += 26;
  if (/[A-Z]/.test(str)) pool += 26;
  if (/[0-9]/.test(str)) pool += 10;
  if (/[^a-zA-Z0-9]/.test(str)) pool += 33;
  return pool || 1;
}

/**
 * Calculates optimal segmented minimum guesses via dynamic programming.
 */
function calculateMinimumGuesses(password: string, matches: Match[]): { guesses: number; usedMatches: Match[] } {
  const len = password.length;
  if (len === 0) return { guesses: 1, usedMatches: [] };

  // dp[i] represents optimal guesses for prefix of length i
  const dp: number[] = new Array(len + 1).fill(Infinity);
  const matchUsed: (Match | null)[] = new Array(len + 1).fill(null);
  const prevIdx: number[] = new Array(len + 1).fill(0);

  dp[0] = 1;

  for (let i = 1; i <= len; i++) {
    // 1. Consider unmatched character at index i-1 (brute force extension)
    const char = password[i - 1];
    const charPool = poolSize(char);
    const bruteGuesses = dp[i - 1] * charPool;
    if (bruteGuesses < dp[i]) {
      dp[i] = bruteGuesses;
      matchUsed[i] = null;
      prevIdx[i] = i - 1;
    }

    // 2. Consider all matches ending at index i
    const endingMatches = matches.filter((m) => m.end === i);
    for (const m of endingMatches) {
      const matchCost = dp[m.start] * m.guesses;
      if (matchCost < dp[i]) {
        dp[i] = matchCost;
        matchUsed[i] = m;
        prevIdx[i] = m.start;
      }
    }
  }

  // Backtrack to find used matches
  const usedMatches: Match[] = [];
  let curr = len;
  while (curr > 0) {
    const m = matchUsed[curr];
    if (m) {
      usedMatches.push(m);
      curr = m.start;
    } else {
      curr = prevIdx[curr];
    }
  }

  return {
    guesses: dp[len],
    usedMatches: usedMatches.reverse(),
  };
}

/**
 * Main zxcvbn-style password strength estimator.
 */
export function getStrength(p: string): StrengthResult {
  if (!p || p.length === 0) {
    return {
      score: 0,
      label: '',
      color: 'bg-transparent',
      entropy: 0,
      guesses: 0,
      guessesLog10: 0,
      patternsDetected: [],
      warning: undefined,
      suggestions: ['Enter a passphrase with at least 10 characters.'],
    };
  }

  // Aggregate all pattern matches
  const allMatches: Match[] = [
    ...findDictionaryMatches(p),
    ...findRepeatMatches(p),
    ...findSequenceMatches(p),
    ...findSpatialMatches(p),
    ...findDateMatches(p),
  ];

  const { guesses, usedMatches } = calculateMinimumGuesses(p, allMatches);
  const entropy = Math.max(0, Math.log2(guesses || 1));
  const guessesLog10 = Math.max(0, Math.log10(guesses || 1));
  const patternsDetected = Array.from(new Set(usedMatches.map((m) => m.description)));

  // Minimum length check (Vault enforces at least 10 chars)
  if (p.length < 10) {
    return {
      score: 1,
      label: 'Weak',
      color: 'bg-red-500',
      entropy: Math.round(entropy),
      guesses,
      guessesLog10,
      patternsDetected,
      warning: 'Passphrase is too short',
      suggestions: [`Add ${10 - p.length} more characters.`],
    };
  }

  // Scoring thresholds (log10 of guesses)
  // Score 1 (Weak): < 10^6 guesses (~19.9 bits)
  // Score 2 (Fair): 10^6 - 10^8 guesses (~19.9 - 26.6 bits)
  // Score 3 (Good): 10^8 - 10^11 guesses (~26.6 - 36.5 bits)
  // Score 4 (Strong): >= 10^11 guesses (>= 36.5 bits)
  let score: 0 | 1 | 2 | 3 | 4;
  let label: '' | 'Weak' | 'Fair' | 'Good' | 'Strong';
  let color: string;

  if (guessesLog10 < 6) {
    score = 1;
    label = 'Weak';
    color = 'bg-red-500';
  } else if (guessesLog10 < 8) {
    score = 2;
    label = 'Fair';
    color = 'bg-yellow-500';
  } else if (guessesLog10 < 11) {
    score = 3;
    label = 'Good';
    color = 'bg-blue-500';
  } else {
    score = 4;
    label = 'Strong';
    color = 'bg-moss';
  }

  // Suggestions and warnings
  const suggestions: string[] = [];
  let warning: string | undefined;

  if (patternsDetected.length > 0) {
    warning = `Contains predictable patterns (${patternsDetected[0]}).`;
    suggestions.push('Avoid common words, keyboard sequences, or repeated characters.');
  }

  if (score < 4 && suggestions.length === 0) {
    suggestions.push('Add random symbols, uppercase letters, or extra words for higher security.');
  }

  return {
    score,
    label,
    color,
    entropy: Math.round(entropy),
    guesses,
    guessesLog10,
    patternsDetected,
    warning,
    suggestions,
  };
}
