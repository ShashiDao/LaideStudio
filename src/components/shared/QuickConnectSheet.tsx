import React, { useState, useEffect } from 'react';
import { 
  Bot, 
  Key, 
  Sparkles, 
  X, 
  Check, 
  ChevronRight, 
  Eye,
  EyeOff,
  HardDrive
} from 'lucide-react';
import { db, type ConnectionProfile } from '../../db';
import { useAppStore } from '../../store';
import { getModelContextWindow } from '../../services/llm/modelDiscovery';

interface QuickConnectSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onProfileConnected?: (profileId: string) => void;
}

interface ProviderOption {
  id: string;
  label: string;
  badge?: string;
  defaultModel: string;
  models: string[];
  placeholder: string;
  defaultBaseUrl?: string;
  requiresKey: boolean;
  description: string;
}

const PROVIDER_OPTIONS: ProviderOption[] = [
  {
    id: 'google',
    label: 'Google Gemini',
    badge: 'Recommended',
    defaultModel: 'gemini-1.5-pro',
    models: ['gemini-1.5-pro', 'gemini-2.0-flash', 'gemini-1.5-flash'],
    placeholder: 'AIzaSy...',
    requiresKey: true,
    description: 'Fast, high-context agentic reasoning'
  },
  {
    id: 'anthropic',
    label: 'Anthropic Claude',
    defaultModel: 'claude-3-7-sonnet-20250219',
    models: ['claude-3-7-sonnet-20250219', 'claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022'],
    placeholder: 'sk-ant-...',
    requiresKey: true,
    description: 'State-of-the-art coding and tool execution'
  },
  {
    id: 'openai',
    label: 'OpenAI',
    defaultModel: 'gpt-4o',
    models: ['gpt-4o', 'gpt-4o-mini', 'o3-mini', 'o1'],
    placeholder: 'sk-...',
    requiresKey: true,
    description: 'General intelligence & function calling'
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    badge: 'Multi-Model',
    defaultModel: 'anthropic/claude-3.5-sonnet',
    models: ['anthropic/claude-3.5-sonnet', 'deepseek/deepseek-r1', 'meta-llama/llama-3.3-70b-instruct'],
    placeholder: 'sk-or-v1-...',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    requiresKey: true,
    description: 'Access hundreds of frontier models with one key'
  },
  {
    id: 'ollama',
    label: 'Ollama',
    badge: 'Free & Local',
    defaultModel: 'llama3.2',
    models: ['llama3.2', 'qwen2.5-coder', 'deepseek-r1', 'mistral'],
    placeholder: 'ollama (optional)',
    defaultBaseUrl: 'http://localhost:11434/v1',
    requiresKey: false,
    description: 'Run completely offline on your own GPU/CPU'
  },
  {
    id: 'openai-compatible',
    label: 'Custom / OpenAI API',
    defaultModel: 'custom-model',
    models: ['custom-model'],
    placeholder: 'sk-...',
    defaultBaseUrl: 'https://api.groq.com/openai/v1',
    requiresKey: false,
    description: 'Groq, Mistral, Together, vLLM, or LM Studio'
  }
];

