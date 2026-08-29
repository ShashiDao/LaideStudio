// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ImageViewerModal, isImageFile, getImageSrc } from './ImageViewerModal';
import type { FileItem } from '../../db';

describe('ImageViewerModal & Image Helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cleanup();
  });

  afterEach(() => {
    cleanup();
  });

  describe('isImageFile', () => {
    it('returns true for common image file extensions case-insensitively', () => {
      expect(isImageFile('avatar.png')).toBe(true);
      expect(isImageFile('PHOTO.PNG')).toBe(true);
      expect(isImageFile('/assets/hero.jpg')).toBe(true);
      expect(isImageFile('/assets/hero.jpeg')).toBe(true);
      expect(isImageFile('/icons/badge.svg')).toBe(true);
      expect(isImageFile('spinner.gif')).toBe(true);
      expect(isImageFile('banner.webp')).toBe(true);
      expect(isImageFile('favicon.ico')).toBe(true);
      expect(isImageFile('bitmap.bmp')).toBe(true);
    });

    it('returns false for non-image file extensions', () => {
      expect(isImageFile('App.tsx')).toBe(false);
      expect(isImageFile('index.html')).toBe(false);
      expect(isImageFile('package.json')).toBe(false);
      expect(isImageFile('style.css')).toBe(false);
      expect(isImageFile('')).toBe(false);
    });
  });

  describe('getImageSrc', () => {
    it('returns data URI directly if content already starts with data:', () => {
      const file: FileItem = {
        id: 'f-img-1',
        projectId: 'p-1',
        path: '/public/image.png',
        content: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        updatedAt: 1000,
      };
      expect(getImageSrc(file)).toBe(file.content);
    });

    it('formats raw SVG XML into utf-8 encoded data URI', () => {
      const file: FileItem = {
        id: 'f-svg-1',
        projectId: 'p-1',
        path: '/icons/star.svg',
        content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><polygon points="12,2 15,9 22,9 17,14 19,21 12,17 5,21 7,14 2,9 9,9"/></svg>',
        updatedAt: 1000,
      };
      const src = getImageSrc(file);
      expect(src.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true);
      expect(src).toContain(encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg"'));
    });

    it('formats base64 PNG content into image/png data URI', () => {
      const file: FileItem = {
        id: 'f-png-1',
        projectId: 'p-1',
        path: '/assets/logo.png',
        content: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk',
        updatedAt: 1000,
      };
      expect(getImageSrc(file)).toBe('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk');
    });

    it('formats base64 JPG content into image/jpeg data URI', () => {
      const file: FileItem = {
        id: 'f-jpg-1',
        projectId: 'p-1',
        path: '/assets/bg.jpg',
        content: '/9j/4AAQSkZJRgABAQEASABIAAD',
        updatedAt: 1000,
      };
      expect(getImageSrc(file)).toBe('data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD');
    });
  });

  describe('ImageViewerModal Component UI & Interactions', () => {
    const samplePng: FileItem = {
      id: 'f-1',
      projectId: 'p-1',
      path: '/public/logo.png',
      content: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      updatedAt: 1000,
    };

    const sampleSvg: FileItem = {
      id: 'f-2',
      projectId: 'p-1',
      path: '/icons/vector.svg',
      content: '<svg xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10"/></svg>',
      updatedAt: 1000,
    };

    it('renders null when file is not provided', () => {
      const { container } = render(<ImageViewerModal file={null} onClose={vi.fn()} />);
      expect(container.firstChild).toBeNull();
    });

    it('renders modal dialog with filename, format badge, and path', () => {
      render(<ImageViewerModal file={samplePng} onClose={vi.fn()} />);

      expect(screen.getByRole('dialog')).toBeDefined();
      expect(screen.getByText('logo.png')).toBeDefined();
      expect(screen.getByText('PNG')).toBeDefined();
      expect(screen.getByText('/public/logo.png')).toBeDefined();
      expect(screen.getByText('100%')).toBeDefined();
    });

    it('supports zoom in, zoom out, and reset zoom actions', () => {
      render(<ImageViewerModal file={samplePng} onClose={vi.fn()} />);

      const zoomInBtn = screen.getByTitle('Zoom in (+)');
      const zoomOutBtn = screen.getByTitle('Zoom out (-)');
      const resetBtn = screen.getByTitle('Reset zoom and rotation (0)');

      // Initial zoom is 100%
      expect(screen.getByText('100%')).toBeDefined();

      // Zoom in
      fireEvent.click(zoomInBtn);
      expect(screen.getByText('125%')).toBeDefined();

      // Zoom out twice
      fireEvent.click(zoomOutBtn);
      expect(screen.getByText('100%')).toBeDefined();
      fireEvent.click(zoomOutBtn);
      expect(screen.getByText('80%')).toBeDefined();

      // Reset zoom
      fireEvent.click(resetBtn);
      expect(screen.getByText('100%')).toBeDefined();
    });

    it('supports rotating image clockwise', () => {
      render(<ImageViewerModal file={samplePng} onClose={vi.fn()} />);

      const rotateBtn = screen.getByTitle('Rotate 90° clockwise (R)');
      fireEvent.click(rotateBtn);

      const img = screen.getByAltText('logo.png');
      expect(img).toBeDefined();
    });

    it('calls onClose when close button is clicked or Escape key pressed', () => {
      const onClose = vi.fn();
      render(<ImageViewerModal file={samplePng} onClose={onClose} />);

      const closeBtn = screen.getByLabelText('Close image viewer');
      fireEvent.click(closeBtn);
      expect(onClose).toHaveBeenCalledTimes(1);

      // Keyboard escape
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(onClose).toHaveBeenCalledTimes(2);
    });

    it('handles keyboard shortcuts (+, -, 0, r)', () => {
      render(<ImageViewerModal file={samplePng} onClose={vi.fn()} />);

      expect(screen.getByText('100%')).toBeDefined();

      // '+' to zoom in
      fireEvent.keyDown(window, { key: '+' });
      expect(screen.getByText('125%')).toBeDefined();

      // '-' to zoom out
      fireEvent.keyDown(window, { key: '-' });
      expect(screen.getByText('100%')).toBeDefined();

      // '0' to reset
      fireEvent.keyDown(window, { key: '+' });
      expect(screen.getByText('125%')).toBeDefined();
      fireEvent.keyDown(window, { key: '0' });
      expect(screen.getByText('100%')).toBeDefined();
    });

    it('renders vector label for SVG files', () => {
      render(<ImageViewerModal file={sampleSvg} onClose={vi.fn()} />);

      expect(screen.getByText('Vector SVG')).toBeDefined();
      expect(screen.getByText('SVG')).toBeDefined();
    });

    it('calls onDownload when download button is clicked', () => {
      const onDownload = vi.fn();
      render(<ImageViewerModal file={samplePng} onClose={vi.fn()} onDownload={onDownload} />);

      const downloadBtn = screen.getByTitle('Download image');
      fireEvent.click(downloadBtn);

      expect(onDownload).toHaveBeenCalledWith(samplePng);
    });
  });
});
