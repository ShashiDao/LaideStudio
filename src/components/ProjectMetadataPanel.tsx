import React, { useState, useMemo } from 'react';
import { 
  BarChart2, 
  PieChart as PieChartIcon, 
  Code2, 
  FileText, 
  HardDrive, 
  Sparkles, 
  X, 
  ChevronRight,
  TrendingUp,
  Layers
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

export interface ProjectMetadataPanelProps {
  project: Project;
  files: FileItem[];
  isOpen: boolean;
  onClose: () => void;
}

export function ProjectMetadataPanel({
  project,
  files,
  isOpen,
  onClose
}: ProjectMetadataPanelProps) {
  const [chartMode, setChartMode] = useState<'donut' | 'bar'>('donut');
  const [metric, setMetric] = useState<'loc' | 'files'>('loc');

  const metadata = useMemo(() => {
    return calculateProjectMetadata(files);
  }, [files]);

  if (!isOpen) return null;

  const chartData = metadata.languages.map(l => ({
    name: l.language,
    value: metric === 'loc' ? l.linesOfCode : l.filesCount,
    linesOfCode: l.linesOfCode,
    filesCount: l.filesCount,
    percentage: l.percentage,
    bytes: l.bytes,
    color: l.color
  }));

  // Custom tooltip for recharts
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-surface border border-border/80 px-2.5 py-1.5 rounded shadow-xl font-mono text-[11px] z-50">
          <div className="flex items-center gap-1.5 font-bold" style={{ color: data.color }}>
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: data.color }} />
            <span>{data.name}</span>
          </div>
          <div className="text-text/90 mt-1 flex flex-col gap-0.5 text-[10px]">
            <div>Lines of Code: <span className="font-semibold text-accent">{data.linesOfCode.toLocaleString()}</span> ({data.percentage}%)</div>
            <div>Files: <span className="font-semibold text-accent">{data.filesCount}</span></div>
            <div>Size: <span className="text-muted">{formatBytes(data.bytes)}</span></div>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div 
      className="border-b border-border/80 bg-surface/95 backdrop-blur-md px-3 py-3 font-mono text-xs animate-in slide-in-from-top-2 duration-200 shadow-md relative z-20"
      role="region"
      aria-label="Active project detailed metadata and language analytics"
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-2 mb-3 border-b border-border/60">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1 rounded bg-accent/15 text-accent border border-accent/30">
            <Layers size={14} />
          </div>
          <div className="min-w-0">
            <h3 className="text-xs font-bold text-accent truncate">
              {project.name} Analytics
            </h3>
            <p className="text-[10px] text-muted truncate">
              Active Project Codebase Statistics
            </p>
          </div>
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
                  onClick={() => setMetric('loc')}
                  className={`px-1.5 py-0.5 rounded cursor-pointer transition-colors ${
                    metric === 'loc' ? 'bg-accent text-accent-text-on font-bold' : 'text-muted hover:text-text'
                  }`}
                >
                  LOC
                </button>
                <button
                  type="button"
                  onClick={() => setMetric('files')}
                  className={`px-1.5 py-0.5 rounded cursor-pointer transition-colors ${
                    metric === 'files' ? 'bg-accent text-accent-text-on font-bold' : 'text-muted hover:text-text'
                  }`}
                >
                  Files
                </button>
              </div>

              {/* Chart Type Toggle */}
              <div className="flex items-center bg-surface-elevated border border-border rounded p-0.5 text-[10px]">
                <button
                  type="button"
                  onClick={() => setChartMode('donut')}
                  className={`p-1 rounded cursor-pointer transition-colors ${
                    chartMode === 'donut' ? 'bg-accent text-accent-text-on' : 'text-muted hover:text-text'
                  }`}
                  title="Donut Chart"
                  aria-label="Donut Chart"
                >
                  <PieChartIcon size={12} />
                </button>
                <button
                  type="button"
                  onClick={() => setChartMode('bar')}
                  className={`p-1 rounded cursor-pointer transition-colors ${
                    chartMode === 'bar' ? 'bg-accent text-accent-text-on' : 'text-muted hover:text-text'
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
              {chartMode === 'donut' ? (
                <PieChart>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={36}
                    outerRadius={58}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} stroke="rgba(0,0,0,0.3)" />
                    ))}
                  </Pie>
                  <RechartsTooltip content={<CustomTooltip />} />
                </PieChart>
              ) : (
                <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                  <XAxis type="number" hide />
                  <YAxis 
                    dataKey="name" 
                    type="category" 
                    width={80} 
                    tick={{ fill: 'currentColor', fontSize: 10 }} 
                    axisLine={false}
                    tickLine={false}
                  />
                  <RechartsTooltip content={<CustomTooltip />} />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                    {chartData.map((entry, index) => (
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
    </div>
  );
}
