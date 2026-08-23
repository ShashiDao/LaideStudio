import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Folder, FolderOpen, FileText, Download, Trash, Edit2, FilePlus, MessageSquare, Search, X } from 'lucide-react';
import type { FileItem } from '../db';
import { useAppStore } from '../store';
import { renameFile, deleteFile, createFile, deleteFolder } from '../services/fs/vfs';
import { binaryExtensions } from '../services/fs/zipExport';

export type TreeNode = {
  name: string;
  path: string;
  type: 'file' | 'folder';
  file?: FileItem;
  children?: Record<string, TreeNode>;
};

export function buildFileTree(files: FileItem[]): TreeNode {
  const root: TreeNode = { name: 'root', path: '', type: 'folder', children: {} };

  for (const file of files) {
    const parts = file.path.split('/').filter(Boolean);
    let current = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isFile = i === parts.length - 1;
      const currentPath = current.path + '/' + part;
      
      if (!current.children) {
        current.children = {};
      }
      
      if (!current.children[part]) {
        current.children[part] = {
          name: part,
          path: currentPath,
          type: isFile ? 'file' : 'folder',
          ...(isFile ? { file } : { children: {} }),
        };
      }
      current = current.children[part];
    }
  }

  return root;
}

function countFilesInFolder(node: TreeNode): number {
  if (node.type === 'file') return 1;
  let count = 0;
  for (const child of Object.values(node.children || {})) {
    count += countFilesInFolder(child);
  }
  return count;
}

function formatFileSize(content: string): string {
  const bytes = new Blob([content]).size;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  const q = query.trim().toLowerCase();
  const lower = text.toLowerCase();
  const index = lower.indexOf(q);
  if (index === -1) return text;

  const before = text.slice(0, index);
  const match = text.slice(index, index + q.length);
  const after = text.slice(index + q.length);

  return (
    <>
      {before}
      <span className="bg-accent/25 text-accent font-semibold px-0.5 rounded-[2px]">{match}</span>
      {highlightMatch(after, query)}
    </>
  );
}

function FileNode({ node, level, onSelectFile, onContextMenu, isActive, isFlashing }: { 
  key?: string,
  node: TreeNode, 
  level: number, 
  onSelectFile: (file: FileItem) => void,
  onContextMenu: (e: React.MouseEvent | React.TouchEvent, file: FileItem) => void,
  isActive: boolean,
  isFlashing?: boolean
}) {
  const longPressTimer = useRef<any>(null);
  const longPressFired = useRef(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    longPressFired.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true;
      onContextMenu(e, node.file!);
    }, 500);
  };

  const clearTimer = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  };

  return (
    <div 
      className={`flex items-center gap-1.5 py-1 px-2 hover:bg-accent/10 cursor-pointer select-none text-muted transition-colors min-w-full w-fit ${
        isActive ? 'bg-accent/15 text-accent font-medium' : ''
      } ${isFlashing ? 'animate-accent-flash' : ''}`}
      style={{ paddingLeft: `${level * 12 + 8}px` }}
      onClick={() => {
        if (!longPressFired.current) {
          onSelectFile(node.file!);
        }
      }}
      onContextMenu={(e) => onContextMenu(e, node.file!)}
      onTouchStart={handleTouchStart}
      onTouchEnd={clearTimer}
      onTouchMove={clearTimer}
    >
      <FileText size={14} className={`shrink-0 ${isFlashing ? 'text-accent' : 'text-moss/80'}`} />
      <span className="font-mono text-[12px] truncate max-w-[240px] sm:max-w-none">{node.name}</span>
    </div>
  );
}

