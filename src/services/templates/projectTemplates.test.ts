// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '../../db';
import { 
  PROJECT_TEMPLATES, 
  getTemplateById, 
  createProjectFromTemplate 
} from './projectTemplates';
import { listFiles } from '../fs/vfs';

describe('projectTemplates service', () => {
  beforeEach(async () => {
    await db.projects.clear();
    await db.files.clear();
    await db.snapshots.clear();
  });

  it('defines all required predefined templates', () => {
    const templateIds = PROJECT_TEMPLATES.map(t => t.id);
    expect(templateIds).toContain('react-ts');
    expect(templateIds).toContain('tailwind-css');
    expect(templateIds).toContain('empty');
    expect(templateIds).toContain('vanilla-js');

    const reactTemplate = PROJECT_TEMPLATES.find(t => t.id === 'react-ts')!;
    expect(reactTemplate.name).toBe('React TypeScript');
    expect(reactTemplate.files.some(f => f.path === '/package.json')).toBe(true);
    expect(reactTemplate.files.some(f => f.path === '/src/App.tsx')).toBe(true);
    expect(reactTemplate.files.some(f => f.path === '/index.html')).toBe(true);

    const tailwindTemplate = PROJECT_TEMPLATES.find(t => t.id === 'tailwind-css')!;
    expect(tailwindTemplate.name).toBe('Tailwind CSS');
    expect(tailwindTemplate.files.some(f => f.path === '/src/index.css')).toBe(true);

    const emptyTemplate = PROJECT_TEMPLATES.find(t => t.id === 'empty')!;
    expect(emptyTemplate.name).toBe('Empty Project');
    expect(emptyTemplate.files.some(f => f.path === '/README.md')).toBe(true);
  });

  it('getTemplateById returns the matching template or fallback', () => {
    expect(getTemplateById('tailwind-css').name).toBe('Tailwind CSS');
    expect(getTemplateById('empty').name).toBe('Empty Project');
    // @ts-expect-error test fallback
    expect(getTemplateById('non-existent')).toBeDefined();
  });

  it('createProjectFromTemplate initializes React TypeScript project with all skeleton files', async () => {
    const result = await createProjectFromTemplate('My React App', 'react-ts');
    expect(result.project.name).toBe('My React App');
    expect(result.project.id).toBeDefined();

    const storedProject = await db.projects.get(result.project.id);
    expect(storedProject).toBeDefined();
    expect(storedProject?.name).toBe('My React App');

    const files = await listFiles(result.project.id);
    expect(files.length).toBeGreaterThanOrEqual(5);

    const appFile = files.find(f => f.path === '/src/App.tsx');
    expect(appFile).toBeDefined();
    expect(appFile?.content).toContain('React 19 + TypeScript');

    const pkgFile = files.find(f => f.path === '/package.json');
    expect(pkgFile).toBeDefined();
    expect(pkgFile?.content).toContain('react-ts-starter');
  });

  it('createProjectFromTemplate initializes Tailwind CSS template', async () => {
    const result = await createProjectFromTemplate('My Tailwind App', 'tailwind-css');
    expect(result.project.name).toBe('My Tailwind App');

    const files = await listFiles(result.project.id);
    const cssFile = files.find(f => f.path === '/src/index.css');
    expect(cssFile).toBeDefined();
    expect(cssFile?.content).toContain('@import "tailwindcss"');
  });

  it('createProjectFromTemplate initializes Empty Project template', async () => {
    const result = await createProjectFromTemplate('Clean Slate', 'empty');
    expect(result.project.name).toBe('Clean Slate');

    const files = await listFiles(result.project.id);
    expect(files.length).toBe(3);
    expect(files.some(f => f.path === '/README.md')).toBe(true);
    expect(files.some(f => f.path === '/index.html')).toBe(true);
    expect(files.some(f => f.path === '/src/main.ts')).toBe(true);
  });

  it('falls back to default template name if project name is blank', async () => {
    const result = await createProjectFromTemplate('   ', 'react-ts');
    expect(result.project.name).toBe('React TS App');
  });
});
