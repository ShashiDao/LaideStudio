import type { FileItem, Project } from '../../db';
import { db } from '../../db';
import { createFile, generateId, listFiles } from '../fs/vfs';

export interface ProjectTemplateFile {
  path: string;
  content: string;
}

export type TemplateId = 'react-ts' | 'tailwind-css' | 'empty' | 'vanilla-js';

export interface ProjectTemplate {
  id: TemplateId;
  name: string;
  badge?: string;
  description: string;
  iconName: 'react' | 'tailwind' | 'empty' | 'javascript';
  defaultProjectName: string;
  tags: string[];
  fileListSummary: string[];
  files: ProjectTemplateFile[];
}

export const PROJECT_TEMPLATES: ProjectTemplate[] = [
  {
    id: 'react-ts',
    name: 'React TypeScript',
    badge: 'Popular',
    description: 'React 19 + TypeScript starter skeleton with modular components and styling.',
    iconName: 'react',
    defaultProjectName: 'React TS App',
    tags: ['React 19', 'TypeScript', 'Vite'],
    fileListSummary: ['package.json', 'index.html', 'src/App.tsx', 'src/main.tsx', 'src/index.css', 'README.md'],
    files: [
      {
        path: '/package.json',
        content: JSON.stringify(
          {
            name: 'react-ts-starter',
            private: true,
            version: '0.0.0',
            type: 'module',
            scripts: {
              dev: 'vite',
              build: 'tsc && vite build',
              preview: 'vite preview',
            },
            dependencies: {
              react: '^19.0.0',
              'react-dom': '^19.0.0',
              'lucide-react': '^0.546.0',
            },
            devDependencies: {
              '@types/react': '^19.0.0',
              '@types/react-dom': '^19.0.0',
              '@vitejs/plugin-react': '^4.3.0',
              typescript: '~5.8.0',
              vite: '^6.0.0',
            },
          },
          null,
          2
        ),
      },
      {
        path: '/index.html',
        content: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>React + TypeScript App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`,
      },
      {
        path: '/src/main.tsx',
        content: `import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}`,
      },
      {
        path: '/src/App.tsx',
        content: `import React, { useState } from 'react';

export default function App() {
  const [count, setCount] = useState(0);

  return (
    <div className="container">
      <div className="card">
        <div className="badge">React 19 + TypeScript</div>
        <h1>React Starter</h1>
        <p className="description">
          Edit <code>src/App.tsx</code> to see live updates in the preview.
        </p>
        <div className="counter-box">
          <button
            onClick={() => setCount((c) => c + 1)}
            className="counter-btn"
          >
            Count: {count}
          </button>
          <button
            onClick={() => setCount(0)}
            className="reset-btn"
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}`,
      },
      {
        path: '/src/index.css',
        content: `:root {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
  color: #f8fafc;
  background-color: #090d16;
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
}

.container {
  width: 100%;
  max-width: 480px;
  padding: 24px;
}

.card {
  background: #131b2e;
  border: 1px solid #1e293b;
  border-radius: 16px;
  padding: 32px 24px;
  text-align: center;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
}

.badge {
  display: inline-block;
  font-size: 11px;
  font-weight: 600;
  color: #38bdf8;
  background: rgba(56, 189, 248, 0.12);
  border: 1px solid rgba(56, 189, 248, 0.25);
  border-radius: 9999px;
  padding: 4px 12px;
  margin-bottom: 16px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

h1 {
  font-size: 28px;
  font-weight: 700;
  margin-bottom: 8px;
  color: #ffffff;
}

.description {
  color: #94a3b8;
  font-size: 14px;
  margin-bottom: 24px;
  line-height: 1.5;
}

code {
  background: #0f172a;
  color: #38bdf8;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 13px;
  font-family: monospace;
}

.counter-box {
  display: flex;
  gap: 12px;
  justify-content: center;
}

.counter-btn {
  background: #0284c7;
  color: #ffffff;
  border: none;
  padding: 10px 20px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s ease, transform 0.1s ease;
}

.counter-btn:hover {
  background: #0369a1;
  transform: translateY(-1px);
}

.counter-btn:active {
  transform: translateY(1px);
}

.reset-btn {
  background: transparent;
  color: #94a3b8;
  border: 1px solid #334155;
  padding: 10px 16px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.reset-btn:hover {
  color: #f1f5f9;
  border-color: #475569;
  background: rgba(255, 255, 255, 0.05);
}`,
      },
      {
        path: '/README.md',
        content: `# React TypeScript Starter

A modern starter skeleton configured with React 19 and TypeScript.

## Getting Started
- Edit \`src/App.tsx\` to build your components.
- Switch to the **Preview** tab to see your live changes instantly.
`,
      },
    ],
  },
  {
    id: 'tailwind-css',
    name: 'Tailwind CSS',
    badge: 'Recommended',
    description: 'Utility-first styling with Tailwind CSS v4 and interactive React components.',
    iconName: 'tailwind',
    defaultProjectName: 'Tailwind App',
    tags: ['Tailwind v4', 'React 19', 'Modern UI'],
    fileListSummary: ['package.json', 'index.html', 'src/App.tsx', 'src/main.tsx', 'src/index.css', 'README.md'],
    files: [
      {
        path: '/package.json',
        content: JSON.stringify(
          {
            name: 'tailwind-starter',
            private: true,
            version: '0.0.0',
            type: 'module',
            scripts: {
              dev: 'vite',
              build: 'vite build',
              preview: 'vite preview',
            },
            dependencies: {
              react: '^19.0.0',
              'react-dom': '^19.0.0',
              'lucide-react': '^0.546.0',
            },
            devDependencies: {
              '@types/react': '^19.0.0',
              '@types/react-dom': '^19.0.0',
              '@tailwindcss/vite': '^4.0.0',
              tailwindcss: '^4.0.0',
              typescript: '~5.8.0',
              vite: '^6.0.0',
            },
          },
          null,
          2
        ),
      },
      {
        path: '/index.html',
        content: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Tailwind CSS App</title>
  </head>
  <body class="bg-zinc-950 text-zinc-100 min-h-screen">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`,
      },
      {
        path: '/src/main.tsx',
        content: `import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}`,
      },
      {
        path: '/src/App.tsx',
        content: `import React, { useState } from 'react';
import { Sparkles, Zap, Shield, Rocket } from 'lucide-react';

export default function App() {
  const [selected, setSelected] = useState(0);

  const cards = [
    { title: 'Tailwind CSS v4', desc: 'Utility-first styling with fast compilation', icon: Zap },
    { title: 'Interactive State', desc: 'React 19 hooks and instant reactivity', icon: Sparkles },
    { title: 'Zero Config', desc: 'Pre-configured modern web workspace', icon: Rocket }
  ];

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <Shield className="w-3.5 h-3.5" />
            <span>Tailwind CSS Starter</span>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            Tailwind Starter Skeleton
          </h1>
          <p className="text-xs text-zinc-400">
            Click cards below to test interactive state.
          </p>
        </div>

        <div className="space-y-3">
          {cards.map((card, i) => {
            const Icon = card.icon;
            const active = selected === i;
            return (
              <div
                key={card.title}
                onClick={() => setSelected(i)}
                className={\`p-4 rounded-xl border transition-all cursor-pointer flex items-center gap-3.5 \${
                  active
                    ? 'bg-emerald-950/40 border-emerald-500/50 shadow-md shadow-emerald-950/50'
                    : 'bg-zinc-900/60 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900'
                }\`}
              >
                <div className={\`p-2 rounded-lg \${active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-800 text-zinc-400'}\`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white">{card.title}</h3>
                  <p className="text-xs text-zinc-400">{card.desc}</p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="p-3.5 rounded-xl bg-zinc-900/40 border border-zinc-800 text-center">
          <p className="text-xs text-zinc-400">
            Edit <span className="font-mono text-emerald-400">src/App.tsx</span> to start creating!
          </p>
        </div>
      </div>
    </div>
  );
}`,
      },
      {
        path: '/src/index.css',
        content: `@import "tailwindcss";`,
      },
      {
        path: '/README.md',
        content: `# Tailwind CSS Starter

A modern starter skeleton configured with Tailwind CSS and React.

## Features
- Utility-first CSS configured out-of-the-box
- Interactive cards and components
- Live preview hot updates
`,
      },
    ],
  },
  {
    id: 'empty',
    name: 'Empty Project',
    badge: 'Minimal',
    description: 'Clean slate with minimal files. Perfect for custom architectures or blank setups.',
    iconName: 'empty',
    defaultProjectName: 'Empty Workspace',
    tags: ['Minimal', 'Clean Slate'],
    fileListSummary: ['README.md', 'index.html', 'src/main.ts'],
    files: [
      {
        path: '/README.md',
        content: `# Empty Workspace

A clean workspace with no preset frameworks or opinionated configurations.

## Getting Started
- Add files or folders using the Files explorer.
- Switch to the Editor to write code.
`,
      },
      {
        path: '/index.html',
        content: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Empty Workspace</title>
  </head>
  <body>
    <h1>Empty Workspace</h1>
    <p>Create files or import code to begin.</p>
  </body>
</html>`,
      },
      {
        path: '/src/main.ts',
        content: `// Empty project entry point
console.log('Clean workspace initialized.');
`,
      },
    ],
  },
  {
    id: 'vanilla-js',
    name: 'Vanilla HTML / JS',
    badge: 'Lightweight',
    description: 'Classic HTML5, CSS3, and modern JavaScript without framework overhead.',
    iconName: 'javascript',
    defaultProjectName: 'Vanilla Web App',
    tags: ['HTML5', 'CSS3', 'JavaScript'],
    fileListSummary: ['index.html', 'style.css', 'main.js', 'README.md'],
    files: [
      {
        path: '/index.html',
        content: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Vanilla Web App</title>
    <link rel="stylesheet" href="/style.css" />
  </head>
  <body>
    <main class="card">
      <span class="badge">Vanilla Web</span>
      <h1>Hello, World!</h1>
      <p>Clean HTML5, CSS3, and modern JavaScript without framework overhead.</p>
      <button id="btn">Clicked 0 times</button>
    </main>
    <script type="module" src="/main.js"></script>
  </body>
</html>`,
      },
      {
        path: '/style.css',
        content: `body {
  margin: 0;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #0f172a;
  color: #f8fafc;
  font-family: system-ui, -apple-system, sans-serif;
}
.card {
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 12px;
  padding: 32px;
  text-align: center;
  max-width: 400px;
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.4);
}
.badge {
  display: inline-block;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  color: #f59e0b;
  background: rgba(245, 158, 11, 0.15);
  border: 1px solid rgba(245, 158, 11, 0.3);
  padding: 3px 10px;
  border-radius: 9999px;
  margin-bottom: 16px;
}
h1 { margin: 0 0 8px; font-size: 24px; }
p { color: #94a3b8; font-size: 14px; margin-bottom: 20px; line-height: 1.5; }
button {
  background: #f59e0b;
  color: #0f172a;
  border: none;
  padding: 10px 18px;
  border-radius: 6px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s ease;
}
button:hover { background: #fbbf24; }`,
      },
      {
        path: '/main.js',
        content: `let count = 0;
const btn = document.getElementById('btn');
if (btn) {
  btn.addEventListener('click', () => {
    count++;
    btn.textContent = \`Clicked \${count} times\`;
  });
}`,
      },
      {
        path: '/README.md',
        content: `# Vanilla Web App

A lightweight HTML5, CSS3, and Vanilla JavaScript project.
`,
      },
    ],
  },
];

export function getTemplateById(id: TemplateId): ProjectTemplate {
  const found = PROJECT_TEMPLATES.find((t) => t.id === id);
  if (!found) {
    return PROJECT_TEMPLATES[0];
  }
  return found;
}

export async function createProjectFromTemplate(
  projectName: string,
  templateId: TemplateId
): Promise<{ project: Project; files: FileItem[] }> {
  const template = getTemplateById(templateId);
  const trimmedName = projectName.trim() || template.defaultProjectName;
  const newProjId = generateId();

  const newProj: Project = {
    id: newProjId,
    name: trimmedName,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  // Save project in Dexie
  await db.projects.put(newProj);

  // Write all template files in parallel into VFS (OPFS + Dexie)
  await Promise.all(
    template.files.map((file) => createFile(newProjId, file.path, file.content))
  );

  const createdFiles = await listFiles(newProjId);

  return {
    project: newProj,
    files: createdFiles,
  };
}
