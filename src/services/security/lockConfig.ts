import type { PasskeyData } from './passkeyCrypto';
import type { RecoveryData } from './recovery';

export interface LockConfig {
  saltBase64: string;
  verifierBase64: string;
  recoveryData?: RecoveryData | null;
  passkeyData: PasskeyData | null;
}

const STORAGE_KEY = 'laide_lock_config';

export function getLockConfig(): LockConfig | null {
  const data = localStorage.getItem(STORAGE_KEY);
  if (!data) return null;
  try {
    return JSON.parse(data) as LockConfig;
  } catch (_e) {
    return null;
  }
}

export function saveLockConfig(config: LockConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function clearLockConfig(): void {
  localStorage.removeItem(STORAGE_KEY);
}
