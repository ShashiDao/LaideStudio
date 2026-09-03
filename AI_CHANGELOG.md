## Current State
- Phase: HOTFIX-127
- Last verified working: All agent verification paths audited and hardened around the run-level WorkspaceOverlay; runTestsFromOverlay and runTestsDetailedFromOverlay added in testRunner.ts; run_tests, verify_tests, build_project, and verify_build fail closed with explicit errors when context.overlay is missing without falling back to canonical VFS; test and build runners evaluate the exact same candidate view materialized from the run-level overlay; comprehensive audit test suite overlayVerificationConsistency.test.ts (8 tests) verifies candidate modification visibility, accumulation, deletion propagation, byte-for-byte canonical immutability, and rejection of canonical fallback; all 91 test files (718 tests) pass in Vitest, tsc --noEmit passes (0 errors), npm run lint passes (0 errors), and compile_applet build succeeded.
- Known issues / incomplete: none
- Deviations from blueprint so far: none
- Tech Debt / Split Candidates:
  - `src/components/terminal/terminalExecutor.ts` (1365 lines) — Extract domain command executors (fs, git, npm, bisect) into separate handler files under `src/components/terminal/handlers/`.
  - `src/components/shared/FileTree.tsx` (1279 lines) — Extract tree node item rendering and search bar into `FileTreeNode.tsx` and `FileTreeSearch.tsx`.
  - `src/components/chat/ChatPanel.tsx` (1070 lines) — Extract message history list, model configuration header chip, and composer action bar into `ChatMessageList.tsx` and `ChatComposer.tsx`.
  - `src/components/modals/GithubPushModal.tsx` (1000 lines) — Extract PR metadata form, commit diff previewer, and branch creation wizard into dedicated sub-components.
  - `src/components/editor/Editor.tsx` (976 lines) — Extract CodeMirror extension configuration, search panel overlay, and mobile accessory toolbar into `editorExtensions.ts` and `EditorAccessoryBar.tsx`.
  - `src/components/shared/SettingsAIProvidersTab.tsx` (944 lines) — Extract WebLLM model manager, profile connection modal/drawer, and custom prompt templates into sub-components.
  - `src/components/modals/TrustReportModal.tsx` (918 lines) — Extract audit ledger summary card, human-vs-AI attribution visualizer, and test verification report into modular panels.
  - `src/components/modals/DeployModal.tsx` (832 lines) — Extract Netlify and Vercel provider deployment workflows and status log stream into separate sub-components.
  - `src/components/chat/PatchReviewSheet.tsx` (811 lines) — Extract unified diff hunk viewer, file patch accordion, and batch approve/reject bar into `PatchDiffHunk.tsx` and `PatchReviewControls.tsx`.
  - `src/components/shared/LockScreen.tsx` (781 lines) — Extract vault setup form, passphrase unlock form, and BIP-39 recovery phrase wizard into separate sub-views.
  - `src/components/preview/PreviewPanel.tsx` (870 lines) — Extract preview iframe wrapper, viewport scaling bar, and live console inspector drawer into dedicated sub-components.
  - `src/services/agent/ensemble.ts` (762 lines) — Extract candidate execution runner and arbiter judge prompt builder into separate sub-services under `src/services/agent/`.
  - `src/components/project/ProjectMetadataPanel.tsx` (761 lines) — Extract language distribution Recharts view, project statistics grid, and tag manager into modular panels.
  - `src/services/bundler/esbuild.worker.ts` (744 lines) — Extract VFS virtual plugin resolver and Tailwind CDN CSS transformer into separate helper modules.
  - `src/App.tsx` (690 lines) — Extract global keyboard accelerators and shell layout tabs into `useKeyboardShortcuts` hook and `AppLayout.tsx`.
  - `src/services/provenance/signing.ts` (666 lines) — Extract HMAC/Ed25519 signing primitives and audit chain verification into separate cryptographic services.
  - `src/services/llm/providers/webllm.ts` (652 lines) — Extract engine state subscription and WebGPU model cache manager into separate helper modules.
  - `src/components/modals/FindWhatBrokeModal.tsx` (620 lines) — Extract bisection progress indicator and historical test run diff viewer into sub-components.
  - `src/services/deploy/deployClient.ts` (609 lines) — Extract Netlify API and Vercel API client implementations into separate provider adapters.
  - `src/services/templates/projectTemplates.ts` (596 lines) — Extract template definitions and file manifest generators into individual template files under `src/services/templates/definitions/`.
  - `src/services/usage/tokenSpend.ts` (550 lines) — Extract pricing catalog definitions and token counting heuristics into `pricingCatalog.ts` and `tokenCounter.ts`.
  - `src/store.ts` (545 lines) — Slice Zustand store into dedicated feature slices (editorSlice, projectSlice, vaultSlice, uiSlice).
  - `src/components/modals/SnapshotsModal.tsx` (520 lines) — Extract snapshot timeline list and snapshot comparison diff viewer into sub-components.
  - `src/components/editor/EditorAiBlame.tsx` (519 lines) — Extract AI attribution tooltip and line-by-line provenance gutter into dedicated sub-components.
  - `src/components/project/ProjectSearchModal.tsx` (517 lines) — Extract search filter options and search result list item rendering into sub-components.
  - `src/services/fs/vfs.ts` (513 lines) — Extract OPFS file persistence and Dexie IndexedDB sync adapter into separate storage modules.
  - `src/components/modals/ImageViewerModal.tsx` (505 lines) — Extract image canvas pan/zoom controls and image metadata footer into sub-components.
  - `src/components/project/ProjectActionsMenu.tsx` (482 lines) — Extract ZIP export/import modal triggers and project deletion confirmation dialog into separate sub-components.
  - `src/services/security/passwordStrength.ts` (480 lines) — Extract password dictionary wordlists and pattern matchers into separate security utilities.
  - `src/components/shared/QuickConnectSheet.tsx` (473 lines) — Extract individual provider quick-connect cards into sub-components under `src/components/shared/`.
  - `src/services/provenance/trustScore.ts` (442 lines) — Extract penalty computation rules and letter grade formatters into separate provenance helpers.

## Archived Log Summary

