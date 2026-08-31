import React, { useState, useRef } from 'react';
import { 
  Lock, ShieldCheck, HardDrive, Download, Upload, CheckCircle2, 
  AlertTriangle, X, FileJson, Check, RefreshCw 
} from 'lucide-react';
import { useAppStore } from '../../../store';
import { 
  createEncryptedBackup, 
  downloadBackupFile, 
  validateBackupFile, 
  restoreBackup,
  type BackupValidationResult
} from '../../../services/security/backup';

export function SecuritySection() {
  const { keys, setKeys, lockVault, pendingPatches } = useAppStore();

  const [exportingBackup, setExportingBackup] = useState(false);
  const [backupExportSuccess, setBackupExportSuccess] = useState(false);
  const [importingBackup, setImportingBackup] = useState(false);
  const [importValidation, setImportValidation] = useState<BackupValidationResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccessMsg, setImportSuccessMsg] = useState<string | null>(null);
  const [showLockConfirmModal, setShowLockConfirmModal] = useState(false);

  const backupFileInputRef = useRef<HTMLInputElement>(null);

  const performLock = () => {
    if (lockVault) {
      lockVault();
    } else {
      setKeys(null);
    }
  };

  const handleLockClick = () => {
    if (pendingPatches && pendingPatches.length > 0) {
      setShowLockConfirmModal(true);
    } else {
      performLock();
    }
  };

  const handleExportBackup = async () => {
    if (!keys) return;
    setExportingBackup(true);
    setImportError(null);
    try {
      const payload = await createEncryptedBackup();
      downloadBackupFile(payload);
      setBackupExportSuccess(true);
      setTimeout(() => setBackupExportSuccess(false), 3000);
    } catch (err: unknown) {
      console.error('Backup export failed', err);
      setImportError('Failed to export vault backup.');
    } finally {
      setExportingBackup(false);
    }
  };

  const handleBackupFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError(null);
    setImportSuccessMsg(null);
    try {
      const text = await file.text();
      const validation = validateBackupFile(text);
      if (!validation.valid || !validation.backup) {
        setImportError(validation.error || 'Invalid backup file format.');
        return;
      }
      setImportValidation(validation);
    } catch {
      setImportError('Failed to parse backup file as JSON.');
    } finally {
      if (backupFileInputRef.current) {
        backupFileInputRef.current.value = '';
      }
    }
  };

  const handleConfirmRestore = async () => {
    if (!importValidation?.backup || !keys) return;
    setImportingBackup(true);
    setImportError(null);
    try {
      const result = await restoreBackup(importValidation.backup);
      setImportSuccessMsg(`Successfully restored ${result.projectsCount} project(s) and ${result.filesCount} file(s).`);
      setImportValidation(null);
      setTimeout(() => setImportSuccessMsg(null), 5000);
    } catch (err: unknown) {
      setImportError(err instanceof Error ? err.message : 'Restore operation failed.');
    } finally {
      setImportingBackup(false);
    }
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      {/* Lock Vault Control Card */}
      <div className="rounded-xl border border-border bg-surface/30 p-4 sm:p-5 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-border/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-surface-elevated border border-border flex items-center justify-center text-accent">
              <Lock size={15} />
            </div>
            <div>
              <h3 className="text-xs font-semibold text-text tracking-tight">Vault Security</h3>
              <p className="text-[11px] text-muted">Protect active workspace session and cryptographic keys</p>
            </div>
          </div>
          <span className="font-mono text-[10px] px-2 py-0.5 rounded-md bg-moss/10 border border-moss/30 text-moss font-medium flex items-center gap-1">
            <ShieldCheck size={11} /> Unlocked
          </span>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-bg/60 border border-border p-3.5 rounded-lg">
          <div className="space-y-0.5">
            <h4 className="text-xs font-semibold text-text">Lock Local Vault</h4>
            <p className="text-[11px] text-muted leading-relaxed">
              Purges active decrypted keys and chat context from memory. Your files remain securely encrypted on disk.
            </p>
          </div>
          <button
            type="button"
            onClick={handleLockClick}
            className="px-3.5 py-2 bg-oxide/15 hover:bg-oxide/25 text-oxide border border-oxide/30 font-semibold text-xs rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer shrink-0"
          >
            <Lock size={13} />
            <span>Lock Vault</span>
          </button>
        </div>
      </div>

      {/* Encrypted Vault Backup & Restore */}
      <div className="bg-surface/50 border border-border p-4 sm:p-5 rounded">
        <div className="flex items-center gap-2 text-accent mb-2">
          <HardDrive size={18} />
          <h3 className="text-sm font-sans font-bold">Encrypted Vault Backup</h3>
        </div>

        <p className="text-xs text-muted font-sans mb-4 leading-relaxed">
          Export a complete encrypted JSON backup of all your projects, files, and connection profiles, or restore from a previously downloaded backup file.
        </p>

        {importError && (
          <div className="mb-4 p-3 rounded bg-oxide/10 border border-oxide/30 text-oxide text-xs font-sans flex items-center gap-2">
            <AlertTriangle size={14} className="shrink-0" />
            <span>{importError}</span>
          </div>
        )}

        {importSuccessMsg && (
          <div className="mb-4 p-3 rounded bg-moss/10 border border-moss/30 text-moss text-xs font-sans flex items-center gap-2">
            <CheckCircle2 size={14} className="shrink-0" />
            <span>{importSuccessMsg}</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={handleExportBackup}
            disabled={exportingBackup}
            className="py-2.5 px-4 bg-surface hover:bg-black/5 border border-white/15 text-text font-sans text-xs rounded font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
          >
            {backupExportSuccess ? (
              <CheckCircle2 size={15} className="text-moss" />
            ) : (
              <Download size={15} className="text-accent" />
            )}
            <span>{backupExportSuccess ? 'Backup Exported!' : exportingBackup ? 'Exporting...' : 'Export Encrypted Backup'}</span>
          </button>

          <input
            type="file"
            ref={backupFileInputRef}
            onChange={handleBackupFileSelect}
            accept=".json,application/json"
            className="hidden"
          />

          <button
            type="button"
            onClick={() => backupFileInputRef.current?.click()}
            className="py-2.5 px-4 bg-surface hover:bg-black/5 border border-white/15 text-text font-sans text-xs rounded font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <Upload size={15} className="text-moss" />
            <span>Import Backup File</span>
          </button>
        </div>
      </div>

      {/* Lock Vault Confirmation Modal */}
      {showLockConfirmModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-bg border border-oxide/40 rounded-xl max-w-sm w-full p-5 shadow-2xl flex flex-col gap-4 font-sans text-left">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5 text-oxide">
                <div className="p-2 bg-oxide/10 border border-oxide/30 rounded-lg">
                  <Lock size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-text">Lock Vault?</h3>
                  <p className="text-[10px] text-oxide font-semibold">Pending Patches Unreviewed</p>
                </div>
              </div>
              <button
                onClick={() => setShowLockConfirmModal(false)}
                className="text-muted hover:text-text p-1 cursor-pointer transition-colors"
                aria-label="Cancel"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-2 text-xs text-muted leading-relaxed border-y border-border py-3">
              <p>
                You have <span className="text-text font-bold">{pendingPatches.length} pending patch{pendingPatches.length > 1 ? 'es' : ''}</span> waiting for review.
              </p>
              <p className="text-[11px] text-text/90">
                Locking the vault will not lose your local workspace files, but you will need to re-unlock the vault to continue reviewing pending patches.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                onClick={() => setShowLockConfirmModal(false)}
                className="px-3 py-1.5 bg-surface border border-border hover:bg-black/5 text-text rounded text-xs transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowLockConfirmModal(false);
                  performLock();
                }}
                className="px-3 py-1.5 bg-oxide hover:bg-oxide/90 text-white font-bold text-xs rounded transition-colors flex items-center gap-1.5 cursor-pointer shadow"
              >
                <Lock size={13} />
                <span>Lock Vault</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Backup Restore Confirmation Modal */}
      {importValidation && importValidation.summary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="bg-surface border border-white/15 rounded-lg p-5 sm:p-6 w-full max-w-md shadow-2xl flex flex-col gap-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-2.5 text-accent">
              <FileJson size={20} />
              <h3 className="text-sm font-sans font-bold text-text">Restore Encrypted Backup</h3>
            </div>

            <div className="bg-bg/80 border border-border rounded p-3 font-sans text-xs space-y-2">
              <div className="text-muted text-[10px]">Backup Contents:</div>
              <div className="flex justify-between text-muted">
                <span>Projects:</span>
                <span className="font-bold text-text">{importValidation.summary.projectCount}</span>
              </div>
              <div className="flex justify-between text-muted">
                <span>Total Files:</span>
                <span className="font-bold text-text">{importValidation.summary.fileCount}</span>
              </div>
              <div className="flex justify-between text-muted">
                <span>Connection Profiles:</span>
                <span className="font-bold text-text">{importValidation.summary.profileCount}</span>
              </div>
              <div className="flex justify-between text-muted">
                <span>Snapshots:</span>
                <span className="font-bold text-text">{importValidation.summary.snapshotCount}</span>
              </div>
              <div className="flex justify-between text-muted">
                <span>Exported Date:</span>
                <span className="text-muted">{new Date(importValidation.summary.exportedAt).toLocaleDateString()}</span>
              </div>
            </div>

            <p className="text-xs text-muted leading-relaxed font-sans">
              Restoring will import and merge these records into your IndexedDB database. Existing projects with identical IDs will be updated.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => setImportValidation(null)}
                disabled={importingBackup}
                className="px-3 py-2 text-xs font-sans text-muted hover:text-text transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRestore}
                disabled={importingBackup}
                className="px-4 py-2 bg-accent text-surface font-sans font-bold text-xs rounded hover:bg-accent/90 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {importingBackup ? (
                  <RefreshCw size={14} className="animate-spin" />
                ) : (
                  <Check size={14} />
                )}
                <span>{importingBackup ? 'Restoring...' : 'Confirm Restore'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
