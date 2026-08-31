## Current State
- Phase: HOTFIX-97
- Last verified working: Searchable combobox repository picker, plus Cloudflare Pages one-click deployment integration with vault token caching (all 77 test suites and 559 tests passing).
- Known issues / incomplete: none
- Deviations from blueprint so far: none

## Archived Log Summary

### 2026-08-27
- **Mobile Coding Accessory Toolbar, Searchable Model Picker Bottom Sheet & Touch Polish** (HOTFIX-80): Implemented CodeMirror mobile coding toolbar pinned above virtual keyboard on phone viewports with quick symbols (`Tab`, `{`, `}`, `(`, `)`, `[`, `]`, `<`, `>`, `=>`, `;`, `'`, `"`, `=`) and `Undo`/`Redo` with `onMouseDown` preventDefault to prevent blurring editor selection.
- **CreateProjectModal Mobile Bottom-Sheet Framing, Uniform Card Geometry & Haptics** (HOTFIX-79): Refactored `CreateProjectModal` dialog container to `fixed inset-x-0 bottom-0 z-50 max-h-[88vh] rounded-t-2xl sm:inset-auto sm:max-w-lg sm:rounded-2xl sm:max-h-[90vh]`, providing natural mobile bottom-sheet ergonomics with slide-in-from-bottom animation and centered desktop framing.
- **Keyboard Dynamic Tab Bar Hiding, Thumb Ergonomics & Subcommand Tab Autocomplete** (HOTFIX-78): Added real-time virtual keyboard detection in `App.tsx` via `focusin`/`focusout` and `window.visualViewport` height resize tracking, hiding the bottom navigation bar (`<nav role="tablist">`) so the terminal prompt and accessory strip sit flush above the keyboard.
- **Frictionless In-Chat Onboarding & Dynamic Manifest Bar Hiding** (HOTFIX-77): Built `QuickConnectSheet.tsx` providing a swipe-up mobile bottom sheet / desktop dialog to connect providers (Google Gemini, Anthropic Claude, OpenAI, OpenRouter, Ollama, OpenAI-compatible) and activate existing profiles with a single tap.
- **Terminal Virtual Keyboard Ergonomics & Fixed Shell Modifiers** (HOTFIX-76): Integrated a sticky bottom console control zone combining the command input and a floating accessory toolbar pinned directly above the mobile virtual keyboard and terminal output area.
- **Mobile Preview Toolbar Optimization & High-Utility Native Mobile Tools** (HOTFIX-75): Conditionally swapped viewport scaling chips (`[Phone] [Tablet] [Desktop]`) on mobile screens (`breakpoint === 'phone'`) for high-utility mobile developer controls (`[Logs]`, `[Inspect]`, `[QR]`), reserving viewport scaling chips for tablet and desktop viewports.
- **Settings Subtitle Truncation Fix & Redundant Lock Trigger Elimination** (HOTFIX-74): Refined category descriptors in `SETTINGS_CATEGORIES` to concise high-contrast phrasing: "Themes & Contrast", "LLM Profiles & Ensembles", "GitHub, Deploys & MCP", "Vault Lock & Backups", and "Diagnostics, Cache & Keys".
- **Bundle Cleanup, Chunk Streamlining & Snappy UI Optimization** (HOTFIX-73): Deleted unused root placeholder `index.ts` file.
- **Project Archiving & Separate Storage Collection Management** (HOTFIX-72): Added `ArchivedProject` interface and database tables `archivedProjects` and `archivedFiles` in `src/db.ts` (schema version 4).
- **AI Provider Grid Layout, Redundant Dropdown Removal & Deploy Card Encapsulation** (HOTFIX-71): Re-architected the AI Provider card selection block in `SettingsPanel.tsx` using an adaptive grid (`grid-cols-2 sm:grid-cols-3 gap-2`), with `col-span-2 sm:col-span-1` applied to the last item ("Ollama / Local") so it gracefully spans both columns on mobile without visual voids.
- **Settings Header Back-Navigation Alignment & Theme Palette Swatch Padding** (HOTFIX-70): Refactored "< Categories" back-navigation button in `SettingsPanel.tsx` to use `flex items-center gap-1.5 h-full py-1` with a `shrink-0` chevron icon and `leading-none` text for exact vertical baseline alignment.
- **Defensive Spacing & Safe-Area Padding for Terminal Input Container** (HOTFIX-69): Updated the command input prompt container in `TerminalPanel.tsx` with `p-2.5 pb-3.5 sm:pb-2.5 mb-2 sm:mb-0 pb-safe`.
- **Mobile Action Toolbar Layout & High-Density Vision Toggle in Preview Panel** (HOTFIX-68): Wrapped the PreviewPanel top toolbar in a flexible, space-aware container: `flex justify-between items-center gap-2 px-3 w-full overflow-x-auto sb-hidden`.
- **Safe Shell Command Evaluation, Code Block Pasting Protection & Artifact Cleanup** (HOTFIX-67): Implemented `ALLOWED_COMMANDS` Set in `TerminalPanel.tsx` containing explicit operation aliases, safely rejecting any unknown command strings before executing or evaluating redirection.
- **Hide Disabled Send Button & Make Profile Warning Bar Full-Width** (HOTFIX-66): Refactored `ChatPanel` input controls to conditionally render either the full-width (`w-full`) configuration warning banner (`!activeProfileId`) or the active input group containing `<textarea>` and Send/Stop action buttons.
- **Refactor GitHub Push Modal Submit Button & PR Provenance 2x2 Grid Matrix** (HOTFIX-65): Shortened the primary submit button text on `GithubPushModal` from "Push to New Branch (<branch>)" to concise `"Push to Remote Branch"` with `whitespace-nowrap`, preserving the target branch in the button's title tooltip.
- **Polish Chat View Configuration Warning Bar Text & Action Badge** (HOTFIX-64): Updated the warning string in the locked input container to the compact phrasing: `"Configure an AI profile to start chatting"`.
- **Refactor Manifest Token Dropdown Depth Layering, Solid Theme Background, and Middle-Ellipsis Path Truncation** (HOTFIX-63): Applied 100% solid opaque `bg-surface` background to the collapsible context files header row and its expanded dropdown container, eliminating transparency bleed-through into background session cards.
- **Refactor Chat Input Toolbar, Remove Error Banner, and Add Clickable Settings Input Container** (HOTFIX-62): Removed the separate red `AlertCircle` "No profile selected — Tap to configure" error banner block above the text area, opening up vertical breathing room for prompt chips and editor space.
- **Polish Workspace Actions Touch State Radii & Mobile AI Blame Sheet Overlay** (HOTFIX-61): Added `first:active:rounded-t-lg last:active:rounded-b-lg first:hover:rounded-t-lg last:hover:rounded-b-lg` to all action buttons in `ProjectActionsMenu.tsx` to ensure touch state highlights strictly respect card corner boundaries without square leaks.
- **Refactor AI Provenance & Trust Report Header, Ledger Badge Alignment, and Table Padding** (HOTFIX-60): Refactored `TrustReportModal` modal header into a responsive flex layout (`flex-col sm:flex-row sm:items-center justify-between gap-3`) with dedicated button groupings that prevent overlapping with title tags or subtitles.
- **Fix Language Distribution Row Text Overlap with Explicit 3-Column Grid Layout** (HOTFIX-59): Refactored each language list item row into a 3-column CSS Grid template (`grid-cols-[1fr_auto_auto] items-center gap-2.5 sm:gap-4`).
- **Refactor Workspace Actions Drawer Layout, Ledger Contrast, and Project Search Modal Spacing** (HOTFIX-58): Added `pt-4 sm:pt-0` padding to the `ProjectActionsMenu` mobile drawer and positioned the grab handle at `absolute top-2 left-1/2 -translate-x-1/2` so it does not collide with header text or the close button.
- **Refactor Project Selector from Native Select to Custom React Popover Dropdown** (HOTFIX-57): Replaced the native `<select>` and `<option>` tags in `ProjectFilesPane.tsx` with a custom controlled `ProjectSelector` component.
- **Clarify Language Labels, Fix Navigation Overlay Z-Index, and Polish Token Analytics Tab Header** (HOTFIX-56): Updated language color map in `src/utils/projectStats.ts` to explicitly distinguish `TypeScript (Vanilla)` (`ts`) and `TypeScript (React)` (`tsx`), as well as `JavaScript (Vanilla)` (`js`) and `JavaScript (React)` (`jsx`).
- **Polish Toast Notification Overlay with Opaque Surface and Fixed Bottom Positioning** (HOTFIX-55): Changed `Toaster` container from top overlay to `fixed bottom-6 right-4 sm:right-6 left-4 sm:left-auto` with safe area bottom offset, leaving the upper tabs and editor lines completely unobstructed.
- **Drag-and-Drop File Tab Reordering in EditorTabs** (HOTFIX-54): Added HTML5 drag-and-drop handlers (`handleDragStart`, `handleDragOver`, `handleDragEnter`, `handleDrop`, `handleDragEnd`) to `EditorTabs.tsx`.
- **Implement Responsive Workspace Docks, Multi-File Editor Tabs, and Terminal Drawer (Steps 3-5)** (HOTFIX-53): Added `openFileIds`, `setOpenFileIds`, `openFile`, `closeFile`, `isTerminalDrawerOpen`, `setIsTerminalDrawerOpen`, and `toggleTerminalDrawer` to the Zustand store.
- **Implement Responsive Layout Scaffold (Step 1 & Step 2) with State Persistence** (HOTFIX-52): Created `useShellBreakpoint.ts` observing the root container width via `ResizeObserver` with 8px hysteresis dead-band and lazy window initialization to avoid initial flash.
- **Regroup SettingsPanel into 5 Named Categories with Responsive Navigation** (HOTFIX-51): Grouped all settings sections into 5 categorized modules: Appearance (theme + contrast), AI & Providers (connection profiles + ensemble + custom instructions), Integrations (GitHub + deploy tokens + MCP servers), Security & Vault (lock vault + encrypted backup/restore), and Advanced (system diagnostics + dependency cache + keyboard shortcuts).
- **Add Responsive Viewport Size Controls to PreviewPanel Toolbar** (HOTFIX-50): Added a connected segmented control with Phone (~420px), Tablet (~768px), and Desktop (100%) viewport chips to the left of the Reload button in `PreviewPanel.tsx`.
- **Collapse Chat Composer Controls Row into Summary Chip** (HOTFIX-49): Collapsed the multi-pill row above the chat composer into a single summary chip displaying model label, vision state, and session cost with an ensemble active pulse dot indicator.
- **Merge Insights Control and Add Toolbar Overflow Menu** (HOTFIX-48): Merged the separate Trust Score badge and AI Blame toggle into a single "Insights [Score]%" button that opens the AI Blame & Trust Inspector side panel.
- **Fix SettingsPanel Test Queries and Database Mocks** (HOTFIX-47): Added `count` mock implementations to `db.projects` and `db.files` in `SettingsPanel.test.tsx`.
- **Wire Up onOpenShortcuts in TopStrip** (HOTFIX-46): Updated `TopStrip` function signature to destructure `{ dbTested, onOpenShortcuts }`.

