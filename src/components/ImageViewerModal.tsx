import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { 
  X, 
  ZoomIn, 
  ZoomOut, 
  Maximize2, 
  RotateCw, 
  Download, 
  Copy, 
  Check, 
  Image as ImageIcon,
  AlertCircle
} from 'lucide-react';
import type { FileItem } from '../db';
import { useAppStore } from '../store';
import { binaryExtensions } from '../services/fs/zipExport';

export const IMAGE_EXTENSIONS = [
  '.png', 
  '.jpg', 
  '.jpeg', 
  '.svg', 
  '.gif', 
  '.webp', 
  '.ico', 
  '.bmp'
];

/**
 * Checks if a file path has an image extension
 */
export function isImageFile(path: string): boolean {
  if (!path) return false;
  const lower = path.toLowerCase();
  return IMAGE_EXTENSIONS.some(ext => lower.endsWith(ext));
}

/**
 * Derives a suitable data URI / source URL for rendering an image FileItem
 */
export function getImageSrc(file: FileItem): string {
  if (!file || !file.content) return '';
  
  const lowerPath = file.path.toLowerCase();
  
  // If already a complete data URI or URL
  if (
    file.content.startsWith('data:') || 
    file.content.startsWith('http://') || 
    file.content.startsWith('https://') || 
    file.content.startsWith('blob:')
  ) {
    return file.content;
  }

  // SVG Handling: could be raw SVG XML or base64
  if (lowerPath.endsWith('.svg')) {
    const trimmed = file.content.trim();
    if (trimmed.startsWith('<svg') || trimmed.startsWith('<?xml')) {
      return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(file.content)}`;
    }
    return `data:image/svg+xml;base64,${file.content}`;
  }

  // Mime detection for common raster formats
  let mime = 'image/png';
  if (lowerPath.endsWith('.jpg') || lowerPath.endsWith('.jpeg')) {
    mime = 'image/jpeg';
  } else if (lowerPath.endsWith('.gif')) {
    mime = 'image/gif';
  } else if (lowerPath.endsWith('.webp')) {
    mime = 'image/webp';
  } else if (lowerPath.endsWith('.ico')) {
    mime = 'image/x-icon';
  } else if (lowerPath.endsWith('.bmp')) {
    mime = 'image/bmp';
  }

  return `data:${mime};base64,${file.content}`;
}

function formatFileSize(content: string, isBinary: boolean): string {
  const padding = content.endsWith('==') ? 2 : (content.endsWith('=') ? 1 : 0);
  const bytes = isBinary
    ? Math.max(0, (content.length * (3 / 4)) - padding)
    : new Blob([content]).size;

  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export interface ImageViewerModalProps {
  file: FileItem | null;
  onClose: () => void;
  onDownload?: (file: FileItem) => void;
}

export function ImageViewerModal({ file, onClose, onDownload }: ImageViewerModalProps) {
  const { addToast } = useAppStore();
  
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [rotation, setRotation] = useState<number>(0);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [naturalDimensions, setNaturalDimensions] = useState<{ width: number; height: number } | null>(null);
  const [hasError, setHasError] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const touchStartDist = useRef<number | null>(null);

  // Reset zoom, pan, rotation, and dimensions when file changes
  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (active) {
        setZoom(1);
        setPan({ x: 0, y: 0 });
        setRotation(0);
        setNaturalDimensions(null);
        setHasError(false);
        setCopied(false);
      }
    });
    return () => {
      active = false;
    };
  }, [file?.id, file?.path]);

  // Keyboard shortcut listener
  useEffect(() => {
    if (!file) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        setZoom(prev => Math.min(10, +(prev * 1.25).toFixed(2)));
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        setZoom(prev => Math.max(0.1, +(prev / 1.25).toFixed(2)));
      } else if (e.key === '0') {
        e.preventDefault();
        setZoom(1);
        setPan({ x: 0, y: 0 });
        setRotation(0);
      } else if (e.key.toLowerCase() === 'r' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setRotation(prev => (prev + 90) % 360);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [file, onClose]);

  const imgSrc = useMemo(() => {
    if (!file) return '';
    return getImageSrc(file);
  }, [file]);

  const fileName = useMemo(() => {
    if (!file) return '';
    return file.path.split('/').pop() || file.path;
  }, [file]);

  const fileExtension = useMemo(() => {
    if (!file) return '';
    const parts = file.path.split('.');
    return parts.length > 1 ? parts.pop()?.toUpperCase() || '' : '';
  }, [file]);

  const isBinary = useMemo(() => {
    if (!file) return false;
    return binaryExtensions.some(ext => file.path.toLowerCase().endsWith(ext));
  }, [file]);

  // Zoom controls
  const handleZoomIn = useCallback(() => {
    setZoom(prev => Math.min(10, +(prev * 1.25).toFixed(2)));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom(prev => Math.max(0.1, +(prev / 1.25).toFixed(2)));
  }, []);

  const handleResetZoom = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setRotation(0);
  }, []);

  const handleRotate = useCallback(() => {
    setRotation(prev => (prev + 90) % 360);
  }, []);

  const handleCopyPath = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!file) return;
    navigator.clipboard.writeText(file.path).then(() => {
      setCopied(true);
      addToast(`Copied path: ${file.path}`, 'success');
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {
      addToast('Failed to copy path', 'error');
    });
  }, [file, addToast]);

  // Mouse wheel zoom
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.deltaY < 0) {
      setZoom(prev => Math.min(10, +(prev * 1.15).toFixed(2)));
    } else {
      setZoom(prev => Math.max(0.1, +(prev / 1.15).toFixed(2)));
    }
  };

  // Mouse drag to pan
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.button !== 1) return; // Left or middle click
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Touch drag and pinch-to-zoom
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 1) {
      setIsDragging(true);
      setDragStart({
        x: e.touches[0].clientX - pan.x,
        y: e.touches[0].clientY - pan.y
      });
      touchStartDist.current = null;
    } else if (e.touches.length === 2) {
      setIsDragging(false);
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      touchStartDist.current = Math.hypot(dx, dy);
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 1 && isDragging) {
      setPan({
        x: e.touches[0].clientX - dragStart.x,
        y: e.touches[0].clientY - dragStart.y
      });
    } else if (e.touches.length === 2 && touchStartDist.current !== null) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const currentDist = Math.hypot(dx, dy);
      const ratio = currentDist / touchStartDist.current;
      
      setZoom(prev => {
        const next = Math.max(0.1, Math.min(10, +(prev * ratio).toFixed(2)));
        return next;
      });
      touchStartDist.current = currentDist;
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    touchStartDist.current = null;
  };

  // Double click toggles between 100% and 200% zoom
  const handleDoubleClick = () => {
    if (zoom === 1) {
      setZoom(2);
    } else {
      setZoom(1);
      setPan({ x: 0, y: 0 });
    }
  };

  if (!file) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="image-viewer-title"
    >
      <div 
        className="bg-surface border border-border rounded-xl max-w-4xl w-full h-[85vh] sm:h-[90vh] shadow-2xl flex flex-col font-sans text-left corner-ticks overflow-hidden select-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Bar */}
        <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-border bg-surface-elevated/70 shrink-0 gap-2">
          {/* File Information */}
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className="p-1 bg-accent/15 border border-accent/40 rounded text-accent shrink-0 shadow-xs">
              <ImageIcon size={16} />
            </div>
            <div className="flex flex-col min-w-0 flex-1">
              <div className="flex items-center gap-2 min-w-0">
                <h2 id="image-viewer-title" className="text-xs font-mono font-bold text-text truncate max-w-[200px] sm:max-w-[320px]">
                  {fileName}
                </h2>
                <span className="px-1.5 py-0.2 bg-accent/15 text-accent border border-accent/30 rounded text-[9px] font-mono font-semibold uppercase shrink-0">
                  {fileExtension || 'IMG'}
                </span>
              </div>
              <p className="text-[10px] font-mono text-muted truncate max-w-[240px] sm:max-w-md" title={file.path}>
                {file.path}
              </p>
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex items-center gap-1 shrink-0 font-mono text-xs">
            <button
              type="button"
              onClick={handleCopyPath}
              className="p-1.5 text-muted hover:text-accent hover:bg-surface rounded transition-colors cursor-pointer border border-transparent hover:border-border"
              title="Copy file path"
              aria-label="Copy file path"
            >
              {copied ? <Check size={14} className="text-accent" /> : <Copy size={14} />}
            </button>

            {onDownload && (
              <button
                type="button"
                onClick={() => onDownload(file)}
                className="p-1.5 text-muted hover:text-accent hover:bg-surface rounded transition-colors cursor-pointer border border-transparent hover:border-border"
                title="Download image"
                aria-label="Download image"
              >
                <Download size={14} />
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-muted hover:text-text hover:bg-surface rounded transition-colors cursor-pointer ml-1 border border-transparent hover:border-border"
              title="Close image viewer (Esc)"
              aria-label="Close image viewer"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Image Canvas Viewport */}
        <div 
          ref={containerRef}
          className={`flex-1 relative overflow-hidden bg-[#111115] flex items-center justify-center cursor-default ${
            isDragging ? 'cursor-grabbing' : 'cursor-grab'
          }`}
          style={{
            backgroundImage: `
              linear-gradient(45deg, rgba(128, 128, 128, 0.08) 25%, transparent 25%), 
              linear-gradient(-45deg, rgba(128, 128, 128, 0.08) 25%, transparent 25%), 
              linear-gradient(45deg, transparent 75%, rgba(128, 128, 128, 0.08) 75%), 
              linear-gradient(-45deg, transparent 75%, rgba(128, 128, 128, 0.08) 75%)
            `,
            backgroundSize: '20px 20px',
            backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px'
          }}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onDoubleClick={handleDoubleClick}
        >
          {hasError ? (
            <div className="flex flex-col items-center justify-center p-6 text-center text-muted max-w-sm">
              <div className="w-10 h-10 rounded-full bg-error/15 border border-error/40 flex items-center justify-center text-error mb-2.5">
                <AlertCircle size={20} />
              </div>
              <h3 className="font-mono text-xs font-bold text-text mb-1">
                Unable to Display Image
              </h3>
              <p className="font-sans text-[11px] text-muted leading-relaxed">
                The image data could not be parsed or rendered.
              </p>
            </div>
          ) : (
            <div 
              className="transition-transform duration-75 ease-out select-none pointer-events-auto"
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom}) rotate(${rotation}deg)`,
                transformOrigin: 'center center'
              }}
            >
              <img
                src={imgSrc}
                alt={fileName}
                draggable={false}
                onLoad={(e) => {
                  const img = e.currentTarget;
                  setNaturalDimensions({ width: img.naturalWidth, height: img.naturalHeight });
                  setHasError(false);
                }}
                onError={() => {
                  setHasError(true);
                }}
                className="max-w-[75vw] max-h-[60vh] object-contain shadow-2xl rounded-[2px] border border-white/5"
              />
            </div>
          )}
        </div>

        {/* Footer Controls & Diagnostics Bar */}
        <div className="px-3.5 py-2 border-t border-border bg-surface-elevated/70 shrink-0 flex items-center justify-between gap-2 font-mono text-[11px] flex-wrap">
          {/* Metadata Display */}
          <div className="flex items-center gap-2 sm:gap-3 text-muted">
            {naturalDimensions && naturalDimensions.width > 0 && naturalDimensions.height > 0 ? (
              <span className="text-text/90">
                {naturalDimensions.width} × {naturalDimensions.height} px
              </span>
            ) : fileExtension === 'SVG' ? (
              <span className="text-accent/90">Vector SVG</span>
            ) : null}

            <span className="text-muted/40">•</span>
            <span>{formatFileSize(file.content, isBinary)}</span>
          </div>

          {/* Zoom & Rotation Toolbar */}
          <div className="flex items-center gap-1 bg-surface border border-border rounded-lg p-0.5 shadow-xs">
            <button
              type="button"
              onClick={handleZoomOut}
              disabled={zoom <= 0.1}
              className="p-1 text-muted hover:text-accent hover:bg-surface-elevated rounded transition-colors disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
              title="Zoom out (-)"
              aria-label="Zoom out"
            >
              <ZoomOut size={13} />
            </button>

            <button
              type="button"
              onClick={handleResetZoom}
              className="px-2 py-0.5 text-[10px] font-bold text-accent hover:bg-surface-elevated rounded transition-colors cursor-pointer min-w-[44px] text-center"
              title="Reset zoom and rotation (0)"
              aria-label="Reset zoom and rotation"
            >
              {Math.round(zoom * 100)}%
            </button>

            <button
              type="button"
              onClick={handleZoomIn}
              disabled={zoom >= 10}
              className="p-1 text-muted hover:text-accent hover:bg-surface-elevated rounded transition-colors disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
              title="Zoom in (+)"
              aria-label="Zoom in"
            >
              <ZoomIn size={13} />
            </button>

            <div className="w-[1px] h-3.5 bg-border/80 mx-0.5" />

            <button
              type="button"
              onClick={handleResetZoom}
              className="p-1 text-muted hover:text-accent hover:bg-surface-elevated rounded transition-colors cursor-pointer"
              title="Fit to view (100%)"
              aria-label="Fit to view"
            >
              <Maximize2 size={13} />
            </button>

            <button
              type="button"
              onClick={handleRotate}
              className="p-1 text-muted hover:text-accent hover:bg-surface-elevated rounded transition-colors cursor-pointer"
              title="Rotate 90° clockwise (R)"
              aria-label="Rotate 90 degrees clockwise"
            >
              <RotateCw size={13} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
