import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, Save, Trash2, ShieldCheck, ShieldAlert, Activity, CheckCircle2, 
  ChevronDown, Check, Sparkles, RefreshCw, MessageSquareCode, RotateCcw,
  AlertTriangle, Lock, Cpu, GitMerge, ToggleLeft, ToggleRight,
  Key, Tag, Globe, Eye, EyeOff, Edit3, Bot
} from 'lucide-react';
import { db, type ConnectionProfile } from '../../../db';
import { useAppStore } from '../../../store';
import { AnthropicProvider } from '../../../services/llm/providers/anthropic';
import { OpenAIProvider } from '../../../services/llm/providers/openai';
import { GoogleProvider } from '../../../services/llm/providers/google';
import { OpenAICompatibleProvider } from '../../../services/llm/providers/openaiCompatible';
import type { LLMAdapter } from '../../../services/llm/llmAdapter';
import { 
  fetchAvailableModels, 
  type DiscoveredModel,
  getModelContextWindow,
  formatContextWindow
} from '../../../services/llm/modelDiscovery';
import { toFriendlyErrorMessage } from '../../../services/llm/friendlyError';
import { PROVIDER_TAGLINES } from '../../../services/llm/providerMeta';
import { ModelPickerModal } from '../../modals/ModelPickerModal';

export const PROVIDERS = [
  { id: 'anthropic', label: 'Anthropic' },
  { id: 'openai', label: 'OpenAI' },
  { id: 'google', label: 'Google Gemini' },
  { id: 'openrouter', label: 'OpenRouter' },
  { id: 'openai-compatible', label: 'OpenAI Compatible (Local/Custom)' },
] as const;

export const API_KEY_HINTS: Record<string, string> = {
  'anthropic': 'sk-ant-...',
  'openai': 'sk-...',
  'google': 'AIza...',
  'openrouter': 'sk-or-v1-...',
  'openai-compatible': 'sk-...',
};

export const DEFAULT_MODELS: Record<string, string> = {
  'anthropic': 'claude-3-7-sonnet-20250219',
  'openai': 'gpt-4o',
  'google': 'gemini-1.5-pro',
  'openrouter': 'anthropic/claude-3.5-sonnet',
  'openai-compatible': ''
};