### 2026-08-25
- **Surface AI Provenance & Trust Score for Files and PRs** (HOTFIX-45): Implemented `calculateFileTrustScore` and `calculateProjectTrustScore` in `src/services/provenance/trustScore.ts` calculating quantitative trust metrics (0-100%, A+ to F letter grades), line-level AI/human attribution, model breakdowns, and test verification rates with penalty enforcement for broken hash chains.
- **Exclude package-lock.json and AI_CHANGELOG.md from ZIP Exports** (HOTFIX-44): Added `ZIP_EXPORT_EXCLUDED_FILES` list and `isExcludedFromZipExport` helper in `zipExport.ts` targeting `package-lock.json` and `ai_changelog.md` (case-insensitively for both exact relative paths and file names).
- **Surface MCP Connection and Execution Failures in Chat & Tool-Result Stream** (HOTFIX-43): Updated `McpService.listTools` to propagate connection/listing errors rather than swallowing them into an empty array.
- **Wire Stream Usage Events into Agent Loop and Ensemble** (HOTFIX-42): Captured `{ type: 'usage' }` stream events in `agentLoop.ts` and `ensemble.ts` during multi-step tool-calling agent executions, accumulating exact input, output, and cached tokens reported by LLM providers.
- **Real zxcvbn-Style Password Strength Estimator** (HOTFIX-41): Implemented full zxcvbn-style passphrase strength estimator in `passwordStrength.ts` with dictionary matching (common passwords, BIP-39 words, reversed terms, l33tspeak substitutions), character and substring repetition matching, sequential run detection (numbers, alphabets), spatial keyboard walk analysis (QWERTY rows), and date detection.
- **Unified Root OPFS/Dexie Access via getAllFileContent** (HOTFIX-40): Implemented and exported centralized `getAllFileContent` in `vfs.ts` supporting retrieval across all projects, by project ID, or from a list of `FileItem` records, automatically resolving content from OPFS or Dexie fallback.
- **Ensemble Auto-Arbiter** (HOTFIX-46): Replaced the hardcoded candidate selection fallback in `runEnsembleDualEvaluation` with an LLM judge pass.

### 2026-08-24
- **Dynamic Theme Contrast Fine-Tuning** (FEATURE-07): Created theme contrast computation service (`contrast.ts`) with continuous RGB interpolation and contrast bounds (60% to 140%).
- **Project-Wide Content Search (Find in Files)** (FEATURE-06): Implemented high-performance project search service (`projectSearch.ts`) supporting literal substring, case-sensitive matching, whole-word boundaries, full JavaScript regular expressions, and include/exclude glob filters.
- **1-Click Live Deployment & Instant Hosting (Netlify & Vercel)** (FEATURE-05): Built `deployClient.ts` implementing static packaging (bundling HTML/CSS/JS, handling SPA redirects via `_redirects` and `vercel.json`), Netlify ZIP direct deploy API (`/api/v1/sites`), and Vercel v13 deployments API with status polling.
- **Safe-area and Notch Handling Support** (HOTFIX-39): Added `viewport-fit=cover` to `<meta name="viewport">` in `index.html` to enable full edge-to-edge rendering on modern notched and Dynamic Island displays.
- **Full Project Markdown Documentation Export** (FEATURE-04): Created `src/services/fs/markdownExport.ts` with `generateProjectMarkdown` and `exportProjectAsMarkdown` providing formatted single-file Markdown export.
- **Fast and Robust Upload/Download Engine** (HOTFIX-38): Implemented `bulkCreateOrUpdateFiles` in `src/services/fs/vfs.ts` utilizing single-transaction IndexedDB `bulkPut` combined with concurrent OPFS writes, replacing O(N^2) individual lookups.
- **Cleanup Trash Files & Blazing Speed Response Optimization** (HOTFIX-37): Removed orphaned `bun.lock` file to keep the repository pristine and exclusively managed by npm (`package.json` + `package-lock.json`).
- **Starter Template Selection for New Projects** (FEAT-TEMPLATES-1): Created `projectTemplates.ts` service with predefined starter skeletons: 'React TypeScript' (React 19 + TypeScript + Vite + CSS), 'Tailwind CSS' (Tailwind CSS v4 + React 19 + interactive state cards), 'Empty Project' (clean minimal workspace), and 'Vanilla HTML / JS'.
- **Modernize Infrastructure (Vite 8, OPFS, Argon2id)** (HOTFIX-36): Upgraded `vite` to `^8.2.2` and `esbuild` to `^0.28.0` to leverage the unified Rust-based Rolldown bundler for dev-time builds.
- **LockScreen Password Visibility Toggles & Feedback** (HOTFIX-33): Added Eye/EyeOff toggle buttons to setup passphrase, confirm passphrase, unlock passphrase, and recovery phrase inputs.
- **Convert ProjectActionsMenu to Bottom Sheet with Backdrop and Grouped Action Sections** (HOTFIX-35): Converted `ProjectActionsMenu` dropdown into a responsive modal sheet with full viewport backdrop (`fixed inset-0 z-50 bg-black/80 backdrop-blur-xs`), rendering as a full-width bottom sheet on narrow mobile viewports and a centered dialog card on wider viewports.
- **Fix preventDefault timing in async form submission handlers** (HOTFIX-35): Moved `e.preventDefault()` to the top of the async function body in `handleStartSetup`, `handleUnlock`, and `handleRecoveryUnlock` in `LockScreen.tsx`.
- **'Keep me logged in' Vault Session Persistence across Browser Refreshes** (HOTFIX-34): Added `VaultSession` interface and `vaultSessions` table store (`version(3)`) to Dexie `LaideDatabase`.