function FolderNode({ node, level, onSelectFile, onContextMenu, onFolderContextMenu, activeFileId, flashingPaths }: { 
  key?: string,
  node: TreeNode, 
  level: number, 
  onSelectFile: (file: FileItem) => void, 
  onContextMenu: (e: React.MouseEvent | React.TouchEvent, file: FileItem) => void,
  onFolderContextMenu: (e: React.MouseEvent | React.TouchEvent, node: TreeNode) => void,
  activeFileId: string | null,
  flashingPaths: string[]
}) {
  const [isOpen, setIsOpen] = useState(true);
  const longPressTimer = useRef<any>(null);
  const longPressFired = useRef(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    longPressFired.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true;
      onFolderContextMenu(e, node);
    }, 500);
  };

  const clearTimer = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  };
  
  const entries = (Object.values(node.children || {}) as TreeNode[]).sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div>
      <div 
        className="flex items-center gap-1.5 py-1 px-2 hover:bg-accent/10 cursor-pointer select-none text-muted min-w-full w-fit"
        style={{ paddingLeft: `${level * 12 + 8}px` }}
        onClick={() => {
          if (!longPressFired.current) {
            setIsOpen(!isOpen);
          }
        }}
        onContextMenu={(e) => onFolderContextMenu(e, node)}
        onTouchStart={handleTouchStart}
        onTouchEnd={clearTimer}
        onTouchMove={clearTimer}
      >
        {isOpen ? <FolderOpen size={14} className="text-accent/80 shrink-0" /> : <Folder size={14} className="text-accent/80 shrink-0" />}
        <span className="font-mono text-[12px] truncate max-w-[240px] sm:max-w-none">{node.name}</span>
      </div>
      {isOpen && (
        <div>
          {entries.map(child => child.type === 'folder' 
            ? <FolderNode key={child.path} node={child} level={level + 1} onSelectFile={onSelectFile} onContextMenu={onContextMenu} onFolderContextMenu={onFolderContextMenu} activeFileId={activeFileId} flashingPaths={flashingPaths} />
            : <FileNode 
                key={child.path} 
                node={child} 
                level={level + 1} 
                onSelectFile={onSelectFile} 
                onContextMenu={onContextMenu} 
                isActive={child.file?.id === activeFileId} 
                isFlashing={flashingPaths.includes(child.path) || (child.file ? flashingPaths.includes(child.file.path) : false)}
              />
          )}
        </div>
      )}
    </div>
  );
}