export function ProviderProfilesSection() {
  const {
    keys,
    activeProfileId,
    setActiveProfileId,
    customInstructions,
    setCustomInstructions,
    tokenUsage,
    setTokenUsage,
    ensembleModeEnabled,
    setEnsembleModeEnabled,
    ensembleCandidateBProfileId,
    setEnsembleCandidateBProfileId,
  } = useAppStore();

  const [profiles, setProfiles] = useState<ConnectionProfile[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [provider, setProvider] = useState('anthropic');
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('');

  const [discoveredModels, setDiscoveredModels] = useState<DiscoveredModel[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const modelDropdownRef = useRef<HTMLDivElement>(null);

  const [testStatus, setTestStatus] = useState<{ id: string, loading: boolean, success?: boolean, error?: string } | null>(null);
  const [instructionsDraft, setInstructionsDraft] = useState(customInstructions);
  const [instructionsSaved, setInstructionsSaved] = useState(false);

  const loadProfiles = async () => {
    const all = await db.connectionProfiles.toArray();
    setProfiles(all);
  };

  useEffect(() => {
    let active = true;
    async function initProfiles() {
      const all = await db.connectionProfiles.toArray();
      if (active) {
        setProfiles(all);
      }
    }
    initProfiles();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (active) {
        setInstructionsDraft(customInstructions);
      }
    });
    return () => {
      active = false;
    };
  }, [customInstructions]);

  // Close model dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(event.target as Node)) {
        setShowModelDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectProvider = (newProvider: string) => {
    setProvider(newProvider);
    setModel(DEFAULT_MODELS[newProvider] || '');
    if (newProvider === 'openrouter') {
      setBaseUrl('https://openrouter.ai/api/v1');
    } else if (newProvider !== 'openai-compatible') {
      setBaseUrl('');
    }
  };

  // Auto-discover models when API key and provider are available
  const handleRefreshModels = async () => {
    if (!apiKey && provider !== 'openai-compatible' && provider !== 'openrouter') {
      return;
    }
    setLoadingModels(true);
    try {
      const models = await fetchAvailableModels(provider, apiKey, baseUrl);
      setDiscoveredModels(models);
    } catch {
      setDiscoveredModels([]);
    } finally {
      setLoadingModels(false);
    }
  };

  useEffect(() => {
    let active = true;
    const fetchModels = async () => {
      if (!apiKey && provider !== 'openai-compatible' && provider !== 'openrouter') {
        setDiscoveredModels([]);
        return;
      }
      setLoadingModels(true);
      try {
        const models = await fetchAvailableModels(provider, apiKey, baseUrl);
        if (active) {
          setDiscoveredModels(models);
        }
      } catch {
        if (active) setDiscoveredModels([]);
      } finally {
        if (active) setLoadingModels(false);
      }
    };

    const timer = setTimeout(fetchModels, 500);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [provider, apiKey, baseUrl]);

  const handleSetDefault = (id: string) => {
    setActiveProfileId(id);
    const p = profiles.find(x => x.id === id);
    if (p) {
      const targetMax = getModelContextWindow(p.provider, p.model);
      setTokenUsage({ ...tokenUsage, max: targetMax });
    }
  };

  const handleEdit = async (p: ConnectionProfile) => {
    setEditingId(p.id);
    setLabel(p.label);
    setProvider(p.provider);
    setBaseUrl(p.baseUrl);
    setModel(p.model);
    setApiKey(''); // Don't show by default, user must enter new one if they want to change it
    
    // Attempt to decrypt to show it, or keep it empty
    if (keys) {
      try {
        const { decryptData } = await import('../../../services/security/crypto');
        const decrypted = await decryptData(keys.aesKey, p.encryptedApiKey);
        setApiKey(decrypted);
      } catch (_e) {
        console.warn('Could not decrypt API key for display');
      }
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setLabel('');
    setProvider('anthropic');
    setApiKey('');
    setBaseUrl('');
    setModel(DEFAULT_MODELS['anthropic']);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keys) return;

    let finalEncryptedKey = '';
    if (editingId && !apiKey) {
      // User didn't change the API key
      const existing = profiles.find(p => p.id === editingId);
      if (existing) finalEncryptedKey = existing.encryptedApiKey;
    } else {
      // Encrypt new API key
      const { encryptData } = await import('../../../services/security/crypto');
      finalEncryptedKey = await encryptData(keys.aesKey, apiKey);
    }

    const id = editingId || crypto.randomUUID();
    
    const newProfile: ConnectionProfile = {
      id,
      label: label || `${provider} default`,
      provider,
      encryptedApiKey: finalEncryptedKey,
      baseUrl: (provider === 'openai-compatible' || provider === 'openrouter') ? baseUrl : '',
      model: model || DEFAULT_MODELS[provider] || ''
    };

    await db.connectionProfiles.put(newProfile);
    
    if (!activeProfileId || activeProfileId === id) {
      handleSetDefault(id);
    }
    
    resetForm();
    loadProfiles();
  };

  const handleDelete = async (id: string) => {
    await db.connectionProfiles.delete(id);
    if (activeProfileId === id) {
      localStorage.removeItem('laide_active_profile_id');
      setActiveProfileId('');
    }
    loadProfiles();
  };

  const handleTest = async (p: ConnectionProfile) => {
    if (!keys) return;
    setTestStatus({ id: p.id, loading: true });
    
    try {
      // Decrypt API key
      const { decryptData } = await import('../../../services/security/crypto');
      const rawKey = await decryptData(keys.aesKey, p.encryptedApiKey);

      if (!rawKey) throw new Error('API key could not be decrypted');

      let adapter: LLMAdapter;
      switch (p.provider) {
        case 'anthropic':
          adapter = new AnthropicProvider(rawKey, p.model);
          break;
        case 'openai':
          adapter = new OpenAIProvider(rawKey, p.model);
          break;
        case 'google':
          adapter = new GoogleProvider(rawKey, p.model);
          break;
        case 'openrouter':
        case 'openai-compatible':
          adapter = new OpenAICompatibleProvider(p.baseUrl, rawKey, p.model);
          break;
        default:
          throw new Error('Unknown provider');
      }

      // Minimal test request
      await adapter.send({
        messages: [{ role: 'user', content: 'Hello.' }],
        maxTokens: 5
      });

      setTestStatus({ id: p.id, loading: false, success: true });
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const friendly = toFriendlyErrorMessage(errorMsg);
      setTestStatus({ id: p.id, loading: false, success: false, error: friendly.summary });
    }
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      {/* Connection Profiles Section (Unified Professional Layout) */}
      <div className="rounded-xl border border-border bg-surface/30 p-4 sm:p-5 space-y-4">
        {/* Section Header */}
        <div className="flex items-center justify-between pb-3 border-b border-border/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-surface-elevated border border-border flex items-center justify-center text-accent">
              <Bot size={15} />
            </div>
            <div>
              <h3 className="text-xs font-semibold text-text tracking-tight">Connection Profiles</h3>
              <p className="text-[11px] text-muted">AI provider credentials for chat, coding loops, and automated patch reviews</p>
            </div>
          </div>
          <span className="font-mono text-[10px] px-2 py-0.5 rounded-md bg-surface-elevated border border-border text-muted font-medium">
            {profiles.length === 0 ? '0 Configured' : `${profiles.length} ${profiles.length === 1 ? 'Profile' : 'Profiles'}`}
          </span>
        </div>

        {/* Existing Profiles List or Compact Empty State */}
        {profiles.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/80 bg-surface/40 p-4 sm:p-5 text-center flex flex-col items-center">
            <div className="w-9 h-9 rounded-lg bg-accent/10 border border-accent/30 flex items-center justify-center text-accent mb-2.5">
              <Sparkles size={16} />
            </div>
            <h4 className="text-xs font-semibold text-text mb-1">No Connection Profiles Configured</h4>
            <p className="text-[11px] text-muted max-w-sm leading-relaxed mb-3.5">
              Connect an AI model to power chat, code generation, and patch review. Choose a provider below, enter your API key, and tap Add Profile.
            </p>
            {/* Quick Provider Selection Chips */}
            <div className="flex flex-wrap items-center justify-center gap-1.5 pt-2.5 border-t border-border/40 w-full max-w-md">
              <span className="text-[10px] font-mono text-muted mr-1">Quick Select:</span>
              {PROVIDERS.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => selectProvider(p.id)}
                  className={`px-2 py-0.5 rounded text-[11px] font-medium transition-all cursor-pointer border ${
                    provider === p.id 
                      ? 'bg-accent/15 border-accent text-accent font-semibold' 
                      : 'bg-surface-elevated/80 border-border text-muted hover:text-text hover:border-accent/40'
                  }`}
                >
                  {p.label.split(' ')[0]}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-2.5">
            {profiles.map(p => {
              const isActive = activeProfileId === p.id;
              const ctx = getModelContextWindow(p.provider, p.model);
              return (
                <div 
                  key={p.id} 
                  className={`border rounded-lg p-3.5 transition-all flex flex-col gap-2.5 ${
                    isActive 
                      ? 'border-accent bg-accent/5 ring-1 ring-accent/30 shadow-xs' 
                      : 'border-border/80 bg-surface/40 hover:border-border'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-md bg-surface-elevated border border-border flex items-center justify-center text-accent text-xs font-bold font-mono">
                        {p.provider.charAt(0).toUpperCase()}
                      </div>
                      <span className="font-semibold text-xs text-text">{p.label}</span>
                      {isActive && (
                        <span className="text-[10px] font-mono bg-moss/15 text-moss border border-moss/30 px-1.5 py-0.5 rounded font-semibold">
                          Default
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      {!isActive && (
                        <button 
                          onClick={() => handleSetDefault(p.id)} 
                          className="px-2 py-1 text-[11px] font-medium rounded text-muted hover:text-text hover:bg-surface-elevated transition-colors cursor-pointer"
                        >
                          Set Default
                        </button>
                      )}
                      <button 
                        onClick={() => handleEdit(p)} 
                        className="p-1 rounded text-muted hover:text-accent hover:bg-surface-elevated transition-colors cursor-pointer"
                        title="Edit profile"
                        aria-label={`Edit ${p.label}`}
                      >
                        <Edit3 size={13} />
                      </button>
                      <button 
                        onClick={() => handleDelete(p.id)} 
                        className="p-1 rounded text-muted hover:text-oxide hover:bg-surface-elevated transition-colors cursor-pointer"
                        title="Delete profile"
                        aria-label={`Delete ${p.label}`}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                  
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-mono text-muted">
                    <span className="text-text/90 font-medium">{p.model}</span>
                    <span>•</span>
                    <span>{formatContextWindow(ctx)} ctx</span>
                    <span>•</span>
                    <span className="flex items-center gap-1 text-moss">
                      <ShieldCheck size={11} /> Encrypted Key
                    </span>
                  </div>
                  
                  <div className="flex items-center justify-between pt-2 border-t border-border/50 text-xs">
                    <button 
                      onClick={() => handleTest(p)}
                      disabled={testStatus?.id === p.id && testStatus.loading}
                      title="Test basic connectivity with provider"
                      className="text-[11px] font-medium flex items-center gap-1.5 bg-surface-elevated hover:bg-surface border border-border text-text px-2.5 py-1 rounded transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      {testStatus?.id === p.id && testStatus.loading ? (
                        <RefreshCw size={11} className="animate-spin text-accent" />
                      ) : (
                        <Activity size={11} className="text-accent" />
                      )}
                      <span>{testStatus?.id === p.id && testStatus.loading ? 'Testing...' : 'Test Connection'}</span>
                    </button>
                    
                    {testStatus?.id === p.id && !testStatus.loading && (
                      <div className={`text-[11px] font-medium flex items-center gap-1 ${testStatus.success ? 'text-moss' : 'text-oxide'}`}>
                        {testStatus.success ? (
                          <><CheckCircle2 size={12} /> Connection OK</>
                        ) : (
                          <><ShieldAlert size={12} /> {testStatus.error}</>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Add / Edit Profile Form Card */}
        <div className="rounded-lg border border-border/80 bg-surface/50 p-4 space-y-4">
          <div className="flex items-center justify-between pb-2.5 border-b border-border/40">
            <div className="flex items-center gap-2">
              {editingId ? <Save size={13} className="text-accent" /> : <Plus size={13} className="text-accent" />}
              <h4 className="text-xs font-semibold text-text tracking-tight">
                {editingId ? 'Edit Profile' : 'Add New Profile'}
              </h4>
            </div>
            {editingId && (
              <button 
                type="button"
                onClick={resetForm} 
                className="text-[11px] text-muted hover:text-text px-2 py-0.5 rounded hover:bg-surface-elevated transition-colors cursor-pointer"
              >
                Cancel Edit
              </button>
            )}
          </div>
          
          <form onSubmit={handleSave} className="space-y-2.5">
            {/* Quick Provider Picker Chips */}
            <div className="space-y-1.5">
              <label className="block text-[11px] font-medium text-muted">Provider</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {PROVIDERS.map((opt, idx) => {
                  const isSelected = provider === opt.id;
                  const isLastOdd = idx === PROVIDERS.length - 1 && PROVIDERS.length % 2 !== 0;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => selectProvider(opt.id)}
                      className={`px-2.5 py-2 rounded-lg border text-left flex flex-col gap-0.5 transition-all cursor-pointer ${
                        isLastOdd ? 'col-span-2 sm:col-span-1' : 'col-span-1'
                      } ${
                        isSelected
                          ? 'border-accent bg-accent/15 text-accent font-semibold shadow-xs ring-1 ring-accent/30'
                          : 'border-border/70 bg-bg/50 text-muted hover:border-accent/40 hover:text-text'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className="text-xs truncate">{opt.label.split(' ')[0]}</span>
                        {isSelected && <Check size={11} className="text-accent stroke-[3] shrink-0" />}
                      </div>
                      <span className="text-[10px] text-muted font-normal truncate">
                        {PROVIDER_TAGLINES[opt.id] || ''}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Profile Label & Model Name */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <label className="block text-[11px] font-medium text-muted">Profile Label</label>
                <div className="relative flex items-center">
                  <Tag size={13} className="absolute left-2.5 text-muted pointer-events-none" />
                  <input 
                    type="text"
                    value={label}
                    onChange={e => setLabel(e.target.value)}
                    placeholder="e.g. Work Claude"
                    required
                    className="w-full bg-bg/80 border border-border/80 rounded-lg pl-8 pr-3 py-2 text-text font-sans text-xs focus:border-accent focus:ring-1 focus:ring-accent/30 focus:outline-none transition-colors placeholder-neutral-500"
                  />
                </div>
              </div>

              <div className="space-y-1 relative" ref={modelDropdownRef}>
                <div className="flex items-center justify-between">
                  <label className="block text-[11px] font-medium text-muted">Model Name</label>
                  {discoveredModels.length > 0 && (
                    <span className="text-[10px] font-mono text-moss flex items-center gap-1">
                      <Sparkles size={9} /> {discoveredModels.length} models found
                    </span>
                  )}
                </div>
                <div className="relative flex items-center">
                  <Cpu size={13} className="absolute left-2.5 text-muted pointer-events-none" />
                  <input 
                    type="text"
                    value={model}
                    onChange={e => setModel(e.target.value)}
                    placeholder={`e.g. ${DEFAULT_MODELS[provider] || 'gpt-4'}`}
                    required
                    className="w-full bg-bg/80 border border-border/80 rounded-lg pl-8 pr-8 py-2 text-text font-sans text-xs focus:border-accent focus:ring-1 focus:ring-accent/30 focus:outline-none transition-colors font-mono placeholder-neutral-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowModelDropdown(true)}
                    disabled={loadingModels || (discoveredModels.length === 0 && !apiKey && provider !== 'openai-compatible' && provider !== 'openrouter')}
                    title="Select from available models"
                    aria-label="Toggle available models list"
                    className="absolute right-2 text-muted hover:text-accent disabled:opacity-30 cursor-pointer p-1 transition-colors"
                  >
                    {loadingModels ? (
                      <RefreshCw size={13} className="animate-spin text-accent" />
                    ) : (
                      <ChevronDown size={13} />
                    )}
                  </button>
                </div>

                {/* Searchable Model Picker Bottom Sheet */}
                <ModelPickerModal
                  isOpen={showModelDropdown}
                  onClose={() => setShowModelDropdown(false)}
                  models={discoveredModels}
                  selectedModel={model}
                  onSelectModel={(modelId) => setModel(modelId)}
                  provider={provider}
                  loading={loadingModels}
                  onRefresh={handleRefreshModels}
                />
              </div>
            </div>
            
            {/* Base URL for OpenRouter & OpenAI-compatible */}
            {(provider === 'openai-compatible' || provider === 'openrouter') && (
              <div className="space-y-1">
                <label className="block text-[11px] font-medium text-muted">Base URL</label>
                <div className="relative flex items-center">
                  <Globe size={13} className="absolute left-2.5 text-muted pointer-events-none" />
                  <input 
                    type="url"
                    value={baseUrl}
                    onChange={e => setBaseUrl(e.target.value)}
                    placeholder="https://openrouter.ai/api/v1"
                    required
                    className="w-full bg-bg/80 border border-border/80 rounded-lg pl-8 pr-3 py-2 text-text font-sans text-xs focus:border-accent focus:ring-1 focus:ring-accent/30 focus:outline-none transition-colors font-mono placeholder-neutral-500"
                  />
                </div>
              </div>
            )}

            {/* API Key */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="block text-[11px] font-medium text-muted">
                  API Key {editingId && '(Leave blank to keep existing)'}
                </label>
                <span className="text-[10px] text-muted flex items-center gap-1">
                  <Lock size={10} className="text-moss" /> Encrypted locally
                </span>
              </div>
              <div className="relative flex items-center">
                <Key size={13} className="absolute left-2.5 text-muted pointer-events-none" />
                <input 
                  type={showApiKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  placeholder={API_KEY_HINTS[provider] || 'sk-...'}
                  required={!editingId}
                  className="w-full bg-bg/80 border border-border/80 rounded-lg pl-8 pr-9 py-2 text-text font-sans text-xs focus:border-accent focus:ring-1 focus:ring-accent/30 focus:outline-none transition-colors font-mono placeholder-neutral-500"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-2.5 text-muted hover:text-text cursor-pointer p-1 transition-colors"
                  title={showApiKey ? "Hide API key" : "Show API key"}
                  aria-label={showApiKey ? "Hide API key" : "Show API key"}
                >
                  {showApiKey ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
              </div>
            </div>
            
            {/* Submit Button */}
            <button 
              type="submit"
              className="w-full mt-2 py-2.5 bg-accent text-surface font-semibold text-xs rounded-lg flex items-center justify-center gap-2 hover:brightness-105 active:scale-[0.99] transition-all cursor-pointer shadow-xs"
            >
              {editingId ? <Save size={14} /> : <Plus size={14} />}
              <span>{editingId ? 'Save Profile' : 'Add Profile'}</span>
            </button>
          </form>
        </div>
      </div>

      {/* Dual-LLM Ensemble Mode Configuration Card */}
      <div className="bg-surface/50 border border-border p-4 sm:p-5 rounded">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 text-accent">
            <GitMerge size={18} />
            <h3 className="text-sm font-sans font-bold">Dual-LLM Ensemble Mode</h3>
          </div>
          <button
            type="button"
            onClick={() => setEnsembleModeEnabled(!ensembleModeEnabled)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-sans font-semibold transition-colors cursor-pointer border ${
              ensembleModeEnabled
                ? 'bg-accent text-surface border-accent'
                : 'bg-bg text-muted border-border hover:text-text'
            }`}
          >
            {ensembleModeEnabled ? (
              <>
                <ToggleRight size={16} />
                <span>Enabled (Opt-In)</span>
              </>
            ) : (
              <>
                <ToggleLeft size={16} />
                <span>Disabled (Off)</span>
              </>
            )}
          </button>
        </div>

        <p className="text-xs text-muted font-sans mb-3 leading-relaxed">
          When enabled and multiple profiles are configured, your coding task is dispatched to two models concurrently. Both candidate patches are executed against the sandboxed Vitest runner. Only the patch that passes test verification is presented to you; if both pass, you can compare diffs and pick.
        </p>

        <div className="p-3 bg-oxide/10 border border-oxide/20 rounded text-[11px] text-oxide flex items-start gap-2 mb-3">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <span>
            <strong>Token Cost Notice:</strong> Running two LLM providers in parallel roughly doubles token consumption per request. This mode defaults to disabled.
          </span>
        </div>

        {ensembleModeEnabled && (
          <div className="space-y-3 pt-2 border-t border-border">
            {profiles.length < 2 ? (
              <div className="p-3 bg-bg border border-border rounded text-xs text-muted">
                ⚠️ You need at least two connection profiles configured to run Dual-LLM Ensemble mode. Please add a second profile above.
              </div>
            ) : (
              <div>
                <label className="block text-xs font-sans text-muted mb-1.5">
                  Secondary Candidate Model (Candidate B)
                </label>
                <select
                  value={ensembleCandidateBProfileId || ''}
                  onChange={(e) => setEnsembleCandidateBProfileId(e.target.value || null)}
                  className="w-full bg-bg border border-border rounded px-3 py-2 text-text font-sans text-xs focus:border-accent focus:outline-none"
                >
                  <option value="">-- Auto-select first alternate profile --</option>
                  {profiles
                    .filter((p) => p.id !== activeProfileId)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label || p.provider} ({p.model})
                      </option>
                    ))}
                </select>
                <p className="text-[10px] text-muted mt-1">
                  Primary model (Candidate A) is your active default profile: <strong>{profiles.find(p => p.id === activeProfileId)?.label || 'Default Profile'}</strong>.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Custom Instructions Panel */}
      <div className="bg-surface/50 border border-border p-4 sm:p-5 rounded">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 text-accent">
            <MessageSquareCode size={18} />
            <h3 className="text-sm font-sans font-bold">Custom Instructions</h3>
          </div>
          {instructionsDraft.trim() !== '' && (
            <button
              type="button"
              onClick={() => {
                setInstructionsDraft('');
                setCustomInstructions('');
              }}
              className="text-[11px] font-sans text-muted hover:text-oxide flex items-center gap-1 transition-colors cursor-pointer"
            >
              <RotateCcw size={12} /> Clear
            </button>
          )}
        </div>
        
        <p className="text-xs text-muted font-sans mb-3">
          Direct the AI assistant on coding preferences, architectural patterns, styling conventions, or response demeanor across all chats.
        </p>

        <form onSubmit={(e) => {
          e.preventDefault();
          setCustomInstructions(instructionsDraft);
          setInstructionsSaved(true);
          setTimeout(() => setInstructionsSaved(false), 2000);
        }} className="space-y-3">
          <div>
            <textarea
              rows={4}
              value={instructionsDraft}
              onChange={(e) => setInstructionsDraft(e.target.value)}
              placeholder="e.g. Always use TypeScript strict mode. Prefer Tailwind CSS utility classes. Keep components modular and concise. Avoid unnecessary conversational fluff."
              className="w-full bg-bg border border-border rounded px-3 py-2.5 text-text font-sans text-xs focus:border-accent focus:outline-none placeholder-neutral-500 leading-relaxed resize-y min-h-[90px]"
            />
          </div>

          <button 
            type="submit"
            className="w-full py-2.5 bg-accent text-surface font-sans font-bold rounded flex items-center justify-center gap-2 hover:bg-accent/90 transition-colors cursor-pointer"
          >
            {instructionsSaved ? <CheckCircle2 size={16} /> : <Save size={16} />}
            {instructionsSaved ? 'Instructions Saved' : 'Save Custom Instructions'}
          </button>
        </form>
      </div>
    </div>
  );
}
