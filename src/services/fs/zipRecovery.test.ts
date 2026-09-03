import { describe, expect, it, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '../../db';
import { importZip } from './zipImport';
import { listFiles } from './vfs';
import { recoverZip } from './zipRecovery';

function localZip(entries: Array<{ name: string; content: string }>): Uint8Array {
  const encoded = entries.map(entry => ({
    name: new TextEncoder().encode(entry.name),
    content: new TextEncoder().encode(entry.content),
  }));
  const totalSize = encoded.reduce((sum, entry) => sum + 30 + entry.name.length + entry.content.length, 0);
  const output = new Uint8Array(totalSize);
  const view = new DataView(output.buffer);
  let offset = 0;

  for (const entry of encoded) {
    view.setUint32(offset, 0x04034b50, true);
    view.setUint16(offset + 4, 20, true);
    view.setUint16(offset + 6, 0, true);
    view.setUint16(offset + 8, 0, true); // stored
    view.setUint32(offset + 18, entry.content.length, true);
    view.setUint32(offset + 22, entry.content.length, true);
    view.setUint16(offset + 26, entry.name.length, true);
    view.setUint16(offset + 28, 0, true);
    offset += 30;
    output.set(entry.name, offset);
    offset += entry.name.length;
    output.set(entry.content, offset);
    offset += entry.content.length;
  }

  return output;
}

describe('ZIP recovery', () => {
  beforeEach(async () => {
    await db.files.clear();
    await db.snapshots.clear();
  });

  it('recovers stored files when the central directory is completely missing', async () => {
    const zipWithoutCentralDirectory = localZip([
      { name: 'README.md', content: '# Recovered' },
      { name: 'src/main.ts', content: 'export const ok = true;' },
    ]);

    const result = await recoverZip(zipWithoutCentralDirectory);

    expect(result.files).toHaveLength(2);
    expect(result.files.map(file => file.path)).toEqual(['/README.md', '/src/main.ts']);
  });

  it('imports recovered files through the normal VFS path', async () => {
    const projectId = 'zip-recovery-import-test';
    const damagedArchive = localZip([
      { name: 'package.json', content: '{"name":"recovered"}' },
      { name: 'src/index.ts', content: 'export default 42;' },
    ]);

    const result = await importZip(damagedArchive, projectId, { autoRestructure: true });

    expect(result.recovered).toBe(true);
    expect(result.count).toBe(2);

    const files = await listFiles(projectId);
    expect(files.map(file => file.path).sort()).toEqual(['/package.json', '/src/index.ts']);
  });

  it('does not recover unsafe paths', async () => {
    const result = await recoverZip(localZip([
      { name: '../escape.txt', content: 'unsafe' },
      { name: 'safe.txt', content: 'safe' },
    ]));

    expect(result.files.map(file => file.path)).toEqual(['/safe.txt']);
    expect(result.skipped).toContain('../escape.txt');
  });

  it('rejects truncated entry data instead of importing partial content', async () => {
    const valid = localZip([{ name: 'truncated.txt', content: 'complete content' }]);
    const truncated = valid.slice(0, valid.length - 5);

    const result = await recoverZip(truncated);

    expect(result.files).toHaveLength(0);
    expect(result.skipped).toContain('truncated.txt');
  });
});