### 2026-08-23
- **Migrate IndexedDB from XiomDatabase to LaideDatabase** (REBRAND-2): Renamed the `XiomDatabase` argument in `super('XiomDatabase')` to `'LaideDatabase'` inside `LaideDatabase` constructor.
- **Dual-LLM Ensemble Mode with Sandboxed Test Verification** (FEAT-ENSEMBLE-1): Implemented `runSimulatedAgentCandidate`, `evaluateCandidatePatches`, and `runEnsembleDualEvaluation` in `src/services/agent/ensemble.ts` using the unified `LLMAdapter` abstraction with no provider-specific branching.
- **Historical Provenance Bisection ("Find What Broke This") Action** (FEAT-PROVENANCE-3): Implemented `bisectBrokenTest` in `src/services/provenance/bisect.ts` using logarithmic binary search ($O(\log N)$ historical test runs) across ordered provenance entries.
- **Background Test Suite Runner & Editor AI Blame Affordance** (FEAT-PROVENANCE-2): Extended `ProvenanceEntry` with `ProvenanceTestResult` and optional before/after snapshots in `db.ts`.
- **Local Tamper-Evident Provenance Ledger for Applied AI Patches** (FEAT-PROVENANCE-1): Added Dexie schema `version(2)` in `LaideDatabase` with the new `provenanceEntries` table carrying forward all v1 tables.
- **Add zoomable ImageViewerModal component for image file preview in FileTree** (HOTFIX-32): Created `ImageViewerModal` with pan, pinch/wheel zoom, 90° rotation, fit to view, keyboard shortcuts (Esc, +, -, 0, r), file copy/download, and transparent checkerboard background.
- **Lazy-load crypto.ts, bundler.ts, and gpt-tokenizer for Vite code-splitting** (HOTFIX-31): Changed static imports of `bundler.ts` functions to dynamic `await import` across TerminalPanel and testRunner.
- **Fix CodeMirror SearchCursor TypeScript errors and resolve all ESLint errors** (HOTFIX-30): Corrected TypeScript types in `Editor.tsx` by using CodeMirror's `SearchCursor` type directly instead of generic `Iterator`.

### 2026-08-22
- **Add active project detailed metadata & Recharts language distribution charts** (FEAT-PROJECT-ANALYTICS): Installed `recharts` for rich, animated SVG data visualization.
- **Streamline upper file tree header into professional ProjectActionsMenu dropdown** (FEAT-HEADER-STREAMLINE): Replaced the stacked multi-row workspace button bar (which previously took 4 vertical rows with Import, Push, Upload, Export, Trash, file counter) with a single-line compact header.
- **Implement FileBreadcrumb component in FileTree with parent navigation** (FEAT-BREADCRUMB): Created `FileBreadcrumb` component displaying the root project name with home icon, chevron-delimited directory segments, and active file leaf badge.
- **Add global keyboard accelerators & shortcuts cheatsheet modal** (FEAT-KEYBOARD-SHORTCUTS): Implemented global hotkey listener in `App.tsx` supporting:
- **Create new TerminalPanel component for sandbox shell execution** (FEAT-TERMINAL-PANEL): Added `'terminal'` to `TabId` in `store.ts`.
- **Implement global file search in FileTree panel** (FEAT-FILE-SEARCH): Added a search input bar at the top of the file tree panel with a search icon, clear button, match count indicator, and keyboard navigation instructions.
- **Surface last known build status on timeout & nested worker checkpoint** (HOTFIX-29): Added `lastStatuses` Map in `bundler.ts` tracking the last received `STATUS` string per build `id`.
- **Implement recursive worker bundling for `new URL(..., import.meta.url)` pattern** (HOTFIX-28): Passed `_nestedWorkerPaths: Set<string>` inside `VfsPluginOptions` to track recursive bundling state and prevent infinite recursion.
- **Tailwind v3 vs v4 detection, custom @theme preservation, and version-specific CDN injection** (HOTFIX-27): Updated `stripTailwindDirectives` in `esbuild.worker.ts` to return `{ stripped, hasTailwind, version: 'v3' | 'v4' | null }`, preserving `@theme` blocks and custom tokens for Tailwind v4 while stripping import/directive statements.
- **Move script tag sanitization to bundler** (HOTFIX-26): Moved `escapeScriptClosingTags` to `bundler.ts` and applied it directly to the output string of `bundle()`.
- **Apply script closing tag sanitization to PreviewPanel static fallback branch** (HOTFIX-25): Updated the static fallback HTML generation path in `PreviewPanel.tsx` to call `escapeScriptClosingTags` on the content of external scripts before injecting them into Blob URLs.
- **Sanitize script closing tags in PreviewPanel HTML generation** (HOTFIX-24): Added `escapeScriptClosingTags` helper to replace all case-insensitive occurrences of `</script` with `<\/script` (backslash-escaped forward slash).
- **Replace removed Lucide Github icon and pin bundler bare import versions to package.json** (HOTFIX-23): Replaced `Github` from `lucide-react` with inline `GithubIcon` SVG component in `App.tsx`, `GithubImportModal.tsx`, and `GithubPushModal.tsx`.
- **Fix data URI externalization and CSS handling in esbuild bundler** (HOTFIX-22): Added data: and blob: URI check in `vfsPlugin` `onResolve` returning `{ path: args.path, external: true }` to prevent data URIs from being resolved as bare package names on `esm.sh`.

### 2026-08-21
- **Rename XioM Studio to LAIDE Studio** (REBRAND-1): Updated title, description, and open graph metadata in `index.html`.

