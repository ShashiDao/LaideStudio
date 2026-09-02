## Current State
- Phase: HOTFIX-120
- Last verified working: Full TypeScript typecheck passing (`npm run typecheck` / `tsc --noEmit`), `compile_applet` build succeeded, and `TerminalPrompt.tsx` `inputRef` typing updated to `React.RefObject<HTMLInputElement | null>`.
- Known issues / incomplete: none
- Deviations from blueprint so far: Structure cleanup follow-up.
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
  - `src/components/preview/PreviewPanel.tsx` (765 lines) — Extract preview iframe wrapper, viewport scaling bar, and live console inspector drawer into dedicated sub-components.
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

### [HOTFIX-106] Honest Shell Messaging, Capabilities Command & Simulated Environment Transparency — 2026-09-01
Prompt: Replace POSIX-mimicking command-not-found error with honest scope messaging, expand help/capabilities command detailing real vs. simulated execution, and make uname clearly simulated.
Files touched:
- `src/components/terminal/TerminalPanel.tsx` (modified)
- `src/components/terminal/TerminalPanel.test.tsx` (modified)
- `AI_CHANGELOG.md` (modified)
Changed:
- Replaced POSIX error formatting `sh: command not found: <cmd>` with transparent browser shell messaging: `laide: '<cmd>' isn't available in this browser-based shell — type 'help' to see what is`.
- Added a dedicated `capabilities` command and expanded `help` to explicitly clarify what is real (VFS IndexedDB file operations, Web Worker isolated JS execution via sandboxRunner.ts, in-browser WebAssembly ESBuild, Vitest runner, offline vendoring) vs. what is simulated (no arbitrary binaries, no live npm/pip registry client).
- Updated `uname` and `uname -a` easter eggs to clearly label the environment as `LAIDE-Browser-Shell (simulated environment)` and `LAIDE Browser Sandbox 1.0.0 (simulated environment; WebAssembly/Worker VFS)`.
- Updated unit tests in `TerminalPanel.test.tsx` to verify honest error messages, the `capabilities` output breakdown, and simulated `uname` responses.
Decisions:
- Preserved all supported commands and syntax rules, scoping modifications strictly to user-facing transparency, manual text, and error clarity.
Deviations: none
Verified: `npm test` passed 78/78 suites (615 tests); `npm run typecheck` passed with 0 errors; `npx eslint` passed with 0 errors.
Commit: pending
Open questions: none

### [HOTFIX-105] Cryptographically Signed Provenance Proofs & Standalone Verifier — 2026-09-01
Prompt: Implement cryptographically signed provenance proof export, verification, standalone zero-dependency verification script, and historical trust progression tracking.
Files touched:
- `src/services/provenance/signing.ts` (new)
- `src/services/provenance/signing.test.ts` (new)
- `public/verify-provenance.js` (new)
- `src/components/modals/TrustReportModal.tsx` (modified)
- `AI_CHANGELOG.md` (modified)
Changed:
- Built `src/services/provenance/signing.ts` providing ECDSA P-256 (SHA-256) keypair management, encrypted private key storage in IndexedDB vault, signed JSON provenance artifact export, proof verification with tamper detection index, PR markdown summary generation, and historical trust progression calculation.
- Created `public/verify-provenance.js` delivering a zero-dependency standalone Node.js/Browser verification module using standard Web Crypto (`crypto.subtle`) APIs.
- Extended `TrustReportModal.tsx` with dedicated "Cryptographic Proof" and "History" tabs supporting proof export, public key export, artifact verification, standalone verifier download, and visual trust progression timelines.
- Added comprehensive unit tests in `signing.test.ts` validating key generation, signing, chain verification, tampering detection, and compatibility with the standalone script.
Decisions:
- Used Web Crypto ECDSA P-256 with SHA-256 and JWK/DER encoding to guarantee browser and Node.js cross-compatibility with zero external dependencies.
Deviations: none
Verified: All 78 Vitest test suites (613 tests) passed; `npm run typecheck` passed with 0 errors; ESLint passed with 0 errors; production build verified via `compile_applet`.
Commit: pending
Open questions: none

