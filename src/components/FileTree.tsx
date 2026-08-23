import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { 
  Folder, 
  FolderOpen, 
  ChevronRight,
  FileText, 
  FileCode,
  Code2,
  Braces,
  Hash,
  Globe,
  Image,
  FileArchive,
  FileCog,
  Key,
  Lock,
  Terminal,
  Boxes,
  Download, 
  Trash, 
  Edit2, 
  FilePlus, 
  MessageSquare, 
  Search, 
  X, 
  Copy, 
  Check, 
  ChevronsDown,
  ChevronsUp,
  FolderPlus
} from 'lucide-react';
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

export function getAllFolderPaths(node: TreeNode): string[] {
  const paths: string[] = [];
  if (node.path && node.type === 'folder') {
    paths.push(node.path);
  }
  if (node.children) {
    for (const child of Object.values(node.children)) {
      if (child.type === 'folder') {
        paths.push(...getAllFolderPaths(child));
      }
    }
  }
  return paths;
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

/**
 * Returns a visually distinct icon based on file name and extension
 */
export function getFileIcon(filename: string, className?: string, isFlashing?: boolean) {
  if (isFlashing) {
    return <FileCode size={14} className={`text-accent shrink-0 ${className || ''}`} />;
  }

  const lowerName = filename.toLowerCase();
  const parts = lowerName.split('.');
  const ext = parts.length > 1 ? parts.pop() || '' : '';

  // Special exact filenames
  if (lowerName === 'package.json') {
    return <Boxes size={14} className={`text-amber-400 shrink-0 ${className || ''}`} />;
  }
  if (lowerName.startsWith('tsconfig') || lowerName.includes('vite.config') || lowerName.includes('tailwind.config') || lowerName.includes('eslint') || lowerName.includes('prettier')) {
    return <FileCog size={14} className={`text-sky-400 shrink-0 ${className || ''}`} />;
  }
  if (lowerName.startsWith('.env') || lowerName.endsWith('.env')) {
    return <Key size={14} className={`text-yellow-400 shrink-0 ${className || ''}`} />;
  }
  if (lowerName.endsWith('.lock') || lowerName === 'bun.lockb') {
    return <Lock size={14} className={`text-muted shrink-0 ${className || ''}`} />;
  }
  if (lowerName.endsWith('.test.ts') || lowerName.endsWith('.test.tsx') || lowerName.endsWith('.spec.ts') || lowerName.endsWith('.spec.tsx')) {
    return <FileCode size={14} className={`text-emerald-400 shrink-0 ${className || ''}`} />;
  }

  // Extensions
  switch (ext) {
    case 'tsx':
    case 'jsx':
      return <Code2 size={14} className={`text-cyan-400 shrink-0 ${className || ''}`} />;
    case 'ts':
    case 'mts':
    case 'cts':
      return <FileCode size={14} className={`text-blue-400 shrink-0 ${className || ''}`} />;
    case 'js':
    case 'mjs':
    case 'cjs':
      return <FileCode size={14} className={`text-yellow-300 shrink-0 ${className || ''}`} />;
    case 'json':
    case 'json5':
    case 'jsonc':
      return <Braces size={14} className={`text-amber-400 shrink-0 ${className || ''}`} />;
    case 'css':
    case 'scss':
    case 'sass':
    case 'less':
      return <Hash size={14} className={`text-pink-400 shrink-0 ${className || ''}`} />;
    case 'html':
    case 'htm':
      return <Globe size={14} className={`text-orange-400 shrink-0 ${className || ''}`} />;
    case 'md':
    case 'mdx':
    case 'markdown':
    case 'txt':
    case 'log':
      return <FileText size={14} className={`text-slate-300 shrink-0 ${className || ''}`} />;
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'svg':
    case 'webp':
    case 'ico':
    case 'bmp':
      return <Image size={14} className={`text-emerald-400 shrink-0 ${className || ''}`} />;
    case 'zip':
    case 'tar':
    case 'gz':
    case '7z':
    case 'rar':
      return <FileArchive size={14} className={`text-purple-400 shrink-0 ${className || ''}`} />;
    case 'sh':
    case 'bash':
    case 'zsh':
      return <Terminal size={14} className={`text-lime-400 shrink-0 ${className || ''}`} />;
    default:
      return <FileText size={14} className={`text-moss/80 shrink-0 ${className || ''}`} />;
  }
}

/**
 * Returns contextual folder icon based on directory name
 */
export function getFolderIcon(folderName: string, isOpen: boolean, className?: string) {
  const lower = folderName.toLowerCase();
  let colorClass = 'text-accent';

  if (lower === 'src' || lower === 'app') {
    colorClass = 'text-accent';
  } else if (lower === 'components' || lower === 'ui') {
    colorClass = 'text-cyan-400';
  } else if (lower === 'services' || lower === 'api' || lower === 'db' || lower === 'utils') {
    colorClass = 'text-amber-400';
  } else if (lower === 'test' || lower === 'tests' || lower === '__tests__') {
    colorClass = 'text-emerald-400';
  } else if (lower === 'public' || lower === 'assets' || lower === 'static') {
    colorClass = 'text-pink-400';
  } else if (lower === 'node_modules') {
    colorClass = 'text-muted';
  }

  if (isOpen) {
    return <FolderOpen size={14} className={`${colorClass} shrink-0 ${className || ''}`} />;
  }
  return <Folder size={14} className={`${colorClass}/90 shrink-0 ${className || ''}`} />;
}

function FileNode({ 
  node, 
  level, 
  onSelectFile, 
  onContextMenu, 
  isActive, 
  isFlashing,
  onCopyPath 
}: { 
  node: TreeNode, 
  level: number, 
  onSelectFile: (file: FileItem) => void,
  onContextMenu: (e: React.MouseEvent | React.TouchEvent, file: FileItem) => void,
  isActive: boolean,
  isFlashing?: boolean,
  onCopyPath: (path: string, e: React.MouseEvent) => void
}) {
  const longPressTimer = useRef<any>(null);
  const longPressFired = useRef(false);
  const [copied, setCopied] = useState(false);

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

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (node.file) {
      onCopyPath(node.file.path, e);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <div 
      className={`group flex items-center justify-between py-1 px-2 hover:bg-accent/10 cursor-pointer select-none text-muted transition-colors min-w-full w-fit rounded-[3px] my-[0.5px] ${
        isActive ? 'bg-accent/15 text-accent font-medium shadow-xs' : ''
      } ${isFlashing ? 'animate-accent-flash' : ''}`}
      style={{ paddingLeft: `${level * 14 + 18}px` }}
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
      <div className="flex items-center gap-1.5 min-w-0 pr-2">
        {getFileIcon(node.name, undefined, isFlashing)}
        <span className={`font-mono text-[12px] truncate max-w-[200px] sm:max-w-[280px] ${isActive ? 'text-text font-semibold' : 'text-text/90'}`}>
          {node.name}
        </span>
      </div>

      <button
        type="button"
        onClick={handleCopy}
        className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-0.5 hover:text-accent hover:bg-surface rounded transition-all cursor-pointer shrink-0 ml-1.5"
        title={`Copy path "${node.file?.path}"`}
        aria-label={`Copy path ${node.file?.path}`}
      >
        {copied ? (
          <Check size={12} className="text-accent" />
        ) : (
          <Copy size={12} className="text-muted hover:text-accent" />
        )}
      </button>
    </div>
  );
}

function FolderNode({ 
  node, 
  level, 
  onSelectFile, 
  onContextMenu, 
  onFolderContextMenu, 
  activeFileId, 
  flashingPaths,
  onCopyPath,
  expandedFolders,
  onToggleExpand
}: { 
  node: TreeNode, 
  level: number, 
  onSelectFile: (file: FileItem) => void, 
  onContextMenu: (e: React.MouseEvent | React.TouchEvent, file: FileItem) => void,
  onFolderContextMenu: (e: React.MouseEvent | React.TouchEvent, node: TreeNode) => void,
  activeFileId: string | null,
  flashingPaths: string[],
  onCopyPath: (path: string, e: React.MouseEvent) => void,
  expandedFolders: Set<string>,
  onToggleExpand: (path: string) => void
}) {
  const longPressTimer = useRef<any>(null);
  const longPressFired = useRef(false);

  const isExpanded = expandedFolders.has(node.path);

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

  const childCount = Object.keys(node.children || {}).length;

  return (
    <div className="select-none">
      {/* Folder Header Item */}
      <div 
        className="group flex items-center justify-between py-1 px-2 hover:bg-accent/10 cursor-pointer select-none text-muted min-w-full w-fit transition-colors rounded-[3px] my-[0.5px]"
        style={{ paddingLeft: `${level * 14 + 6}px` }}
        onClick={() => {
          if (!longPressFired.current) {
            onToggleExpand(node.path);
          }
        }}
        onContextMenu={(e) => onFolderContextMenu(e, node)}
        onTouchStart={handleTouchStart}
        onTouchEnd={clearTimer}
        onTouchMove={clearTimer}
        role="button"
        aria-expanded={isExpanded}
        aria-label={`Folder ${node.name}, ${isExpanded ? 'expanded' : 'collapsed'}`}
      >
        <div className="flex items-center gap-1 min-w-0 pr-2">
          {/* Rotating Chevron Indicator */}
          <ChevronRight 
            size={12} 
            className={`text-muted/60 group-hover:text-text transition-transform duration-200 ease-in-out shrink-0 ${
              isExpanded ? 'rotate-90 text-accent/90' : 'rotate-0'
            }`} 
          />
          
          {/* Distinct Folder Icon */}
          {getFolderIcon(node.name, isExpanded)}
          
          <span className="font-mono text-[12px] font-medium text-text truncate max-w-[220px] sm:max-w-none">
            {node.name}
          </span>
        </div>

        {/* Subtree item count badge */}
        <span className="text-[10px] font-mono text-muted/50 group-hover:text-muted/80 transition-colors ml-1 px-1 py-0.2 rounded">
          {childCount}
        </span>
      </div>

      {/* Smoothly animated collapsible child container */}
      <div 
        className={`grid transition-[grid-template-rows,opacity] duration-200 ease-in-out ${
          isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0 pointer-events-none'
        }`}
      >
        <div className="min-h-0 overflow-hidden">
          {entries.map(child => child.type === 'folder' 
            ? <FolderNode 
                key={child.path} 
                node={child} 
                level={level + 1} 
                onSelectFile={onSelectFile} 
                onContextMenu={onContextMenu} 
                onFolderContextMenu={onFolderContextMenu} 
                activeFileId={activeFileId} 
                flashingPaths={flashingPaths}
                onCopyPath={onCopyPath}
                expandedFolders={expandedFolders}
                onToggleExpand={onToggleExpand}
              />
            : <FileNode 
                key={child.path} 
                node={child} 
                level={level + 1} 
                onSelectFile={onSelectFile} 
                onContextMenu={onContextMenu} 
                isActive={child.file?.id === activeFileId} 
                isFlashing={flashingPaths.includes(child.path) || (child.file ? flashingPaths.includes(child.file.path) : false)}
                onCopyPath={onCopyPath}
              />
          )}
        </div>
      </div>
    </div>
  );
}

export function FileTree({ 
  files, 
  projectId,
  onFilesChanged,
  autoFocusSearch
}: { 
  files: FileItem[], 
  projectId?: string,
  onFilesChanged?: () => void,
  autoFocusSearch?: boolean
}) {
  const { activeFileId, setActiveFileId, flashingPaths, setActiveTab, addToast } = useAppStore();

  const copyFilePath = (path: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    navigator.clipboard.writeText(path).then(() => {
      addToast(`Copied path: ${path}`, 'success');
    }).catch(() => {
      addToast(`Failed to copy path`, 'error');
    });
  };

  const tree = useMemo(() => buildFileTree(files), [files]);
  const allFolderPaths = useMemo(() => getAllFolderPaths(tree), [tree]);

  // State to hold set of expanded folder paths
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => {
    return new Set<string>(allFolderPaths);
  });

  // Keep expanded folders updated when new folders appear
  useEffect(() => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      for (const p of allFolderPaths) {
        if (!prev.has(p)) {
          next.add(p);
        }
      }
      return next;
    });
  }, [allFolderPaths]);

  // Expand parent folders of active file when active file changes
  useEffect(() => {
    if (activeFileId) {
      const activeFile = files.find(f => f.id === activeFileId);
      if (activeFile) {
        const parts = activeFile.path.split('/').filter(Boolean);
        parts.pop(); // remove file name
        let cur = '';
        setExpandedFolders(prev => {
          let modified = false;
          const next = new Set(prev);
          for (const part of parts) {
            cur += '/' + part;
            if (!next.has(cur)) {
              next.add(cur);
              modified = true;
            }
          }
          return modified ? next : prev;
        });
      }
    }
  }, [activeFileId, files]);

  const toggleFolder = useCallback((path: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    setExpandedFolders(new Set(allFolderPaths));
  }, [allFolderPaths]);

  const collapseAll = useCallback(() => {
    setExpandedFolders(new Set());
  }, []);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocusSearch) {
      setTimeout(() => {
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }, 50);
    }
  }, [autoFocusSearch]);

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

  // Global '/' keyboard shortcut to focus search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInput = activeEl && (
        activeEl.tagName === 'INPUT' || 
        activeEl.tagName === 'TEXTAREA' || 
        (activeEl as HTMLElement).isContentEditable ||
        activeEl.closest('.cm-editor') !== null
      );

      if (e.key === '/' && !isInput && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Filtered files for search
  const filteredFiles = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const query = searchQuery.trim().toLowerCase();
    return files
      .filter(file => {
        const parts = file.path.split('/').filter(Boolean);
        const fileName = parts.pop() || '';
        return fileName.toLowerCase().includes(query) || file.path.toLowerCase().includes(query);
      })
      .sort((a, b) => {
        const aName = a.path.split('/').pop()?.toLowerCase() || '';
        const bName = b.path.split('/').pop()?.toLowerCase() || '';
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
    const menuWidth = 160;
    const menuHeight = 160;
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
      {/* File Search Header & Quick Tree Controls */}
      <div className="px-2 py-1.5 border-b border-border/80 bg-surface/50 shrink-0 space-y-1.5">
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

        {/* Tree controls bar: Expand All, Collapse All & Stats */}
        <div className="flex items-center justify-between px-1 text-[10px] font-mono text-muted">
          {isSearching ? (
            <>
              <span className="text-accent font-medium">
                {filteredFiles.length} {filteredFiles.length === 1 ? 'file found' : 'files found'}
              </span>
              <span className="text-[9px] text-muted/80">
                <kbd className="px-1 py-0.5 bg-surface-elevated border border-border rounded text-[9px]">↑↓</kbd> navigate <kbd className="px-1 py-0.5 bg-surface-elevated border border-border rounded text-[9px]">↵</kbd> open
              </span>
            </>
          ) : (
            <>
              <div className="flex items-center gap-1.5 text-muted/80">
                <span>{files.length} files</span>
                <span>•</span>
                <span>{allFolderPaths.length} folders</span>
              </div>

              {allFolderPaths.length > 0 && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={expandAll}
                    className="flex items-center gap-0.5 px-1.5 py-0.5 hover:bg-surface-elevated text-muted hover:text-accent rounded transition-colors cursor-pointer border border-transparent hover:border-border"
                    title="Expand all folders"
                    aria-label="Expand all folders"
                  >
                    <ChevronsDown size={11} />
                    <span className="text-[9px]">Expand</span>
                  </button>
                  <button
                    type="button"
                    onClick={collapseAll}
                    className="flex items-center gap-0.5 px-1.5 py-0.5 hover:bg-surface-elevated text-muted hover:text-accent rounded transition-colors cursor-pointer border border-transparent hover:border-border"
                    title="Collapse all folders"
                    aria-label="Collapse all folders"
                  >
                    <ChevronsUp size={11} />
                    <span className="text-[9px]">Collapse</span>
                  </button>
                </div>
              )}
            </>
          )}
        </div>
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
                  className={`group flex items-center justify-between gap-2 px-3 py-2 cursor-pointer select-none transition-colors border-l-2 ${
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
                    {getFileIcon(fileName, undefined, isActive || isSelected)}
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="font-mono text-[12px] font-medium truncate text-text">
                        {highlightMatch(fileName, searchQuery)}
                      </span>
                      <span className="font-mono text-[10px] text-muted truncate">
                        {highlightMatch(dirPath, searchQuery)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={(e) => copyFilePath(file.path, e)}
                      className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1 hover:text-accent hover:bg-surface rounded transition-all cursor-pointer"
                      title={`Copy path "${file.path}"`}
                      aria-label={`Copy path ${file.path}`}
                    >
                      <Copy size={12} />
                    </button>
                    <span className="font-mono text-[10px] text-muted/70">
                      {formatFileSize(file.content)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : (
        <div className="py-2 px-1 flex-1 overflow-auto relative w-full scrollbar-thin">
          <div className="min-w-full w-max">
            {entries.map(child => child.type === 'folder' 
              ? <FolderNode 
                  key={child.path} 
                  node={child} 
                  level={0} 
                  onSelectFile={(f) => setActiveFileId(f.id)} 
                  onContextMenu={handleContextMenu} 
                  onFolderContextMenu={handleFolderContextMenu} 
                  activeFileId={activeFileId} 
                  flashingPaths={flashingPaths}
                  onCopyPath={copyFilePath}
                  expandedFolders={expandedFolders}
                  onToggleExpand={toggleFolder}
                />
              : <FileNode 
                  key={child.path} 
                  node={child} 
                  level={0} 
                  onSelectFile={(f) => setActiveFileId(f.id)} 
                  onContextMenu={handleContextMenu} 
                  isActive={child.file?.id === activeFileId} 
                  isFlashing={flashingPaths.includes(child.path) || (child.file ? flashingPaths.includes(child.file.path) : false)}
                  onCopyPath={copyFilePath}
                />
            )}
          </div>
        </div>
      )}

      {/* Context Menu */}
      {menu && (
        <div 
          className="fixed bg-surface border border-border rounded shadow-xl flex flex-col z-50 text-[11px] font-mono w-40 overflow-hidden"
          style={{ top: menu.y, left: menu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button 
            className="flex items-center gap-2 px-3 py-2 hover:bg-accent/10 text-left text-muted hover:text-text cursor-pointer transition-colors"
            onClick={(e) => {
              copyFilePath(menu.file.path, e);
              setMenu(null);
            }}
          >
            <Copy size={12} className="text-accent" /> Copy Path
          </button>
          <button 
            className="flex items-center gap-2 px-3 py-2 hover:bg-accent/10 text-left text-muted hover:text-text cursor-pointer transition-colors"
            onClick={(e) => {
              const rel = menu.file.path.replace(/^\//, '');
              copyFilePath(rel, e);
              setMenu(null);
            }}
          >
            <FileCode size={12} className="text-accent" /> Copy Relative Path
          </button>
          <button 
            className="flex items-center gap-2 px-3 py-2 hover:bg-accent/10 text-left text-muted hover:text-text cursor-pointer transition-colors border-t border-border/40"
            onClick={() => {
              setRenaming(menu.file);
              setNewName(menu.file.path.split('/').pop() || '');
              setMenu(null);
            }}
          >
            <Edit2 size={12} /> Rename
          </button>
          <button 
            className="flex items-center gap-2 px-3 py-2 hover:bg-accent/10 text-left text-muted hover:text-text cursor-pointer transition-colors"
            onClick={() => handleDownload(menu.file)}
          >
            <Download size={12} /> Download
          </button>
          <button 
            className="flex items-center gap-2 px-3 py-2 hover:bg-error/20 text-left text-error cursor-pointer transition-colors border-t border-border/40"
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
            className="flex items-center gap-2 px-3 py-2 hover:bg-error/20 text-left text-error cursor-pointer transition-colors"
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
            <h3 className="text-muted text-xs font-mono mb-3">Rename File</h3>
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
            <h3 className="text-red-400 text-xs font-mono mb-3">Confirm Delete</h3>
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