### 2026-08-20
- **Add `run_tests` agent tool using esbuild pipeline in Web Worker** (HOTFIX-21): Intercepted `vitest` imports in the VFS plugin of `esbuild.worker.ts` to alias to a lightweight virtual `/vitest_shim.ts`.
- **Add MCP (Model Context Protocol) server support** (HOTFIX-20): Installed `@modelcontextprotocol/sdk`.
- **Screenshot-based vision feedback loop for agent and preview panel** (HOTFIX-19): Extended `LLMMessage`, `LLMContentBlock`, and `LLMContentPart` in `llmAdapter.ts` to support image content blocks alongside text.
- **Add markdown rendering for assistant messages in ChatPanel** (HOTFIX-18): Installed `react-markdown`.
- **Split OpenAI Compatible provider into OpenRouter and Local options** (HOTFIX-17): Split the 'openai-compatible' provider option into 'openrouter' and 'openai-compatible' to improve UI clarity.
- **Surface empty assistant responses in chat UI** (HOTFIX-16): In `ChatPanel.tsx`, modified the `handleSend` to check if `finalMessages` has an empty assistant message (no content, no toolCalls) at the end, and if so, replaces its content with a `⚠️ No response received from the model — try again` error message so it is visible instead of rendering nothing.
- **Display UI errors for LLM chat failures and note test connection limits** (HOTFIX-15): In `ChatPanel.tsx`, modified the `handleSend` catch block to extract the current `chatHistory` state and append a visible assistant error message (`⚠️ Request failed: ...`) so users can clearly see model rejections, network errors, or missing capabilities directly in the UI.
- **Responsive Files-tab header row wrapping for narrow mobile screens** (HOTFIX-14): Enabled `flex-wrap` and `gap-y-2` on the Files-tab header row in `src/App.tsx`, with `border-b border-border/30` for clean visual demarcation.
- **Update default Anthropic model to claude-3-7-sonnet-20250219** (HOTFIX-13): Changed `DEFAULT_MODELS['anthropic']` in `SettingsPanel.tsx` to `'claude-3-7-sonnet-20250219'`.
- **Update default Anthropic model to claude-3-7-sonnet-20250219** (HOTFIX-13): Changed `DEFAULT_MODELS['anthropic']` in `SettingsPanel.tsx` to `'claude-3-7-sonnet-20250219'`.
- **Prevent hunk index drifting during partial patch application** (HOTFIX-12): Added a strict parity check (`file.content !== patch.oldContent`) in `executeApply` for partial-hunk patches. If the content has drifted from when the patches were generated, the application aborts and throws an error instead of letting hunk indices silently misalign.
- **Handle 422 branch collision on GithubPushModal** (HOTFIX-11): Added a `try-catch` specifically for `client.createBranch` to trap HTTP 422 errors indicative of branch collisions.
- **Fetch and default to GitHub repository default_branch in GithubPushModal** (HOTFIX-10): Added a debounced `useEffect` that triggers when the user updates the `owner` and `repo` input fields, which calls `client.getRepo(owner, repo)` to resolve and populate the correct `default_branch` into the baseBranch field.
- **Fix empty error messages for LLM API failures** (HOTFIX-9): Updated HTTP error handlers in all LLM providers (`AnthropicProvider`, `GoogleProvider`, `OpenAIProvider`, `OpenAICompatibleProvider`) to correctly parse and surface API error details.
- **Fix GitHub API base64 decoding for non-ASCII and binary files** (HOTFIX-8): `GithubClient.getFileContent` now checks `binaryExtensions` and returns raw base64 string for binary files.
- **Fix Github API Content-Type Header for POST requests** (HOTFIX-7): Added `Content-Type: application/json` header setting to `GithubClient.request()` when `options.body` is present.
- **Add Unit Test Suites for High-Risk File Modifying & Git Components** (HOTFIX-6): Added `src/components/GithubImportModal.test.ts`: mocks fetch to GitHub API, verifies files land at correct `/...` VFS paths, confirms 404/network errors surface readable error messages without crashing, and tests existing file overwrites.
- **Add Mid-Session Manual "Lock Vault" Action & Confirmation** (HOTFIX-5): Added `lockVault()` action to `WorkspaceSlice` in `src/store.ts` to reset `keys` to `null` and clear `chatHistory`.
- **Remove bun.lock, Update .gitignore, and Pin Engines in package.json** (HOTFIX-4): Deleted redundant `bun.lock` file from repository root.
- **Update README.md Run Locally Instructions** (HOTFIX-3): Rewrote the "Run Locally" section in README.md removing all references to `.env.local` or environment variable keys.
- **GitHub Import Default Branch Detection & Error Handling** (HOTFIX-2): Added `getRepo(owner: string, repo: string)` method in `GithubClient` targeting `GET /repos/{owner}/{repo}`.
- **Complete 2048-Word BIP-39 English Wordlist & Test** (HOTFIX-1): Replaced truncated 2046-word list with the complete, official 2048-word BIP-39 English wordlist.
- **Historical Phase Label Collision Audit** (AUDIT-2): Audited all historical changelog entries for duplicated phase and subphase labels.
- **Light Theme Redesign** (5.0): Replaced dark color tokens (ink, brass) with light equivalents (bg, surface, accent, muted).
- **File Manifest Exclusion Patterns & Store Integration** (5.2): Added `DEFAULT_MANIFEST_EXCLUDE_PATTERNS` to `src/services/agent/prompts.ts` containing lockfiles, `.gitignore`, `.env.example`, and binary extensions imported directly from `src/services/fs/zipExport.ts`.
- **ChatSlice MaxAgentSteps Store Integration** (5.2): Added `maxAgentSteps: number` and `setMaxAgentSteps: (steps: number) => void` to `ChatSlice` in `src/store.ts`, initialized to 25 with localStorage persistence under `xiom_max_agent_steps`.
- **ChatSlice Temperature & MaxOutputTokens Store Integration** (5.2): Added `temperature?: number` and `maxOutputTokens?: number` properties to `ChatSlice` along with `setTemperature` and `setMaxOutputTokens` setters and `localStorage` persistence.
- **ESLint Setup & Baseline Scan** (6.1): Installed `eslint`, `typescript-eslint`, `eslint-plugin-react-hooks`, `@eslint/js`, and `globals` as dev dependencies.
- **LockScreen Type Safety Update** (6.1): Updated `passkeyData` parameter type in `finalizeSetup` function in `src/components/LockScreen.tsx` from `any` to `PasskeyData | null`.
- **Vite-Only Virtual Module Interception & Preview Stubbing** (6.1): Added special-cased resolution in `esbuild.worker.ts`'s `vfsPlugin.onResolve` for `virtual:*` and `\0virtual:*` paths to the `virtual-module-stub` namespace.
- **Direct Compiler WASM Binary Loading & Resolution Isolation** (6.1): Updated `esbuild.worker.ts` compiler initialization to directly fetch `wasmUrl` as an `ArrayBuffer` and compile via `WebAssembly.compile(wasmBytes)` into a `wasmModule` before invoking `esbuild.initialize({ wasmModule, worker: false })`.
- **Multi-Project Deletion Transaction & Confirmation Modal** (Phase 7): Added `deleteProject(projectId: string)` to `src/services/fs/vfs.ts` executing an atomic Dexie transaction across `db.projects`, `db.files`, and `db.snapshots` to prevent orphaned records.
- **Project Switcher Chip Restyling & Persistent New Project Button** (Phase 7): Restyled the project switcher `<select>` container into an interactive chip button with `bg-surface`, `border-brass/30`, hover states (`hover:border-brass/70`), and a visible brass chevron indicator.
- **ChatPanel Assistant Loading Placeholder Indicator** (3.1): Added a conditional render inside `ChatPanel.tsx`'s message bubble block for `msg.role === 'assistant' && !msg.content && !msg.toolCalls && loading`.
- **Multi-Project Switcher Support** (Phase 7): Added `activeProjectId` and `setActiveProjectId` to `WorkspaceSlice` in `src/store.ts`, persisting the selected project in `localStorage` as `xiom_active_project_id`.
- **PreviewPanel Bundled-Mode Detection & Entry Point Resolution** (6.1): Created `detectBundledProject()` utility in `src/services/bundler/entryDetection.ts` providing structured bundled-mode detection and entry point resolution.
- **Agent Loop Cancellation Graceful Handling** (Phase B): Modified `runAgentLoop` in `src/services/agent/agentLoop.ts` to replace the simple `break` on `signal?.aborted` during tool execution.
- **LockScreen Passphrase Minimum Length & Strength Enforcement** (1.1): Raised the enforced minimum passphrase length in `LockScreen.handleStartSetup` from 4 to 10 characters.
- **Dynamic Model Context Window Resolution & Metadata** (Phase A): Extended `DiscoveredModel` interface in `modelDiscovery.ts` with optional `contextWindow?: number`.
- **Lightweight File Manifest & Token Math Refactoring** (Phase A): Replaced monolithic `<codebase>` file content dump with `buildFileManifest()` in `prompts.ts`, formatting paths and byte counts without leaking full source contents.
- **PatchReviewSheet Upsert Semantics, Error Handling & Applied Paths Fix** (Phase C): Changed `PatchReviewSheet.executeApply()` 'create' branch to inspect `files` for an existing file at `patch.path` and fallback to `writeFile()` (upsert semantics) if found.
- **Zustand Store Slices Refactoring** (Phase F): Broke down monolithic `AppState` interface in `store.ts` into `WorkspaceSlice`, `PatchSlice`, `ChatSlice`, and `PWASlice`.
- **Production Scaffolding Audit & Dependency Cleanup** (Phase F): Removed `console.log('[DB Test Result]', res)` from `App.tsx` on-mount database readback verification.
- **Bundle Code-Splitting & Lazy Loading** (Phase E): Converted CodeMirror language extensions in `Editor.tsx` (`@codemirror/lang-javascript`, `@codemirror/lang-html`, `@codemirror/lang-css`, `@codemirror/lang-json`, `@codemirror/lang-markdown`) to dynamic `import()` loaders with in-memory caching keyed by language type.
- **Cache Storage Dependency Cache & Offline Bundler** (Phase D): Integrated browser Cache Storage (`xiom-esm-dep-cache-v1`) into the esbuild worker's `unpkg-url` plugin loader to store and reuse remote esm.sh responses across rebuilds and sessions.
- **Agent Loop Safety Rails, Step Cap & Delete Confirmation** (Phase C): Added tool-call step counter to `runAgentLoop` with configurable `maxSteps` (default 25); appends an assistant notification (`Agent stopped after ${stepCount} steps.`) and halts cleanly when reached.
- **LLM Provider Adapters & Agent Loop Unit Testing** (Phase B): Implemented comprehensive mock fetch test suites for AnthropicProvider, OpenAIProvider, OpenAICompatibleProvider, and GoogleProvider covering `send()` (text and tool calls), `stream()` (text SSE, tool call json delta accumulation, usage metadata), mid-stream stream-reader network aborts, and corrupted/truncated SSE chunk recovery.
- **Passphrase Recovery Mechanism & Encrypted Backup/Restore** (Phase A): Built BIP-39 12-word recovery service deriving PBKDF2 wrapping key to store second AES-GCM wrapped copy of master key in LockConfig.
- **External Codebase Review & Robustness Phases A–G Scoped** (AUDIT): No application code changed. Ran `npm install`, `tsc --noEmit`, `npm test`, `npm run build`, `npm audit` directly against the shipped zip rather than trusting prior "Verified" lines.

