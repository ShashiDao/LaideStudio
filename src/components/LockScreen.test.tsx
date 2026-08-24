/**
 * @vitest-environment happy-dom
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import { getStrength, LockScreen } from './LockScreen';
import { getLockConfig } from '../services/lockConfig';

vi.mock('../services/lockConfig', () => ({
  getLockConfig: vi.fn(() => null), // Force setup flow
  saveLockConfig: vi.fn(),
}));

afterEach(() => {
  cleanup();
});

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

describe('LockScreen Setup UI', () => {
  it('shows real-time match feedback when typing confirm passphrase', async () => {
    render(<LockScreen />);
    
    const passInput = await screen.findByPlaceholderText('Enter strong passphrase');
    const confirmInput = screen.getByPlaceholderText('Confirm passphrase');
    
    // Mismatch
    fireEvent.change(passInput, { target: { value: 'SecretPassword123!' } });
    fireEvent.change(confirmInput, { target: { value: 'SecretPassword123' } });
    expect(screen.getByText("Doesn't match yet")).toBeTruthy();
    expect(screen.queryByText('Passphrases match')).toBeNull();
    
    // Fix mismatch
    fireEvent.change(confirmInput, { target: { value: 'SecretPassword123!' } });
    expect(screen.getByText('Passphrases match')).toBeTruthy();
    expect(screen.queryByText("Doesn't match yet")).toBeNull();
  });

  it('renders Keep me logged in checkbox with default unchecked state', async () => {
    render(<LockScreen />);
    
    const checkbox = await screen.findByRole('checkbox', { name: /keep me logged in/i });
    expect(checkbox).toBeTruthy();
    expect((checkbox as HTMLInputElement).checked).toBe(false);

    fireEvent.click(checkbox);
    expect((checkbox as HTMLInputElement).checked).toBe(true);
  });
});

describe('Form Submission preventDefault Regression', () => {
  it('calls preventDefault synchronously on setup form submission before awaiting crypto', async () => {
    // Ensure setup flow
    vi.mocked(getLockConfig).mockReturnValue(null);
    render(<LockScreen />);
    
    const passInput = await screen.findByPlaceholderText('Enter strong passphrase');
    const form = passInput.closest('form')!;
    
    // fireEvent.submit returns false if preventDefault was called.
    const notPrevented = fireEvent.submit(form);
    
    // It should be prevented synchronously
    expect(notPrevented).toBe(false);
  });

  it('calls preventDefault synchronously on unlock form submission before awaiting crypto', async () => {
    // Force unlock flow
    vi.mocked(getLockConfig).mockReturnValue({
      verifierBase64: 'abc',
      saltBase64: 'def',
      recoveryData: { ivBase64: 'g', encryptedMasterKeyBase64: 'h' }
    } as any);
    
    render(<LockScreen />);
    
    const passInput = await screen.findByPlaceholderText('Enter master passphrase');
    const form = passInput.closest('form')!;
    
    const notPrevented = fireEvent.submit(form);
    
    expect(notPrevented).toBe(false);
  });
});