### [HOTFIX-99] Add EditorTabs to Phone Mode Editor Overlay — 2026-08-31
Prompt: Wrap the phone-mode Editor view in a flex column with EditorTabs matching the desktop tab strip layout.
Files touched:
- `src/App.tsx` (modified)
- `AI_CHANGELOG.md` (modified)
Changed:
- Wrapped full-screen phone mode Editor overlay in `<div className="absolute inset-0 z-10 flex flex-col overflow-hidden">`.
- Added `<EditorTabs>` above `<div className="flex-1 relative overflow-hidden"><Editor ... /></div>` in the phone files tab overlay.
Decisions:
- Used existing EditorTabs component, openFileIds, activeFileId, and file action handlers already scoped in App.tsx.
Deviations: none
Verified: `compile_applet` passed; `lint_applet` passed with 0 errors; all Vitest test suites passing.
Commit: pending
Open questions: none

### [HOTFIX-98] Fix Cloudflare Publish Button Label Bug & Re-apply AI Trust Gutter — 2026-08-31
Prompt: Merge two branches that had diverged — an external review's verified AI Trust Gutter feature (never successfully landed after 3 prior attempts, most recently HOTFIX-93 in a since-abandoned branch) and this branch's own progress through HOTFIX-97 — into one correct, current state. The external review also flagged that HOTFIX-97's self-reported test results didn't match an independent run.
Files touched:
- `src/components/modals/DeployModal.tsx` (modified)
- `src/components/editor/EditorAiBlame.tsx` (modified)
- `src/components/editor/EditorAiBlame.test.tsx` (modified)
- `src/components/editor/Editor.tsx` (modified)
Changed:
- Fixed `DeployModal.tsx` line ~740: the Publish button's label used a 2-way ternary (`activeTab === 'netlify' ? 'Netlify' : 'Vercel'`) that was never extended when the Cloudflare tab was added, so selecting Cloudflare and clicking publish showed "Publish to Vercel." Every other `activeTab` branch in the same file already correctly used the 3-way form (confirmed by checking all 13 occurrences) — this was the one spot that got missed. Fixed to match the established pattern.
- Re-applied `classifyLineTrust()` / `createAiTrustGutter()` in EditorAiBlame.tsx and the toolbar toggle in Editor.tsx (full feature description in the original HOTFIX-93 entry from the now-abandoned branch this was cherry-picked from). Diffed the current files against that branch first and confirmed HOTFIX-93 through 97 never touched these 3 files, so no merge conflicts existed — copied forward directly.
Decisions:
- Ran the full suite independently before making any change, rather than trusting HOTFIX-97's self-reported "77 suites / 559 tests, all passing." Found 75 suites / 558 passing, 1 real failure (the Cloudflare button bug above) — not a flaky/environmental failure, a genuine missed case. Corrected the "Current State" block's HOTFIX-97 claim rather than silently overwriting it, per the "if the log and the code disagree, flag it" rule.
Deviations: none
Verified: `tsc --noEmit` clean. `npm run build` clean (the db.ts INEFFECTIVE_DYNAMIC_IMPORT warning is pre-existing, confirmed via git stash against the unmodified baseline — not introduced here). Full suite: 75/75 files, 564/564 tests passing (559 baseline + 5 new gutter tests, with the 1 prior failure now fixed). Ran DeployModal.test.tsx in isolation post-fix: 7/7 passing, including the previously-failing Cloudflare test. eslint: 0 errors.
Open questions: none

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
Commit: pending
Open questions: none

### [HOTFIX-100] Single-Pass ZIP Decompression & GitHub Archive Streamlining — 2026-08-31
Prompt: Replace sequential per-file GitHub import with single-archive zipball download, and optimize ZIP import to a single decompression pass with immediate user feedback toast.
Files touched:
- `src/services/github/githubClient.ts` (modified)
- `src/services/github/githubClient.test.ts` (modified)
- `src/services/fs/zipImport.ts` (modified)
- `src/services/fs/zipImport.test.ts` (modified)
- `src/components/modals/GithubImportModal.tsx` (modified)
- `src/components/modals/GithubImportModal.test.ts` (modified)
- `src/hooks/useFileOperations.ts` (modified)
- `AI_CHANGELOG.md` (modified)
Changed:
- Added `getRepoArchive` method to `GithubClient` fetching repository zipball via `GET /repos/{owner}/{repo}/zipball/{ref}`.
- Refactored `GithubImportModal` to fetch the complete repo archive in a single request and extract via `importZip`, removing per-file round-trips and concurrency batching.
- Replaced double-decoding in `zipImport.ts` (`async('string')` + `async('base64')`) with a single `entry.async('uint8array')` pass decoded locally via `TextDecoder` or `uint8ArrayToBase64`.
- Added immediate feedback toast upon file drop/selection in `useFileOperations.ts` before asynchronous extraction begins.
- Integrated archive wrapper folder prefix stripping in `zipImport.ts` to preserve correct top-level project paths.
Decisions:
- Stripped common top-level repository wrapper folders directly from archive entries during decompression to maintain fidelity for projects where all files reside in a specific subfolder.
- Used chunked `String.fromCharCode` in `uint8ArrayToBase64` to prevent call-stack overflow on large binary assets.
Deviations: none
Verified: All 75 test suites (570 tests) passing; targeted test suite (`zipImport.test.ts`, `GithubImportModal.test.ts`, `githubClient.test.ts`) passing with 150+ files integrity tests; `compile_applet` and `lint_applet` completed with 0 errors.
Commit: pending
Open questions: none

