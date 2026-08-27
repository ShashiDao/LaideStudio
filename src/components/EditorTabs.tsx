import React, { useRef, useEffect, useState } from 'react';
import { X, GripVertical } from 'lucide-react';
import type { FileItem } from '../db';
import { getFileIcon } from './FileTree';

interface EditorTabsProps {
  files: FileItem[];
  openFileIds: string[];
  activeFileId: string | null;
  onSelectFile: (fileId: string) => void;
  onCloseFile: (fileId: string, e: React.MouseEvent) => void;
  onReorderTabs?: (newOpenFileIds: string[]) => void;
}

export function EditorTabs({
  files,
  openFileIds,
  activeFileId,
  onSelectFile,
  onCloseFile,
  onReorderTabs,
}: EditorTabsProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  // Auto-scroll the active tab into view
  useEffect(() => {
    if (activeFileId && scrollRef.current && !draggedId) {
      const activeEl = scrollRef.current.querySelector<HTMLElement>(`[data-tab-id="${activeFileId}"]`);
      if (activeEl) {
        activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
      }
    }
  }, [activeFileId, draggedId]);

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, id: string) => {
    setDraggedId(id);
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>, id: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverId !== id) {
      setDragOverId(id);
    }
  };

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>, id: string) => {
    e.preventDefault();
    if (dragOverId !== id) {
      setDragOverId(id);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>, targetId: string) => {
    e.preventDefault();
    if (!draggedId || draggedId === targetId) {
      setDraggedId(null);
      setDragOverId(null);
      return;
    }

    const fromIndex = openFileIds.indexOf(draggedId);
    const toIndex = openFileIds.indexOf(targetId);

    if (fromIndex !== -1 && toIndex !== -1) {
      const nextOpenFileIds = [...openFileIds];
      const [movedId] = nextOpenFileIds.splice(fromIndex, 1);
      nextOpenFileIds.splice(toIndex, 0, movedId);

      onReorderTabs?.(nextOpenFileIds);
    }

    setDraggedId(null);
    setDragOverId(null);
  };

  const handleDragEnd = () => {
    setDraggedId(null);
    setDragOverId(null);
  };

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
        const isDragging = draggedId === id;
        const isDragOver = dragOverId === id && draggedId !== id;
        const fileName = file.path.split('/').pop() || file.path;

        return (
          <div
            key={id}
            data-tab-id={id}
            role="tab"
            draggable
            aria-selected={isActive}
            aria-grabbed={isDragging}
            aria-label={fileName}
            onClick={() => onSelectFile(id)}
            onDragStart={(e) => handleDragStart(e, id)}
            onDragOver={(e) => handleDragOver(e, id)}
            onDragEnter={(e) => handleDragEnter(e, id)}
            onDrop={(e) => handleDrop(e, id)}
            onDragEnd={handleDragEnd}
            title={`${file.path} (Drag to reorder)`}
            className={`group h-[28px] max-w-[180px] min-w-[100px] flex items-center justify-between gap-1.5 px-2 rounded text-xs font-mono border transition-all cursor-grab active:cursor-grabbing ${
              isDragging
                ? 'opacity-40 scale-95 border-dashed border-accent'
                : isDragOver
                ? 'bg-surface-elevated border-accent ring-1 ring-accent/50 shadow-xs'
                : isActive
                ? 'bg-surface-elevated text-text border-accent/40 font-medium shadow-xs'
                : 'bg-transparent text-muted hover:text-text hover:bg-surface-elevated/50 border-transparent'
            }`}
          >
            <div className="flex items-center gap-1.5 min-w-0 truncate">
              <GripVertical size={11} className="text-muted/40 group-hover:text-muted/80 shrink-0 hidden sm:block -ml-0.5" />
              {getFileIcon(file.path, 'w-3.5 h-3.5 shrink-0')}
              <span className="truncate text-[11.5px]">{fileName}</span>
            </div>

            <button
              type="button"
              draggable={false}
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