### 2026-08-19
- **Small Viewport (360px) & Overflow Hardening** (8.5.11): TopStrip: Added compact token formatter (`formatTokens` e.g. `198k / 200k (99%)`), flex shrink protection, and near-full alert badge (`isNearFull` at >=85% with oxide highlight and icon).
- **Accessibility, Contrast & Reduced-Motion Audit** (8.5.10): Added universal `:focus-visible` ring styling (`outline: 2px solid var(--color-brass)`, `outline-offset: 2px`) for keyboard focus across all interactive elements (`button`, `a`, `input`, `select`, `textarea`, `[tabindex]`).
- **Orchestrated Patch Motion & Empty State Copy** (8.5.9): Added `@keyframes brass-flash` in `src/index.css` running a 400ms bezier transition from brass glow (`rgba(201, 162, 75, 0.45)`) back to normal state.
- **Custom PWA Install Prompt & Engagement Trigger** (8.5.8): Added `deferredInstallPrompt`, `showInstallPrompt`, and `triggerInstallEngagement` in `src/store.ts` with standalone mode checking and dismissal persistence in localStorage (`xiom_pwa_install_dismissed`).
- **Vite PWA Configuration & Offline Support** (8.5.7): Configured `VitePWA` in `vite.config.ts` with `registerType: 'prompt'`, `globPatterns` caching all static assets (`js,css,html,ico,png,svg,json,woff,woff2`), `navigateFallback: '/index.html'`, runtime caching for Google Fonts, and full web app manifest metadata.
- **Custom Instructions Panel** (8.5.6): Added `customInstructions` state and `setCustomInstructions` with `localStorage` persistence in `src/store.ts`.
- **Provider Subtitles & Dynamic Model Discovery** (8.5.5): Replaced hardcoded model version subtitles in the provider sheet with generic, non-version-locked descriptions ("Claude models", "GPT models", "Gemini models", "Local & compatible endpoints").
- **Provider Picker Swipe-Up Sheet** (8.5.4): Replaced native HTML `<select>` with a stylized custom trigger button in SettingsPanel profile form.
- **GitHub Modals Branding & Branch Surfacing** (8.5.3): Changed default commit message to `Update from XioM Studio (<date>)` and updated placeholder branding.
- **Settings Panel Polish & GitHub Guardrails** (8.5.2): Updated "Save GitHub Token" button style to `bg-brass text-ink font-bold` matching "+ Add Profile" primary action weight.
- **Preview Panel Actionable Empty State & Reload State** (8.5.1): Centralized suggestion prompt strings into `src/services/agent/prompts.ts` referenced by both ChatPanel and PreviewPanel.
- **Chat Panel Improvements** (8.5): Gated Chat panel textarea and send button on profile availability and made profile status row tap directly to Settings tab.
- **Scaffold Project** (1.0): Installed zustand, dexie, zod, vite-plugin-pwa
- **App Shell & Theme** (1.1): Added Google Fonts links to index.html for IBM Plex Sans & Mono.
- **Dexie Database Setup** (1.2): Defined XiomDatabase with IndexedDB tables: projects, files, snapshots, connectionProfiles using Dexie.
- **Virtual File System Service** (1.3): Implemented `vfs.ts` with direct Dexie operations for files: listFiles, readFile, writeFile, createFile, deleteFile, renameFile, and a checkPathCollision helper.
- **Snapshot Service** (1.4): Implemented `createSnapshot` fetching all project files and storing serialized JSON to `snapshots` table.
- **Client-Only Environment** (1.5): Removed `express`, `dotenv`, `@google/genai`, and `@types/express` from `package.json`.
- **ZIP Import Service** (1.6): Implemented `importZip(zipData, projectId)` utilizing JSZip.
- **Restructure Service** (1.7): Implemented flattenWrapperDirectory to remove wrapper directories.
- **ZIP Export Service** (1.8): Implemented exportZip using jszip.
- **Files Panel & Editor** (1.9): Replaced placeholder UI with actual FileTree component and active file Editor logic.
- **Context Menu & Upload** (1.10): Added context menu, renaming modals, and upload hook for Zip/Single files.
- **CodeMirror Editor & DB Fix** (1.11): Migrated from textarea to @uiw/react-codemirror with dark theme and syntax highlighting.
- **Passphrase Engine** (4.1): Implemented deriveKeys, generateVerifier, verifyPassphrase, encryptData, decryptData.
- **Passkey PRF Wrap** (4.2): Implemented enrollPasskey and unlockWithPasskey using WebAuthn PRF extension.
- **Lock Screen** (4.3): Blocked app UI if `keys` in Zustand store is null.
- **LLM Adapter Interface** (5.1): Created the generic LLMAdapter TypeScript interface.
- **Anthropic Provider** (5.2): Created `AnthropicProvider` implementing REST/SSE payloads.
- **OpenAI, Google & Compatible Providers** (5.3): Built `OpenAICompatibleProvider` parsing standard `chat/completions` chunks, delta tool calls.
- **Tokenizer Utility** (5.4): Installed `gpt-tokenizer` via npm.
- **Settings Panel** (5.5): Created SettingsPanel to manage `ConnectionProfile` objects stored in Dexie.
- **Agent Tools** (5.6): Defined JSON schemas for list_directory, read_file, write_file, and search_code.
- **Agent Loop** (5.7): Implemented `runAgentLoop` in `agentLoop.ts` handling the continuous async streaming cycle between the LLM and the workspace.
- **Zod Patch Schema & Diff Utility** (6.1): Installed `zod`, `diff`, and `@types/diff` dependencies.
- **Patch Review UI** (6.2): Built `PatchReviewSheet.tsx` as a fixed swipe-up overlay displaying pending patches dynamically mapping `computeHunks` outputs.
- **Chat UI & Inline Patches** (6.3/6.4): Built `ChatPanel.tsx` rendering message history sequentially mapped to markdown.
- **Token Usage Top Strip** (6.5): Built `TopStrip.tsx` component to replace the inline top strip. Added layered `brass` fill elements with varying opacities to represent the three usage segments (system, codebase, chat).
- **Local Preview Panel** (7.1): Built `PreviewPanel.tsx` that leverages `DOMParser` to read `index.html` from the VFS.
- **esbuild-wasm Web Worker Integration** (7.2): Installed `esbuild-wasm` package.
- **GitHub API Client & PAT Encryption** (8.1): Created `GithubClient` service communicating with `api.github.com` strictly utilizing the native browser `fetch` API under CORS rules to query repos, tree topologies, and raw base64 file payloads.
- **Import from GitHub** (8.2): Built `GithubImportModal.tsx` containing an intuitive repo URL parser and import progress tracking.
- **Push to GitHub** (8.3): Integrated native Git Database primitives into `githubClient.ts`: `createBlob`, `createTree`, `createCommit`, `createBranch`, and branch/commit data fetching.
- **UI Polish & Settings Context** (8.4): Replaced bg-moss usages in ChatPanel with bg-brass for interactive buttons and status styles.
- **Files Panel Mobile Header Layout** (8.4.1): Shortened Files panel title to "Files" with item count separated in a compact badge.

## Log

### [HOTFIX-87] Escape Interpolated HTML in Editor AI Blame Popover & XSS Audit — 2026-08-30
Prompt: Fix XSS risk in EditorAiBlame.tsx by HTML-escaping all interpolated fields, and audit editor and chat directories for other innerHTML instances.
Files touched:
- `src/components/editor/EditorAiBlame.tsx` (modified)
- `src/components/editor/EditorAiBlame.test.tsx` (modified)
- `AI_CHANGELOG.md` (modified)
Changed:
- Implemented and exported `escapeHtml` utility in `src/components/editor/EditorAiBlame.tsx` escaping `&`, `<`, `>`, `"`, and `'` characters.
- Applied `escapeHtml` to all interpolated variables in CodeMirror 6 hover tooltip popover DOM creation: `entry.model`, `entry.provider`, formatted timestamp `timeStr`, `entry.rationale`, `shortHash`, `testInfo.label`, and `testInfo.details`.
- Audited `src/components/editor/` and `src/components/chat/` for any other `innerHTML`, `outerHTML`, or raw HTML insertions; verified that no other unescaped `innerHTML` instances exist.
- Added comprehensive unit tests in `EditorAiBlame.test.tsx` validating `escapeHtml` correctness and ensuring adversarial XSS payloads (e.g., `<script>`, `<img onerror>`, `"><svg onload>`) in provenance metadata are neutralized.
Decisions:
- Preserved identical visual styling and layout in the AI blame popover while guaranteeing zero unescaped strings reach the privileged DOM tree.
Deviations: none
Verified: All 72 test suites (535 tests) pass cleanly with 0 failures; `lint_applet` reports 0 errors; `compile_applet` build succeeded.
Open questions: none