### 2026-08-27
- **Framework-Agnostic Bundled Project Detection & Static Preview Fallback Guard** (HOTFIX-121): Updated `detectBundledProject` in `entryDetection.ts` to treat projects containing `/package.json` or `.jsx`/`.tsx` files as bundled (`isBundled = true`) regardless of hardcoded framework dependency names, and guarded static preview fallback in `PreviewPanel.tsx` against unbundled JSX and bare-specifier imports with a "Bundling Required" error card.
- **TerminalPrompt inputRef RefObject Null Typing Follow-up** (HOTFIX-120): Follow-up to the SettingsPanel and TerminalPanel file-split work: updated `inputRef` prop type in `TerminalPrompt.tsx` to `React.RefObject<HTMLInputElement | null>` to match `useRef<HTMLInputElement>(null)`.
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

— entries before 2026-09-02 moved to AI_CHANGELOG_ARCHIVE.md —

### [HOTFIX-107] Rebrand Cleanup, Github Import Modal Integration & Accessibility Pass — 2026-09-02
Prompt: Search repository for legacy "xiom" references, bump cache storage to laide-esm-dep-cache-v2 with legacy cache cleanup, integrate GithubImportModal, and perform accessibility hygiene pass with axe-core on EditorAiBlame, TerminalPanel, and PatchReviewSheet.
Files touched:
- `src/services/bundler/esbuild.worker.ts` (modified)
- `src/services/bundler/esbuild.worker.test.ts` (modified)
- `src/services/bundler/previewCapture.ts` (modified)
- `src/components/preview/PreviewPanel.tsx` (modified)
- `src/components/modals/GithubImportModal.tsx` (new)
- `src/components/project/ProjectSelector.tsx` (modified)
- `src/components/project/ProjectActionsMenu.tsx` (modified)
- `src/components/chat/PatchReviewSheet.tsx` (modified)
- `src/components/shared/AccessibilityPass.test.tsx` (new)
- `AI_CHANGELOG.md` (modified)
Changed:
- Bumped Cache Storage key in `esbuild.worker.ts` to `laide-esm-dep-cache-v2` and added `cleanLegacyCaches()` to automatically delete old `xiom-esm-dep-cache-v1` and `laide-esm-dep-cache-v1` caches on startup.
- Migrated legacy `xiom` event types and storage prefixes across preview `postMessage` listeners and capture systems with full backward compatibility.
- Integrated `GithubImportModal` into `ProjectSelector` and `ProjectActionsMenu` for frictionless repository importing.
- Conducted accessibility hygiene pass on `AiBlameSidePanel`, `TerminalPanel`, and `PatchReviewSheet`: resolved all axe-core violations (0 violations), added semantic landmark regions, ARIA labels, `aria-expanded` state, `Escape` key dismissal, and Tab focus trapping.
- Added comprehensive unit tests in `esbuild.worker.test.ts` and `AccessibilityPass.test.tsx`.
Decisions:
- Maintained dual-prefix support in preview message handlers (`LAIDE_` and `XIOM_`) so existing cached preview scripts continue communicating without runtime interruption.
- Trapped keyboard focus and attached Escape key handlers to `PatchReviewSheet` and its nested delete confirmation modal to adhere to WAI-ARIA modal dialog patterns.
Deviations: none
Verified: `AccessibilityPass.test.tsx` (5/5 tests passing with 0 axe-core violations), `esbuild.worker.test.ts` (34/34 tests passing), full vitest suite (79/79 suites, 623/623 tests passing), `npm run typecheck` passing (0 errors), `npm run lint` passing (0 errors), `compile_applet` build succeeded.
Commit: pending
Open questions: none

### [HOTFIX-108] Static Imports Optimization, Stale Closures & Robustness Polish — 2026-09-02
Prompt: Continue careful implementation across codebase hygiene, static imports optimization, error logging resilience, and hook dependencies.
Files touched:
- `src/services/security/passkeyCrypto.ts` (modified)
- `src/services/security/recovery.ts` (modified)
- `src/services/llm/factory.ts` (modified)
- `src/services/llm/modelDiscovery.ts` (modified)
- `src/services/github/githubClient.ts` (modified)
- `src/services/deploy/deployClient.ts` (modified)
- `src/components/shared/LockScreen.tsx` (modified)
- `src/components/shared/QuickConnectSheet.tsx` (modified)
- `src/components/shared/SettingsPanel.tsx` (modified)
- `src/components/chat/ChatPanel.tsx` (modified)
- `src/components/editor/Editor.tsx` (modified)
- `src/components/preview/PreviewPanel.tsx` (modified)
- `src/components/terminal/TerminalPanel.tsx` (modified)
- `src/hooks/useFileOperations.ts` (modified)
- `AI_CHANGELOG.md` (modified)
Changed:
- Replaced inline dynamic imports with top-level static imports in `passkeyCrypto.ts`, `recovery.ts`, `factory.ts`, `modelDiscovery.ts`, `githubClient.ts`, `deployClient.ts`, `LockScreen.tsx`, `QuickConnectSheet.tsx`, and `SettingsPanel.tsx` for cleaner bundling and predictable module resolution.
- Hardened stale closures in `ChatPanel.tsx` by using `useRef` for external prompt triggers and ensured `Editor.tsx` reads directly from CodeMirror document state (`view.state.doc.toString()`) on save keymaps.
- Added explicit error logging in `TerminalPanel.tsx` and `PreviewPanel.tsx` empty catch blocks to ensure debuggability.
- Optimized `useFileOperations.ts` effect dependencies by utilizing stable primitive `activeProjectId` rather than whole object references.
Decisions:
- Preserved lazy component loading where appropriate (modals) while standardizing synchronous internal crypto and utility helpers to static imports.
Deviations: none
Verified: `npm run lint` clean (0 errors); `compile_applet` production build succeeded with 0 errors.
Commit: pending
Open questions: none

