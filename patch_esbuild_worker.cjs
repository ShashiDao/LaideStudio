const fs = require('fs');

let content = fs.readFileSync('src/services/bundler/esbuild.worker.ts', 'utf-8');

// Replace boolean guard with Promise guard
content = content.replace(
  'let initialized = false;',
  `let initialized = false;
let initPromise: Promise<void> | null = null;

async function ensureEsbuildInitialized(wasmUrl?: string): Promise<void> {
  if (initialized) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      if (wasmUrl) {
        const wasmRes = await fetch(wasmUrl);
        if (!wasmRes.ok) {
          throw new Error(\`Failed to fetch wasm binary from \${wasmUrl} (\${wasmRes.status} \${wasmRes.statusText})\`);
        }
        const wasmBytes = await wasmRes.arrayBuffer();
        const wasmModule = await WebAssembly.compile(wasmBytes);
        await esbuild.initialize({ wasmModule, worker: false });
      } else {
        await esbuild.initialize({ worker: false });
      }
    } catch (initErr) {
      console.warn('Direct wasmModule compilation failed, trying fallback with wasmURL:', initErr);
      await esbuild.initialize({ wasmURL: wasmUrl, worker: false });
    }
    initialized = true;
  })();

  try {
    await initPromise;
  } catch (err) {
    initPromise = null; // allow a later call to retry from scratch
    throw err;
  }
}`
);

const oldInitLogic = `        if (!initialized) {
          self.postMessage({ id, type: 'STATUS', status: 'Initializing compiler...' });                    try {            if (wasmUrl) {              // Direct binary fetch & WebAssembly module compilation to guarantee compiler binary bypasses plugin resolution/text-loaders              const wasmRes = await fetch(wasmUrl);              if (!wasmRes.ok) {                throw new Error(\`Failed to fetch wasm binary from \${wasmUrl} (\${wasmRes.status} \${wasmRes.statusText})\`);              }              const wasmBytes = await wasmRes.arrayBuffer();              const wasmModule = await WebAssembly.compile(wasmBytes);              await esbuild.initialize({                wasmModule,                worker: false              });            } else {              await esbuild.initialize({                worker: false              });            }          } catch (initErr) {            console.warn('Direct wasmModule compilation failed, trying fallback with wasmURL:', initErr);            await esbuild.initialize({              wasmURL: wasmUrl,              worker: false            });          }          initialized = true;        }`;

const oldInitLogicRegex = /if \(!initialized\) \{[\s\S]*?initialized = true;\s*\}/;

content = content.replace(oldInitLogicRegex, `        if (!initialized) {
          self.postMessage({ id, type: 'STATUS', status: 'Initializing compiler...' });
        }
        await ensureEsbuildInitialized(wasmUrl);`);

content = content.replace(
  'const code = result.outputFiles?.[0]?.text;',
  `const code = result.outputFiles?.[0]?.text;
        
        if (!result.outputFiles?.length || typeof result.outputFiles[0].text !== 'string' || result.outputFiles[0].text.trim() === '') {
          throw new Error('Build produced no output. Check that your entry point file exists and exports/renders something.');
        }`
);

fs.writeFileSync('src/services/bundler/esbuild.worker.ts', content);
