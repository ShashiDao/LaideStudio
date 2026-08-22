# LAIDE Studio

A local-first, privacy-focused in-browser AI development environment and progressive web app (PWA). LAIDE Studio runs an agentic coding loop, virtual file system, in-browser bundler with live preview, and encrypted credential vault entirely on the client.

## Features

- **Client-Side Encrypted Vault**: Passphrase-derived master encryption (PBKDF2 + AES-GCM) with passkey support and BIP-39 recovery phrases. All API keys and GitHub tokens are encrypted locally in IndexedDB.
- **Multi-Provider LLM Integration**: Connect to Google Gemini, Anthropic Claude, OpenAI, or any OpenAI-compatible API (e.g. OpenRouter, Groq, Ollama, DeepSeek).
- **Virtual File System (VFS)**: Persistent file storage backed by Dexie / IndexedDB with ZIP import/export, snapshots, and file management.
- **In-Browser Bundler & Live Preview**: Fast in-browser module bundling and sandboxed preview powered by `esbuild-wasm` Web Workers.
- **Interactive Patch Review**: Unified diff view and patch approval system before agent modifications apply to the workspace.
- **GitHub Integration**: Import and push repositories directly from/to GitHub branches using client-side encrypted Personal Access Tokens.
- **PWA & Offline Ready**: Service worker caching and offline capabilities for on-the-go development.

## Getting Started / Run Locally

### Prerequisites

- Node.js (v18 or higher)
- npm or compatible package manager

### Steps

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Start the development server**
   ```bash
   npm run dev
   ```

3. **Open the application**
   Open your browser to `http://localhost:3000` (or the URL displayed in your terminal).

4. **Initialize your encrypted vault**
   On first launch, set a master passphrase on the Lock Screen to initialize your encrypted local vault. Store your recovery phrase securely.

5. **Configure API keys in Settings**
   Navigate to the **Settings** panel (gear icon) to add your LLM provider API key(s) (e.g., Google Gemini, Anthropic Claude, OpenAI) and optional GitHub Personal Access Token.

> **Note**: All credentials and API keys are stored locally in your browser's encrypted vault. No `.env.local` configuration or environment variable setup is needed.

## Available Scripts

- `npm run dev`: Starts the Vite development server on port 3000.
- `npm run build`: Compiles TypeScript and builds the production bundle.
- `npm run preview`: Locally previews the production build.
- `npm test`: Runs the test suite via Vitest.
- `npm run lint`: Runs TypeScript validation (`tsc --noEmit`) and ESLint checks.

## Architecture & Security

- **Zero Server-Side Credential Storage**: No API keys, prompts, or workspace code are sent to intermediary servers other than direct LLM provider endpoints and GitHub API calls made directly from the client.
- **Encryption**: Cryptographic primitives leverage the standard Web Cryptography API (`crypto.subtle`) for PBKDF2 key derivation (600,000 iterations), AES-256-GCM encryption/decryption, and WebAuthn PRF extensions when supported.