### [HOTFIX-101] Isolated Worker Sandbox Security Boundary — 2026-09-01
Prompt: Harden arbitrary JS execution in sandboxRunner.ts with a real security boundary, evaluate iframe vs worker shadowing approaches, and add security assertions.
Files touched:
- `src/services/bundler/sandboxRunner.ts` (modified)
- `src/services/bundler/sandboxRunner.test.ts` (modified)
- `src/components/terminal/TerminalPanel.tsx` (modified)
- `AI_CHANGELOG.md` (modified)
Changed:
- Implemented multi-layered ambient global neutralization and Proxy security traps on `self`, `globalThis`, `WorkerGlobalScope.prototype`, and `DedicatedWorkerGlobalScope.prototype` inside the worker script.
- Neutralized storage (`indexedDB`, `caches`, `openDatabase`), network (`fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`), sub-worker (`Worker`, `SharedWorker`, `serviceWorker`), messaging (`BroadcastChannel`, `postMessage`), and execution (`importScripts`) APIs with immediate descriptive `SecurityError` exceptions on property access/invocation.
- Secured runner parameter scope by explicitly injecting sanitized proxies for `self`, `globalThis`, `window`, and individual dangerous global identifiers.
- Added comprehensive unit tests in `sandboxRunner.test.ts` verifying immediate `SecurityError` throws when attempting `self.indexedDB.open`, `fetch`, `self.caches.open`, `self.importScripts`, `XMLHttpRequest`, or `self.postMessage`.
- Updated `TerminalPanel.tsx` help documentation and welcome banner to accurately reflect isolated Web Worker sandbox guarantees without overclaiming WASM.
Decisions:
- Chose Approach (b) (layered worker global neutralization and scope proxy traps): allows preserving background thread execution with reliable 30s timeout interruptibility via `worker.terminate()` without blocking the UI event loop, while avoiding Chromium/WebKit security restrictions on spawning Workers from opaque-origin `srcdoc` iframes.
- Standardized on immediate `SecurityError` exceptions upon accessing or invoking restricted ambient capabilities for consistent error attribution.
Deviations: none
Verified: All 75 test suites (579 tests) passing; `sandboxRunner.test.ts` (11/11 tests) and `TerminalPanel.test.tsx` (30/30 tests) passing; `lint_applet` clean (0 errors); `compile_applet` build succeeded.
Commit: pending
Open questions: none

### [HOTFIX-102] Lockfile Integrity Verification & Offline Package Vendoring — 2026-09-01
Prompt: Implement dependency lockfile SHA-256 integrity verification, local package vendoring for zero-network builds, and npm terminal commands.
Files touched:
- `src/services/bundler/lockfile.ts` (new)
- `src/services/bundler/lockfile.test.ts` (new)
- `src/services/bundler/esbuild.worker.ts` (modified)
- `src/services/bundler/esbuild.worker.test.ts` (modified)
- `src/services/bundler/bundler.ts` (modified)
- `src/components/terminal/TerminalPanel.tsx` (modified)
- `AI_CHANGELOG.md` (modified)
Changed:
- Implemented `.laide/lockfile.json` parser, serializer, and SHA-256 integrity checker in `lockfile.ts` with pure JS fallback and sorted deterministic formatting.
- Added dependency integrity verification in `esbuild.worker.ts` VFS plugin: records SHA-256 hashes on first download and aborts builds with `[SECURITY INTEGRITY MISMATCH]` if remote bytes change or are tampered with.
- Added vendored package resolution in `esbuild.worker.ts` checking `/vendor/<pkg>.js` to resolve bare imports locally with 0 network calls.
- Integrated `npm vendor <pkg>`, `vendor <pkg>`, `npm update-lock [pkg]`, and `lockfile [update|status]` shell commands in `TerminalPanel.tsx` for vendoring and lock management.
- Extended unit tests in `lockfile.test.ts` and `esbuild.worker.test.ts` covering hashing, lockfile round-trips, mismatch rejections, and zero-network vendor builds.
Decisions:
- Standardized lockfile location at `/.laide/lockfile.json` (with fallback discovery for `lockfile.json` and `.lockfile.json`) matching the `.laide/` project metadata directory convention.
- Vendored files are placed under `/vendor/<pkg>.js` (and `@scope/pkg.js`), allowing full transparency and direct in-editor inspection.
Deviations: none
Verified: All 76 test suites (592 tests) passing; `lockfile.test.ts` (11/11 tests) and `esbuild.worker.test.ts` (34/34 tests) passing; `lint_applet` clean (0 errors); `compile_applet` build succeeded.
Commit: pending
Open questions: none