### [HOTFIX-109] Non-Extractable VaultSession CryptoKeys & Sandboxed Test Worker Security Guard — 2026-09-02
Prompt: Stop storing raw master key in VaultSession (store non-extractable CryptoKeys in IndexedDB) and sandbox the test runner with a bootstrap security guard.
Files touched:
- `src/db.ts` (modified)
- `src/services/security/crypto.ts` (modified)
- `src/services/security/session.ts` (modified)
- `src/services/security/session.test.ts` (modified)
- `src/components/shared/LockScreen.tsx` (modified)
- `src/services/provenance/signing.ts` (modified)
- `src/services/bundler/sandboxGuard.ts` (new)
- `src/services/bundler/testRunner.ts` (modified)
- `src/services/bundler/testRunner.test.ts` (new)
- `AI_CHANGELOG.md` (modified)
Changed:
- Updated `VaultSession` interface and Dexie schema (`version(6)`) to store non-extractable `aesKey: CryptoKey` and `hmacKey: CryptoKey` directly in IndexedDB with HMAC `verifierBase64`, removing raw master key byte persistence and reducing default session duration to 24 hours.
- Rewrote `src/services/security/session.ts` to save and restore `KeyMaterial` directly using `CryptoKey` references and verify session authenticity via `verifyPassphrase` without exposing key bytes.
- Extracted shared sandbox lockdown logic into `src/services/bundler/sandboxGuard.ts` (`SANDBOX_GUARD_PREAMBLE`), blocking `indexedDB`, `fetch`, `caches`, `importScripts`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `BroadcastChannel`, `Worker`, `SharedWorker`, `openDatabase`, `serviceWorker`, and `navigator.sendBeacon`.
- Replaced direct module worker invocation in `src/services/bundler/testRunner.ts` with a sandboxed bootstrap worker that enforces security traps before dynamically importing bundled user test code.
Decisions:
- Preserved backward-compatible `masterKeyBytes?: Uint8Array` in `KeyMaterial` so existing unlock workflows remain operational while `VaultSession` persistence stores strictly non-extractable `CryptoKey` instances.
- Added `navigator.sendBeacon` lockdown to `SANDBOX_GUARD_PREAMBLE` to prevent out-of-band data exfiltration from test workers.
Deviations: none
Verified: `npx vitest run src/services/security/session.test.ts src/services/bundler/sandboxRunner.test.ts src/services/bundler/testRunner.test.ts` (16/16 tests passing), `npm run lint` (0 errors), `compile_applet` build passed.
Commit: pending
Open questions: none

### [HOTFIX-110] Pre-Deploy Secret Scanning & ZIP Import Path Sanitization — 2026-09-02
Prompt: Integrate secret scanning into deployment packaging and DeployModal with explicit confirmation, and sanitize ZIP import paths against path traversal attacks.
Files touched:
- `src/services/security/secretScan.ts` (new)
- `src/services/security/secretScan.test.ts` (new)
- `src/services/deploy/deployClient.ts` (modified)
- `src/components/modals/DeployModal.tsx` (modified)
- `src/services/fs/vfs.ts` (modified)
- `src/services/fs/zipImport.ts` (modified)
- `src/services/fs/zipImport.test.ts` (modified)
- `src/hooks/useFileOperations.ts` (modified)
- `AI_CHANGELOG.md` (modified)
Changed:
- Integrated `scanFilesForSecrets` into `buildDeployPackage` to scan all workspace files for `.env` files and API key patterns (Anthropic, OpenAI, Google, GitHub, generic credentials) before generating deployment archives.
- Updated `DeployModal.tsx` to trap detected secrets and render a dedicated warning interface detailing file, line number, pattern, and redacted preview, requiring explicit "Deploy anyway" user confirmation to prevent accidental key exposure.
- Added `sanitizeImportedPath` in `src/services/fs/vfs.ts` to reject path traversal attempts (`..`, `.`), control characters, and malformed segments.
- Updated `src/services/fs/zipImport.ts` to filter entries with `sanitizeImportedPath`, record skipped unsafe files, and notify users via toast warnings in `useFileOperations.ts`.
Decisions:
- Redacted secret previews in `secretScan.ts` (displaying only first and last 4 characters separated by ellipses) to protect sensitive values from full on-screen disclosure.
- Allowed explicit bypass in DeployModal via "Deploy anyway" action so false positives or intentional non-production configurations do not block deployments permanently.
Deviations: none
Verified: Vitest suite (81/81 test files, 631/631 tests passing), ESLint (0 errors), and `compile_applet` build succeeded.
Commit: pending
Open questions: none

### [HOTFIX-111] CI Pipeline & Typecheck Alignment — 2026-09-02
Prompt: Look into ci logs and fix it and then verify yourself first.
Files touched:
- `package-lock.json` (modified)
- `src/components/terminal/TerminalPanel.tsx` (modified)
- `src/components/shared/AccessibilityPass.test.tsx` (modified)
- `src/components/shared/LockScreen.tsx` (modified)
- `src/components/shared/Toaster.tsx` (modified)
- `src/store.ts` (modified)
- `src/services/security/recovery.test.ts` (modified)
- `AI_CHANGELOG.md` (modified)
Changed:
- Synchronized `package-lock.json` with `package.json` dependencies (resolving `axe-core@4.13.0` lockfile mismatch causing `npm ci` failures in CI).
- Made `files?: FileItem[]` optional with default `[]` in `TerminalPanel.tsx` component props and added explicit `files={[]}` in `AccessibilityPass.test.tsx`.
- Added defensive null-check guards for `keys.masterKeyBytes` in `LockScreen.tsx` setup before passing to `createRecoveryBundle` and `pendingSetup`.
- Extended `ToastMessage` and `ToastSlice` in `src/store.ts` to support `'warning'` toast types, and updated `src/components/shared/Toaster.tsx` with amber badge styling and `AlertTriangle` icon rendering.
- Fixed non-null assertions in `recovery.test.ts` for strict TypeScript type checking.
Decisions:
- Updated `ToastSlice` type definition to include `'warning'` to align with usages across file operations and security notifications while providing distinct amber visual feedback.
Deviations: none
Verified: `npm ci` completed cleanly, `npm run typecheck` (`tsc --noEmit`) passed with 0 errors, ESLint passed with 0 errors, full Vitest suite (81/81 test files, 631/631 tests) passed, and `compile_applet` build succeeded.
Commit: pending
Open questions: none

