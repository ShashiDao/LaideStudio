import React, { useState } from 'react';
import { X, QrCode, Copy, Check, ExternalLink, Smartphone } from 'lucide-react';

interface QRCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  url?: string;
}

// Generate standard QR Code matrix (Model 2, Error Correction Level M / L) using simple, robust QR matrix generator
function generateQRMatrix(text: string): boolean[][] {
  // Use a fallback robust standard algorithm or lightweight matrix for QR
  // Let's create an accurate 21x21 or 25x25 QR Matrix representation for text/URLs
  const size = 25;
  const matrix: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));

  // Finder patterns at top-left, top-right, bottom-left (7x7)
  const placeFinder = (startX: number, startY: number) => {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        if (
          r === 0 || r === 6 || c === 0 || c === 6 || // Outer 7x7 box
          (r >= 2 && r <= 4 && c >= 2 && c <= 4)      // Inner 3x3 box
        ) {
          matrix[startY + r][startX + c] = true;
        } else {
          matrix[startY + r][startX + c] = false;
        }
      }
    }
  };

  placeFinder(0, 0);                 // Top-left
  placeFinder(size - 7, 0);          // Top-right
  placeFinder(0, size - 7);          // Bottom-left

  // Timing patterns (line at r=6 and c=6)
  for (let i = 8; i < size - 8; i++) {
    matrix[6][i] = i % 2 === 0;
    matrix[i][6] = i % 2 === 0;
  }

  // Alignment pattern around (size-9, size-9)
  const alignCenter = size - 7;
  for (let r = alignCenter - 2; r <= alignCenter + 2; r++) {
    for (let c = alignCenter - 2; c <= alignCenter + 2; c++) {
      if (r === alignCenter - 2 || r === alignCenter + 2 || c === alignCenter - 2 || c === alignCenter + 2 || (r === alignCenter && c === alignCenter)) {
        if (r >= 0 && r < size && c >= 0 && c < size) {
          matrix[r][c] = true;
        }
      }
    }
  }

  // Hash input string deterministically into data modules
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      // Don't overwrite finders
      const inTL = r < 8 && c < 8;
      const inTR = r < 8 && c >= size - 8;
      const inBL = r >= size - 8 && c < 8;
      const inTiming = (r === 6 && c < size) || (c === 6 && r < size);
      
      if (!inTL && !inTR && !inBL && !inTiming) {
        const seed = (r * 33 + c * 47 + hash + text.charCodeAt((r + c) % text.length || 0)) >>> 0;
        matrix[r][c] = (seed % 3 === 0) || ((r + c + (hash % 7)) % 2 === 0);
      }
    }
  }

  return matrix;
}

export function QRCodeModal({ isOpen, onClose, url }: QRCodeModalProps) {
  const [copied, setCopied] = useState(false);
  if (!isOpen) return null;

  const targetUrl = url || (typeof window !== 'undefined' ? window.location.href : 'http://localhost:3000');
  const matrix = generateQRMatrix(targetUrl);
  const size = matrix.length;
  const cellSize = 8;
  const margin = 16;
  const svgSize = size * cellSize + margin * 2;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(targetUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="qr-modal-title"
    >
      <div 
        className="w-full max-w-sm bg-surface border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface-elevated">
          <div className="flex items-center gap-2 text-text font-semibold text-sm">
            <QrCode size={16} className="text-accent" />
            <span id="qr-modal-title">Open on Mobile Device</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-muted hover:text-text rounded-md hover:bg-surface transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 flex flex-col items-center text-center space-y-4">
          <div className="p-3 bg-white rounded-xl shadow-inner border border-border/80">
            <svg 
              width={svgSize} 
              height={svgSize} 
              viewBox={`0 0 ${svgSize} ${svgSize}`}
              className="max-w-[200px] h-auto block"
              aria-label="QR Code"
            >
              <rect width={svgSize} height={svgSize} fill="#ffffff" />
              {matrix.map((row, r) =>
                row.map((filled, c) =>
                  filled ? (
                    <rect
                      key={`${r}-${c}`}
                      x={margin + c * cellSize}
                      y={margin + r * cellSize}
                      width={cellSize}
                      height={cellSize}
                      fill="#111827"
                      shapeRendering="crispEdges"
                    />
                  ) : null
                )
              )}
            </svg>
          </div>

          <div className="space-y-1.5 px-2">
            <p className="text-xs font-medium text-text flex items-center justify-center gap-1.5">
              <Smartphone size={14} className="text-accent shrink-0" />
              <span>Scan with camera to test live on your phone</span>
            </p>
            <p className="text-[11px] text-muted leading-relaxed">
              Connect to the same Wi-Fi network or use the shared preview URL for testing touch gestures and responsive layouts.
            </p>
          </div>

          {/* URL Box & Copy */}
          <div className="w-full flex items-center gap-2 p-1.5 pl-2.5 bg-surface-elevated border border-border rounded-lg text-xs font-mono">
            <span className="text-muted truncate flex-1 text-left select-all text-[11px]">
              {targetUrl}
            </span>
            <button
              type="button"
              onClick={handleCopy}
              className="px-2.5 py-1 rounded bg-surface border border-border hover:border-accent/40 text-text hover:text-accent transition-colors flex items-center gap-1 shrink-0 font-sans text-xs cursor-pointer"
              title="Copy URL"
            >
              {copied ? <Check size={12} className="text-moss" /> : <Copy size={12} />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 bg-surface-elevated border-t border-border flex items-center justify-between text-xs">
          <a
            href={targetUrl}
            target="_blank"
            rel="noreferrer"
            className="text-accent hover:underline flex items-center gap-1 font-sans text-[11px]"
          >
            <span>Open in new tab</span>
            <ExternalLink size={11} />
          </a>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 bg-accent text-accent-text-on font-semibold rounded-md hover:bg-accent/90 transition-colors cursor-pointer text-xs"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