export function FileTree({ 
  files, 
  projectId,
  onFilesChanged 
}: { 
  files: FileItem[], 
  projectId?: string,
  onFilesChanged?: () => void 
}) {
  const { activeFileId, setActiveFileId, flashingPaths, setActiveTab, addToast } = useAppStore();
  const tree = useMemo(() => buildFileTree(files), [files]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [menu, setMenu] = useState<{ file: FileItem, x: number, y: number } | null>(null);
  const [folderMenu, setFolderMenu] = useState<{ node: TreeNode, x: number, y: number } | null>(null);
  
  const [deleting, setDeleting] = useState<FileItem | null>(null);
  const [deletingFolder, setDeletingFolder] = useState<TreeNode | null>(null);
  const [renaming, setRenaming] = useState<FileItem | null>(null);
  const [newName, setNewName] = useState('');

  // Close context menu on outside click
  useEffect(() => {
    const handleClick = () => {
      setMenu(null);
      setFolderMenu(null);
    };
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  // Global shortcut to focus file search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.key === '/' || ((e.metaKey || e.ctrlKey) && (e.key === 'p' || e.key === 'f'))) {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const filteredFiles = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return [];

    return files
      .filter(file => file.path.toLowerCase().includes(query))
      .sort((a, b) => {
        const aName = (a.path.split('/').pop() || '').toLowerCase();
        const bName = (b.path.split('/').pop() || '').toLowerCase();
        
        const aExact = aName === query;
        const bExact = bName === query;
        if (aExact && !bExact) return -1;
        if (!aExact && bExact) return 1;

        const aStarts = aName.startsWith(query);
        const bStarts = bName.startsWith(query);
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;

        const aIncludesName = aName.includes(query);
        const bIncludesName = bName.includes(query);
        if (aIncludesName && !bIncludesName) return -1;
        if (!aIncludesName && bIncludesName) return 1;

        return a.path.localeCompare(b.path);
      });
  }, [files, searchQuery]);

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (filteredFiles.length > 0 ? (prev + 1) % filteredFiles.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (filteredFiles.length > 0 ? (prev - 1 + filteredFiles.length) % filteredFiles.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredFiles[selectedIndex]) {
        setActiveFileId(filteredFiles[selectedIndex].id);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setSearchQuery('');
      searchInputRef.current?.blur();
    }
  };

  const handleContextMenu = (e: React.MouseEvent | React.TouchEvent, file: FileItem) => {
    e.preventDefault();
    e.stopPropagation();
    
    let clientX = 0, clientY = 0;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }
    
    // Clamp to viewport so menu never overflows screen boundaries
    const menuWidth = 136;
    const menuHeight = 120;
    const x = Math.max(8, Math.min(clientX, window.innerWidth - menuWidth - 8));
    const y = Math.max(8, Math.min(clientY, window.innerHeight - menuHeight - 8));

    setFolderMenu(null);
    setMenu({ file, x, y });
  };

  const handleFolderContextMenu = (e: React.MouseEvent | React.TouchEvent, node: TreeNode) => {
    e.preventDefault();
    e.stopPropagation();
    
    let clientX = 0, clientY = 0;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }
    
    // Clamp to viewport so menu never overflows screen boundaries
    const menuWidth = 136;
    const menuHeight = 60;
    const x = Math.max(8, Math.min(clientX, window.innerWidth - menuWidth - 8));
    const y = Math.max(8, Math.min(clientY, window.innerHeight - menuHeight - 8));

    setMenu(null);
    setFolderMenu({ node, x, y });
  };

  const handleDownload = (file: FileItem) => {
    try {
      const isBinary = binaryExtensions.some(ext => file.path.toLowerCase().endsWith(ext));
      let blob: Blob;
      
      if (isBinary) {
        const byteCharacters = atob(file.content);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        blob = new Blob([byteArray]);
      } else {
        blob = new Blob([file.content], { type: 'text/plain' });
      }
      
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const fileName = file.path.split('/').pop() || 'download';
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error('Failed to download file', err);
      addToast(err.message || 'Download failed', 'error');
    }
    setMenu(null);
  };

  const handleRename = async () => {
    if (renaming && newName) {
      const trimmed = newName.trim();
      if (!trimmed) {
        addToast('Filename cannot be empty', 'error');
        return;
      }
      if (trimmed.includes('/')) {
        addToast('Filename cannot contain slashes', 'error');
        return;
      }
      if (/^[. ]|[. ]$|[\\:*?"<>|]/.test(trimmed)) {
        addToast('Filename contains invalid characters', 'error');
        return;
      }

      try {
        const parts = renaming.path.split('/');
        parts[parts.length - 1] = trimmed;
        const targetPath = parts.join('/');
        await renameFile(renaming.id, targetPath);
        onFilesChanged?.();
        setRenaming(null);
        setNewName('');
      } catch (err: any) {
        console.error('Rename failed', err);
        if (err.name === 'QuotaExceededError') {
          addToast('Storage is full. Free up space and try again.', 'error');
        } else if (err.message && err.message.includes('collision')) {
          addToast('A file already exists at this path.', 'error');
        } else {
          addToast(err.message || 'Rename failed', 'error');
        }
      }
    } else {
      setRenaming(null);
      setNewName('');
    }
  };

  const handleDelete = async () => {
    if (deleting) {
      try {
        await deleteFile(deleting.id);
        if (activeFileId === deleting.id) {
          setActiveFileId(null);
        }
        onFilesChanged?.();
      } catch (err: any) {
        console.error('Delete failed', err);
        addToast(err.message || 'Delete failed', 'error');
      }
    }
    setDeleting(null);
  };

  const handleDeleteFolder = async () => {
    if (deletingFolder && projectId) {
      try {
        await deleteFolder(projectId, deletingFolder.path);
        if (activeFileId && activeFileId.startsWith(deletingFolder.path + '/')) {
          setActiveFileId(null);
        }
        onFilesChanged?.();
      } catch (err: any) {
        console.error('Delete folder failed', err);
        addToast(err.message || 'Delete folder failed', 'error');
      }
    }
    setDeletingFolder(null);
  };

  if (files.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center h-full canvas-grid-pattern">
        <div className="border border-border bg-surface/80 rounded-xl p-5 max-w-xs w-full flex flex-col items-center corner-ticks shadow-sm">
          <div className="w-10 h-10 rounded-lg bg-surface-elevated border border-accent/40 flex items-center justify-center text-accent mb-3 shadow-xs">
            <FilePlus size={20} />
          </div>
          <div className="font-mono text-[10px] text-accent tracking-wider uppercase mb-1">
            VFS TREE : EMPTY
          </div>
          <h4 className="font-mono text-xs font-bold text-text mb-1">
            No Files in Project
          </h4>
          <p className="font-sans text-[11px] text-muted mb-4 leading-relaxed">
            Create an entry file, upload files, or instruct the agent to scaffold code.
          </p>
          <div className="flex flex-col gap-2 w-full">
            {projectId && (
              <button
                onClick={async () => {
                  try {
                    await createFile(projectId, '/index.ts', '// Main application entry\nconsole.log("LAIDE Studio Ready");\n');
                    onFilesChanged?.();
                  } catch (err) {
                    console.error('Failed to create initial file', err);
                  }
                }}
                className="w-full py-2 px-3 bg-accent text-accent-text-on font-mono font-bold text-xs rounded hover:bg-accent/90 transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
              >
                <FilePlus size={13} /> Create First File
              </button>
            )}
            <button
              onClick={() => setActiveTab('chat')}
              className="w-full py-2 px-3 bg-surface border border-border text-text font-mono text-xs rounded hover:bg-accent/5 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <MessageSquare size={13} className="text-moss" /> Open Agent Chat
            </button>
          </div>
        </div>
      </div>
    );
  }

  const entries = (Object.values(tree.children || {}) as TreeNode[]).sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  const isSearching = searchQuery.trim().length > 0;

  return (
    <div className="flex-1 flex flex-col overflow-hidden relative w-full">
      {/* File Search Header */}
      <div className="px-2 py-1.5 border-b border-border/80 bg-surface/50 shrink-0">
        <div className="relative flex items-center">
          <Search size={13} className="absolute left-2.5 text-muted pointer-events-none" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleSearchKeyDown}
            placeholder="Search files... (/)"
            aria-label="Search files by name or path"
            className="w-full pl-8 pr-7 py-1 bg-surface-elevated/70 border border-border rounded text-[11px] font-mono text-text placeholder:text-muted/60 focus:outline-none focus:border-accent transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => {
                setSearchQuery('');
                setSelectedIndex(0);
                searchInputRef.current?.focus();
              }}
              className="absolute right-2 text-muted hover:text-text p-0.5 rounded cursor-pointer transition-colors"
              aria-label="Clear search"
              title="Clear search"
            >
              <X size={12} />
            </button>
          )}
        </div>
        {isSearching && (
          <div className="flex items-center justify-between mt-1 px-1 text-[10px] font-mono text-muted">
            <span className="text-accent font-medium">
              {filteredFiles.length} {filteredFiles.length === 1 ? 'file found' : 'files found'}
            </span>
            <span className="text-[9px] text-muted/80">
              <kbd className="px-1 py-0.5 bg-surface-elevated border border-border rounded text-[9px]">↑↓</kbd> navigate <kbd className="px-1 py-0.5 bg-surface-elevated border border-border rounded text-[9px]">↵</kbd> open
            </span>
          </div>
        )}
      </div>

      {/* Main File Content: Search Results vs Tree View */}
      {isSearching ? (
        filteredFiles.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-muted">
            <div className="w-8 h-8 rounded-full bg-surface-elevated border border-border flex items-center justify-center text-muted mb-2">
              <Search size={14} />
            </div>
            <p className="font-mono text-xs font-semibold text-text mb-1">No matching files</p>
            <p className="font-sans text-[11px] text-muted mb-3 max-w-[220px]">
              No files match &ldquo;<span className="font-mono text-accent">{searchQuery}</span>&rdquo;
            </p>
            <button
              onClick={() => {
                setSearchQuery('');
                setSelectedIndex(0);
              }}
              className="px-3 py-1 text-[11px] font-mono bg-surface-elevated border border-border hover:border-accent/40 rounded text-accent hover:bg-accent/10 transition-colors cursor-pointer"
            >
              Clear Search
            </button>
          </div>
        ) : (
          <div 
            className="flex-1 overflow-auto py-1 scrollbar-thin divide-y divide-border/20" 
            role="listbox" 
            aria-label="File search results"
          >
            {filteredFiles.map((file, idx) => {
              const isSelected = idx === selectedIndex;
              const isActive = file.id === activeFileId;
              const parts = file.path.split('/').filter(Boolean);
              const fileName = parts.pop() || file.path;
              const dirPath = parts.length > 0 ? '/' + parts.join('/') : '/';

              return (
                <div
                  key={file.id}
                  role="option"
                  aria-selected={isSelected}
                  className={`flex items-center justify-between gap-2 px-3 py-2 cursor-pointer select-none transition-colors border-l-2 ${
                    isSelected 
                      ? 'bg-accent/15 border-accent text-text' 
                      : isActive
                      ? 'bg-surface-elevated border-accent/60 text-text'
                      : 'border-transparent hover:bg-surface-elevated/70 text-muted hover:text-text'
                  }`}
                  onClick={() => {
                    setActiveFileId(file.id);
                  }}
                  onContextMenu={(e) => handleContextMenu(e, file)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <FileText 
                      size={14} 
                      className={`shrink-0 ${isActive || isSelected ? 'text-accent' : 'text-moss/80'}`} 
                    />
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="font-mono text-[12px] font-medium truncate text-text">
                        {highlightMatch(fileName, searchQuery)}
                      </span>
                      <span className="font-mono text-[10px] text-muted truncate">
                        {highlightMatch(dirPath, searchQuery)}
                      </span>
                    </div>
                  </div>
                  <span className="font-mono text-[10px] text-muted/70 shrink-0">
                    {formatFileSize(file.content)}
                  </span>
                </div>
              );
            })}
          </div>
        )
      ) : (
        <div className="py-2 flex-1 overflow-auto relative w-full scrollbar-thin">
          <div className="min-w-full w-max">
            {entries.map(child => child.type === 'folder' 
              ? <FolderNode key={child.path} node={child} level={0} onSelectFile={(f) => setActiveFileId(f.id)} onContextMenu={handleContextMenu} onFolderContextMenu={handleFolderContextMenu} activeFileId={activeFileId} flashingPaths={flashingPaths} />
              : <FileNode 
                  key={child.path} 
                  node={child} 
                  level={0} 
                  onSelectFile={(f) => setActiveFileId(f.id)} 
                  onContextMenu={handleContextMenu} 
                  isActive={child.file?.id === activeFileId} 
                  isFlashing={flashingPaths.includes(child.path) || (child.file ? flashingPaths.includes(child.file.path) : false)}
                />
            )}
          </div>
        </div>
      )}

      {/* Context Menu */}
      {menu && (
        <div 
          className="fixed bg-surface border border-border rounded shadow-xl flex flex-col z-50 text-[11px] font-mono w-32 overflow-hidden"
          style={{ top: menu.y, left: menu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button 
            className="flex items-center gap-2 px-3 py-2 hover:bg-black/5 text-left text-muted cursor-pointer"
            onClick={() => {
              setRenaming(menu.file);
              setNewName(menu.file.path.split('/').pop() || '');
              setMenu(null);
            }}
          >
            <Edit2 size={12} /> Rename
          </button>
          <button 
            className="flex items-center gap-2 px-3 py-2 hover:bg-black/5 text-left text-muted cursor-pointer"
            onClick={() => handleDownload(menu.file)}
          >
            <Download size={12} /> Download
          </button>
          <button 
            className="flex items-center gap-2 px-3 py-2 hover:bg-red-500/20 text-left text-red-400 cursor-pointer"
            onClick={() => {
              setDeleting(menu.file);
              setMenu(null);
            }}
          >
            <Trash size={12} /> Delete
          </button>
        </div>
      )}

      {/* Folder Context Menu */}
      {folderMenu && (
        <div 
          className="fixed bg-surface border border-border rounded shadow-xl flex flex-col z-50 text-[11px] font-mono w-36 overflow-hidden"
          style={{ top: folderMenu.y, left: folderMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button 
            className="flex items-center gap-2 px-3 py-2 hover:bg-red-500/20 text-left text-red-400 cursor-pointer"
            onClick={() => {
              setDeletingFolder(folderMenu.node);
              setFolderMenu(null);
            }}
          >
            <Trash size={12} /> Delete Folder
          </button>
        </div>
      )}

      {/* Rename Dialog */}
      {renaming && (
        <div className="absolute inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-surface border border-border p-4 rounded-lg shadow-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <h3 className="text-muted text-xs font-mono  mb-3">Rename File</h3>
            <input 
              type="text" 
              value={newName} 
              onChange={e => setNewName(e.target.value)}
              className="w-full bg-bg border border-border rounded px-2 py-1 text-sm text-text font-mono focus:outline-none focus:border-moss"
              autoFocus
              onKeyDown={e => {
                if (e.key === 'Enter') handleRename();
                else if (e.key === 'Escape') setRenaming(null);
              }}
            />
            <div className="flex justify-end gap-2 mt-4">
              <button 
                onClick={() => setRenaming(null)}
                className="px-3 py-1.5 text-xs font-mono text-muted hover:text-text cursor-pointer"
              >
                Cancel
              </button>
              <button 
                onClick={handleRename}
                className="px-3 py-1.5 text-xs font-mono bg-moss/20 text-moss rounded hover:bg-moss/30 cursor-pointer"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Dialog */}
      {deleting && (
        <div className="absolute inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-surface border border-red-500/30 p-4 rounded-lg shadow-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <h3 className="text-red-400 text-xs font-mono  mb-3">Confirm Delete</h3>
            <p className="text-muted text-sm mb-4">
              Are you sure you want to delete <span className="font-mono text-text">{deleting.path}</span>?
            </p>
            <div className="flex justify-end gap-2">
              <button 
                onClick={() => setDeleting(null)}
                className="px-3 py-1.5 text-xs font-mono text-muted hover:text-text cursor-pointer"
              >
                Cancel
              </button>
              <button 
                onClick={handleDelete}
                className="px-3 py-1.5 text-xs font-mono bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Folder Dialog */}
      {deletingFolder && (
        <div className="absolute inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-surface border border-red-500/30 p-4 rounded-lg shadow-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <h3 className="text-red-400 text-xs font-mono mb-3">Delete Folder</h3>
            <p className="text-muted text-sm mb-4">
              Delete folder <span className="font-mono text-text">{deletingFolder.name}</span> and its {countFilesInFolder(deletingFolder)} file{countFilesInFolder(deletingFolder) !== 1 ? 's' : ''}?
            </p>
            <div className="flex justify-end gap-2">
              <button 
                onClick={() => setDeletingFolder(null)}
                className="px-3 py-1.5 text-xs font-mono text-muted hover:text-text cursor-pointer"
              >
                Cancel
              </button>
              <button 
                onClick={handleDeleteFolder}
                className="px-3 py-1.5 text-xs font-mono bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 cursor-pointer"
              >
                Delete Folder
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

