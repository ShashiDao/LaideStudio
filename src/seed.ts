import { db, type Project, type FileItem } from './db';
import { getAllFileContent, writeOpfsFile, isOpfsSupported } from './services/fs/vfs';

export async function seedDemoData() {
  const existingProjectsCount = await db.projects.count();
  if (existingProjectsCount > 0) {
    console.log('[Seed] Database already contains project data.');
    return;
  }

  const now = Date.now();
  const demoProjectId = 'demo-project-1';

  const demoProject: Project = {
    id: demoProjectId,
    name: 'Demo Studio Project',
    createdAt: now,
    updatedAt: now,
  };

  const file1: FileItem = {
    id: 'file-1',
    projectId: demoProjectId,
    path: '/src/main.ts',
    content: '// Demo main TypeScript file\nconsole.log("Hello from LAIDE Studio Demo Project!");',
    updatedAt: now,
  };

  const file2: FileItem = {
    id: 'file-2',
    projectId: demoProjectId,
    path: '/README.md',
    content: '# Demo Studio Project\nWelcome to LAIDE Studio local workspace.',
    updatedAt: now,
  };

  await db.projects.put(demoProject);
  const dbFiles = isOpfsSupported() ? [
    { ...file1, content: '' },
    { ...file2, content: '' }
  ] : [file1, file2];
  await db.files.bulkPut(dbFiles);

  if (isOpfsSupported()) {
    await writeOpfsFile(demoProjectId, file1.path, file1.content);
    await writeOpfsFile(demoProjectId, file2.path, file2.content);
  }

  console.log('[Seed] Demo project and files created successfully.');
}

export async function testDatabaseReadback() {
  await seedDemoData();

  const projects = await db.projects.toArray();
  const files = await getAllFileContent('demo-project-1');

  return {
    projects,
    files,
    success: projects.length > 0 && files.length === 2,
  };
}