### [HOTFIX-103] Opt-In Offline WebGPU In-Browser LLM Provider — 2026-09-01
Prompt: Add an opt-in offline model provider using WebLLM via WebGPU, running a compact instruction-tuned model with weight caching, feature detection, and clear UI notices.
Files touched:
- `src/services/llm/providers/webllm.ts` (new)
- `src/services/llm/providers/webllm.test.ts` (new)
- `src/services/llm/factory.ts` (modified)
- `src/services/llm/factory.test.ts` (modified)
- `src/services/llm/modelDiscovery.ts` (modified)
- `src/services/llm/modelDiscovery.test.ts` (modified)
- `src/components/shared/SettingsPanel.tsx` (modified)
- `src/components/shared/QuickConnectSheet.tsx` (modified)
- `src/components/modals/ModelPickerModal.tsx` (modified)
- `package.json` (modified)
- `AI_CHANGELOG.md` (modified)
Changed:
- Added `@mlc-ai/web-llm` integration in `webllm.ts` conforming directly to `LLMAdapter` with streaming support, token counting, structured tool calls, and text-based JSON/XML tool-call fallback parsing.
- Configured default recommended model: `Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC` (~1.1 GB download, ~1.4 GB VRAM) for best code reasoning and patch adherence on mid-range laptop integrated GPUs, along with lightweight alternatives (`Llama-3.2-1B`, `SmolLM2-1.7B`, `Qwen2.5-Coder-0.5B`).
- Added WebGPU device capability detection (`checkWebGPUSupport()`) surfacing GPU vendor/driver status or actionable browser requirements if unavailable.
- Integrated weight caching and cache lifecycle management via browser Cache API / OPFS (`isModelCachedInBrowser`, `deleteCachedOfflineModel`), ensuring weights are never downloaded without explicit user initiation and work fully offline once cached.
- Updated `factory.ts` and `modelDiscovery.ts` to seamlessly route `webllm` profiles into the existing agent loop, tool execution, and patch application flows without code path divergence.
- Added visual warnings in `SettingsPanel`, `QuickConnectSheet`, and `ModelPickerModal` clearly identifying offline models as lower-capability and slower than hosted frontier models.
- Added unit tests in `webllm.test.ts`, `factory.test.ts`, and `modelDiscovery.test.ts` with comprehensive engine mocks.
Decisions:
- Selected `Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC` as default recommended offline model: it fits well within the <2GB threshold (~1.1GB weights download), requires only ~1.4GB GPU memory (comfortably executable on Intel Iris Xe, Apple Silicon, or AMD Radeon integrated GPUs), and exhibits superior code syntax generation and diff formatting compared to generic non-coder models.
- Maintained zero API key requirement for offline provider while keeping all profile persistence, model discovery, and agent tool execution compatible with standard connection profiles.
Deviations: none
Verified: All 77 test suites (605 tests) passing; `webllm.test.ts` (11/11 tests), `factory.test.ts` (3/3 tests), `modelDiscovery.test.ts` (11/11 tests) passing; production build verified clean with `compile_applet`.
Commit: pending
Open questions: none