### [HOTFIX-86] Friendly LLM Error Normalization & Model Picker Experimental Badges — 2026-08-30
Prompt: Translate raw provider error messages into friendly UI summaries with collapsible details and add experimental badges to the model picker.
Files touched:
- `src/services/llm/friendlyError.ts` (new)
- `src/services/llm/friendlyError.test.ts` (new)
- `src/components/modals/ModelPickerModal.tsx` (modified)
- `src/components/modals/ModelPickerModal.test.tsx` (modified)
- `src/components/chat/ChatPanel.tsx` (modified)
- `src/components/chat/ChatPanel.test.tsx` (modified)
- `src/components/shared/SettingsPanel.tsx` (modified)
- `src/services/fs/markdownExport.test.ts` (modified)
- `AI_CHANGELOG.md` (modified)
Changed:
- Implemented `toFriendlyErrorMessage`, `formatFriendlyErrorForChat`, and `parseFriendlyErrorFromMessage` in `src/services/llm/friendlyError.ts` normalizing raw HTTP/JSON errors across providers into human-readable summaries with direct action links and structured raw error tags.
- Handled OpenRouter data-policy / guardrail restrictions with direct link to `https://openrouter.ai/settings/preferences`, rate limits (429), authentication/API key errors (401), model not found (404), and fallback generic error cards with collapsible raw technical details.
- Updated `ChatPanel.tsx` and `SettingsPanel.tsx` to display friendly summaries and action buttons with togglable technical debug payloads.
- Added visual "Experimental" amber badge chip to model cards in `ModelPickerModal.tsx` matching `-exp` or `exp-` identifiers (such as `google/gemini-2.0-flash-exp:free`) while keeping all models accessible.
Decisions:
- Encapsulated raw error metadata inside structured HTML comment markers within chat history strings so persisted session data maintains both human-readable clarity and full raw error debuggability without breaking schema backwards compatibility.
Deviations: none
Verified: Comprehensive unit tests in `friendlyError.test.ts`, `ModelPickerModal.test.tsx`, `ChatPanel.test.tsx`, and full repository test suite (72 test files, 532 tests) passed with 0 failures; `lint_applet` passed with 0 errors; `compile_applet` built cleanly.
Open questions: none

### [HOTFIX-85] Eliminate Ineffective Dynamic Imports in Bundler & Deployment Pipelines — 2026-08-29
Prompt: Resolve INEFFECTIVE_DYNAMIC_IMPORT warnings for testRunner.ts and PreviewPanel.tsx.
Files touched:
- `src/services/provenance/provenance.ts` (modified)
- `src/services/deploy/deployClient.ts` (modified)
- `AI_CHANGELOG.md` (modified)
Changed:
- Converted dynamic import of `testRunner.ts` in `src/services/provenance/provenance.ts` (`runBackgroundTestsForProvenance`) to a top-level static import (`runProjectTestsDetailed`).
- Converted dynamic import of `PreviewPanel.tsx` helpers in `src/services/deploy/deployClient.ts` (`packageProjectForDeployment`) to top-level static imports (`buildBundledHtml`, `detectProjectTailwindVersion`, `injectTailwindScriptIntoHtml`).
- Updated `AI_CHANGELOG.md` reflecting the resolved bundling warnings and verification status.
Decisions:
- Option (a) (static imports) was chosen for both modules: `testRunner.ts` is already statically bundled into the main chunk by core modules (`TerminalPanel.tsx`, `agent/tools.ts`, `agent/ensemble.ts`, `provenance/bisect.ts`), and `PreviewPanel.tsx` is already statically imported by `App.tsx`. Static imports remove unnecessary dynamic import overhead without altering any runtime behavior.
Deviations: none
Verified: Ran `npm run build` to verify that both `[INEFFECTIVE_DYNAMIC_IMPORT]` warnings are gone; ran full test suite via vitest (71 test suites, 518 tests passed); verified `lint_applet` and `compile_applet` succeed with zero errors.
Open questions: none

### [HOTFIX-84] Merge Archived Changelog Summary & Remove CHANGELOG.md — 2026-08-29
Prompt: Merge CHANGELOG.md condensed entries as Archived Log Summary section into AI_CHANGELOG.md and delete CHANGELOG.md.
Files touched:
- `AI_CHANGELOG.md` (modified)
- `CHANGELOG.md` (deleted)
Changed:
- Consolidated 172 condensed historical entries from `CHANGELOG.md` into `AI_CHANGELOG.md` under a new `## Archived Log Summary` section situated between `## Current State` and `## Log`.
- Confirmed no build, test, or source code references to `CHANGELOG.md` exist across the codebase.
- Deleted `CHANGELOG.md` to establish a single active changelog file going forward while preserving `AI_CHANGELOG_ARCHIVE.md` untouched.
Decisions:
- Maintained exact date groupings and entry descriptions from the condensed log to ensure consistent grep-ability for past phase and hotfix labels.
Deviations: none
Verified: Grepped workspace to confirm zero build/test references to `CHANGELOG.md`; confirmed `AI_CHANGELOG.md` contains all archived entries; ran `lint_applet` and `compile_applet` successfully.
Open questions: none

### [HOTFIX-83] Fix Mobile Bottom Tab Bar Visibility on Terminal Focus — 2026-08-29
Prompt: Fix invisible/missing tab switch buttons when opening the terminal tab.
Files touched:
- `src/App.tsx` (modified)
- `src/components/terminal/TerminalPanel.tsx` (modified)
- `src/App.test.ts` (modified)
- `AI_CHANGELOG.md` (modified)
Changed:
- Removed erroneous `isKeyboardOpen ? 'hidden' : 'flex'` logic from the mobile `<nav>` tab bar in `App.tsx` that caused the tab switcher to vanish whenever the terminal input was focused.
- Removed aggressive `autoFocus` and container-level focus hijack from `TerminalPanel.tsx` to prevent unexpected keyboard popups and viewport shifts on mobile devices.
- Scoped the full-screen mobile editor view overlay to `activeTab === 'files'` so that switching tabs directly reveals the active view.
- Updated `App.test.ts` with assertions verifying that the bottom tab navigation bar remains permanently visible and functional when switching tabs and interacting with inputs.
Decisions:
- The bottom navigation bar on mobile must remain persistently visible to guarantee users can always switch views without being trapped in any single tab.
Deviations: none
Verified: `npm test` running `App.test.ts` and `TerminalPanel.test.tsx` passed (32/32 tests); `lint_applet` passed with 0 errors; `compile_applet` compiled successfully.
Open questions: none

### [HOTFIX-82] Official LAIDE Studio Vector Logo Integration — 2026-08-29
Prompt: Add provided SVG monogram logo everywhere in the application.
Files touched:
- `public/icon.svg` (modified)
- `src/components/shared/LaideLogo.tsx` (new)
- `src/components/shared/LaideLogo.test.tsx` (new)
- `src/components/shared/TopStrip.tsx` (modified)
- `src/components/shared/LockScreen.tsx` (modified)
- `src/components/shared/InstallPrompt.tsx` (modified)
- `src/components/shared/SettingsPanel.tsx` (modified)
- `AI_CHANGELOG.md` (modified)
Changed:
- Replaced `public/icon.svg` with the user-provided vector monogram logo (dark rounded canvas, gold inner shield, and stylized geometric "LS" strokes).
- Created reusable `<LaideLogo />` React component in `src/components/shared/LaideLogo.tsx` supporting custom sizing, optional background, accessibility labels, and standard SVG props.
- Integrated the new logo into `TopStrip.tsx` (top application header), replacing the placeholder terminal square.
- Added the logo to `LockScreen.tsx` (intro onboarding screen, passphrase initialization, and unlock vault headers).
- Updated `InstallPrompt.tsx` (PWA install card) and `SettingsPanel.tsx` (settings header & sidebar brand footer).
Decisions:
- Encapsulated SVG vectors in a shared component for crisp rendering across all screen densities and themes without pixel distortion or external asset fetch delays.
Deviations: none
Verified: Unit tests in `LaideLogo.test.tsx`, `TopStrip.test.tsx`, and `LockScreen.test.tsx` passed (18/18); `lint_applet` passed with 0 errors; `compile_applet` compiled cleanly.
Open questions: none

