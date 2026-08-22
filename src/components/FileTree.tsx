import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Folder, FolderOpen, FileText, Download, Trash, Edit2, FilePlus, MessageSquare } from 'lucide-react';
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

  return (
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