### [HOTFIX-113] Global Happy-DOM Environment, Node 20 Pinning & Strict Lint Unused-Vars Gating — 2026-09-02
Prompt: Set test environment happy-dom globally in vite.config.ts, pin Node 20 via .nvmrc and package.json engines, and upgrade no-unused-vars in eslint.config.js to error so lint gates CI.
Files touched:
- `vite.config.ts` (modified)
- `.nvmrc` (new)
- `package.json` (modified)
- `eslint.config.js` (modified)
- `src/App.tsx` (modified)
- `src/components/chat/ChatPanel.tsx` (modified)
- `src/components/editor/Editor.tsx` (modified)
- `src/components/modals/TrustReportModal.tsx` (modified)
- `AI_CHANGELOG.md` (modified)
Changed:
- Configured `test: { environment: 'happy-dom' }` globally in `vite.config.ts` along with `/// <reference types="vitest" />`.
- Created `.nvmrc` (`20`) and pinned `engines` in `package.json` to `"node": "20.x"` to match CI Node.js 20 environment.
- Upgraded `@typescript-eslint/no-unused-vars` to `'error'` in `eslint.config.js` to strictly gate the build against dead code and unused variables.
- Removed unused variables and imports across `App.tsx` (`GithubIcon`, `openFile`), `ChatPanel.tsx` (`AlertCircle`), `Editor.tsx` (`getTrustColorStyles`, `trustColorStyles`), and `TrustReportModal.tsx` (`Sparkles`), and wired the Copy Markdown Report action in `TrustReportModal.tsx`.
Decisions:
- Set global Vitest environment in `vite.config.ts` so future browser tests run without requiring per-file directives, while preserving support for per-file environment overrides.
- Upgraded `@typescript-eslint/no-unused-vars` to `'error'` rather than adding CLI flags so both IDEs and `npm run lint` enforce unused variable elimination automatically.
Deviations: none
Verified: `npm run typecheck` (`tsc --noEmit`) clean with 0 errors, `npm run lint` clean with 0 errors, Vitest test suite (81/81 test files, 631/631 tests) passing, and `compile_applet` production build succeeded.
Commit: pending
Open questions: none

### [HOTFIX-114] Secret Scanning in GitHub Push Flow & Bypass Confirmation — 2026-09-02
Prompt: Before the push actually sends files to GitHub in GithubPushModal.tsx, call scanFilesForSecrets on the file set about to be committed, mirroring DeployModal.tsx. If matches are found, block the push and show warning UI requiring explicit confirmation. Add test.
Files touched:
- `src/components/modals/GithubPushModal.tsx` (modified)
- `src/components/modals/GithubPushModal.test.ts` (modified)
- `AI_CHANGELOG.md` (modified)
Changed:
- Integrated `scanFilesForSecrets` from `src/services/security/secretScan.ts` into `handlePush` in `GithubPushModal.tsx` to inspect all workspace files prior to calling GitHub Git Data APIs.
- Implemented warning and confirmation UI in `GithubPushModal.tsx` mirroring `DeployModal.tsx`, presenting detected secret matches (path, line number, pattern, redacted preview) and blocking push execution until user clicks "Push anyway".
- Added unit tests in `GithubPushModal.test.ts` verifying that flagged secrets halt git API requests, display the warning list, allow cancellation to review files, allow bypass via "Push anyway", and ensure clean file sets push without friction.
Decisions:
- Maintained a `forceBypass?: boolean` flag in `handlePush` so user confirmation seamlessly proceeds with repository creation and branch pushes without re-scanning or resetting branch options.
- Retained full modal dismissibility and review mode via "Cancel & Review Files" button to allow users to clean up accidental secrets before re-attempting a push.
Deviations: none
Verified: `npx vitest run src/components/modals/GithubPushModal.test.ts` (16/16 tests passing), full Vitest suite (81/81 test files, 634/634 tests passing), `npm run lint` (0 errors), and `compile_applet` build succeeded.
Commit: pending
Open questions: none

### [HOTFIX-115] Preview Iframe Message Listener Source Validation — 2026-09-02
Prompt: FIX 2 — Add check that e.source === iframeRef.current?.contentWindow before processing preview messages in PreviewPanel.tsx and return early to prevent window spoofing of runtime errors, logs, and inspect mode. Add test.
Files touched:
- `src/components/preview/PreviewPanel.tsx` (modified)
- `src/components/preview/PreviewPanel.test.tsx` (modified)
- `AI_CHANGELOG.md` (modified)
Changed:
- Added strict source verification `if (e.source !== iframeRef.current?.contentWindow) return;` at the entry of the `handleMessage` listener in `PreviewPanel.tsx` before evaluating `e.data`.
- Guarded preview state updates (`runtimeError`, `consoleLogs`, `inspectedElement`) against spoofed message events originating from other frames, windows, or non-matching origins.
- Added comprehensive test in `PreviewPanel.test.tsx` verifying that spoofed runtime errors and console log messages from non-matching sources (such as parent `window` or `null`) are ignored, while messages originating from `iframe.contentWindow` are correctly processed and rendered.
Decisions:
- Used strict `e.source !== iframeRef.current?.contentWindow` reference comparison rather than `e.origin` because the sandboxed preview iframe uses `srcdoc` (without `allow-same-origin`), causing `e.origin` to report `"null"`.
Deviations: none
Verified: `npx vitest run src/components/preview/PreviewPanel.test.tsx` (13/13 tests passing), full Vitest suite (81/81 test files, 635/635 tests passing), `npm run lint` (0 errors), and `compile_applet` build succeeded.
Commit: pending
Open questions: none

### [HOTFIX-116] Synchronize Encryption KDF Documentation in README — 2026-09-02
Prompt: FIX 3 — Change "PBKDF2 + AES-GCM" to "Argon2id + AES-256-GCM" in README.md so features list matches the actual Argon2id implementation described in Architecture & Security.
Files touched:
- `README.md` (modified)
- `AI_CHANGELOG.md` (modified)
Changed:
- Updated the "Client-Side Encrypted Vault" feature bullet in `README.md` from `PBKDF2 + AES-GCM` to `Argon2id + AES-256-GCM`.
- Ensured uniform documentation of key derivation and cipher suite across the overview and security architecture sections.
Decisions:
- Kept all surrounding phrasing intact without adding or removing unrelated markdown sections.
Deviations: none
Verified: `grep -i "PBKDF2" README.md` returned 0 matches, `npm run lint` passed (0 errors), and `compile_applet` build succeeded.
Commit: pending
Open questions: none

