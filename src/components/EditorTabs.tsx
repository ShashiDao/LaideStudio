import React, { useRef, useEffect } from 'react';
import { X } from 'lucide-react';
import type { FileItem } from '../db';
import { getFileIcon } from './FileTree';

interface EditorTabsProps {
  files: FileItem[];
  openFileIds: string[];
  activeFileId: string | null;
  onSelectFile: (fileId: string) => void;
  onCloseFile: (fileId: string, e: React.MouseEvent) => void;
}

export function EditorTabs({
  files,
  openFileIds,
  activeFileId,
  onSelectFile,
  onCloseFile,
}: EditorTabsProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll the active tab into view
  useEffect(() => {
    if (activeFileId && scrollRef.current) {
      const activeEl = scrollRef.current.querySelector<HTMLElement>(`[data-tab-id="${activeFileId}"]`);
      if (activeEl) {
        activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
      }
    }
  }, [activeFileId]);

  if (openFileIds.length === 0) return null;

  return (
    <div 
      ref={scrollRef}
      role="tablist"
      aria-label="Open editor tabs"
      className="h-[34px] bg-surface border-b border-border flex items-center overflow-x-auto scrollbar-none shrink-0 select-none px-1 gap-1"
    >
      {openFileIds.map(id => {
        const file = files.find(f => f.id === id);
        if (!file) return null;
        const isActive = activeFileId === id;
        const fileName = file.path.split('/').pop() || file.path;

        return (
          <div
            key={id}
            data-tab-id={id}
            role="tab"
            aria-selected={isActive}
            aria-label={fileName}
            onClick={() => onSelectFile(id)}
            title={file.path}
            className={`group h-[28px] max-w-[180px] min-w-[100px] flex items-center justify-between gap-1.5 px-2.5 rounded text-xs font-mono border transition-all cursor-pointer ${
              isActive
                ? 'bg-surface-elevated text-text border-accent/40 font-medium shadow-xs'
                : 'bg-transparent text-muted hover:text-text hover:bg-surface-elevated/50 border-transparent'
            }`}
          >
            <div className="flex items-center gap-1.5 min-w-0 truncate">
              {getFileIcon(file.path, 'w-3.5 h-3.5 shrink-0')}
              <span className="truncate text-[11.5px]">{fileName}</span>
            </div>

            <button
              type="button"
              aria-label={`Close ${fileName}`}
              onClick={(e) => {
                e.stopPropagation();
                onCloseFile(id, e);
              }}
              className="w-4 h-4 rounded flex items-center justify-center text-muted hover:text-text hover:bg-border/60 transition-colors shrink-0 cursor-pointer"
            >
              <X size={11} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