### [HOTFIX-81] Snapshot Restore UI, Version History Modal & Deploy Token Deletion — 2026-08-29
Prompt: Expose Snapshot restore / "Undo AI changes" via UI modal and wire deploy token deletion in DeployModal.
Files touched:
- `src/components/modals/SnapshotsModal.tsx` (new)
- `src/components/modals/SnapshotsModal.test.tsx` (new)
- `src/components/modals/DeployModal.tsx` (modified)
- `src/components/modals/DeployModal.test.tsx` (modified)
- `src/components/modals/FindWhatBrokeModal.tsx` (modified)
- `src/components/modals/FindWhatBrokeModal.test.tsx` (modified)
- `src/components/project/ProjectActionsMenu.tsx` (modified)
- `src/components/project/ProjectFilesPane.tsx` (modified)
- `src/App.tsx` (modified)
- `AI_CHANGELOG.md` (new)
Changed:
- Built `SnapshotsModal.tsx` displaying all IndexedDB saved project snapshots with relative timestamps, file breakdown, one-click manual snapshot creation, destructive restore confirmation dialog, individual snapshot deletion, and clear all.
- Added quick "Undo Last AI Changes" hero action banner in `SnapshotsModal` for immediate rollback of the most recent agent patch batch.
- Wired "Snapshots & Version History" menu item into `ProjectActionsMenu.tsx` and connected modal lifecycle across `App.tsx` and `useModalState`.
- Enhanced `FindWhatBrokeModal.tsx` regression view to offer direct snapshot rollback before the offending patch and added a button to open full version history.
- Added "Revoke / Delete Token" action button with confirmation state to `DeployModal.tsx` utilizing `deleteDeployToken()`.
Decisions:
- Enforced strict confirmation dialogs before snapshot restore and deletion to prevent accidental workspace data loss.
- Managed modal open state cleanly through React state and callbacks to comply with React 19 linting standards.
Deviations: none
Verified: Unit test suites in `SnapshotsModal.test.tsx`, `DeployModal.test.tsx`, `FindWhatBrokeModal.test.tsx`, and `ProjectActionsMenu.test.tsx` (23 tests total) all passed; `lint_applet` passed with 0 errors; `compile_applet` compiled successfully.
Open questions: none

### [HOTFIX-88] Secure Terminal node/eval with Web Worker Sandbox — 2026-08-30
Prompt: Route terminal node/eval/run commands through isolated Web Worker sandbox instead of direct main-thread execution.
Files touched:
- `src/services/bundler/sandboxRunner.ts` (new)
- `src/services/bundler/sandboxRunner.test.ts` (new)
- `src/components/terminal/TerminalPanel.tsx` (modified)
- `src/components/terminal/TerminalPanel.test.tsx` (modified)
- `AI_CHANGELOG.md` (modified)
Changed:
- Extracted terminal code evaluation into a dedicated Web Worker sandbox via Blob URL (`src/services/bundler/sandboxRunner.ts`), closing the main-thread `new Function` escape hatch that allowed access to `window` and `document`.
- Mocked out `sandboxRunner` in `TerminalPanel.test.tsx` to maintain existing tests without depending on happy-dom Web Worker polyfills, preserving exact UX logic tests.
- Formatted output formatting identical to previous behavior by serializing `fakeConsole` streams in Web Worker and mapping `FileItem` payloads safely over `postMessage`.
Decisions:
- Stripped non-transferable data (like methods or extraneous fields) from `files` array inside `TerminalPanel` before passing via `postMessage` to guarantee fast, safe serialization to the worker.
- Applied exact same 30-second execution timeout guard and cleanup behavior as `runProjectTests` worker to prevent infinite loops in terminal.
Deviations: none
Verified: `TerminalPanel.test.tsx` and `sandboxRunner.test.ts` unit tests pass cleanly. `npm run lint` and `npm run build` succeed with 0 errors.
Open questions: none

### [HOTFIX-89] Add Strict Content-Security-Policy to index.html — 2026-08-30
Prompt: Add a strict CSP meta tag to index.html, auditing and allowing all external network destinations, and denying everything else by default.
Files touched:
- `index.html` (modified)
Changed:
- Added `<meta http-equiv="Content-Security-Policy">` with `default-src 'none'`.
- Allowed external LLM endpoints (Google, Anthropic, OpenAI, OpenRouter, Groq), GitHub API, Deploy endpoints (Netlify, Vercel), and bundler CDN dependencies (esm.sh, jsdelivr, tailwindcss) in `connect-src`.
- Allowed `blob:` and `data:` for workers, iframes, and image sources as required by the bundler/preview.
Decisions:
- Restricting `connect-src` exactly to the audited list means custom user-configured OpenAI-compatible endpoints or custom MCP servers (other than localhost/127.0.0.1) will be blocked.
- Required adding `'unsafe-eval'` to `script-src` because `esbuild-wasm` needs it to compile and instantiate WebAssembly, and `sandboxRunner.ts` evaluates code via `new Function` in workers.
- Required adding `'unsafe-inline'` to `script-src` because the `PreviewPanel` injects user-authored application code via `srcDoc`, generating inline scripts that cannot run otherwise.
Deviations: none
Verified: `npm run build` succeeds, `npm run lint` succeeds.
Open questions: The strict `connect-src` inheritance on the un-sandboxed `srcDoc` iframe prevents user-authored preview apps from fetching from external APIs (e.g., `https://pokeapi.co`). To fix this, either `connect-src` needs `https:` or the preview iframe must be sandboxed.

### [HOTFIX-90] Standardize on "laide_" Storage Prefix & Clean Legacy Fallbacks — 2026-08-30
Prompt: Standardize on "laide_" prefix across all localStorage/sessionStorage keys, add one-time on-boot migration copying old keys byte-for-byte and deleting old keys, update all read/write sites, and remove dead fallback branches.
Files touched:
- `src/utils/storageMigration.ts` (new)
- `src/utils/storageMigration.test.ts` (new)
- `src/db.ts` (modified)
- `src/store.ts` (modified)
- `src/App.tsx` (modified)
- `src/hooks/useModalState.ts` (modified)
- `src/components/shared/SettingsPanel.tsx` (modified)
- `src/components/shared/InstallPrompt.tsx` (modified)
- `src/components/modals/GithubImportModal.tsx` (modified)
- `src/components/modals/GithubImportModal.test.ts` (modified)
- `src/components/modals/GithubPushModal.tsx` (modified)
- `src/components/modals/GithubPushModal.test.ts` (modified)
- `src/services/security/lockConfig.ts` (modified)
- `src/services/security/backup.ts` (modified)
- `src/services/security/backup.test.ts` (modified)
- `src/services/github/githubClient.ts` (modified)
- `src/services/deploy/deployClient.ts` (modified)
- `src/services/deploy/deployClient.test.ts` (modified)
- `src/services/bundler/previewCapture.ts` (modified)
- `AI_CHANGELOG.md` (modified)
Changed:
- Created `migrateLocalStorage()` utility in `src/utils/storageMigration.ts` that iterates `localStorage` and `sessionStorage`, copies any `xiom_` prefixed keys to `laide_` byte-for-byte without altering encryption payloads, and removes the old keys.
- Wired `migrateLocalStorage()` into `migrateXiomToLaide()` in `src/db.ts` to run automatically before app rendering.
- Migrated all read and write calls across Zustand store, settings panel, modals, GitHub client, deploy client, backup service, lock config, and preview capture scripts to use `laide_` exclusively.
- Removed legacy fallback read chains (e.g., `localStorage.getItem('laide_...') || localStorage.getItem('xiom_...')`).
Decisions:
- Preserved existing ciphertext as-is without re-encryption during key rename since the payload data is identical.
- Maintained fallback protection in migration utility so existing `laide_` values are not overwritten if already set.
Deviations: none
Verified: All 74 test suites (541 unit and integration tests) pass; `lint_applet` reports 0 errors; `compile_applet` compiles cleanly.
Open questions: none


### [HOTFIX-91] Migrate Encrypted Tokens from localStorage to IndexedDB — 2026-08-30
Prompt: examine the existing Dexie/IndexedDB vault schema and crypto module (src/services/security/crypto.ts and related) and decide whether to (a) migrate these specific ciphertext values into the existing IndexedDB vault store for consistency with the documented model.
Files touched:
- `src/db.ts` (modified)
- `src/components/shared/SettingsPanel.tsx` (modified)
- `src/hooks/useModalState.ts` (modified)
- `src/components/modals/DeployModal.tsx` (modified)
- `src/components/modals/GithubImportModal.test.ts` (modified)
- `src/components/modals/GithubPushModal.test.ts` (modified)
- `src/services/github/githubClient.ts` (modified)
- `src/services/deploy/deployClient.ts` (modified)
- `src/services/deploy/deployClient.test.ts` (modified)
- `src/services/security/backup.ts` (modified)
- `src/services/security/backup.test.ts` (modified)
Changed:
- Added `SecureToken` interface and `secureTokens` table to `LaideDatabase` schema (bumped version to 5).
- Expanded `migrateXiomToLaide()` to dynamically move `laide_github_pat`, `laide_netlify_token`, and `laide_vercel_token` from `localStorage` to `db.secureTokens` and delete old localStorage keys automatically on startup.
- Refactored `githubClient`, `deployClient`, `SettingsPanel`, `backup` service, and relevant modals to read/write from `db.secureTokens` via Dexie asynchronously.
Decisions:
- Persisted tokens as strings in IndexedDB in their exact AES-GCM encrypted format (without decrypting and re-encrypting), avoiding any user re-auth or key re-derivation.
- Avoided mutating `localStorage` keys for settings that are not sensitive (like `laide_custom_instructions` or `laide_active_profile_id`).
Deviations: none
Verified: All 74 test suites pass, fixing documentation discrepancy where API keys were claimed to be in IndexedDB but were in localStorage.
Open questions: none