### [HOTFIX-117] Shared Exponential Backoff & Rate-Limit Retry for LLM Providers — 2026-09-02
Prompt: FIX 4 — Implement a shared retry helper with exponential backoff + jitter (max 3 attempts) in the shared adapter layer, reusing friendlyError.ts's rate-limit detection for 429/ResourceExhausted errors without retrying terminal errors (e.g. 401) or mid-stream emissions.
Files touched:
- `src/services/llm/friendlyError.ts` (modified)
- `src/services/llm/llmAdapter.ts` (modified)
- `src/services/llm/factory.ts` (modified)
- `src/services/llm/llmAdapter.test.ts` (new)
- `AI_CHANGELOG.md` (modified)
Changed:
- Exported `isRateLimitError` / `isRetryableError` from `src/services/llm/friendlyError.ts` to provide a single source of truth detecting HTTP 429, ResourceExhausted, quota exceeded, and rate_limit_exceeded errors across all providers.
- Implemented `retryWithBackoff`, `calculateBackoffDelay`, and `withRetry` in `src/services/llm/llmAdapter.ts`, applying max 3 attempts with exponential backoff and jitter.
- Restricted stream retries strictly to the initial connection phase before any chunk has yielded, ensuring mid-stream failures are not restarted or duplicated in the UI.
- Wrapped all adapter instantiations in `src/services/llm/factory.ts` with `withRetry`.
- Added unit tests in `src/services/llm/llmAdapter.test.ts` verifying retry on 429, immediate failure on 401, stream initial connection retry, mid-stream failure non-retry, and backoff jitter calculation.
Decisions:
- Implemented `withRetry` as a transparent Proxy around `LLMAdapter` to preserve prototype identity (`instanceof` checks for individual provider classes) while intercepting `send`, `stream`, and `countTokens`.
Deviations: none
Verified: `npx vitest run src/services/llm/` (9/9 test files, 69/69 tests passing), full Vitest suite (82/82 test files, 644/644 tests passing), `npm run lint` (0 errors), and `compile_applet` build succeeded.
Commit: pending
Open questions: none

### [HOTFIX-118] Generate and Track package-lock.json for CI — 2026-09-02
Prompt: Generate and commit a package-lock.json file for this project by resolving exact versions for every dependency currently listed in package.json (both dependencies and devDependencies). Ensure the lockfile is NOT excluded in .gitignore.
Files touched:
- `package-lock.json` (new)
- `AI_CHANGELOG.md` (modified)
Changed:
- Generated `package-lock.json` lockfile version 3 resolving all dependencies and devDependencies from `package.json`.
- Confirmed `.gitignore` contains no rules excluding `package-lock.json` or `*.lock`.
- Established convention to maintain and update `package-lock.json` in sync with any future dependency changes for reliable `npm ci` in GitHub Actions.
Decisions:
- Used `npm i --package-lock-only` to generate lockfile version 3 without altering existing installed node_modules.
Deviations: none
Verified: `package-lock.json` generated and tracked, `.gitignore` inspected, `npm run lint` passed (0 errors), `compile_applet` build succeeded.
Commit: pending
Open questions: none

### [HOTFIX-119] Split SettingsPanel and TerminalPanel into Modular Sub-components & Backfill Tech Debt Registry — 2026-09-02
Prompt: Do a structure audit, fix CI badge URL, split SettingsPanel and TerminalPanel into sub-components, backfill Tech Debt / Split Candidates in AI_CHANGELOG.md, and run tests.
Files touched:
- `README.md` (modified)
- `src/components/shared/SettingsPanel.tsx` (modified)
- `src/components/shared/SettingsAppearanceTab.tsx` (new)
- `src/components/shared/SettingsAIProvidersTab.tsx` (new)
- `src/components/shared/SettingsIntegrationsTab.tsx` (new)
- `src/components/shared/SettingsSecurityVaultTab.tsx` (new)
- `src/components/shared/SettingsAdvancedTab.tsx` (new)
- `src/components/shared/settingsConstants.ts` (new)
- `src/components/terminal/TerminalPanel.tsx` (modified)
- `src/components/terminal/terminalTypes.ts` (new)
- `src/components/terminal/terminalExecutor.ts` (new)
- `src/components/terminal/terminalAutocomplete.ts` (new)
- `src/components/terminal/TerminalOutputList.tsx` (new)
- `src/components/terminal/TerminalPrompt.tsx` (new)
- `src/services/usage/tokenSpend.ts` (modified)
- `AI_CHANGELOG.md` (modified)
Changed:
- Corrected the CI badge URL in `README.md` from `characterskit/laide` to `ShashiDao/LaideStudio`.
- Split monolithic `SettingsPanel.tsx` (2,499 lines) into modular category tab components (`SettingsAppearanceTab`, `SettingsAIProvidersTab`, `SettingsIntegrationsTab`, `SettingsSecurityVaultTab`, `SettingsAdvancedTab`) and shared types/constants (`settingsConstants.ts`), reducing `SettingsPanel.tsx` to 196 lines.
- Split monolithic `TerminalPanel.tsx` (2,244 lines) into modular sub-modules (`terminalTypes.ts`, `terminalExecutor.ts`, `terminalAutocomplete.ts`, `TerminalOutputList.tsx`, `TerminalPrompt.tsx`), reducing `TerminalPanel.tsx` to 353 lines.
- Added `getSessionUsageSummary` and `clearSessionUsage` to `tokenSpend.ts` to cleanly service the Settings UI.
- Backfilled the "Tech Debt / Split Candidates" list in `AI_CHANGELOG.md` Current State with every remaining non-test file over 400 lines (31 files) with a clear one-line split proposal for each.
Decisions:
- Preserved all sub-components strictly within their respective feature folders (`src/components/shared/` and `src/components/terminal/`) without creating arbitrary new directories.
- Ensured zero logic duplication by lifting state to container shells while delegating command execution and tab rendering to dedicated modules.
Deviations: Structure cleanup pass outside the blueprint sequence.
Verified: Full Vitest suite passing (`npm test` — 82/82 test files, 645/645 tests passed in 126.94s), `npm run lint` clean (0 errors, 194 warnings), and `compile_applet` build succeeded.
Commit: pending
Open questions: none

