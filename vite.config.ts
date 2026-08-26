import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'prompt',
        injectRegister: 'auto',
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,json,woff,woff2}'],
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api/],
          maximumFileSizeToCacheInBytes: 25 * 1024 * 1024,
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'gstatic-fonts-cache',
                expiration: {
                  maxEntries: 30,
                  maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        },
        includeAssets: ['icon.svg'],
        manifest: {
          name: 'LAIDE Studio',
          short_name: 'LAIDE',
          description: 'Client-side workspace and code studio with local VFS',
          theme_color: '#0e0f12',
          background_color: '#0e0f12',
          display: 'standalone',
          orientation: 'portrait',
          icons: [
            {
              src: '/icon.svg',
              sizes: 'any',
              type: 'image/svg+xml',
              purpose: 'any maskable'
            }
          ]
        }
      })
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      target: 'es2022',
      cssCodeSplit: true,
      sourcemap: false,
      chunkSizeWarningLimit: 1500,
      modulePreload: {
        // vendor-charts (recharts) is only used by the lazy-loaded
        // ProjectMetadataPanel. Vite's default preloading would otherwise
        // fetch it on every initial page load "just in case" — skip that
        // for chunks that are genuinely optional on first paint, since
        // this app targets phones on cellular connections.
        resolveDependencies: (_filename, deps) =>
          deps.filter((dep) => !dep.includes('vendor-charts')),
      },
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/') || id.includes('node_modules/zustand/')) {
              return 'vendor-react-core';
            }
            if (id.includes('node_modules/gpt-tokenizer')) {
              return 'vendor-tokenizer';
            }
            if (id.includes('node_modules/jszip')) {
              return 'vendor-jszip';
            }
            if (id.includes('node_modules/diff')) {
              return 'vendor-diff';
            }
            if (id.includes('node_modules/recharts')) {
              return 'vendor-charts';
            }
            if (id.includes('node_modules/hash-wasm')) {
              return 'vendor-crypto';
            }
            if (id.includes('node_modules/@uiw') || id.includes('node_modules/@codemirror') || id.includes('node_modules/@lezer')) {
              return 'vendor-codemirror';
            }
          }
        }
      }
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      host: '0.0.0.0',
      port: 3000,
      allowedHosts: true,
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
