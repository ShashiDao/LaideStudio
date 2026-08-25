import JSZip from 'jszip';
import { listFiles } from './vfs';

export const binaryExtensions = [
  '.png', '.jpg', '.jpeg', '.gif', '.ico', 
  '.webp', '.pdf', '.ttf', '.woff', '.woff2', 
  '.eot', '.mp4', '.mp3', '.wav', '.zip'
];

export const ZIP_EXPORT_EXCLUDED_FILES = [
  'package-lock.json',
  'ai_changelog.md'
];

export function isExcludedFromZipExport(filePath: string): boolean {
  const relativePath = filePath.startsWith('/') ? filePath.substring(1) : filePath;
  const fileName = relativePath.split('/').pop() || relativePath;
  return ZIP_EXPORT_EXCLUDED_FILES.includes(fileName.toLowerCase()) || 
         ZIP_EXPORT_EXCLUDED_FILES.includes(relativePath.toLowerCase());
}

export async function exportZip(projectId: string): Promise<Blob> {
  const zip = new JSZip();
  const files = await listFiles(projectId);

  for (const file of files) {
    const relativePath = file.path.startsWith('/') ? file.path.substring(1) : file.path;
    
    if (isExcludedFromZipExport(relativePath)) {
      continue;
    }

    const isBinary = binaryExtensions.some(ext => relativePath.toLowerCase().endsWith(ext));
    
    if (isBinary) {
      zip.file(relativePath, file.content, { base64: true });
    } else {
      zip.file(relativePath, file.content);
    }
  }

  return await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });
}