### [HOTFIX-120] Fix RefObject Nullability Type for TerminalPrompt inputRef Prop — 2026-09-02
Prompt: In src/components/terminal/TerminalPrompt.tsx, change the inputRef prop type from React.RefObject<HTMLInputElement> to React.RefObject<HTMLInputElement | null>, check all split components for similar patterns, run typecheck, and log.
Files touched:
- `src/components/terminal/TerminalPrompt.tsx` (modified)
- `AI_CHANGELOG.md` (modified)
Changed:
- Updated `TerminalPromptProps.inputRef` type in `TerminalPrompt.tsx` from `React.RefObject<HTMLInputElement>` to `React.RefObject<HTMLInputElement | null>` to accurately reflect the return type of `useRef<HTMLInputElement>(null)`.
- Audited all other split sub-components in `src/components/terminal/` and `src/components/shared/` for `RefObject` prop patterns.
Decisions:
- Follow-up type refinement directly addressing React 19 / TypeScript `RefObject` nullable value ergonomics.
Deviations: none
Verified: `npm run typecheck` (`tsc --noEmit` — 0 errors) and `compile_applet` build succeeded.
Commit: pending
Open questions: none

### [HOTFIX-121] Framework-Agnostic Bundled Project Detection & Static Preview Fallback Guard — 2026-09-03
Prompt: Detect bundled projects containing package.json or JSX/TSX files and guard static preview fallback against raw JSX and bare-specifier imports with a clear bundling-required error state.
Files touched:
- `src/services/bundler/entryDetection.ts` (modified)
- `src/components/preview/PreviewPanel.tsx` (modified)
- `src/components/preview/PreviewPanel.test.tsx` (modified)
- `AI_CHANGELOG.md` (modified)
Changed:
- Updated `detectBundledProject` in `entryDetection.ts` to identify projects with `/package.json` or `.jsx`/`.tsx` files as bundled (`isBundled = true`), eliminating reliance on hardcoded framework dependency names.
- Added `hasJsxSyntax`, `hasNonRelativeImport`, and `scriptNeedsBundling` regex heuristics in `PreviewPanel.tsx` to detect unbundled JSX and bare-specifier imports in static script tags.
- Guarded static preview fallback to render a "Bundling Required" guidance card with a direct action button to switch to or configure bundling rather than failing silently with broken script tags.
- Updated `PreviewPanel.test.tsx` test suite with happy-dom mock worker support and coverage for syntax detection and UI fallback states.
Decisions:
- Allowed plain vanilla JS/HTML projects with relative imports to continue rendering instantly via the static fallback path without requiring the WebAssembly bundler.
Deviations: none
Verified: `npx vitest run src/services/bundler/entryDetection.test.ts src/components/preview/PreviewPanel.test.tsx` (34/34 tests passed in 4.38s), `npm run typecheck` (`tsc --noEmit` — 0 errors), `npm run lint` clean (0 errors), and `compile_applet` build succeeded.
Commit: pending
Open questions: none

### [HOTFIX-122] Sandpack Preview Engine Integration & Multi-Engine Selector — 2026-09-03
Prompt: Replace custom service worker/Babel preview with Sandpack (@codesandbox/sandpack-react), support dynamic templates, and integrate multi-engine preview selection in PreviewPanel.
Files touched:
- `src/components/preview/PreviewPane.tsx` (new)
- `src/components/preview/PreviewPane.test.tsx` (new)
- `src/components/preview/PreviewPanel.tsx` (modified)
- `src/components/preview/PreviewPanel.test.tsx` (modified)
- `vite.config.ts` (modified)
- `package.json` (modified)
- `AI_CHANGELOG.md` (modified)
- `AI_CHANGELOG_ARCHIVE.md` (modified)
Changed:
- Built `PreviewPane.tsx` utilizing `@codesandbox/sandpack-react` (`SandpackProvider` + `SandpackPreview`) for instant client-side bundling, CDN package resolution (esm.sh), and fast hot reload without service worker overhead.
- Implemented `detectSandpackTemplate` dynamically resolving project templates (`react`, `react-ts`, `vanilla`, `static`) based on file extensions, React imports, and package manifests.
- Added `normalizeSandpackFiles` and `extractDependenciesFromPackageJson` ensuring full file structure fidelity and dependency inheritance in Sandpack.
- Added Preview Engine segmented toggle in `PreviewPanel.tsx` (`[Bundler] [Sandpack]`), allowing developers to switch between the local offline ESBuild bundler and Sandpack CDN engine with one click, plus a quick-switch action from bundling-required error states.
- Configured Vitest `server.deps.inline` in `vite.config.ts` for `@codesandbox/sandpack-react`, `@codesandbox/sandpack-client`, and `static-browser-server` to resolve ESM/CJS interop in happy-dom environments.
Decisions:
- Preserved the existing ESBuild bundler as default engine (`defaultEngine = 'bundler'`) for zero-network offline local execution while offering Sandpack for immediate CDN-backed previews with external npm dependencies.
- Performed routine log archive rotation of 27 pre-2026-09-02 entries to `AI_CHANGELOG_ARCHIVE.md` to keep the active log concise and under context limits.
Deviations: none
Verified: 29/29 preview tests passed (`npx vitest run src/components/preview/PreviewPane.test.tsx src/components/preview/PreviewPanel.test.tsx` in 5.48s), full typecheck passed with 0 errors (`tsc --noEmit`), and `compile_applet` build succeeded.
Commit: pending
Open questions: none

