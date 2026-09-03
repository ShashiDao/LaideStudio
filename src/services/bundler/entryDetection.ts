import type { FileItem } from '../../db';

export interface BundledProjectInfo {
  isBundled: boolean;
  entryPoint: string | null;
  expectedEntries: string[];
}

export const DEFAULT_EXPECTED_ENTRIES = [
  '/src/main.tsx',
  '/src/index.tsx',
  '/src/main.jsx',
  '/src/index.jsx',
  '/src/main.ts',
  '/src/index.ts',
  '/src/main.js',
  '/src/index.js',
  '/src/App.tsx',
  '/src/App.vue',
  '/src/main.svelte',
  '/src/App.svelte'
];

function normalizePath(path: string): string {
  if (!path.startsWith('/')) path = '/' + path;
  return path.replace(/\/+/g, '/');
}

export function detectBundledProject(files: FileItem[]): BundledProjectInfo {
  const pkgFile = files.find(f => f.path === '/package.json');
  const viteConfigFile = files.find(f => 
    f.path === '/vite.config.ts' || 
    f.path === '/vite.config.js' || 
    f.path === '/vite.config.mjs' || 
    f.path === '/vite.config.cjs'
  );

  let isBundled = false;
  let customRoot = '';
  const explicitInputs: string[] = [];

  // 1. Any project with /package.json needs the bundler
  if (pkgFile) {
    isBundled = true;
  }

  // 2. Any project containing .jsx or .tsx files needs the bundler
  if (files.some(f => f.path.endsWith('.jsx') || f.path.endsWith('.tsx'))) {
    isBundled = true;
  }

  // 3. Check vite.config.{js,ts,mjs,cjs}
  if (viteConfigFile) {
    isBundled = true;
    const content = viteConfigFile.content;

    // Check root: '...' or root: "..."
    const rootMatch = content.match(/root\s*:\s*['"`]([^'"`]+)['"`]/);
    if (rootMatch && rootMatch[1]) {
      customRoot = rootMatch[1].trim().replace(/^\.\//, '').replace(/\/+$/, '');
    }

    // Check explicit build.rollupOptions.input (or input)
    // Direct string: input: 'src/main.ts'
    const directInputMatch = content.match(/input\s*:\s*['"`]([^'"`]+)['"`]/);
    if (directInputMatch && directInputMatch[1]) {
      explicitInputs.push(directInputMatch[1].trim());
    }

    // Object map: input: { main: 'src/main.tsx', ... } or resolve(__dirname, 'src/main.tsx')
    const objectInputMatch = content.match(/input\s*:\s*\{([^}]+)\}/s);
    if (objectInputMatch && objectInputMatch[1]) {
      const stringMatches = objectInputMatch[1].matchAll(/['"`]([^'"`]+\.[a-zA-Z0-9]+)['"`]/g);
      for (const m of stringMatches) {
        if (m[1]) {
          explicitInputs.push(m[1].trim());
        }
      }
    }

    // Array: input: ['src/main.tsx']
    const arrayInputMatch = content.match(/input\s*:\s*\[([^\]]+)\]/s);
    if (arrayInputMatch && arrayInputMatch[1]) {
      const stringMatches = arrayInputMatch[1].matchAll(/['"`]([^'"`]+)['"`]/g);
      for (const m of stringMatches) {
        if (m[1]) {
          explicitInputs.push(m[1].trim());
        }
      }
    }
  }

  if (!isBundled) {
    return {
      isBundled: false,
      entryPoint: null,
      expectedEntries: DEFAULT_EXPECTED_ENTRIES
    };
  }

  // 1. Check explicit inputs from vite.config
  for (const rawInput of explicitInputs) {
    let resolved = rawInput.replace(/^\.\//, '');
    if (customRoot && !resolved.startsWith(customRoot)) {
      resolved = `${customRoot}/${resolved}`;
    }
    const fullPath = normalizePath(resolved);
    if (files.some(f => f.path === fullPath)) {
      return {
        isBundled: true,
        entryPoint: fullPath,
        expectedEntries: DEFAULT_EXPECTED_ENTRIES
      };
    }
  }

  // 2. Check index.html <script type="module" src="...">
  const indexHtmlPaths = [
    customRoot ? `/${customRoot}/index.html` : '/index.html',
    '/index.html',
    '/public/index.html'
  ];

  for (const indexPath of indexHtmlPaths) {
    const indexFile = files.find(f => f.path === indexPath);
    if (indexFile) {
      const scriptModuleMatch = indexFile.content.match(/<script\b[^>]*\btype=['"]module['"][^>]*\bsrc=['"]([^'"]+)['"][^>]*>/i)
        || indexFile.content.match(/<script\b[^>]*\bsrc=['"]([^'"]+)['"][^>]*\btype=['"]module['"][^>]*>/i);
      
      if (scriptModuleMatch && scriptModuleMatch[1]) {
        const src = scriptModuleMatch[1].trim();
        if (!src.startsWith('http://') && !src.startsWith('https://') && !src.startsWith('//')) {
          if (src.startsWith('/')) {
            if (files.some(f => f.path === src)) {
              return {
                isBundled: true,
                entryPoint: src,
                expectedEntries: DEFAULT_EXPECTED_ENTRIES
              };
            }
          } else {
            const baseDir = indexPath.substring(0, indexPath.lastIndexOf('/') + 1);
            const resolved = normalizePath(baseDir + src);
            if (files.some(f => f.path === resolved)) {
              return {
                isBundled: true,
                entryPoint: resolved,
                expectedEntries: DEFAULT_EXPECTED_ENTRIES
              };
            }
          }
        }
      }
    }
  }

  // 3. Check candidate entry points
  const candidateEntries = [
    ...(customRoot ? [
      `/${customRoot}/src/main.tsx`,
      `/${customRoot}/src/index.tsx`,
      `/${customRoot}/src/main.jsx`,
      `/${customRoot}/src/index.jsx`,
      `/${customRoot}/src/main.ts`,
      `/${customRoot}/src/index.ts`,
      `/${customRoot}/src/main.js`,
      `/${customRoot}/src/index.js`,
      `/${customRoot}/main.tsx`,
      `/${customRoot}/index.tsx`,
      `/${customRoot}/main.jsx`,
      `/${customRoot}/index.jsx`,
      `/${customRoot}/main.ts`,
      `/${customRoot}/index.ts`,
      `/${customRoot}/main.js`,
      `/${customRoot}/index.js`,
      `/${customRoot}/App.tsx`,
      `/${customRoot}/App.jsx`,
      `/${customRoot}/App.vue`,
      `/${customRoot}/main.svelte`,
      `/${customRoot}/App.svelte`
    ] : []),
    ...DEFAULT_EXPECTED_ENTRIES,
    '/main.tsx',
    '/index.tsx',
    '/main.jsx',
    '/index.jsx',
    '/main.ts',
    '/index.ts',
    '/main.js',
    '/index.js',
    '/App.tsx',
    '/App.jsx'
  ];

  for (const candidate of candidateEntries) {
    if (files.some(f => f.path === candidate)) {
      return {
        isBundled: true,
        entryPoint: candidate,
        expectedEntries: DEFAULT_EXPECTED_ENTRIES
      };
    }
  }

  return {
    isBundled: true,
    entryPoint: null,
    expectedEntries: DEFAULT_EXPECTED_ENTRIES
  };
}
