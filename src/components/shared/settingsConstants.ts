import React from 'react';
import { Palette, Bot, Globe, ShieldCheck, Activity } from 'lucide-react';

export function formatTokens(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 10000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toString();
}

export const PROVIDERS = [
  { id: 'anthropic', label: 'Anthropic' },
  { id: 'openai', label: 'OpenAI' },
  { id: 'google', label: 'Google Gemini' },
  { id: 'openrouter', label: 'OpenRouter' },
  { id: 'openai-compatible', label: 'OpenAI Compatible (Local/Custom)' },
  { id: 'webllm', label: 'Offline (WebGPU / WebLLM)' },
] as const;

export const API_KEY_HINTS: Record<string, string> = {
  'anthropic': 'sk-ant-...',
  'openai': 'sk-...',
  'google': 'AIza...',
  'openrouter': 'sk-or-v1-...',
  'openai-compatible': 'sk-...',
  'webllm': 'Not required (100% in-browser offline model)',
};

export const DEFAULT_MODELS: Record<string, string> = {
  'anthropic': 'claude-3-7-sonnet-20250219',
  'openai': 'gpt-4o',
  'google': 'gemini-1.5-pro',
  'openrouter': 'anthropic/claude-3.5-sonnet',
  'openai-compatible': '',
  'webllm': 'Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC'
};

export type SettingsCategoryId = 'appearance' | 'ai-providers' | 'integrations' | 'security-vault' | 'advanced';

export interface SettingsCategoryDef {
  id: SettingsCategoryId;
  label: string;
  shortLabel: string;
  description: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

export const SETTINGS_CATEGORIES: SettingsCategoryDef[] = [
  {
    id: 'appearance',
    label: 'Appearance',
    shortLabel: 'Appearance',
    description: 'Themes & Contrast',
    icon: Palette
  },
  {
    id: 'ai-providers',
    label: 'AI & Providers',
    shortLabel: 'AI & Providers',
    description: 'LLM Profiles & Ensembles',
    icon: Bot
  },
  {
    id: 'integrations',
    label: 'Integrations',
    shortLabel: 'Integrations',
    description: 'GitHub, Deploys & MCP',
    icon: Globe
  },
  {
    id: 'security-vault',
    label: 'Security & Vault',
    shortLabel: 'Security',
    description: 'Vault Lock & Backups',
    icon: ShieldCheck
  },
  {
    id: 'advanced',
    label: 'Advanced',
    shortLabel: 'Advanced',
    description: 'Diagnostics, Cache & Keys',
    icon: Activity
  }
];

export interface ShortcutItem {
  label: string;
  keyCombo: string;
}

export const KEYBOARD_SHORTCUTS_LIST: ShortcutItem[] = [
  { label: 'Toggle Files tab', keyCombo: 'Ctrl+B' },
  { label: 'Toggle Terminal', keyCombo: 'Ctrl+`' },
  { label: 'Quick Open & Search', keyCombo: 'Ctrl+P' },
  { label: 'Find in File', keyCombo: 'Ctrl+F' },
  { label: 'Open Preview', keyCombo: 'Ctrl+Shift+P' },
  { label: 'Lock Vault', keyCombo: 'Ctrl+Shift+L' }
];