### [HOTFIX-123] Agent Engine Phase 0 Implementation — 2026-09-03
Prompt: Implement Phase P0 of the LAIDE Agent Engine roadmap: WorkspaceOverlay, PatchSet, and TaskStateMachine.
Files touched:
- `src/db.ts` (modified)
- `src/services/agent/task/taskTypes.ts` (new)
- `src/services/agent/workspace/overlay.ts` (new)
- `src/services/agent/workspace/overlay.test.ts` (new)
- `src/services/agent/task/taskStateMachine.ts` (new)
- `src/services/agent/task/taskStateMachine.test.ts` (new)
- `src/services/agent/task/taskStore.ts` (new)
- `src/services/agent/task/taskStore.test.ts` (new)
- `src/services/agent/workspace/conflictResolver.ts` (new)
- `src/services/agent/workspace/conflictResolver.test.ts` (new)
Changed:
- Implemented `WorkspaceOverlay` interface to wrap the VFS and isolate candidate edits, keeping the real VFS untouched until explicitly committed.
- Built a durable `TaskStateMachine` backed by Dexie (`taskStore.ts`) to manage resumable state transitions (queued → analyzing → ... → completed).
- Introduced `AgentTask`, `AgentRun`, and `PatchSet` models in Dexie (`src/db.ts`) for transaction and provenance tracking.
- Added explicit conflict detection (`detectConflicts`) in `ConflictResolver` to prevent silent overwriting of modified base revisions.
Decisions:
- Verified overlay isolation, conflict handling, and task state flow with comprehensive unit tests without altering the existing UI or agent loop yet (per Step 1-3 roadmap constraints).
- Placed task metadata (`tasks`, `taskRuns`, `patchSets`) into Dexie for durability across sessions, crashes, and unloads.
Deviations: none
Verified: `npm run typecheck` passed (0 errors), `npm run lint` passed (0 errors), all 18 newly added unit tests pass across 4 test suites, and production build succeeded (`npm run build`).
Commit: pending
Open questions: none

### [HOTFIX-124] Enforce WorkspaceOverlay Write Isolation for Agent Execution — 2026-09-03
Prompt: Harden LAIDE Studio's agent execution architecture: agents must never mutate canonical VFS during a task; fix write side using WorkspaceOverlay.
Files touched:
- `src/services/agent/workspace/overlay.ts` (modified)
- `src/services/agent/tools.ts` (modified)
- `src/services/agent/agentLoop.ts` (modified)
- `src/services/agent/tools.test.ts` (modified)
- `src/services/agent/workspace/overlayWrite.test.ts` (new)
- `AI_CHANGELOG.md` (modified)
Changed:
- Refactored `executeAgentTool` in `tools.ts` to accept `ToolExecutionContext` with `overlay: WorkspaceOverlay` and routed `write_file` tool calls directly into the overlay layer, preventing any premature mutations to `useAppStore` pending patches or the canonical VFS.
- Enhanced `AgentWorkspaceOverlay` to capture `rationale`, `metadata` (model, provider, messageId), and `baseRevision` on overlay writes, and updated `diff()` to produce complete `PendingPatch` objects with proper attribution.
- Updated `runAgentLoop` in `agentLoop.ts` to instantiate `AgentWorkspaceOverlay` at task start, pass it into all agent tool calls, read and search across overlay buffers, and only commit the final deterministic `overlay.diff()` to `pendingPatches` upon task completion.
- Added comprehensive unit test suite `overlayWrite.test.ts` proving overlay write isolation, canonical VFS protection, multiple accumulating writes, create/replace/delete operations, and end-to-end agent loop integration.
Decisions:
- Passed `overlay` via `context` through `executeAgentTool` so all filesystem tools (`read_file`, `write_file`, `list_directory`, `search_code`) operate on the active overlay layer in a unified manner.
- Updated `tools.test.ts` to assert against overlay state and the staged overlay diff rather than legacy direct store writes.
Deviations: none
Verified: All 57 unit tests passed across 9 test suites (`npx vitest run src/services/agent/`), `npm run lint` passed with 0 errors, and `compile_applet` passed with 0 errors.
Commit: pending
Open questions: none

### [HOTFIX-125] Enforce Single Persistent WorkspaceOverlay for Agent Runs — 2026-09-03
Prompt: Finish Prompt 1 — enforce ONE persistent WorkspaceOverlay for the entire agent run; remove dangerous fallback, verify accumulation across tool calls, keep canonical VFS untouched, add regression tests A-G.
Files touched:
- `src/services/agent/agentLoop.ts` (modified)
- `src/services/agent/tools.ts` (modified)
- `src/services/agent/workspace/overlayRunLifecycle.test.ts` (new)
- `AI_CHANGELOG.md` (modified)
Changed:
- Guaranteed single `WorkspaceOverlay` instantiation at the agent execution boundary (`runAgentLoop`) and ensured that exact same instance is passed via `ToolExecutionContext.overlay` to every agent tool call (`read_file`, `write_file`, `list_directory`, `search_code`, `run_tests`).
- Replaced the dangerous silent per-tool fallback in `tools.ts` with an explicit invariant warning and unified active overlay handling across all workspace operations.
- Added `baseRevision` option support to `RunAgentLoopOptions` and `AgentWorkspaceOverlay` constructor so the run base revision remains stable throughout the run.
- Implemented comprehensive regression test suite (`overlayRunLifecycle.test.ts`) validating all invariant requirements: A (same instance reuse), B (write -> read sees modified content), C (sequential write accumulation), D (write -> search_code finds staged content), E (write -> run_tests runs on materialized overlay), F (canonical VFS untouched across multiple tool calls), G (second agent run gets a fresh overlay without leaking prior runs).
Decisions:
- Retained defensive fallback in `tools.ts` with an explicit invariant warning rather than throwing an unhandled exception for compatibility with legacy standalone tool calls, while ensuring normal agent runs always pass the persistent run-level overlay.
- Scoped `AgentWorkspaceOverlay` strictly to the execution lifecycle of `runAgentLoop` so distinct runs never leak uncommitted overlay state.
Deviations: none
Verified: `npm run typecheck` passed (0 errors), `npm run lint` passed (0 errors), all 89 test files and 697 tests passed in Vitest (`npm test`), and `compile_applet` passed cleanly.
Commit: pending
Open questions: none

### [HOTFIX-126] WorkspaceOverlay Candidate Build Verification Pipeline — 2026-09-03
- Prompt: Make build/bundle verification use the SAME WorkspaceOverlay candidate as agent tests. Materialize run-level overlay, preserve generic bundle() API, detect entry point without guessing or mutating canonical VFS, fail closed if overlay missing, cover regression requirements A-H.
- Files touched:
  - `src/services/bundler/buildRunner.ts` (new)
  - `src/services/agent/tools.ts` (modified)
  - `src/services/agent/tools.test.ts` (modified)
  - `src/services/agent/workspace/overlayBuildVerification.test.ts` (new)
  - `AI_CHANGELOG.md` (modified)