### [HOTFIX-92] Remove Unsafe-Inline from CSP Script-Src & Add CSP Suite — 2026-08-30
Prompt: remove unnecessary 'unsafe-inline' from index.html CSP script-src directive after verifying codebase needs, rewrite test-csp.js into a proper Vitest test checking CSP structure.
Files touched:
- `index.html` (modified)
- `test-csp.js` (deleted)
- `src/services/security/csp.test.ts` (new)
- `AI_CHANGELOG.md` (modified)
Changed:
- Audited repository for dynamic script tags or inline handlers that could require `script-src 'unsafe-inline'`; confirmed none exist in the outer application document.
- Removed `'unsafe-inline'` from `script-src` in `index.html`'s `Content-Security-Policy` meta tag, hardening against XSS/DOM injection while retaining `'self' 'unsafe-eval' blob:`.
- Replaced root `test-csp.js` with structured Vitest test suite in `src/services/security/csp.test.ts` parsing directives and verifying `default-src 'none'`, `script-src` restrictions, `connect-src` origins, and asset sandbox controls.
Decisions:
- Placed the CSP test under `src/services/security/csp.test.ts` to adhere to repository conventions for security tests.
- Verified that preview iframe bundling and worker executions operate inside isolated iframe blob documents/Workers and do not affect the main window's CSP policy.
Deviations: none
Verified: All 75 test suites (546 tests) pass via `npx vitest run`; linter passes with 0 errors; `compile_applet` builds cleanly.
Open questions: none

### [HOTFIX-93] Add Create New Repository Option to GitHub Push Modal — 2026-08-31
Prompt: Add a "Create new repository" option to the GitHub push feature in LAIDE Studio with githubClient method, modal toggle, conditional inputs, 422 collision handling, and tests.
Files touched:
- `src/services/github/githubClient.ts` (modified)
- `src/components/modals/GithubPushModal.tsx` (modified)
- `src/services/github/githubClient.test.ts` (modified)
- `src/components/modals/GithubPushModal.test.ts` (modified)
- `AI_CHANGELOG.md` (modified)
Changed:
- Added `createRepo(name, options)` to `GithubClient` supporting personal (`/user/repos`) and organization (`/orgs/{org}/repos`) endpoints with `auto_init: true`.
- Added a segmented mode toggle in `GithubPushModal` switching between "Push to existing repository" and "Create new repository".
- Rendered Repository Name, Description, Visibility (Private default / Public), and optional Organization inputs for new repository mode.
- Orchestrated the push workflow to call `createRepo` first in new repo mode, skip the redundant 404 validation, map created repo metadata, and handle 422 name collisions with clear inline guidance.
Decisions:
- Preserved existing "Push to existing repository" behavior and decrypted PAT access via `createGithubClient(keys)` without alterations.
- Reused existing success summary view with the added direct repository URL link alongside the PR comparison button.
Deviations: none
Verified: All 75 test suites (552 tests) pass via `npx vitest run`; `lint_applet` reports 0 errors; `compile_applet` compiles cleanly.
Open questions: none

### [HOTFIX-94] Fix Repository Initialization Race Condition on Create Repo Push — 2026-08-31
Prompt: Fix a race condition in the "Create new repository" GitHub push flow by adding a retry loop before getBranch.
Files touched:
- `src/components/modals/GithubPushModal.tsx` (modified)
- `src/components/modals/GithubPushModal.test.ts` (modified)
- `AI_CHANGELOG.md` (modified)
Changed:
- Added retry loop (up to 5 attempts, 1s delay) for `client.getBranch()` immediately after `client.createRepo()` when `mode === 'create'`.
- Updated `setProgress` on each attempt to indicate repository initialization status ("Waiting for repository to initialize... (attempt N/5)").
- Throws clear actionable error if all retries fail, directing user to wait and click push again.
- Preserved untouched the existing branch, tree, blob, and commit creation flows and the existing repository push mode.
Decisions:
- Maintained exact 1-second fixed delay for retries to keep implementation robust and responsive.
- Added comprehensive unit test in `GithubPushModal.test.ts` mocking a 404 response on the first `getBranch` call followed by a 200 response on the second attempt.
Deviations: none
Verified: `npx vitest run src/components/modals/GithubPushModal.test.ts` passed 10/10 tests; `lint_applet` reported 0 errors; `compile_applet` compiled cleanly.
Open questions: none

### [HOTFIX-95] Extend Retry Coverage for Repo Initialization Race Condition — 2026-08-31
Prompt: Fix the remaining race condition in the "Create new repository" GitHub push flow by extending the retry loop to cover getCommit and getRepoTree.
Files touched:
- `src/components/modals/GithubPushModal.tsx` (modified)
- `src/components/modals/GithubPushModal.test.ts` (modified)
- `AI_CHANGELOG.md` (modified)
Changed:
- Removed duplicate `client.getBranch` call outside the retry loop for `mode === 'create'`.
- Restructured `baseCommitSha`, `baseTreeSha`, and `treeData` declaration to be accessible outside the `if (mode === 'create')` block.
- Expanded the existing retry loop (for `mode === 'create'`) to attempt `getBranch`, `getCommit`, and `getRepoTree` in sequence. The loop only marks success if all three network requests resolve without throwing a 404.
- Ensured the "Push to existing repository" mode strictly executes its normal 1-pass initialization without any polling/retry behavior.
Decisions:
- Grouped the dependent data retrievals (branch ref -> commit tree -> tree contents) under the same exception handler within the retry loop since a replication delay can cause any of these to be temporarily "not found".
Deviations: none
Verified: `npx vitest run src/components/modals/GithubPushModal.test.ts` passed 11/11 tests; `lint_applet` reported 0 errors; `compile_applet` compiled cleanly.
Open questions: none

### [HOTFIX-96] Add Searchable Repository Picker to Push to Existing Repo — 2026-08-31
Prompt: Add a repository picker to the "Push to existing repository" mode in LAIDE Studio, replacing manual owner/repo typing with a searchable dropdown.
Files touched:
- `src/services/github/githubClient.ts` (modified)
- `src/components/modals/GithubPushModal.tsx` (modified)
- `src/components/modals/GithubPushModal.test.ts` (modified)
- `AI_CHANGELOG.md` (modified)
Changed:
- Exported `GithubTreeResponse` and ensured `GithubRepo` includes `full_name`, `owner.login`, `name`, `default_branch`, and `private`.
- Integrated `client.listRepos()` on modal load when in existing mode to populate available repositories list.
- Replaced separate owner/repo text fields with a custom searchable combobox supporting client-side filtering, automatic owner/repo/default_branch population, and a manual typing fallback option.
- Maintained mobile ergonomics with >=44px touch targets and click-outside dropdown closure.
Decisions:
- Built custom lightweight combobox using standard React state and hooks without adding external UI dependencies.
- Retained full manual typing support when repos fail to fetch or when a non-listed repository is typed.
Deviations: none
Verified: Full test suite passing (75/75 test files, 556/556 tests); `lint_applet` passed with 0 errors; `compile_applet` build succeeded.
Open questions: none



### [HOTFIX-97] Add Cloudflare Pages to Deployment Providers — 2026-08-30
Prompt: Add Cloudflare Pages as a third deploy provider alongside Netlify and Vercel using the exact same structural patterns.
Files touched:
- `src/services/deploy/deployClient.ts` (modified)
- `src/services/deploy/deployClient.test.ts` (modified)
- `src/components/modals/DeployModal.tsx` (modified)
- `src/components/modals/DeployModal.test.tsx` (modified)
Changed:
- Implemented `deployToCloudflarePages` using the Cloudflare Direct Upload REST API via `FormData` mimicking Netlify and Vercel conventions.
- Added support for a secondary vault secret (`cloudflare_account_id`) to the `saveDeployToken`, `getDeployToken`, and `deleteDeployToken` crypto helpers.
- Added a new Cloudflare tab to `DeployModal.tsx` with inputs for both API Token and Account ID, utilizing the cached vault secrets on initialization.
- Added unit tests mimicking existing deployments and updated `DeployModal.test.tsx` to assert new Cloudflare UI states and successful deployment mocks.
Decisions:
- Cloudflare Pages deployments require both an API Token and an Account ID. Both are stored securely via AES-GCM encrypted vault using the existing `db.secureTokens` API.
Deviations: none
Verified: `vitest` pass for all modified code blocks; `compile_applet` finishes completely.
Open questions: none
