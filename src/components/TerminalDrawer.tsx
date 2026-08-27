import React from 'react';
import { 
  Terminal as TerminalIcon, 
  ChevronUp, 
  ChevronDown, 
  X,
  Maximize2,
  Minimize2
} from 'lucide-react';
import { TerminalPanel } from './TerminalPanel';
import type { FileItem } from '../db';

interface TerminalDrawerProps {
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  projectId?: string;
  files: FileItem[];
  onFilesChanged?: () => void;
  onOpenBisect?: (testName?: string) => void;
  height?: number;
  setHeight?: (h: number) => void;
}

export function TerminalDrawer({
  isOpen,
  onToggle,
  onClose,
  projectId,
  files,
  onFilesChanged,
  onOpenBisect,
  height = 240,
}: TerminalDrawerProps) {
  const [isExpanded, setIsExpanded] = React.useState(false);

  return (
    <div 
      role="region" 
      aria-label="Bottom Terminal Drawer"
      className="border-t border-border bg-bg flex flex-col shrink-0 overflow-hidden transition-all duration-150"
      style={{
        height: isOpen ? (isExpanded ? '65%' : `${height}px`) : '30px',
      }}
    >
      {/* Drawer Titlebar / Collapsed Strip */}
      <div 
        onClick={onToggle}
        className="h-[30px] bg-surface border-b border-border/60 px-3 flex items-center justify-between text-xs font-mono select-none cursor-pointer hover:bg-surface-elevated transition-colors shrink-0"
      >
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-accent font-bold text-[11px]">
            <TerminalIcon size={13} className="shrink-0" />
            <span>TERMINAL</span>
          </div>

          <span className="text-[10px] text-muted/80">
            {isOpen ? '(Click to collapse • Ctrl+`)' : '(Click to expand • Ctrl+`)'}
          </span>
        </div>

        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          {isOpen && (
            <button
              type="button"
              onClick={() => setIsExpanded(prev => !prev)}
              className="p-1 rounded text-muted hover:text-text hover:bg-surface-elevated transition-colors cursor-pointer"
              title={isExpanded ? 'Restore height' : 'Maximize terminal'}
              aria-label={isExpanded ? 'Restore height' : 'Maximize terminal'}
            >
              {isExpanded ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
            </button>
          )}

          <button
            type="button"
            onClick={onToggle}
            className="p-1 rounded text-muted hover:text-text hover:bg-surface-elevated transition-colors cursor-pointer"
            title={isOpen ? 'Collapse terminal' : 'Open terminal'}
            aria-label={isOpen ? 'Collapse terminal' : 'Open terminal'}
          >
            {isOpen ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>

          {isOpen && (
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded text-muted hover:text-oxide hover:bg-surface-elevated transition-colors cursor-pointer"
              title="Close terminal drawer"
              aria-label="Close terminal drawer"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Terminal Content Body */}
      {isOpen && (
        <div className="flex-1 overflow-hidden min-h-0">
          <TerminalPanel
            projectId={projectId}
            files={files}
            onFilesChanged={onFilesChanged}
            onOpenBisect={onOpenBisect}
          />
        </div>
      )}
    </div>
  );
}