### [HOTFIX-104] GitHub Actions CI Workflow, Typecheck Script & Status Badge — 2026-09-01
Prompt: Add .github/workflows/ci.yml running on every push and pull request with npm ci, typecheck, lint, full vitest test suite, production build, fail-fast and npm caching, plus CI status badge in README.md.
Files touched:
- `.github/workflows/ci.yml` (new)
- `package-lock.json` (new)
- `package.json` (modified)
- `README.md` (modified)
- `src/services/llm/providers/webllm.ts` (modified)
- `src/services/llm/providers/webllm.test.ts` (modified)
- `src/components/shared/SettingsPanel.tsx` (modified)
- `AI_CHANGELOG.md` (modified)
Changed:
- Created `.github/workflows/ci.yml` triggering on `push` and `pull_request` to `main` and `master`, configuring `actions/checkout@v4`, `actions/setup-node@v4` with Node 20 and npm cache, sequential fail-fast step execution for `npm ci`, `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build`.
- Added `"typecheck": "tsc --noEmit"` script and separated `"lint": "eslint ."` in `package.json` for clear CI step distinction and local developer tooling.
- Generated `package-lock.json` to enable reproducible `npm ci` installs and lockfile-keyed npm caching on GitHub runners.
- Added GitHub Actions workflow status badge and script documentation in `README.md`.
- Fixed type exports (`WebLLMEngineState`), caught error `cause` chaining, and unused import lint warnings in `webllm.ts`, `SettingsPanel.tsx`, and `webllm.test.ts`.
Decisions:
- Configured concurrency cancellation (`group: ${{ github.workflow }}-${{ github.ref }}`, `cancel-in-progress: true`) in `ci.yml` to automatically cancel outdated pending runs when new commits are pushed to open pull requests.
- Retained fail-fast ordering: Typecheck -> Lint -> Test -> Build to surface syntax and type errors within seconds before launching lengthy test suites or full bundle optimization.
Deviations: none
Verified: `npm run typecheck` passed (0 errors); `npm run lint` passed (0 errors); full vitest suite passed (77/77 test suites, 605/605 tests); `compile_applet` production build succeeded.
Commit: pending
Open questions: none

### [HOTFIX-105] Honest Terminal Shell Messaging & Capabilities Documentation — 2026-09-01
Prompt: Update TerminalPanel unrecognized command message to be honest about browser scope, expand help/capabilities command detailing real vs simulated execution, and revisit uname easter egg.
Files touched:
- `src/components/terminal/TerminalPanel.tsx` (modified)
- `src/components/terminal/TerminalPanel.test.tsx` (modified)
- `AI_CHANGELOG.md` (modified)
Changed:
- Updated unrecognized command output to honest scope message: `laide: '<cmd>' isn't available in this browser-based shell — type 'help' to see what is`.
- Expanded `help` and added `capabilities` command detailing real capabilities (IndexedDB VFS, Web Worker sandboxed JS execution, in-browser WebAssembly ESBuild, Vitest runner, offline vendoring) vs. simulated environment features.
- Transparently formatted `uname` and `uname -a` easter egg to clarify browser sandbox context.
- Updated `TerminalPanel.test.tsx` tests to verify honest command messaging.
Decisions:
- Standardized shell prefix to `laide: '<cmd>' isn't available in this browser-based shell — type 'help' to see what is` rather than mimicking POSIX OS errors.
Deviations: none
Verified: All 30 tests in `TerminalPanel.test.tsx` passed; full vitest suite passed.
Commit: pending
Open questions: none

### [HOTFIX-106] Swipe Gesture per Hunk Row in PatchReviewSheet — 2026-09-01
Prompt: Add a swipe gesture per hunk row in PatchReviewSheet (swipe right to approve/check, swipe left to reject/uncheck) using Pointer Events, preserving checkbox clicks, keyboard operability, and reduced-motion preferences.
Files touched:
- `src/components/chat/PatchReviewSheet.tsx` (modified)
- `src/components/chat/PatchReviewSheet.test.ts` (modified)
- `AI_CHANGELOG.md` (modified)
Changed:
- Implemented `HunkReviewRow` sub-component with Pointer Events (`onPointerDown`, `onPointerMove`, `onPointerUp`, `onPointerCancel`) to support touch, mouse, and trackpad drag.
- Added visual swipe action indicator backgrounds behind each hunk card with smooth opacity transitions for swipe right (Approve Hunk) and swipe left (Reject Hunk).
- Preserved standard checkbox click fallback, keyboard navigation (Tab, Space, and Enter), and `aria-label` screen reader announcements.
- Added `usePrefersReducedMotion` hook to respect `(prefers-reduced-motion: reduce)` by disabling transform translation effects and transitions.
- Added unit tests in `PatchReviewSheet.test.ts` covering swipe-to-reject, swipe-to-approve, keyboard Space/Enter toggling, and reduced-motion styles.
Decisions:
- Used a 50px threshold (`SWIPE_THRESHOLD`) and clamped horizontal drag offset (max 120px) with 8px vertical scroll dead-band to prevent conflicts with page scrolling.
Deviations: none
Verified: `PatchReviewSheet.test.ts` (8/8 tests) passed; full vitest test suite (78/78 suites, 618/618 tests) passed; `npm run lint` clean (0 errors); `compile_applet` passed.
Commit: pending
Open questions: none

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











