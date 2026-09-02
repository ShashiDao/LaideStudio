import React, { useState, useEffect, useCallback } from 'react';
import { Lock, ShieldCheck, ArrowRight, ShieldAlert, Fingerprint, LifeBuoy, ArrowLeft, Eye, EyeOff, Copy, Check } from 'lucide-react';
import { LaideLogo } from './LaideLogo';
import { getLockConfig, saveLockConfig, type LockConfig } from '../../services/security/lockConfig';
import { 
  importMasterKey, 
  deriveKeys, 
  generateVerifier, 
  verifyPassphrase, 
  arrayBufferToBase64, 
  base64ToArrayBuffer, 
  type KeyMaterial 
} from '../../services/security/crypto';
import { getPersistentSession, savePersistentSession } from '../../services/security/session';
import { isPasskeyPrfSupported, enrollPasskey, unlockWithPasskey, type PasskeyData } from '../../services/security/passkeyCrypto';
import { generateRecoveryPhrase, createRecoveryBundle, unlockWithRecoveryPhrase, validateRecoveryPhrase, type RecoveryData } from '../../services/security/recovery';
import { useAppStore } from '../../store';

import { getStrength, type StrengthResult } from '../../services/security/passwordStrength';
export { getStrength, type StrengthResult };

export function LockScreen() {
  const { setKeys } = useAppStore();
  
  const [config] = useState<LockConfig | null>(() => getLockConfig());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [keepMeLoggedIn, setKeepMeLoggedIn] = useState(false);
  
  // Setup state
  const [passphrase, setPassphrase] = useState('');
  const [confirm, setConfirm] = useState('');
  const [recoveryPhrase, setRecoveryPhrase] = useState('');
  const [hasSavedRecoveryPhrase, setHasSavedRecoveryPhrase] = useState(false);
  const [copiedPhrase, setCopiedPhrase] = useState(false);
  const [setupStep, setSetupStep] = useState<'intro' | 'passphrase' | 'recovery' | 'passkey'>('intro');
  
  // Unlock state
  const [unlockPassphrase, setUnlockPassphrase] = useState('');
  const [enteredRecoveryPhrase, setEnteredRecoveryPhrase] = useState('');
  const [unlockMode, setUnlockMode] = useState<'passkey' | 'passphrase' | 'recovery'>('passphrase');
  const [error, setError] = useState('');
  
  // Show/Hide password states
  const [showSetupPassphrase, setShowSetupPassphrase] = useState(false);
  const [showSetupConfirm, setShowSetupConfirm] = useState(false);
  const [showUnlockPassphrase, setShowUnlockPassphrase] = useState(false);
  const [showRecoveryPhrase, setShowRecoveryPhrase] = useState(false);
  
  const [pendingSetup, setPendingSetup] = useState<{
    salt: Uint8Array;
    verifier: string;
    masterKey: Uint8Array;
    recoveryData: RecoveryData;
    keys: KeyMaterial;
  } | null>(null);
  
  const strength = getStrength(passphrase);
  
  const handlePasskeyUnlock = useCallback(async (c: LockConfig) => {
    if (!c.passkeyData) return;
    setBusy(true);
    try {
      const masterKeyBytes = await unlockWithPasskey(c.passkeyData);
      if (masterKeyBytes) {
        const keys = await importMasterKey(masterKeyBytes);
        setKeys(keys);
        return;
      } else {
        // Fallback to passphrase UI if passkey fails
        setUnlockMode('passphrase');
      }
    } catch (err) {
      console.error(err);
      setUnlockMode('passphrase');
    } finally {
      setBusy(false);
      setLoading(false);
    }
  }, [setKeys]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const session = await getPersistentSession();
        if (session && active) {
          const keys = await importMasterKey(session.masterKeyBytes);
          if (active) {
            setKeys(keys);
            return;
          }
        }
      } catch (e) {
        console.warn('Failed to restore persistent session', e);
      }

      if (!active) return;
      const existing = getLockConfig();
      
      // Auto-prompt passkey if available
      if (existing && existing.passkeyData) {
        setUnlockMode('passkey');
        handlePasskeyUnlock(existing);
      } else {
        setUnlockMode('passphrase');
        setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [handlePasskeyUnlock, setKeys]);

  const handleStartSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passphrase.length < 10) {
      setError('Passphrase is too short (minimum 10 characters required)');
      return;
    }
    const currentStrength = getStrength(passphrase);
    if (currentStrength.label === 'Weak') {
      setError('Passphrase is too weak. Please combine letters, numbers, and symbols.');
      return;
    }
    if (passphrase !== confirm) {
      setError('Passphrases do not match');
      return;
    }
    
    setBusy(true);
    setError('');
    
    try {
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const keys = await deriveKeys(passphrase, salt);
      const verifier = await generateVerifier(keys.hmacKey);
      
      // Generate 12-word recovery phrase and derive wrapped copy of master key
      const phrase = generateRecoveryPhrase(12);
      setRecoveryPhrase(phrase);
      
      const recoveryData = await createRecoveryBundle(keys.masterKeyBytes, phrase);
      
      setPendingSetup({
        salt,
        verifier,
        masterKey: keys.masterKeyBytes,
        recoveryData,
        keys,
      });
      
      setSetupStep('recovery');
    } catch (err) {
      console.error(err);
      setError('Failed to initialize crypto keys');
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmRecovery = async () => {
    if (!pendingSetup || !hasSavedRecoveryPhrase) return;
    
    setBusy(true);
    try {
      const supportsPrf = await isPasskeyPrfSupported();
      if (supportsPrf) {
        setSetupStep('passkey');
      } else {
        await finalizeSetup(null);
      }
    } catch (err) {
      console.error(err);
      setError('Setup failed');
    } finally {
      setBusy(false);
    }
  };

  const finalizeSetup = async (passkeyData: PasskeyData | null) => {
    if (!pendingSetup) return;
    
    const newConfig: LockConfig = {
      saltBase64: arrayBufferToBase64(pendingSetup.salt.buffer as ArrayBuffer),
      verifierBase64: pendingSetup.verifier,
      recoveryData: pendingSetup.recoveryData,
      passkeyData,
    };
    
    saveLockConfig(newConfig);

    if (keepMeLoggedIn) {
      try {
        await savePersistentSession(pendingSetup.masterKey);
      } catch (err) {
        console.error('Failed to save persistent session during setup', err);
      }
    }

    setKeys(pendingSetup.keys);
  };

  const handleEnrollPasskey = async (accept: boolean) => {
    if (!pendingSetup) return;
    
    setBusy(true);
    let passkeyData = null;
    
    if (accept) {
      try {
        passkeyData = await enrollPasskey(pendingSetup.masterKey);
      } catch (e) {
        console.warn('Passkey enrollment failed, continuing with passphrase only', e);
      }
    }
    
    await finalizeSetup(passkeyData);
    setBusy(false);
  };

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!config) return;
    
    setBusy(true);
    setError('');
    try {
      const salt = base64ToArrayBuffer(config.saltBase64);
      const keys = await deriveKeys(unlockPassphrase, new Uint8Array(salt));
      const isValid = await verifyPassphrase(keys.hmacKey, config.verifierBase64);
      
      if (isValid) {
        if (keepMeLoggedIn) {
          try {
            await savePersistentSession(keys.masterKeyBytes);
          } catch (sessionErr) {
            console.error('Failed to save persistent session', sessionErr);
          }
        }
        setKeys(keys);
      } else {
        setError('Incorrect passphrase');
      }
    } catch (_err) {
      setError('Decryption failed');
    } finally {
      setBusy(false);
    }
  };

  const handleRecoveryUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!config) return;
    
    if (!config.recoveryData) {
      setError('No recovery phrase was configured for this vault');
      return;
    }

    const validation = validateRecoveryPhrase(enteredRecoveryPhrase);
    if (!validation.valid) {
      setError(validation.error || 'Invalid recovery phrase');
      return;
    }

    setBusy(true);
    setError('');
    try {
      const masterKeyBytes = await unlockWithRecoveryPhrase(config.recoveryData, enteredRecoveryPhrase);
      if (masterKeyBytes) {
        const keys = await importMasterKey(masterKeyBytes);
        if (keepMeLoggedIn) {
          try {
            await savePersistentSession(masterKeyBytes);
          } catch (sessionErr) {
            console.error('Failed to save persistent session', sessionErr);
          }
        }
        setKeys(keys);
      } else {
        setError('Incorrect recovery phrase or corrupted backup payload');
      }
    } catch (_err) {
      setError('Recovery unlock failed');
    } finally {
      setBusy(false);
    }
  };

  const handleCopyPhrase = () => {
    navigator.clipboard.writeText(recoveryPhrase);
    setCopiedPhrase(true);
    setTimeout(() => setCopiedPhrase(false), 2000);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center pt-safe pb-safe pl-safe pr-safe">
        <Lock className="text-accent animate-pulse" size={32} />
      </div>
    );
  }

  // ==========================================
  // SETUP FLOW (No config yet)
  // ==========================================
  if (!config) {
    // Step 0: Welcome / Intro Screen on first run
    if (setupStep === 'intro') {
      return (
        <div className="min-h-screen bg-bg flex items-center justify-center p-4 pt-safe pb-safe pl-safe pr-safe">
          <div className="bg-surface border border-border rounded-lg p-6 sm:p-8 w-full max-w-md shadow-2xl corner-ticks flex flex-col">
            <div className="flex items-center gap-3 mb-4">
              <LaideLogo size={40} className="rounded-lg shrink-0 shadow-sm" />
              <div>
                <h1 className="text-xl font-sans text-text font-bold">LAIDE Studio</h1>
                <p className="text-xs font-mono text-muted tracking-wide">Local-First AI Coding Environment</p>
              </div>
            </div>

            <div className="space-y-3 text-xs sm:text-sm text-muted leading-relaxed mb-6">
              <p>
                LAIDE Studio is a local-first AI coding environment that runs entirely in your browser.
              </p>
              <p>
                All project files, code generation, and developer sessions stay local and private on your machine.
              </p>
              <p>
                To keep your credentials secure, an encrypted on-device vault protects your AI API keys and access tokens using zero-knowledge client-side encryption.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setSetupStep('passphrase')}
              className="w-full py-2.5 bg-accent text-accent-text-on font-sans font-bold rounded flex items-center justify-center gap-2 hover:bg-accent/90 transition-colors cursor-pointer shadow-xs"
            >
              <span>Get Started</span>
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      );
    }

    // Step 2: Show 12-word recovery phrase
    if (setupStep === 'recovery') {
      const words = recoveryPhrase.split(' ');

      return (
        <div className="min-h-screen bg-bg flex items-center justify-center p-4 pt-safe pb-safe pl-safe pr-safe">
          <div className="bg-surface border border-border rounded-lg p-6 sm:p-8 w-full max-w-lg shadow-2xl flex flex-col">
            <div className="flex items-center gap-3 mb-3">
              <LifeBuoy className="text-accent" size={26} />
              <h2 className="text-lg sm:text-xl font-sans text-text font-bold">12-Word Recovery Phrase</h2>
            </div>
            
            <p className="text-muted text-xs sm:text-sm mb-4 leading-relaxed">
              If you ever forget your passphrase, this recovery phrase is the <strong className="text-text">only</strong> way to regain access to your vault and encrypted keys. Write it down or save it safely.
            </p>

            {/* 12-Word Grid */}
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 bg-bg/80 p-3.5 rounded-lg border border-border mb-4 font-mono text-xs select-all">
              {words.map((w, idx) => (
                <div key={idx} className="flex items-center gap-1.5 bg-surface/80 px-2 py-1.5 rounded border border-border">
                  <span className="text-muted text-[10px] w-4 text-right">{idx + 1}.</span>
                  <span className="text-text font-semibold">{w}</span>
                </div>
              ))}
            </div>

            {/* Copy Button */}
            <button
              type="button"
              onClick={handleCopyPhrase}
              className="w-full py-2 bg-surface hover:bg-black/5 text-text font-sans text-xs rounded border border-white/15 flex items-center justify-center gap-2 mb-4 transition-colors cursor-pointer"
            >
              {copiedPhrase ? <Check size={14} className="text-moss" /> : <Copy size={14} />}
              {copiedPhrase ? 'Copied to Clipboard' : 'Copy All 12 Words'}
            </button>

            {/* Confirmation Checkbox */}
            <label className="flex items-start gap-2.5 p-3 rounded bg-black/5 border border-border cursor-pointer mb-5 text-xs text-muted select-none">
              <input 
                type="checkbox"
                checked={hasSavedRecoveryPhrase}
                onChange={e => setHasSavedRecoveryPhrase(e.target.checked)}
                className="mt-0.5 rounded border-border text-accent focus:ring-accent cursor-pointer"
              />
              <span className="leading-snug">
                I have saved this 12-word recovery phrase in a safe place. I understand it cannot be recovered if lost.
              </span>
            </label>

            <button 
              type="button"
              onClick={handleConfirmRecovery}
              disabled={!hasSavedRecoveryPhrase || busy}
              className="w-full py-2.5 bg-accent text-accent-text-on font-sans font-bold rounded flex items-center justify-center gap-2 hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-xs"
            >
              {busy ? 'Securing Vault...' : "I've Saved This — Continue"}
              {!busy && <ArrowRight size={16} />}
            </button>
          </div>
        </div>
      );
    }

    // Step 3: Passkey Enrollment Offer
    if (setupStep === 'passkey') {
      return (
        <div className="min-h-screen bg-bg flex items-center justify-center p-4 pt-safe pb-safe pl-safe pr-safe">
          <div className="bg-surface border border-border rounded-lg p-8 w-full max-w-md shadow-2xl flex flex-col items-center corner-ticks">
            <Fingerprint className="text-accent mb-4" size={48} />
            <h2 className="text-xl font-sans text-text mb-2">Enroll Passkey?</h2>
            <p className="text-muted text-sm text-center mb-8 leading-relaxed">
              You can use biometric authentication (like Touch ID, Face ID, or Windows Hello) for faster unlocks in the future.
            </p>
            
            <div className="flex flex-col gap-3 w-full">
              <button 
                onClick={() => handleEnrollPasskey(true)}
                disabled={busy}
                className="w-full py-2.5 bg-accent text-accent-text-on font-sans font-bold rounded flex items-center justify-center gap-2 hover:bg-accent/90 transition-colors cursor-pointer shadow-xs"
              >
                {busy ? 'Enrolling...' : 'Yes, enroll passkey'}
                {!busy && <ArrowRight size={16} />}
              </button>
              
              <button 
                onClick={() => handleEnrollPasskey(false)}
                disabled={busy}
                className="w-full py-2.5 bg-transparent border border-border text-text font-sans rounded hover:bg-surface-elevated transition-colors cursor-pointer"
              >
                No, just use passphrase
              </button>
            </div>
          </div>
        </div>
      );
    }

    // Step 1: Initial Passphrase Setup
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center p-4 pt-safe pb-safe pl-safe pr-safe">
        <div className="bg-surface border border-border rounded-lg p-6 sm:p-8 w-full max-w-md shadow-2xl corner-ticks">
          <div className="flex items-center gap-3 mb-4">
            <ShieldCheck className="text-accent" size={28} />
            <h2 className="text-xl font-sans text-text font-bold">Initialize Vault</h2>
          </div>
          
          <p className="text-muted text-sm mb-4 leading-relaxed">
            Set a master passphrase to secure your local workspace and encrypted API keys. A 12-word recovery phrase will also be generated.
          </p>

          <div className="mb-5 p-3 rounded-lg bg-accent/10 border border-accent/25 text-muted text-xs leading-relaxed">
            <span className="font-semibold text-accent font-sans">Security Notice: </span>
            This passphrase is the only thing standing between local device access and your decrypted API keys and GitHub PAT. Choose a strong passphrase of at least 10 characters.
          </div>
          
          <form onSubmit={handleStartSetup} className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-sans text-muted ">Master Passphrase</label>
                <span className="text-[10px] font-sans text-muted">Min 10 characters</span>
              </div>
              <div className="relative">
                <input 
                  type={showSetupPassphrase ? "text" : "password"}
                  value={passphrase}
                  onChange={e => setPassphrase(e.target.value)}
                  className="w-full bg-bg border border-border rounded px-3 py-2 pr-10 text-text font-sans focus:outline-none focus:border-accent transition-colors text-sm"
                  autoFocus
                  placeholder="Enter strong passphrase"
                />
                <button
                  type="button"
                  onClick={() => setShowSetupPassphrase(!showSetupPassphrase)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-text transition-colors cursor-pointer"
                  tabIndex={-1}
                >
                  {showSetupPassphrase ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              
              {/* Strength Meter */}
              <div className="mt-2 h-1.5 w-full bg-bg rounded overflow-hidden flex gap-1">
                {[1, 2, 3, 4].map((level) => (
                  <div 
                    key={level} 
                    className={`h-full flex-1 transition-colors duration-300 ${
                      strength.score >= level ? strength.color : 'bg-border'
                    }`}
                  />
                ))}
              </div>
              <div className="mt-1 flex items-center justify-between text-[10px] font-sans gap-2">
                <span className="text-muted truncate">
                  {passphrase.length < 10 && passphrase.length > 0 
                    ? `${10 - passphrase.length} more characters needed` 
                    : strength.warning || (strength.entropy > 0 ? `~${strength.entropy} bits entropy` : '')}
                </span>
                <span className={` font-semibold shrink-0 ${strength.label === 'Weak' ? 'text-oxide' : 'text-muted'}`}>
                  {strength.label}
                </span>
              </div>
            </div>
            
            <div>
              <label className="block text-xs font-sans text-muted  mb-1">Confirm Passphrase</label>
              <div className="relative">
                <input 
                  type={showSetupConfirm ? "text" : "password"}
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  className="w-full bg-bg border border-border rounded px-3 py-2 pr-10 text-text font-sans focus:outline-none focus:border-accent transition-colors text-sm"
                  placeholder="Confirm passphrase"
                />
                <button
                  type="button"
                  onClick={() => setShowSetupConfirm(!showSetupConfirm)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-text transition-colors cursor-pointer"
                  tabIndex={-1}
                >
                  {showSetupConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {confirm.length > 0 && (
                <div className={`mt-1.5 text-xs font-sans ${passphrase === confirm ? 'text-moss' : 'text-muted'}`}>
                  {passphrase === confirm ? 'Passphrases match' : "Doesn't match yet"}
                </div>
              )}
            </div>

            <label className="flex items-center gap-2 text-xs text-muted font-sans cursor-pointer select-none">
              <input 
                type="checkbox"
                checked={keepMeLoggedIn}
                onChange={e => setKeepMeLoggedIn(e.target.checked)}
                className="rounded border-border text-accent focus:ring-accent cursor-pointer"
              />
              <span>Keep me logged in</span>
            </label>
            
            {error && (
              <div className="text-oxide text-xs font-sans flex items-center gap-1.5 p-2 rounded bg-oxide/10 border border-oxide/20">
                <ShieldAlert size={14} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}
            
            <button 
              type="submit"
              disabled={busy || !passphrase || !confirm || passphrase.length < 10 || strength.label === 'Weak'}
              className="w-full mt-6 py-2.5 bg-accent text-accent-text-on font-sans font-bold rounded flex items-center justify-center gap-2 hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-xs"
            >
              {busy ? 'Deriving Keys...' : 'Set Passphrase & Generate Recovery'}
              {!busy && <ArrowRight size={16} />}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ==========================================
  // UNLOCK FLOW (Config exists)
  // ==========================================

  // Passkey mode
  if (unlockMode === 'passkey' && config.passkeyData) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center p-4 pt-safe pb-safe pl-safe pr-safe">
        <div className="bg-surface border border-border rounded-lg p-8 w-full max-w-md shadow-2xl flex flex-col items-center corner-ticks">
          <Fingerprint className="text-accent mb-6" size={48} />
          <h2 className="text-xl font-sans text-text mb-2">Unlock Vault</h2>
          <p className="text-muted text-xs font-sans text-center mb-6">Authenticate using your registered passkey</p>
          
          <button 
            onClick={() => handlePasskeyUnlock(config)}
            disabled={busy}
            className="w-full py-2.5 bg-accent text-accent-text-on font-sans font-bold rounded hover:bg-accent/90 transition-colors mb-4 cursor-pointer shadow-xs"
          >
            {busy ? 'Verifying...' : 'Unlock with Passkey'}
          </button>
          
          <button 
            onClick={() => {
              setError('');
              setUnlockMode('passphrase');
            }}
            className="text-xs font-sans text-muted hover:text-text underline cursor-pointer"
          >
            Use passphrase instead
          </button>
        </div>
      </div>
    );
  }

  // Recovery phrase mode
  if (unlockMode === 'recovery') {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center p-4 pt-safe pb-safe pl-safe pr-safe">
        <div className="bg-surface border border-border rounded-lg p-6 sm:p-8 w-full max-w-md shadow-2xl corner-ticks">
          <div className="flex items-center gap-3 mb-4">
            <LifeBuoy className="text-accent" size={26} />
            <h2 className="text-xl font-sans text-text font-bold">Recover Vault</h2>
          </div>

          <p className="text-muted text-xs sm:text-sm mb-5 leading-relaxed">
            Enter your 12-word recovery phrase (separated by spaces) to unwrap your vault master key.
          </p>

          <form onSubmit={handleRecoveryUnlock} className="space-y-4">
            <div>
              <label className="block text-xs font-sans text-muted  mb-1">12-Word Recovery Phrase</label>
              <div className="relative">
                <input 
                  type={showRecoveryPhrase ? "text" : "password"}
                  value={enteredRecoveryPhrase}
                  onChange={e => setEnteredRecoveryPhrase(e.target.value)}
                  placeholder="e.g. apple banana cherry dog elephant fox grape horse island jungle kite lion"
                  className="w-full bg-bg border border-border rounded px-3 py-2 pr-10 text-text font-sans text-xs focus:outline-none focus:border-accent transition-colors leading-relaxed"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowRecoveryPhrase(!showRecoveryPhrase)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-text transition-colors cursor-pointer"
                  tabIndex={-1}
                >
                  {showRecoveryPhrase ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <label className="flex items-center gap-2 text-xs text-muted font-sans cursor-pointer select-none">
              <input 
                type="checkbox"
                checked={keepMeLoggedIn}
                onChange={e => setKeepMeLoggedIn(e.target.checked)}
                className="rounded border-border text-accent focus:ring-accent cursor-pointer"
              />
              <span>Keep me logged in</span>
            </label>

            {error && (
              <div className="text-oxide text-xs font-sans flex items-center gap-1.5">
                <ShieldAlert size={14} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button 
              type="submit"
              disabled={busy || !enteredRecoveryPhrase.trim()}
              className="w-full py-2.5 bg-accent text-accent-text-on font-sans font-bold rounded flex items-center justify-center gap-2 hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-xs"
            >
              {busy ? 'Unwrapping Key...' : 'Unlock with Recovery Phrase'}
              {!busy && <ArrowRight size={16} />}
            </button>

            <div className="pt-2 flex items-center justify-center">
              <button 
                type="button"
                onClick={() => {
                  setError('');
                  setUnlockMode('passphrase');
                }}
                className="text-xs font-sans text-muted hover:text-text flex items-center gap-1.5 underline cursor-pointer"
              >
                <ArrowLeft size={12} /> Back to passphrase
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // Standard Passphrase Unlock mode
  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4 pt-safe pb-safe pl-safe pr-safe">
      <div className="bg-surface border border-border rounded-lg p-6 sm:p-8 w-full max-w-md shadow-2xl corner-ticks">
        <div className="flex items-center gap-3 mb-6">
          <LaideLogo size={32} className="rounded-md shrink-0 shadow-xs" />
          <div>
            <h2 className="text-xl font-sans text-text font-bold">Unlock Vault</h2>
            <p className="text-[11px] font-mono text-muted">LAIDE Studio Workspace</p>
          </div>
        </div>
        
        <form onSubmit={handleUnlock} className="space-y-4">
          <div>
            <label className="block text-xs font-sans text-muted  mb-1">Passphrase</label>
            <div className="relative">
              <input 
                type={showUnlockPassphrase ? "text" : "password"}
                value={unlockPassphrase}
                onChange={e => setUnlockPassphrase(e.target.value)}
                className="w-full bg-bg border border-border rounded px-3 py-2 pr-10 text-text font-sans focus:outline-none focus:border-accent transition-colors"
                autoFocus
                placeholder="Enter master passphrase"
              />
              <button
                type="button"
                onClick={() => setShowUnlockPassphrase(!showUnlockPassphrase)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-text transition-colors cursor-pointer"
                tabIndex={-1}
              >
                {showUnlockPassphrase ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs text-muted font-sans cursor-pointer select-none">
            <input 
              type="checkbox"
              checked={keepMeLoggedIn}
              onChange={e => setKeepMeLoggedIn(e.target.checked)}
              className="rounded border-border text-accent focus:ring-accent cursor-pointer"
            />
            <span>Keep me logged in</span>
          </label>
          
          {error && (
            <div className="text-oxide text-xs font-sans flex items-center gap-1.5">
              <ShieldAlert size={14} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}
          
          <button 
            type="submit"
            disabled={busy || !unlockPassphrase}
            className="w-full mt-2 py-2.5 bg-accent text-accent-text-on font-sans font-bold rounded flex items-center justify-center gap-2 hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-xs"
          >
            {busy ? 'Decrypting...' : 'Unlock'}
            {!busy && <ArrowRight size={16} />}
          </button>
          
          <div className="flex flex-col items-center gap-2 pt-2 text-center">
            {config.recoveryData && (
              <button 
                type="button"
                onClick={() => {
                  setError('');
                  setUnlockMode('recovery');
                }}
                className="text-xs font-sans text-muted hover:text-accent transition-colors underline cursor-pointer"
              >
                Forgot passphrase? Use recovery phrase
              </button>
            )}

            {config.passkeyData && (
              <button 
                type="button"
                onClick={() => {
                  setError('');
                  setUnlockMode('passkey');
                  handlePasskeyUnlock(config);
                }}
                className="text-xs font-sans text-muted hover:text-text underline cursor-pointer"
              >
                Unlock with Passkey
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