export function QuickConnectSheet({ isOpen, onClose, onProfileConnected }: QuickConnectSheetProps) {
  const { 
    keys, 
    activeProfileId, 
    setActiveProfileId, 
    tokenUsage, 
    setTokenUsage, 
    setActiveTab 
  } = useAppStore();

  const [existingProfiles, setExistingProfiles] = useState<ConnectionProfile[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState<string>('google');
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [model, setModel] = useState('gemini-1.5-pro');
  const [baseUrl, setBaseUrl] = useState('');
  const [label, setLabel] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Load existing profiles if any exist
  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    db.connectionProfiles.toArray().then(profiles => {
      if (active) {
        setExistingProfiles(profiles);
      }
    });
    return () => {
      active = false;
    };
  }, [isOpen]);

  const activeProvider = PROVIDER_OPTIONS.find(p => p.id === selectedProviderId) || PROVIDER_OPTIONS[0];

  const handleSelectProvider = (opt: ProviderOption) => {
    setSelectedProviderId(opt.id);
    setModel(opt.defaultModel);
    setBaseUrl(opt.defaultBaseUrl || '');
    setLabel(`${opt.label} Quick`);
    setErrorMessage(null);
  };

  const handleSelectExistingProfile = (p: ConnectionProfile) => {
    setActiveProfileId(p.id);
    const targetMax = getModelContextWindow(p.provider, p.model);
    setTokenUsage({ ...tokenUsage, max: targetMax });
    onProfileConnected?.(p.id);
    onClose();
  };

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const providerKey = activeProvider.id === 'ollama' ? 'openai-compatible' : activeProvider.id;
    const finalKey = apiKey.trim() || (activeProvider.id === 'ollama' ? 'ollama' : '');

    if (activeProvider.requiresKey && !finalKey) {
      setErrorMessage(`Please enter your ${activeProvider.label} API key.`);
      return;
    }

    if (!model.trim()) {
      setErrorMessage('Please specify a model name.');
      return;
    }

    setIsSubmitting(true);

    try {
      let finalEncryptedKey = '';
      if (keys) {
        const { encryptData } = await import('../../services/security/crypto');
        finalEncryptedKey = await encryptData(keys.aesKey, finalKey || 'none');
      } else {
        // Fallback placeholder if vault is not yet generated
        finalEncryptedKey = btoa(finalKey || 'none');
      }

      const newId = crypto.randomUUID();
      const profileLabel = label.trim() || `${activeProvider.label} (${model})`;

      const newProfile: ConnectionProfile = {
        id: newId,
        label: profileLabel,
        provider: providerKey,
        encryptedApiKey: finalEncryptedKey,
        baseUrl: (providerKey === 'openai-compatible' || providerKey === 'openrouter') ? (baseUrl.trim() || activeProvider.defaultBaseUrl || '') : '',
        model: model.trim()
      };

      await db.connectionProfiles.put(newProfile);
      setActiveProfileId(newId);

      const targetMax = getModelContextWindow(newProfile.provider, newProfile.model);
      setTokenUsage({ ...tokenUsage, max: targetMax });

      onProfileConnected?.(newId);
      onClose();
    } catch (err: unknown) {
      console.error('Failed saving connection profile', err);
      const msg = err instanceof Error ? err.message : 'Failed to save connection profile.';
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="quick-connect-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div 
        className="w-full max-w-lg bg-surface border border-border rounded-t-2xl sm:rounded-xl shadow-2xl max-h-[88vh] sm:max-h-[90vh] flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile Swipe / Drag Handle */}
        <div className="w-10 h-1 rounded-full bg-border mx-auto my-2 shrink-0 sm:hidden" />

        {/* Header */}
        <div className="px-4 py-3 border-b border-border flex items-center justify-between shrink-0 bg-surface">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-accent/15 text-accent">
              <Bot size={18} />
            </div>
            <div>
              <h2 id="quick-connect-title" className="text-sm font-semibold text-text font-sans">
                Quick-Connect AI Profile
              </h2>
              <p className="text-[11px] text-muted font-sans">
                Select a provider or paste an API key to start chatting immediately.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Quick Connect Sheet"
            className="p-1.5 text-muted hover:text-text rounded-md hover:bg-surface-elevated transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Sheet Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Existing profiles quick-switch if any exist */}
          {existingProfiles.length > 0 && (
            <div className="p-3 bg-surface-elevated/60 border border-border/80 rounded-lg space-y-2">
              <div className="flex items-center justify-between text-[11px] font-medium text-text">
                <span>Existing Profiles ({existingProfiles.length})</span>
                <span className="text-[10px] text-muted">Tap to activate</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {existingProfiles.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleSelectExistingProfile(p)}
                    className={`px-2.5 py-1 rounded-md text-xs font-sans border transition-all flex items-center gap-1.5 cursor-pointer ${
                      activeProfileId === p.id 
                        ? 'bg-accent/20 border-accent text-accent font-semibold' 
                        : 'bg-surface border-border text-text hover:border-accent/40'
                    }`}
                  >
                    <Bot size={12} className="text-accent" />
                    <span className="truncate max-w-[140px]">{p.label || p.model}</span>
                    {activeProfileId === p.id && <Check size={12} className="text-accent" />}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Provider Grid */}
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-text font-sans">
              Choose Provider:
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {PROVIDER_OPTIONS.map((opt) => {
                const isSelected = selectedProviderId === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => handleSelectProvider(opt)}
                    className={`p-2.5 rounded-lg border text-left flex flex-col justify-between transition-all cursor-pointer relative ${
                      isSelected
                        ? 'bg-accent/10 border-accent ring-1 ring-accent text-text'
                        : 'bg-surface border-border hover:border-border-hover hover:bg-surface-elevated text-muted hover:text-text'
                    }`}
                  >
                    {opt.badge && (
                      <span className="absolute top-1.5 right-1.5 text-[9px] px-1 py-0.2 rounded bg-accent/20 text-accent font-semibold leading-tight">
                        {opt.badge}
                      </span>
                    )}
                    <div className="font-medium text-xs text-text font-sans flex items-center gap-1.5 mb-1">
                      {opt.id === 'ollama' ? <HardDrive size={13} className="text-moss" /> : <Bot size={13} className="text-accent" />}
                      <span>{opt.label}</span>
                    </div>
                    <div className="text-[10px] text-muted line-clamp-1 leading-tight font-sans">
                      {opt.description}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Configuration Form */}
          <form onSubmit={handleConnect} className="space-y-3 pt-1">
            {/* API Key Input (if required or optional) */}
            {activeProvider.requiresKey ? (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label htmlFor="quick-api-key" className="text-xs font-medium text-text font-sans flex items-center gap-1">
                    <Key size={12} className="text-accent" />
                    <span>{activeProvider.label} API Key</span>
                  </label>
                  <span className="text-[10px] text-muted font-mono">Encrypted locally</span>
                </div>
                <div className="relative">
                  <input
                    id="quick-api-key"
                    type={showApiKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={activeProvider.placeholder}
                    className="w-full bg-surface-elevated border border-border focus:border-accent rounded-lg px-3 py-2 text-xs font-mono text-text placeholder:text-muted/50 focus:outline-none pr-9"
                    autoFocus
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-text p-0.5 cursor-pointer"
                  >
                    {showApiKey ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>
            ) : activeProvider.id === 'ollama' ? (
              <div className="p-3 bg-moss/10 border border-moss/30 rounded-lg flex items-start gap-2.5 text-xs text-text font-sans">
                <HardDrive size={16} className="text-moss shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-moss">Zero-Config Local Ollama</span>
                  <p className="text-[11px] text-muted mt-0.5">
                    Connects to your local Ollama daemon at <code className="font-mono text-moss bg-moss/15 px-1 py-0.5 rounded">http://localhost:11434/v1</code>. No API key needed.
                  </p>
                </div>
              </div>
            ) : null}

            {/* Model Selector & Suggestions */}
            <div className="space-y-1">
              <label htmlFor="quick-model" className="text-xs font-medium text-text font-sans flex items-center justify-between">
                <span>Model Name:</span>
                <span className="text-[10px] text-muted">e.g. {activeProvider.defaultModel}</span>
              </label>
              <input
                id="quick-model"
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder={activeProvider.defaultModel}
                className="w-full bg-surface-elevated border border-border focus:border-accent rounded-lg px-3 py-2 text-xs font-mono text-text placeholder:text-muted/50 focus:outline-none"
              />
              {/* Quick model pills */}
              {activeProvider.models.length > 1 && (
                <div className="flex items-center gap-1.5 pt-1 overflow-x-auto no-scrollbar">
                  <span className="text-[10px] text-muted shrink-0">Suggestions:</span>
                  {activeProvider.models.map(m => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setModel(m)}
                      className={`px-2 py-0.5 rounded text-[10px] font-mono border transition-colors cursor-pointer shrink-0 ${
                        model === m
                          ? 'bg-accent/20 border-accent text-accent'
                          : 'bg-surface border-border text-muted hover:text-text'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Base URL Input for Ollama / Custom / OpenRouter */}
            {(activeProvider.id === 'ollama' || activeProvider.id === 'openai-compatible' || activeProvider.id === 'openrouter') && (
              <div className="space-y-1">
                <label htmlFor="quick-base-url" className="text-xs font-medium text-text font-sans flex items-center justify-between">
                  <span>Base Endpoint URL:</span>
                  <span className="text-[10px] text-muted font-mono">{activeProvider.defaultBaseUrl || 'Custom'}</span>
                </label>
                <input
                  id="quick-base-url"
                  type="text"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder={activeProvider.defaultBaseUrl || 'https://...'}
                  className="w-full bg-surface-elevated border border-border focus:border-accent rounded-lg px-3 py-2 text-xs font-mono text-text placeholder:text-muted/50 focus:outline-none"
                />
              </div>
            )}

            {/* Error Message */}
            {errorMessage && (
              <div className="p-2.5 rounded-lg bg-oxide/15 border border-oxide/40 text-oxide text-xs font-sans">
                {errorMessage}
              </div>
            )}

            {/* Action Buttons */}
            <div className="pt-2 flex items-center gap-2">
              <button
                type="submit"
                disabled={isSubmitting || (activeProvider.requiresKey && !apiKey.trim())}
                className="flex-1 py-2.5 px-4 rounded-lg bg-accent text-accent-text-on font-sans text-xs font-semibold hover:bg-accent/90 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm cursor-pointer"
              >
                <Sparkles size={14} />
                <span>{isSubmitting ? 'Connecting...' : `Connect ${activeProvider.label} & Start Chatting`}</span>
              </button>
            </div>
          </form>
        </div>

        {/* Footer with link to Full Settings */}
        <div className="px-4 py-2.5 bg-surface-elevated/40 border-t border-border flex items-center justify-between text-[11px] text-muted font-sans shrink-0">
          <span>Need custom headers, MCP, or multi-key vaults?</span>
          <button
            type="button"
            onClick={() => {
              onClose();
              setActiveTab('settings');
            }}
            className="text-accent hover:underline flex items-center gap-1 font-medium cursor-pointer"
          >
            <span>Full Settings</span>
            <ChevronRight size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}
