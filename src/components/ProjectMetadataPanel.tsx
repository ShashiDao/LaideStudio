import React, { useState, useMemo } from 'react';
import { 
  BarChart2, 
  PieChart as PieChartIcon, 
  Code2, 
  FileText, 
  HardDrive, 
  X, 
  TrendingUp, 
  Coins,
  Trash2,
  GitMerge,
  Info,
  Clock,
  Zap
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell, 
  Tooltip as RechartsTooltip, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis 
} from 'recharts';
import type { FileItem, Project } from '../db';
import { calculateProjectMetadata, formatBytes } from '../utils/projectStats';
import { useAppStore } from '../store';
import { 
  computeSessionUsageSummary, 
  formatUsdCost, 
  formatTokenCount
} from '../services/usage/tokenSpend';
import { EmptyState } from './EmptyState';

export interface ProjectMetadataPanelProps {
  project: Project;
  files: FileItem[];
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'codebase' | 'spend';
}

const MODEL_COLORS = [
  '#f59e0b', // amber
  '#3b82f6', // blue
  '#10b981', // emerald
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
  '#64748b'  // slate
];

// Both custom tooltips below render chart-data points whose exact shape
// varies per chart (language breakdown vs. token-spend history); the
// component reads fields defensively with fallbacks, so this local shape
// covers every field either tooltip actually accesses.
interface ChartTooltipDatum {
  color?: string;
  name?: string;
  label?: string;
  linesOfCode?: number;
  percentage?: number | string;
  filesCount?: number;
  bytes?: number;
  tokens?: number;
  totalTokens?: number;
  value?: number;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  recordsCount?: number;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: ChartTooltipDatum }>;
}

// Custom tooltip for Codebase language chart
function CustomLanguageTooltip({ active, payload }: ChartTooltipProps) {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-surface border border-border/80 px-2.5 py-1.5 rounded shadow-xl font-mono text-[11px] z-50">
        <div className="flex items-center gap-1.5 font-bold" style={{ color: data.color }}>
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: data.color }} />
          <span>{data.name}</span>
        </div>
        <div className="text-text/90 mt-1 flex flex-col gap-0.5 text-[10px]">
          <div>Lines of Code: <span className="font-semibold text-accent">{(data.linesOfCode ?? 0).toLocaleString()}</span> ({data.percentage}%)</div>
          <div>Files: <span className="font-semibold text-accent">{data.filesCount}</span></div>
          <div>Size: <span className="text-muted">{formatBytes(data.bytes ?? 0)}</span></div>
        </div>
      </div>
    );
  }
  return null;
}

// Custom tooltip for Token Spend charts
function CustomUsageTooltip({ active, payload }: ChartTooltipProps) {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-surface border border-border/80 px-2.5 py-1.5 rounded shadow-xl font-mono text-[11px] z-50">
        <div className="flex items-center gap-1.5 font-bold" style={{ color: data.color || '#f59e0b' }}>
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: data.color || '#f59e0b' }} />
          <span>{data.name || data.label || 'Run'}</span>
        </div>
        <div className="text-text/90 mt-1 flex flex-col gap-0.5 text-[10px]">
          <div>Total Tokens: <span className="font-semibold text-accent">{formatTokenCount(data.tokens ?? data.totalTokens ?? data.value ?? 0)}</span></div>
          {data.inputTokens !== undefined && (
            <div>Input / Prompt: <span className="text-text">{formatTokenCount(data.inputTokens)}</span></div>
          )}
          {data.outputTokens !== undefined && (
            <div>Output / Completion: <span className="text-text">{formatTokenCount(data.outputTokens)}</span></div>
          )}
          {data.costUsd !== undefined && (
            <div>Estimated Cost: <span className="font-bold text-accent">{formatUsdCost(data.costUsd)}</span></div>
          )}
          {data.recordsCount !== undefined && (
            <div>Calls Count: <span className="text-muted">{data.recordsCount}</span></div>
          )}
        </div>
      </div>
    );
  }
  return null;
}

