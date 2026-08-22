import JSZip from 'jszip';
import { listFiles } from './vfs';

export const binaryExtensions = [
  '.png', '.jpg', '.jpeg', '.gif', '.ico', 
  '.webp', '.pdf', '.ttf', '.woff', '.woff2', 
  '.eot', '.mp4', '.mp3', '.wav', '.zip'
];

export async function exportZip(projectId: string): Promise<Blob> {
  const zip = new JSZip();
  const files = await listFiles(projectId);

  for (const file of files) {
    const relativePath = file.path.startsWith('/') ? file.path.substring(1) : file.path;
    
    const isBinary = binaryExtensions.some(ext => relativePath.toLowerCase().endsWith(ext));
    
    if (isBinary) {
      zip.file(relativePath, file.content, { base64: true });
    } else {
      zip.file(relativePath, file.content);
    }
  }

  return await zip.generateAsync({ type: 'blob' });
}
