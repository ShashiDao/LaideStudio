import { db, type Project, type FileItem } from './db';

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
  await db.files.bulkPut([file1, file2]);

  console.log('[Seed] Demo project and files created successfully.');
}

export async function testDatabaseReadback() {
  await seedDemoData();

  const projects = await db.projects.toArray();
  const files = await db.files.where('projectId').equals('demo-project-1').toArray();

  return {
    projects,
    files,
    success: projects.length > 0 && files.length === 2,
  };
}