export function ProjectMetadataPanel({
  project,
  files,
  isOpen,
  onClose,
  initialTab = 'codebase'
}: ProjectMetadataPanelProps) {
  const [activeTab, setActiveTab] = useState<'codebase' | 'spend'>(initialTab);
  
  // Codebase chart controls
  const [codebaseChartMode, setCodebaseChartMode] = useState<'donut' | 'bar'>('donut');
  const [codebaseMetric, setCodebaseMetric] = useState<'loc' | 'files'>('loc');

  // Token spend chart controls
  const [spendChartMode, setSpendChartMode] = useState<'by_model' | 'io' | 'history'>('by_model');
  const [showPricingReference, setShowPricingReference] = useState(false);
  const [confirmClearUsage, setConfirmClearUsage] = useState(false);

  const { sessionUsageRecords, clearSessionUsage } = useAppStore();

  const metadata = useMemo(() => {
    return calculateProjectMetadata(files);
  }, [files]);

  const usageSummary = useMemo(() => {
    return computeSessionUsageSummary(sessionUsageRecords);
  }, [sessionUsageRecords]);

  if (!isOpen) return null;

  // Codebase chart data
  const codebaseChartData = metadata.languages.map(l => ({
    name: l.language,
    value: codebaseMetric === 'loc' ? l.linesOfCode : l.filesCount,
    linesOfCode: l.linesOfCode,
    filesCount: l.filesCount,
    percentage: l.percentage,
    bytes: l.bytes,
    color: l.color
  }));

  // Token spend by model chart data
  const modelEntries = Object.values(usageSummary.byModel);
  const spendModelChartData = modelEntries.map((m, idx) => ({
    name: m.model,
    provider: m.provider,
    value: m.tokens,
    tokens: m.tokens,
    inputTokens: m.inputTokens,
    outputTokens: m.outputTokens,
    costUsd: m.costUsd,
    recordsCount: m.recordsCount,
    color: MODEL_COLORS[idx % MODEL_COLORS.length]
  }));

  // Token spend input vs output chart data
  const spendIoChartData = [
    {
      name: 'Input / Prompt Tokens',
      value: usageSummary.totalInputTokens,
      tokens: usageSummary.totalInputTokens,
      color: '#3b82f6'
    },
    {
      name: 'Output / Completion Tokens',
      value: usageSummary.totalOutputTokens,
      tokens: usageSummary.totalOutputTokens,
      color: '#10b981'
    }
  ];

  // Turn-by-turn history chart data
  const spendHistoryChartData = usageSummary.records.map((r, idx) => ({
    name: `Turn #${idx + 1}`,
    label: `${r.category === 'ensemble_candidate_a' ? 'Candidate A' : r.category === 'ensemble_candidate_b' ? 'Candidate B' : r.category === 'ensemble_arbiter' ? 'Arbiter' : 'Chat'} (${r.model})`,
    value: r.totalTokens,
    totalTokens: r.totalTokens,
    inputTokens: r.inputTokens,
    outputTokens: r.outputTokens,
    costUsd: r.estimatedCostUsd,
    color: r.category.startsWith('ensemble') ? '#8b5cf6' : '#f59e0b'
  }));

  // Check if ensemble runs occurred
  const ensembleCount = usageSummary.records.filter(r => r.category.startsWith('ensemble')).length;

  return (
    <div 
      className="border-b border-border/80 bg-surface/95 backdrop-blur-md px-3 py-3 font-mono text-xs animate-in slide-in-from-top-2 duration-200 shadow-md relative z-20"
      role="region"
      aria-label="Active project detailed metadata and analytics"
    >
      {/* Header with Navigation Tabs */}
      <div className="flex items-center justify-between pb-2 mb-3 border-b border-border/60">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex items-center bg-surface-elevated border border-border rounded p-0.5 text-[11px]">
            <button
              type="button"
              onClick={() => setActiveTab('codebase')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded cursor-pointer transition-colors ${
                activeTab === 'codebase'
                  ? 'bg-accent text-accent-text-on font-bold shadow-xs'
                  : 'text-muted hover:text-text'
              }`}
            >
              <Code2 size={13} />
              <span>Codebase (LOC)</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('spend')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded cursor-pointer transition-colors ${
                activeTab === 'spend'
                  ? 'bg-accent text-accent-text-on font-bold shadow-xs'
                  : 'text-muted hover:text-text'
              }`}
            >
              <Coins size={13} />
              <span>API Cost & Spend</span>
              {usageSummary.totalCostUsd > 0 && (
                <span className={`text-[9px] px-1 py-0.2 rounded font-bold ${
                  activeTab === 'spend' ? 'bg-black/20 text-accent-text-on' : 'bg-accent/15 text-accent'
                }`}>
                  {formatUsdCost(usageSummary.totalCostUsd)}
                </span>
              )}
            </button>
          </div>

          <span className="text-[10px] text-muted hidden md:inline truncate">
            {activeTab === 'codebase' ? `${project.name} statistics` : 'Session LLM token analytics'}
          </span>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="p-1 text-muted hover:text-accent rounded hover:bg-surface-elevated transition-colors cursor-pointer"
          title="Close Analytics"
          aria-label="Close analytics"
        >
          <X size={14} />
        </button>
      </div>

      {/* VIEW 1: CODEBASE (LOC & ASSETS) */}
      {activeTab === 'codebase' && (
        <>
          {/* KPI Stats Cards */}
          <div className="grid grid-cols-2 xs:grid-cols-4 gap-2 mb-3">
            <div className="bg-surface-elevated/60 border border-border rounded p-2 flex flex-col justify-between">
              <div className="flex items-center justify-between text-muted text-[10px]">
                <span>Total LOC</span>
                <Code2 size={12} className="text-accent" />
              </div>
              <div className="text-sm font-bold text-accent mt-1">
                {metadata.totalLines.toLocaleString()}
              </div>
              <div className="text-[9px] text-muted/80">lines of code</div>
            </div>

            <div className="bg-surface-elevated/60 border border-border rounded p-2 flex flex-col justify-between">
              <div className="flex items-center justify-between text-muted text-[10px]">
                <span>Files</span>
                <FileText size={12} className="text-accent" />
              </div>
              <div className="text-sm font-bold text-text mt-1">
                {metadata.totalFiles.toLocaleString()}
              </div>
              <div className="text-[9px] text-muted/80">total assets</div>
            </div>

            <div className="bg-surface-elevated/60 border border-border rounded p-2 flex flex-col justify-between">
              <div className="flex items-center justify-between text-muted text-[10px]">
                <span>Code Size</span>
                <HardDrive size={12} className="text-accent" />
              </div>
              <div className="text-sm font-bold text-text mt-1">
                {formatBytes(metadata.totalBytes)}
              </div>
              <div className="text-[9px] text-muted/80">uncompressed</div>
            </div>

            <div className="bg-surface-elevated/60 border border-border rounded p-2 flex flex-col justify-between">
              <div className="flex items-center justify-between text-muted text-[10px]">
                <span>Primary</span>
                <TrendingUp size={12} className="text-accent" />
              </div>
              <div className="text-xs font-bold text-accent truncate mt-1">
                {metadata.dominantLanguage}
              </div>
              <div className="text-[9px] text-muted/80">dominant language</div>
            </div>
          </div>

          {metadata.languages.length > 0 ? (
            <div className="space-y-3">
              {/* Chart Controls */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <span className="text-[11px] font-semibold text-text flex items-center gap-1.5">
                  <span>Language Distribution</span>
                </span>

                <div className="flex items-center gap-2">
                  {/* Metric Toggle */}
                  <div className="flex items-center bg-surface-elevated border border-border rounded p-0.5 text-[10px]">
                    <button
                      type="button"
                      onClick={() => setCodebaseMetric('loc')}
                      className={`px-1.5 py-0.5 rounded cursor-pointer transition-colors ${
                        codebaseMetric === 'loc' ? 'bg-accent text-accent-text-on font-bold' : 'text-muted hover:text-text'
                      }`}
                    >
                      LOC
                    </button>
                    <button
                      type="button"
                      onClick={() => setCodebaseMetric('files')}
                      className={`px-1.5 py-0.5 rounded cursor-pointer transition-colors ${
                        codebaseMetric === 'files' ? 'bg-accent text-accent-text-on font-bold' : 'text-muted hover:text-text'
                      }`}
                    >
                      Files
                    </button>
                  </div>

                  {/* Chart Type Toggle */}
                  <div className="flex items-center bg-surface-elevated border border-border rounded p-0.5 text-[10px]">
                    <button
                      type="button"
                      onClick={() => setCodebaseChartMode('donut')}
                      className={`p-1 rounded cursor-pointer transition-colors ${
                        codebaseChartMode === 'donut' ? 'bg-accent text-accent-text-on' : 'text-muted hover:text-text'
                      }`}
                      title="Donut Chart"
                      aria-label="Donut Chart"
                    >
                      <PieChartIcon size={12} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setCodebaseChartMode('bar')}
                      className={`p-1 rounded cursor-pointer transition-colors ${
                        codebaseChartMode === 'bar' ? 'bg-accent text-accent-text-on' : 'text-muted hover:text-text'
                      }`}
                      title="Bar Chart"
                      aria-label="Bar Chart"
                    >
                      <BarChart2 size={12} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Recharts Visualization */}
              <div className="h-44 w-full bg-surface-elevated/40 border border-border rounded-lg p-2 flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  {codebaseChartMode === 'donut' ? (
                    <PieChart>
                      <Pie
                        data={codebaseChartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={36}
                        outerRadius={58}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {codebaseChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} stroke="rgba(0,0,0,0.3)" />
                        ))}
                      </Pie>
                      <RechartsTooltip content={<CustomLanguageTooltip />} />
                    </PieChart>
                  ) : (
                    <BarChart data={codebaseChartData} layout="vertical" margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                      <XAxis type="number" hide />
                      <YAxis 
                        dataKey="name" 
                        type="category" 
                        width={80} 
                        tick={{ fill: 'currentColor', fontSize: 10 }} 
                        axisLine={false}
                        tickLine={false}
                      />
                      <RechartsTooltip content={<CustomLanguageTooltip />} />
                      <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                        {codebaseChartData.map((entry, index) => (
                          <Cell key={`bar-${index}`} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  )}
                </ResponsiveContainer>
              </div>

              {/* Detailed Language List / Breakdown */}
              <div className="max-h-36 overflow-y-auto divide-y divide-border/40 border border-border/60 rounded bg-surface-elevated/20 scrollbar-thin">
                {metadata.languages.map(lang => (
                  <div key={lang.language} className="px-2 py-1.5 flex items-center justify-between text-[11px] hover:bg-surface-elevated/40 transition-colors">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: lang.color }} />
                      <span className="font-medium text-text truncate">{lang.language}</span>
                      <span className="text-[9px] text-muted shrink-0">({lang.filesCount} {lang.filesCount === 1 ? 'file' : 'files'})</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-accent font-bold">{lang.linesOfCode.toLocaleString()} LOC</span>
                      <span className="text-muted text-[10px] w-10 text-right">{lang.percentage}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="py-4 text-center text-muted text-[11px]">
              No code files detected in this project yet.
            </div>
          )}
        </>
      )}

      {/* VIEW 2: API SPEND & TOKEN ANALYTICS */}
      {activeTab === 'spend' && (
        <div className="space-y-3">
          {/* KPI Summary Cards */}
          <div className="grid grid-cols-2 xs:grid-cols-4 gap-2">
            <div className="bg-surface-elevated/60 border border-border rounded p-2 flex flex-col justify-between">
              <div className="flex items-center justify-between text-muted text-[10px]">
                <span>Estimated Spend</span>
                <Coins size={12} className="text-accent" />
              </div>
              <div className="text-sm font-bold text-accent mt-1">
                {formatUsdCost(usageSummary.totalCostUsd)}
              </div>
              <div className="text-[9px] text-muted/80">total session cost</div>
            </div>

            <div className="bg-surface-elevated/60 border border-border rounded p-2 flex flex-col justify-between">
              <div className="flex items-center justify-between text-muted text-[10px]">
                <span>Tokens Consumed</span>
                <Zap size={12} className="text-accent" />
              </div>
              <div className="text-sm font-bold text-text mt-1">
                {formatTokenCount(usageSummary.totalTokens)}
              </div>
              <div className="text-[9px] text-muted/80">
                {formatTokenCount(usageSummary.totalInputTokens)} in • {formatTokenCount(usageSummary.totalOutputTokens)} out
              </div>
            </div>

            <div className="bg-surface-elevated/60 border border-border rounded p-2 flex flex-col justify-between">
              <div className="flex items-center justify-between text-muted text-[10px]">
                <span>Recorded Runs</span>
                <Clock size={12} className="text-accent" />
              </div>
              <div className="text-sm font-bold text-text mt-1">
                {usageSummary.recordsCount}
              </div>
              <div className="text-[9px] text-muted/80">
                {usageSummary.recordsCount > 0 
                  ? `avg ${formatUsdCost(usageSummary.totalCostUsd / usageSummary.recordsCount)}/run` 
                  : '0 calls'}
              </div>
            </div>

            <div className="bg-surface-elevated/60 border border-border rounded p-2 flex flex-col justify-between">
              <div className="flex items-center justify-between text-muted text-[10px]">
                <span>Ensemble Multiplier</span>
                <GitMerge size={12} className="text-accent" />
              </div>
              <div className="text-xs font-bold text-accent truncate mt-1">
                {ensembleCount > 0 ? `${ensembleCount} Dual Runs` : 'Single Model'}
              </div>
              <div className="text-[9px] text-muted/80">
                {ensembleCount > 0 ? 'parallel dual billing' : '1x standard rate'}
              </div>
            </div>
          </div>

          {usageSummary.recordsCount > 0 ? (
            <>
              {/* Chart Controls & Pricing Reference Toggle */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex items-center gap-1.5 bg-surface-elevated border border-border rounded p-0.5 text-[10px]">
                  <button
                    type="button"
                    onClick={() => setSpendChartMode('by_model')}
                    className={`px-2 py-0.5 rounded cursor-pointer transition-colors ${
                      spendChartMode === 'by_model' ? 'bg-accent text-accent-text-on font-bold' : 'text-muted hover:text-text'
                    }`}
                  >
                    By Model
                  </button>
                  <button
                    type="button"
                    onClick={() => setSpendChartMode('io')}
                    className={`px-2 py-0.5 rounded cursor-pointer transition-colors ${
                      spendChartMode === 'io' ? 'bg-accent text-accent-text-on font-bold' : 'text-muted hover:text-text'
                    }`}
                  >
                    Input vs Output
                  </button>
                  <button
                    type="button"
                    onClick={() => setSpendChartMode('history')}
                    className={`px-2 py-0.5 rounded cursor-pointer transition-colors ${
                      spendChartMode === 'history' ? 'bg-accent text-accent-text-on font-bold' : 'text-muted hover:text-text'
                    }`}
                  >
                    Turn History
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowPricingReference(!showPricingReference)}
                    className="px-2 py-0.5 rounded text-[10px] bg-surface-elevated hover:bg-surface border border-border text-muted hover:text-accent flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <Info size={11} />
                    <span>Rate Card</span>
                  </button>

                  {confirmClearUsage ? (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          clearSessionUsage();
                          setConfirmClearUsage(false);
                        }}
                        className="px-2 py-0.5 bg-oxide text-white rounded text-[10px] font-bold cursor-pointer transition-colors"
                      >
                        Confirm Reset
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmClearUsage(false)}
                        className="px-1.5 py-0.5 bg-surface border border-border text-muted rounded text-[10px] cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmClearUsage(true)}
                      className="p-1 rounded text-muted hover:text-oxide hover:bg-surface-elevated transition-colors cursor-pointer"
                      title="Clear session token usage history"
                      aria-label="Clear session usage history"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              </div>

              {/* Pricing Rate Card Reference (Collapsible) */}
              {showPricingReference && (
                <div className="bg-surface-elevated/70 border border-border/80 rounded-lg p-2.5 text-[10px] space-y-1.5 animate-in fade-in duration-150">
                  <div className="font-bold text-accent flex items-center gap-1">
                    <Info size={12} />
                    <span>Model Pricing Rates (per 1,000,000 Tokens)</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-1.5 text-muted">
                    <div className="bg-bg/60 p-1.5 rounded border border-border/60">
                      <div className="font-semibold text-text">Claude 3.7 / 3.5 Sonnet</div>
                      <div>Input: $3.00 • Output: $15.00</div>
                    </div>
                    <div className="bg-bg/60 p-1.5 rounded border border-border/60">
                      <div className="font-semibold text-text">Claude 3.5 Haiku</div>
                      <div>Input: $0.80 • Output: $4.00</div>
                    </div>
                    <div className="bg-bg/60 p-1.5 rounded border border-border/60">
                      <div className="font-semibold text-text">GPT-4o</div>
                      <div>Input: $2.50 • Output: $10.00</div>
                    </div>
                    <div className="bg-bg/60 p-1.5 rounded border border-border/60">
                      <div className="font-semibold text-text">GPT-4o-mini</div>
                      <div>Input: $0.15 • Output: $0.60</div>
                    </div>
                    <div className="bg-bg/60 p-1.5 rounded border border-border/60">
                      <div className="font-semibold text-text">Gemini 2.0 / 1.5 Flash</div>
                      <div>Input: $0.10 • Output: $0.40</div>
                    </div>
                    <div className="bg-bg/60 p-1.5 rounded border border-border/60">
                      <div className="font-semibold text-text">Local (Ollama / LMStudio)</div>
                      <div className="text-moss font-medium">Free ($0.00 / 1M)</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Visualization Container */}
              <div className="h-44 w-full bg-surface-elevated/40 border border-border rounded-lg p-2 flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  {spendChartMode === 'by_model' ? (
                    <PieChart>
                      <Pie
                        data={spendModelChartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={36}
                        outerRadius={58}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {spendModelChartData.map((entry, index) => (
                          <Cell key={`cell-model-${index}`} fill={entry.color} stroke="rgba(0,0,0,0.3)" />
                        ))}
                      </Pie>
                      <RechartsTooltip content={<CustomUsageTooltip />} />
                    </PieChart>
                  ) : spendChartMode === 'io' ? (
                    <PieChart>
                      <Pie
                        data={spendIoChartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={36}
                        outerRadius={58}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {spendIoChartData.map((entry, index) => (
                          <Cell key={`cell-io-${index}`} fill={entry.color} stroke="rgba(0,0,0,0.3)" />
                        ))}
                      </Pie>
                      <RechartsTooltip content={<CustomUsageTooltip />} />
                    </PieChart>
                  ) : (
                    <BarChart data={spendHistoryChartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                      <XAxis dataKey="name" tick={{ fill: 'currentColor', fontSize: 9 }} />
                      <YAxis tick={{ fill: 'currentColor', fontSize: 9 }} />
                      <RechartsTooltip content={<CustomUsageTooltip />} />
                      <Bar dataKey="inputTokens" fill="#3b82f6" stackId="tokens" name="Input" />
                      <Bar dataKey="outputTokens" fill="#10b981" stackId="tokens" name="Output" />
                    </BarChart>
                  )}
                </ResponsiveContainer>
              </div>

              {/* Turn-by-Turn Usage Breakdown Table */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px] text-muted font-bold px-1">
                  <span>Recent Executions ({usageSummary.records.length})</span>
                  <span>Tokens & Estimated Cost</span>
                </div>
                <div className="max-h-40 overflow-y-auto divide-y divide-border/40 border border-border/60 rounded bg-surface-elevated/20 scrollbar-thin">
                  {usageSummary.records.slice().reverse().map(record => (
                    <div key={record.id} className="px-2 py-1.5 flex items-center justify-between text-[11px] hover:bg-surface-elevated/40 transition-colors">
                      <div className="flex items-center gap-2 min-w-0">
                        {record.category === 'ensemble_candidate_a' ? (
                          <span className="px-1.5 py-0.2 rounded bg-purple-500/15 border border-purple-500/30 text-purple-400 text-[9px] font-bold shrink-0">
                            Ensemble A
                          </span>
                        ) : record.category === 'ensemble_candidate_b' ? (
                          <span className="px-1.5 py-0.2 rounded bg-indigo-500/15 border border-indigo-500/30 text-indigo-400 text-[9px] font-bold shrink-0">
                            Ensemble B
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.2 rounded bg-accent/15 border border-accent/30 text-accent text-[9px] font-bold shrink-0">
                            Chat
                          </span>
                        )}

                        <span className="font-semibold text-text truncate max-w-[120px] sm:max-w-[200px]" title={record.model}>
                          {record.model}
                        </span>

                        {record.promptPreview && (
                          <span className="text-[9px] text-muted truncate hidden md:inline max-w-[150px]">
                            "{record.promptPreview}"
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-muted text-[10px]">
                          {formatTokenCount(record.inputTokens)} in / {formatTokenCount(record.outputTokens)} out
                        </span>
                        <span className="text-accent font-bold w-14 text-right">
                          {formatUsdCost(record.estimatedCostUsd)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <EmptyState
              variant="card"
              icon={<Coins size={20} />}
              title="No API Usage Recorded This Session"
              description="As you chat with coding models or run dual-model ensemble evaluations, token counts and estimated costs will automatically track and chart here."
            />
          )}
        </div>
      )}
    </div>
  );
}