- Changed:
  - Implemented `verifyProjectBuild(files, onProgress)` and `verifyBuildFromOverlay(overlay, onProgress)` in `src/services/bundler/buildRunner.ts`, compiling materialized candidate files from `WorkspaceOverlay` using the existing `bundle(files, entryPoint, onProgress)` API.
  - Reused `detectBundledProject(files)` from `entryDetection.ts` to deterministically resolve the candidate entry point without hard-coding or mutating canonical VFS.
  - Registered `build_project` (and `verify_build` alias) in `AGENT_TOOLS` and `executeAgentTool` in `src/services/agent/tools.ts`, enforcing fail-closed execution when `context.overlay` is missing.
  - Added full regression test suite in `src/services/agent/workspace/overlayBuildVerification.test.ts` proving:
    - A: Build sees overlay candidate changes (not canonical).
    - B: Build does not mutate canonical VFS (original files remain untouched).
    - C: Syntactically invalid candidate code in overlay fails build while canonical VFS remains untouched.
    - D: Unmodified canonical project compiles successfully through the candidate path.
    - E: Deletions in overlay are respected in candidate compilation and not resurrected from canonical VFS.
    - F: Build verification operates on the exact same `overlay` instance passed in `context` alongside tool operations.
    - G: Multiple sequential edits accumulate and are all verified together in the build.
    - H: Canonical VFS content is byte-for-byte identical before and after candidate build verification.
    - Fail-Closed: Missing `context.overlay` fails explicitly without invoking the compiler.
    - Deterministic entry point error: When no valid entry point is present, returns clear failure without guessing.
    - Tool alias: `verify_build` executes identically to `build_project`.
- Decisions:
  - Preserved the pure `bundle(files, entryPoint, onProgress)` contract in `bundler.ts` without introducing VFS reads or hidden global overlay state.
  - Kept build verification isolated to the candidate overlay materialized at verification time, ensuring canonical VFS remains strictly read-only until explicit commit.
- Deviations: none
- Verified: PASS — `npx vitest run src/services/agent/workspace/overlayBuildVerification.test.ts` (11 tests passed), `npx vitest run src/services/agent/tools.test.ts` (11 tests passed), `npx vitest run src/services/agent/workspace/overlayRunLifecycle.test.ts` (7 tests passed), `npx vitest run src/services/bundler/` (7 test suites, 78 tests passed), `npx vitest run src/services/agent/` (11 test suites, 75 tests passed), full test suite `npm test` (90 test suites, 708 tests passed), `npx tsc --noEmit` (0 errors), `npm run lint` (0 errors), and `compile_applet` passed cleanly.
- Commit: pending
- Open questions: none

### [HOTFIX-127] WorkspaceOverlay Verification Consistency & Fail-Closed Hardening Audit — 2026-09-03
- Prompt: Audit and harden all agent verification paths around the run-level WorkspaceOverlay. Confirm test and build verification evaluate the exact same candidate state, enforce fail-closed rejection when overlay context is missing without falling back to canonical VFS, ensure byte-for-byte canonical VFS immutability, and add audit regression test suite.
- Files touched:
  - `src/services/bundler/testRunner.ts` (modified)
  - `src/services/bundler/testRunner.test.ts` (modified)
  - `src/services/agent/tools.ts` (modified)
  - `src/services/agent/workspace/overlayBuildVerification.test.ts` (modified)
  - `src/services/agent/workspace/overlayVerificationConsistency.test.ts` (new)
  - `AI_CHANGELOG.md` (modified)
- Changed:
  - Added overlay-aware test execution functions `runTestsFromOverlay(overlay)` and `runTestsDetailedFromOverlay(overlay)` in `src/services/bundler/testRunner.ts` with validation ensuring only valid WorkspaceOverlay instances can be passed.
  - Audited and hardened `run_tests` and `verify_tests` in `src/services/agent/tools.ts` to fail closed with an explicit error when `context.overlay` is missing, eliminating silent fallback to `listFiles(projectId)`.
  - Added unit test coverage for `runTestsFromOverlay` and `runTestsDetailedFromOverlay` in `src/services/bundler/testRunner.test.ts`.
  - Created a comprehensive consistency audit regression test suite in `src/services/agent/workspace/overlayVerificationConsistency.test.ts` covering 8 essential invariant requirements:
    - Requirement 1: `run_tests` evaluates candidate overlay modifications rather than canonical VFS.
    - Requirement 2: `build_project` compiles candidate overlay modifications rather than canonical VFS.
    - Requirement 3: `run_tests` and `build_project` both evaluate the exact same accumulated candidate state across sequential edits.
    - Requirement 4: Deletions in the candidate overlay are respected by both tests and build verification without resurrection from canonical VFS.
    - Requirement 5: Canonical VFS content is byte-for-byte identical before and after both test and build candidate verification.
    - Requirement 6: Both verification paths evaluate the exact same `WorkspaceOverlay` instance from `ToolExecutionContext`.
    - Requirement 7: Fail closed — both `run_tests` and `build_project` return explicit errors if `context.overlay` is missing.
    - Requirement 8: No silent fallback — missing overlay in agent context rejects rather than reading from `listFiles`.
  - Cleaned up unused imports across test files to maintain 0 ESLint errors.
- Decisions:
  - Maintained canonical VFS strictly read-only until explicit commit; all verification tools materialize directly from the run-level overlay.
  - Verification paths fail closed immediately if called without active overlay context, completely preventing accidental execution against stale canonical disk state.
- Deviations: none
- Verified: PASS — `npx vitest run src/services/agent/workspace/overlayVerificationConsistency.test.ts` (8 tests passed), `npx vitest run src/services/agent/workspace/overlayRunLifecycle.test.ts` (7 tests passed), `npx vitest run src/services/agent/` (12 test suites, 83 tests passed), `npx vitest run src/services/bundler/` (7 test suites, 80 tests passed), full test suite `npm test` (91 test files, 718 tests passed), `npm run typecheck` (`tsc --noEmit` — 0 errors), `npm run lint` (0 errors), and `compile_applet` passed cleanly.
- Commit: pending
- Open questions: none












