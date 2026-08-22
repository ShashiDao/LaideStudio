import { describe, it, expect } from 'vitest';
import { getStrength } from './LockScreen';

describe('LockScreen Passphrase Security', () => {
  it('marks empty strings with score 0 and no label', () => {
    const res = getStrength('');
    expect(res.score).toBe(0);
    expect(res.label).toBe('');
  });

  it('enforces Weak status for passphrases under 10 characters', () => {
    expect(getStrength('1234').label).toBe('Weak');
    expect(getStrength('abcd').label).toBe('Weak');
    expect(getStrength('A1!b').label).toBe('Weak');
    expect(getStrength('123456789').label).toBe('Weak');
    expect(getStrength('123456789').score).toBe(1);
  });

  it('marks low entropy 10+ character passphrases as Weak or Fair', () => {
    // Only lowercase letters: 10 * log2(26) = ~47 -> Fair
    const resAllLower = getStrength('abcdefghij');
    expect(resAllLower.label).toBe('Fair');
    expect(resAllLower.score).toBe(2);
  });

  it('marks mixed complex passphrases (10+ characters) as Good or Strong', () => {
    // 10 chars with lower, upper, numbers, symbols: pool = 26+26+10+32 = 94, entropy = 10 * log2(94) = ~65.5 -> Good
    const resGood = getStrength('P@ssw0rd12');
    expect(resGood.score).toBeGreaterThanOrEqual(3);
    expect(['Good', 'Strong']).toContain(resGood.label);

    // 16 chars with full variety -> Strong
    const resStrong = getStrength('C0mpl3x!P@ssphrase#2026');
    expect(resStrong.label).toBe('Strong');
    expect(resStrong.score).toBe(4);
  });
});

describe('Vault Lock State & Action', () => {
  it('lockVault clears keys and wipes chatHistory in store', async () => {
    const { useAppStore } = await import('../store');
    
    // Simulate unlocked state with active key and prior chat history
    const mockKey: any = { aesKey: {} as CryptoKey, rawKey: new Uint8Array(32) };
    useAppStore.getState().setKeys(mockKey);
    useAppStore.getState().setChatHistory([
      { role: 'user', content: 'Secret API prompt' },
      { role: 'assistant', content: 'Secret response' }
    ]);

    expect(useAppStore.getState().keys).not.toBeNull();
    expect(useAppStore.getState().chatHistory).toHaveLength(2);

    // Lock vault
    useAppStore.getState().lockVault();

    // Verify keys is null and chatHistory is wiped
    expect(useAppStore.getState().keys).toBeNull();
    expect(useAppStore.getState().chatHistory).toEqual([]);
  });
});

