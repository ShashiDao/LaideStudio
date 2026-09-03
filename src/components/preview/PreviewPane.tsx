import React, { useMemo } from 'react';
import {
  SandpackProvider,
  SandpackPreview,
} from '@codesandbox/sandpack-react';
import type { SandpackPredefinedTemplate } from '@codesandbox/sandpack-react';
import type { FileItem } from '../../db';

export type SupportedSandpackTemplate = 'react' | 'react-ts' | 'static' | 'vanilla';

export interface PreviewPaneProps {
  files: FileItem[];
  template?: SupportedSandpackTemplate;
  showNavigator?: boolean;
  showRefreshButton?: boolean;
  className?: string;
  recompileDelay?: number;
}

/**
 * Dynamically selects Sandpack template based on file extensions and presence of package.json.
 */
export function detectSandpackTemplate(files: FileItem[]): SupportedSandpackTemplate {
  const hasTs = files.some(f => f.path.endsWith('.ts') || f.path.endsWith('.tsx'));
  const hasJsx = files.some(f => f.path.endsWith('.jsx') || f.path.endsWith('.tsx'));

  // Check package.json for react dependency
  const pkgFile = files.find(f => {
    const norm = f.path.startsWith('/') ? f.path : `/${f.path}`;
    return norm === '/package.json';
  });

  let hasReact = hasJsx;
  const hasPkg = Boolean(pkgFile);

  if (pkgFile) {
    try {
      const parsed = JSON.parse(pkgFile.content);
      if (
        parsed?.dependencies?.react ||
        parsed?.devDependencies?.react ||
        parsed?.peerDependencies?.react
      ) {
        hasReact = true;
      }
    } catch {
      // ignore JSON parse errors
    }
  }

  if (hasReact) {
    return hasTs ? 'react-ts' : 'react';
  }

  if (hasTs) {
    return 'react-ts';
  }

  const hasJs = files.some(f => f.path.endsWith('.js'));
  if (hasPkg || hasJs) {
    return 'vanilla';
  }

  return 'static';
}

/**
 * Normalizes file paths to ensure a leading slash as expected by Sandpack.
 */
export function normalizeSandpackFiles(files: FileItem[]): Record<string, { code: string }> {
  const normalized: Record<string, { code: string }> = {};

  for (const file of files) {
    if (!file.path) continue;
    const pathWithSlash = file.path.startsWith('/') ? file.path : `/${file.path}`;
    normalized[pathWithSlash] = {
      code: file.content ?? ''
    };
  }

  return normalized;
}

/**
 * Extracts custom dependencies declared in package.json if present.
 */
export function extractDependenciesFromPackageJson(files: FileItem[]): Record<string, string> {
  const pkgFile = files.find(f => {
    const norm = f.path.startsWith('/') ? f.path : `/${f.path}`;
    return norm === '/package.json';
  });

  if (!pkgFile) return {};

  try {
    const parsed = JSON.parse(pkgFile.content);
    return {
      ...(parsed.dependencies || {}),
      ...(parsed.devDependencies || {})
    };
  } catch {
    return {};
  }
}

/**
 * PreviewPane component using Sandpack for automatic bundling, CDN dependency resolution,
 * and hot reload.
 */
export const PreviewPane: React.FC<PreviewPaneProps> = ({
  files,
  template: templateOverride,
  showNavigator = false,
  showRefreshButton = true,
  className = 'w-full h-full min-h-[300px]',
  recompileDelay = 300,
}) => {
  const detectedTemplate = useMemo(() => detectSandpackTemplate(files), [files]);
  const activeTemplate = templateOverride || detectedTemplate;

  const sandpackFiles = useMemo(() => normalizeSandpackFiles(files), [files]);
  const customDependencies = useMemo(() => extractDependenciesFromPackageJson(files), [files]);

  const isDarkMode = typeof document !== 'undefined' &&
    document.documentElement.classList.contains('dark');

  return (
    <div
      data-testid="sandpack-preview-pane"
      className={`relative w-full h-full flex flex-col bg-neutral-900 overflow-hidden ${className}`}
    >
      <SandpackProvider
        template={activeTemplate as SandpackPredefinedTemplate}
        files={sandpackFiles}
        theme={isDarkMode ? 'dark' : 'light'}
        customSetup={
          Object.keys(customDependencies).length > 0
            ? { dependencies: customDependencies }
            : undefined
        }
        options={{
          recompileMode: 'delayed',
          recompileDelay,
          autorun: true,
        }}
      >
        <SandpackPreview
          showNavigator={showNavigator}
          showRefreshButton={showRefreshButton}
          showOpenInCodeSandbox={false}
          showRestartButton={true}
          style={{ height: '100%', width: '100%', flex: 1 }}
        />
      </SandpackProvider>
    </div>
  );
};

export default PreviewPane;
