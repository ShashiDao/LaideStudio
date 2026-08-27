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

  it('marks repetitive or low entropy 10+ character passphrases as Weak or Fair', () => {
    // 12 repeated characters: caught by repetition estimator -> Weak
    const resRepeat = getStrength('aaaaaaaaaaaa');
    expect(resRepeat.label).toBe('Weak');
    expect(resRepeat.score).toBe(1);

    // Dictionary repetition: 'passwordpassword' -> Weak
    const resDict = getStrength('passwordpassword');
    expect(resDict.label).toBe('Weak');
    expect(resDict.score).toBe(1);

    // Predictable combo: dictionary word + year -> Fair (score 2)
    const resFair = getStrength('sunshine1985');
    expect(resFair.label).toBe('Fair');
    expect(resFair.score).toBe(2);
  });

  it('marks mixed complex passphrases (10+ characters) as Good or Strong', () => {
    // Multi-word passphrase
    const resDiceware = getStrength('correct-horse-battery-staple');
    expect(resDiceware.score).toBeGreaterThanOrEqual(3);
    expect(['Good', 'Strong']).toContain(resDiceware.label);

    // 23 chars with full variety and high entropy -> Strong
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
  it('renders intro step on first run with product details and Get Started button', async () => {
    vi.mocked(getLockConfig).mockReturnValue(null);
    render(<LockScreen />);

    expect(await screen.findByText('LAIDE Studio')).toBeTruthy();
    expect(screen.getByText('Local-First AI Coding Environment')).toBeTruthy();
    expect(screen.getByText(/local-first AI coding environment that runs entirely in your browser/i)).toBeTruthy();
    expect(screen.getByText(/encrypted on-device vault/i)).toBeTruthy();
    
    const getStartedBtn = screen.getByRole('button', { name: /get started/i });
    expect(getStartedBtn).toBeTruthy();
  });

  it('advances from intro step to passphrase creation step when Get Started is clicked', async () => {
    vi.mocked(getLockConfig).mockReturnValue(null);
    render(<LockScreen />);

    const getStartedBtn = await screen.findByRole('button', { name: /get started/i });
    fireEvent.click(getStartedBtn);

    expect(await screen.findByText('Initialize Vault')).toBeTruthy();
    expect(screen.getByPlaceholderText('Enter strong passphrase')).toBeTruthy();
    expect(screen.getByPlaceholderText('Confirm passphrase')).toBeTruthy();
  });

  it('shows real-time match feedback when typing confirm passphrase', async () => {
    vi.mocked(getLockConfig).mockReturnValue(null);
    render(<LockScreen />);
    
    // Advance past intro
    const getStartedBtn = await screen.findByRole('button', { name: /get started/i });
    fireEvent.click(getStartedBtn);

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
    vi.mocked(getLockConfig).mockReturnValue(null);
    render(<LockScreen />);
    
    // Advance past intro
    const getStartedBtn = await screen.findByRole('button', { name: /get started/i });
    fireEvent.click(getStartedBtn);

    const checkbox = await screen.findByRole('checkbox', { name: /keep me logged in/i });
    expect(checkbox).toBeTruthy();
    expect((checkbox as HTMLInputElement).checked).toBe(false);

    fireEvent.click(checkbox);
    expect((checkbox as HTMLInputElement).checked).toBe(true);
  });
});

describe('LockScreen Unlock Flow', () => {
  it('skips the intro step entirely when an existing lock config exists', async () => {
    vi.mocked(getLockConfig).mockReturnValue({
      verifierBase64: 'abc',
      saltBase64: 'def',
      recoveryData: { ivBase64: 'g', encryptedMasterKeyBase64: 'h' },
    } as any);

    render(<LockScreen />);

    // Directly renders unlock form
    expect(await screen.findByPlaceholderText('Enter master passphrase')).toBeTruthy();
    expect(screen.getByText('Unlock Vault')).toBeTruthy();

    // Intro step elements must not exist
    expect(screen.queryByRole('button', { name: /get started/i })).toBeNull();
    expect(screen.queryByText('Initialize Vault')).toBeNull();
  });
});

describe('Form Submission preventDefault Regression', () => {
  it('calls preventDefault synchronously on setup form submission before awaiting crypto', async () => {
    // Ensure setup flow
    vi.mocked(getLockConfig).mockReturnValue(null);
    render(<LockScreen />);
    
    // Advance past intro
    const getStartedBtn = await screen.findByRole('button', { name: /get started/i });
    fireEvent.click(getStartedBtn);

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

