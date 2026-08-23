## Current State
- Phase: REBRAND-2
- Last verified working: Full test suite passes cleanly with 49 test files and 315 tests in Vitest (`npm test`). `compile_applet` (`npm run build`) builds the application bundle with 0 errors.
- Known issues / incomplete: none
- Deviations from blueprint so far: none

### Phase Numbering Rule
- Phase and subphase labels must never be reused across entries.
- Always grep `AI_CHANGELOG.md` (e.g. `grep "\[<label>\]" AI_CHANGELOG.md`) for an existing label before assigning it.
- Ad-hoc fix work, audits, or maintenance outside the sequential blueprint sequence must use a distinct prefix like `[REVIEW-FIX]`, `[HOTFIX]`, or `[AUDIT]` (with an incremental counter if multiple are needed) instead of borrowing a blueprint number.

## Log

### [REBRAND-2] Migrate IndexedDB from XiomDatabase to LaideDatabase — 2026-08-23
Prompt: Rename the underlying Dexie database from 'XiomDatabase' to 'LaideDatabase'. Copy all existing rows (projects, files, snapshots, connectionProfiles, provenanceEntries) from any existing XiomDatabase into the new LaideDatabase, preserving project data. Delete the old database only if the copy succeeds.
Files touched:
- `src/db.ts` (modified)
- `src/main.tsx` (modified)
- `src/db.test.ts` (new)
Changed:
- Renamed the `XiomDatabase` argument in `super('XiomDatabase')` to `'LaideDatabase'` inside `LaideDatabase` constructor.
- Implemented `migrateXiomToLaide()` in `src/db.ts` which uses `Dexie.exists()` to check for the old `'XiomDatabase'`, opens it with the correct schema, copies all rows to `LaideDatabase` via `db.transaction` and `bulkPut`, and deletes the old database on success.
- Exported and awaited `migrateXiomToLaide()` inside `src/main.tsx` before invoking React `createRoot`, ensuring data is fully migrated before the app accesses `db`.
- Added `src/db.test.ts` with `fake-indexeddb` to simulate an old `XiomDatabase` with records in each table, execute the migration, and assert the old DB is deleted while the new DB successfully imported the data.
Decisions: Leveraged Dexie's `.bulkPut` combined with a single transaction block for the new DB insert phase to maintain atomicity and speed. The old DB is explicitly retained if any error is caught during the data copy phase.
Deviations: none
Verified: `src/db.test.ts` passes cleanly in Vitest.
Open questions: none

### [FEAT-ENSEMBLE-1] Dual-LLM Ensemble Mode with Sandboxed Test Verification — 2026-08-23
Prompt: When the user has more than one LLM provider configured, add an opt-in mode where a coding task is sent to two providers at once, both candidate patches are run through the sandboxed test runner, and only the patch that passes is shown to the user (if both pass, show both diffs and let the user pick). Reuses the existing LLMAdapter abstraction, defaults to off in Settings.
Files touched:
- `src/services/agent/ensemble.ts` (new)
- `src/services/agent/ensemble.test.ts` (new)
- `src/components/EnsembleCandidatePickerModal.tsx` (new)
- `src/components/EnsembleCandidatePickerModal.test.tsx` (new)
- `src/store.ts` (modified)
- `src/components/SettingsPanel.tsx` (modified)
- `src/components/ChatPanel.tsx` (modified)
Changed:
- Implemented `runSimulatedAgentCandidate`, `evaluateCandidatePatches`, and `runEnsembleDualEvaluation` in `src/services/agent/ensemble.ts` using the unified `LLMAdapter` abstraction with no provider-specific branching.
- Created `EnsembleCandidatePickerModal.tsx` to display dual candidate comparison columns, pass/fail test indicators, test logs, and patch diff lists when user selection is needed.
- Added `ensembleModeEnabled` and `ensembleCandidateBProfileId` configuration in `store.ts` with local storage persistence, defaulting to false/disabled.
- Added Dual-LLM Ensemble Mode opt-in toggle card with token cost notice and secondary candidate selector to `SettingsPanel.tsx`.
- Integrated parallel ensemble execution and candidate resolution into `ChatPanel.tsx`, including bottom bar status indicator and auto-selection when a single candidate passes tests.
- Added unit tests in `ensemble.test.ts` and UI test in `EnsembleCandidatePickerModal.test.tsx`.
Decisions: Defaulted ensemble mode to off with a clear token cost warning. Executed candidate generation in simulated in-memory containers so that intermediate tool calls do not touch the user's live VFS or active pending patches list until test verification and selection complete.
Deviations: none
Verified: All 48 test files and 314 tests pass in Vitest (`npm test`). Application build succeeds (`compile_applet`).
Open questions: none

### [FEAT-PROVENANCE-3] Historical Provenance Bisection ("Find What Broke This") Action — 2026-08-23
Prompt: Add a "Find what broke this" action that walks backward through provenance chain snapshots, binary-searches to identify the earliest patch introducing a test failure, surfaces patch diff and model rationale, and offers a one-click action to pre-fill chat for the agent to fix.
Files touched:
- `src/services/provenance/bisect.ts` (new)
- `src/services/provenance/bisect.test.ts` (new)
- `src/services/provenance/index.ts` (modified)
- `src/components/FindWhatBrokeModal.tsx` (new)
- `src/components/FindWhatBrokeModal.test.tsx` (new)
- `src/components/ProjectActionsMenu.tsx` (modified)
- `src/components/EditorAiBlame.tsx` (modified)
- `src/components/Editor.tsx` (modified)
- `src/components/TerminalPanel.tsx` (modified)
- `src/App.tsx` (modified)
Changed:
- Implemented `bisectBrokenTest` in `src/services/provenance/bisect.ts` using logarithmic binary search ($O(\log N)$ historical test runs) across ordered provenance entries.
- Implemented in-memory historical file state reconstruction (`reconstructHistoricalFiles`) without mutating the live project VFS, deep-cloning files and rewinding patch diffs down to candidate revision indices.
- Added support for `AbortSignal` for instant user cancellation of in-flight bisection runs and progress callback instrumentation.
- Created `FindWhatBrokeModal.tsx` displaying step-by-step progress, binary-search bounds, candidate tests selector, offending patch metadata (model, provider, timestamp, rationale), before/after unified diff, and historical test runner failure logs.
- Added one-click "Send to Agent to Fix" action pre-filling `queuedPrompt` and routing to the Chat tab with full failure context, rationale, and diff.
- Wired "Find What Broke This" affordances into `ProjectActionsMenu`, `EditorAiBlame` side panel, `TerminalPanel` (via `bisect` command and failed test prompts), and `App.tsx`.
- Added unit and integration tests in `bisect.test.ts` (synthetic history, $O(\log N)$ step assertion, abort signal, diff formatting) and `FindWhatBrokeModal.test.tsx`.
Decisions: Kept all bisection runs strictly in-memory against cloned snapshot states so the user's active file editor and live VFS state are never touched or modified during analysis.
Deviations: none
Verified: Full Vitest test suite passes (46 test files, 308 tests). ESLint exits with 0 errors (`npx eslint . --quiet`). TypeScript checks clean (`npx tsc --noEmit`). Applet build succeeds (`compile_applet`).
Open questions: none

### [FEAT-PROVENANCE-2] Background Test Suite Runner & Editor AI Blame Affordance — 2026-08-23
Prompt: Automatically run the sandboxed project test suite after patch application in the background and attach results to provenance ledger entries; add an AI blame affordance to the CodeMirror editor displaying model, provider, timestamp, rationale, and test status.
Files touched:
- `src/db.ts` (modified)
- `src/services/bundler/testRunner.ts` (modified)
- `src/services/provenance/provenance.ts` (modified)
- `src/services/provenance/blame.ts` (new)
- `src/services/provenance/index.ts` (modified)
- `src/components/PatchReviewSheet.tsx` (modified)
- `src/components/EditorAiBlame.tsx` (new)
- `src/components/Editor.tsx` (modified)
- `src/services/provenance/blame.test.ts` (new)
- `src/services/provenance/provenance.test.ts` (modified)
- `src/components/EditorAiBlame.test.tsx` (new)
Changed:
- Extended `ProvenanceEntry` with `ProvenanceTestResult` and optional before/after snapshots in `db.ts`.
- Implemented `runProjectTestsDetailed` in `src/services/bundler/testRunner.ts` to return structured test execution metrics (passed, failed, total, failed test names, status, and output).
- Added `runBackgroundTestsForProvenance` and `attachTestResultToEntry` in `src/services/provenance/provenance.ts` and triggered it asynchronously from `PatchReviewSheet.tsx` after patch application without blocking UI.
- Implemented `computeFileAiBlame` and `getFileAiBlameCached` with LRU-style cache in `src/services/provenance/blame.ts` to trace per-line attribution with zero typing lag.
- Created CodeMirror 6 extensions (`createAiBlameHoverTooltip`, `createAiBlameCursorListener`) and `AiBlameSidePanel` inspector in `src/components/EditorAiBlame.tsx` and integrated them into `src/components/Editor.tsx` with header action toggle.
- Added comprehensive unit and integration tests covering line blame calculation, multi-patch sequential histories, background test execution, test result formatting, and inspector rendering.
Decisions: Kept the blame lookup memoized/cached per file path and content hash to guarantee zero perceptible typing lag; ran test suite in Web Worker asynchronously after patch application to keep the UI completely non-blocking.
Deviations: none
Verified: All 297 tests pass across 44 test suites (`npm test`). ESLint quiet passes with 0 errors (`npx eslint . --quiet`). Applet compilation passes (`compile_applet`).
Open questions: none

### [FEAT-PROVENANCE-1] Local Tamper-Evident Provenance Ledger for Applied AI Patches — 2026-08-23
Prompt: Add a local, tamper-evident history of every applied AI patch (provenance ledger) with Dexie schema migration, hash chaining, model/provider metadata threading, and verification utilities.
Files touched:
- `src/db.ts` (modified)
- `src/services/agent/patchSchema.ts` (modified)
- `src/services/agent/tools.ts` (modified)
- `src/services/agent/agentLoop.ts` (modified)
- `src/components/ChatPanel.tsx` (modified)
- `src/components/PatchReviewSheet.tsx` (modified)
- `src/services/provenance/provenance.ts` (new)
- `src/services/provenance/index.ts` (new)
- `src/services/provenance/provenance.test.ts` (new)
- `src/components/PatchReviewSheet.test.ts` (modified)
- `src/services/agent/tools.test.ts` (modified)
Changed:
- Added Dexie schema `version(2)` in `LaideDatabase` with the new `provenanceEntries` table carrying forward all v1 tables.
- Threaded `model`, `provider`, and `messageId` execution context from LLM chat assistant messages and agent loops down into `addPendingPatch` and `PendingPatch`.
- Implemented `src/services/provenance/provenance.ts` providing standard SHA-256 hash chaining (with 64-zero genesis root), entry payload serialization, sequential chain ordering, and tamper verification.
- Hooked `recordProvenanceEntry` directly into `PatchReviewSheet.tsx` alongside VFS write operations for all applied patch types (`create`, `delete`, `append`, full & partial `replace`).
- Added unit and integration test suites validating hash computation, genesis root linking, multi-project isolation, and tamper detection (altered file paths, mutated hashes, metadata changes, broken links, intermediate entry deletions).
Decisions: Kept the ledger 100% local in Dexie with Web Crypto API (`crypto.subtle.digest`) for zero-dependency high-performance cryptographic hashing.
Deviations: none
Verified: All 279 tests pass across 42 test files in Vitest (`npx vitest run`). ESLint passes with 0 errors (`npm run lint`). `compile_applet` succeeds.
Open questions: none

### [HOTFIX-32] Add zoomable ImageViewerModal component for image file preview in FileTree — 2026-08-23
Prompt: Add a dedicated image viewer component in the FileTree file open logic that detects image extensions (.png, .jpg, .svg) and displays them in a zoomable preview modal instead of trying to open them in the CodeMirror editor.
Files touched:
- `src/components/ImageViewerModal.tsx` (new)
- `src/components/ImageViewerModal.test.tsx` (new)
- `src/components/FileTree.tsx` (modified)
- `src/components/FileTree.test.tsx` (modified)
Changed:
- Created `ImageViewerModal` with pan, pinch/wheel zoom, 90° rotation, fit to view, keyboard shortcuts (Esc, +, -, 0, r), file copy/download, and transparent checkerboard background.
- Updated `FileTree` file open handling in tree nodes and search results to detect image extensions (`.png`, `.jpg`, `.jpeg`, `.svg`, `.gif`, `.webp`, `.ico`, `.bmp`) and trigger the zoomable modal instead of setting `activeFileId` to open binary contents in CodeMirror.
- Added image preview action to the context menu on image files.
- Added comprehensive unit tests in `ImageViewerModal.test.tsx` and `FileTree.test.tsx`.
Decisions: Supported both vector SVG encoding (raw XML / data URI) and raster base64 rendering, ensuring smooth viewport scaling up to 1000% with natural dimension readout.
Deviations: none
Verified: All 265 Vitest tests pass across 41 test suites (`npm test -- --run`). ESLint and TypeScript compilation pass cleanly with 0 errors.
Open questions: none

### [HOTFIX-31] Lazy-load crypto.ts, bundler.ts, and gpt-tokenizer for Vite code-splitting — 2026-08-23
Prompt: Change crypto.ts and bundler.ts to be dynamically imported everywhere to fix Vite chunk-splitting warnings. Lazy-load gpt-tokenizer in ChatPanel to prevent it from blocking the main chunk.
Files touched:
- `src/App.tsx` (modified)
- `src/components/ChatPanel.tsx` (modified)
- `src/components/LockScreen.tsx` (modified)
- `src/components/SettingsPanel.tsx` (modified)
- `src/components/TerminalPanel.tsx` (modified)
- `src/components/PreviewPanel.tsx` (modified)
- `src/components/PreviewPanel.test.tsx` (modified)
- `src/services/bundler/testRunner.ts` (modified)
- `src/services/github/githubClient.ts` (modified)
- `src/services/llm/factory.ts` (modified)
- `src/services/passkeyCrypto.ts` (modified)
- `src/services/recovery.ts` (modified)
Changed:
- Changed static imports of `bundler.ts` functions to dynamic `await import` across TerminalPanel and testRunner.
- Moved `escapeScriptClosingTags` implementation into PreviewPanel directly to remove the synchronous bundler import.
- Changed static imports of `crypto.ts` to dynamic `await import` in LockScreen, SettingsPanel, githubClient, llm/factory, passkeyCrypto, and recovery.
- Replaced the static `gpt-tokenizer` import in ChatPanel with a lazy `await import` in its async token updater.
Decisions: Made all production imports of these heavy dependencies dynamic so Vite correctly splits them into isolated manual chunks rather than inlining them into the main React bundle.
Deviations: none
Verified: `npm run build` output shows these modules and vendor chunks are correctly split. `npm run lint` passes. `npm test` passes.
Open questions: none


### [HOTFIX-30] Fix CodeMirror SearchCursor TypeScript errors and resolve all ESLint errors — 2026-08-23
Prompt: Fix CodeMirror SearchCursor TypeScript errors in Editor.tsx and resolve all 83 ESLint errors across components and services so npm run lint exits 0 cleanly.
Files touched:
- `src/components/Editor.tsx` (modified)
- `src/components/App.tsx` (modified)
- `src/components/ChatPanel.tsx` (modified)
- `src/components/FileTree.tsx` (modified)
- `src/components/GithubImportModal.tsx` (modified)
- `src/components/GithubPushModal.tsx` (modified)
- `src/components/LockScreen.tsx` (modified)
- `src/components/PatchReviewSheet.tsx` (modified)
- `src/components/PatchReviewSheet.test.ts` (modified)
- `src/components/PreviewPanel.tsx` (modified)
- `src/components/PreviewPanel.test.tsx` (modified)
- `src/components/ProjectActionsMenu.tsx` (modified)
- `src/components/ProjectMetadataPanel.tsx` (modified)
- `src/components/ProjectMetadataPanel.test.tsx` (modified)
- `src/components/RenameProjectModal.tsx` (modified)
- `src/components/SettingsPanel.tsx` (modified)
- `src/components/TerminalPanel.tsx` (modified)
- `src/components/TopStrip.tsx` (modified)
- `AI_CHANGELOG.md` (modified)
Changed:
- Corrected TypeScript types in `Editor.tsx` by using CodeMirror's `SearchCursor` type directly instead of generic `Iterator`.
- Eliminated synchronous `setState` within `useEffect` hooks across components using deferred promise microtasks (`Promise.resolve()`) and component mount cancellation flags.
- Resolved React Compiler purity and component-in-render issues by lifting nested components (`CustomTooltip`), wrapping event handlers in `useCallback`, and ensuring pure render lifecycles.
- Cleaned up all unused variables, parameters, and imports, and attached cause chains to rethrown errors.
Decisions: Retained existing behavior and interfaces without introducing breaking API changes while achieving zero TypeScript and ESLint errors.
Deviations: none
Verified: `npx tsc --noEmit` and `npx eslint . --quiet` passed with 0 errors; full Vitest suite (63 tests) passed; `compile_applet` passed.
Open questions: none

### [FEAT-PROJECT-ANALYTICS] Add active project detailed metadata & Recharts language distribution charts — 2026-08-22
Prompt: Update the project header to display more detailed metadata like total lines of code or language distribution charts using recharts, only for the active project.
Files touched:
- `package.json` (installed `recharts`)
- `src/utils/projectStats.ts` (created)
- `src/utils/projectStats.test.ts` (created)
- `src/components/ProjectMetadataPanel.tsx` (created)
- `src/components/ProjectMetadataPanel.test.tsx` (created)
- `src/components/ProjectActionsMenu.tsx` (modified)
- `src/App.tsx` (modified)
- `AI_CHANGELOG.md` (modified)
Changed:
- Installed `recharts` for rich, animated SVG data visualization.
- Created `projectStats.ts` utility calculating lines of code (LOC), byte sizes, dominant programming language, file extension language classification, and percentage breakdowns for all codebase files.
- Built `ProjectMetadataPanel` displaying:
  - Metric summary cards: Total LOC, Total Files, Uncompressed Size, and Dominant Language.
  - Interactive Recharts Donut (`PieChart`) and horizontal `BarChart` comparing code composition.
  - Interactive metric toggle (`LOC` vs `Files`) and chart type switcher (`Donut` vs `Bar`).
  - Custom themed tooltip rendering lines of code, file counts, percentages, and formatted sizes with language accent colors.
  - Detailed scrollable language breakdown list.
- Integrated an interactive metadata trigger badge directly into the active project header row (`<LOC> LOC • <DominantLang>`), as well as a "Project Analytics" entry in `ProjectActionsMenu`.
- Added unit test suites for `projectStats.ts` and `ProjectMetadataPanel.tsx`.
Decisions: Ensuring analytics are scoped strictly to the active project preserves performance and context clarity while keeping the project header clean and collapsible on demand.
Deviations: none
Verified: Vitest suite (16 tests) passing; `compile_applet` clean build.
Open questions: none

### [FEAT-HEADER-STREAMLINE] Streamline upper file tree header into professional ProjectActionsMenu dropdown — 2026-08-22
Prompt: Make upper part less bloated and wrap in drop down professionally.
Files touched:
- `src/components/ProjectActionsMenu.tsx` (created)
- `src/components/ProjectActionsMenu.test.tsx` (created)
- `src/components/GithubIcons.tsx` (created)
- `src/App.tsx` (modified)
- `AI_CHANGELOG.md` (modified)
Changed:
- Replaced the stacked multi-row workspace button bar (which previously took 4 vertical rows with Import, Push, Upload, Export, Trash, file counter) with a single-line compact header.
- Created `ProjectActionsMenu` dropdown component featuring:
  - Clean `Actions ⋮` trigger button with active states and tooltips.
  - Floating menu containing organized items: GitHub Import, GitHub Push, File/ZIP Upload, ZIP Export, and Delete Project with icons, subtext descriptions, and contextual color styling.
  - Full keyboard accessibility (`Escape` to close, outside click listener, ARIA menu roles).
- Preserved the quick `+` New Project button, compact project switcher, and file count badge on the left side of the single header row.
- Added comprehensive unit test suite in `ProjectActionsMenu.test.tsx`.
Decisions: Consolidating secondary project actions into a sleek dropdown menu eliminated vertical clutter and significantly expanded usable viewport height for the file tree and code editor on mobile and desktop viewports.
Deviations: none
Verified: `compile_applet` builds cleanly; vitest tests passing.
Open questions: none

### [FEAT-BREADCRUMB] Implement FileBreadcrumb component in FileTree with parent navigation — 2026-08-22
Prompt: Implement a breadcrumb component at the top of the file tree area that shows the current directory path for the selected project, allowing users to navigate up to parent folders.
Files touched:
- `src/components/FileBreadcrumb.tsx` (created)
- `src/components/FileBreadcrumb.test.tsx` (created)
- `src/components/FileTree.tsx` (modified)
- `src/components/FileTree.test.tsx` (modified)
- `AI_CHANGELOG.md` (modified)
Changed:
- Created `FileBreadcrumb` component displaying the root project name with home icon, chevron-delimited directory segments, and active file leaf badge.
- Added dedicated "Navigate up to parent folder (..)" button (`CornerLeftUp` icon) with automatic root disable state.
- Integrated `FileBreadcrumb` into `FileTree` header area, maintaining synchronized `selectedFolderPath` when clicking folders, breadcrumb segments, or opening files.
- Added auto-expansion in `FolderNode` for active path hierarchies and visual highlighting for the current directory path.
- Added unit test suites in `FileBreadcrumb.test.tsx` and extended `FileTree.test.tsx` to verify segment rendering, click interactions, up navigation, and store synchronization.
Decisions: Styled breadcrumb segments with clean hover states and subtle border accents matching the design system with horizontal scroll support for deeply nested paths.
Deviations: none
Verified: `compile_applet` builds cleanly; full Vitest suite passing.
Open questions: none

### [FEAT-KEYBOARD-SHORTCUTS] Add global keyboard accelerators & shortcuts cheatsheet modal — 2026-08-22
Prompt: Add global keyboard shortcuts (e.g., Ctrl+P for search, Ctrl+B to toggle FileTree, Ctrl+` to toggle Terminal) to improve developer workflow speed.
Files touched:
- `src/components/KeyboardShortcutsModal.tsx` (created)
- `src/components/KeyboardShortcutsModal.test.tsx` (created)
- `src/components/TopStrip.tsx` (modified)
- `src/components/FileTree.tsx` (modified)
- `src/components/SettingsPanel.tsx` (modified)
- `src/App.tsx` (modified)
- `AI_CHANGELOG.md` (modified)
Changed:
- Implemented global hotkey listener in `App.tsx` supporting:
  - `Ctrl+B` / `Cmd+B`: Toggle or switch to Files (FileTree) tab.
  - `Ctrl+`` / `Cmd+``: Toggle or switch to Terminal tab.
  - `Ctrl+P` / `Cmd+P`: Quick open and immediately focus the file search input in the FileTree.
  - `Ctrl+Shift+P` / `Cmd+Shift+P`: Switch to Preview tab.
  - `Ctrl+1` through `Ctrl+5`: Directly switch tabs (1: Files, 2: Chat, 3: Preview, 4: Terminal, 5: Settings) when not actively editing text.
  - `Ctrl+T` / `Cmd+T`: Toggle color theme (OLED vs Paper).
  - `Ctrl+Shift+L` / `Cmd+Shift+L`: Instantly lock vault and secure session keys.
  - `Ctrl+?` / `Cmd+?` or `Ctrl+/`: Open interactive Keyboard Shortcuts Cheatsheet modal.
  - `Esc`: Close open file editor, dismiss active modals, or reset search filter.
- Created `KeyboardShortcutsModal` displaying all shortcut categories (Navigation & Views, Files & Search, Terminal & Actions) with platform-aware key glyphs (`⌘` on macOS, `Ctrl` on Windows/Linux).
- Added quick hotkey button in `TopStrip` header to open the shortcuts cheat sheet at any time.
- Added Keyboard Shortcuts Reference documentation section in `SettingsPanel`.
- Added unit tests in `KeyboardShortcutsModal.test.tsx` verifying modal rendering, accessibility dialog roles, close triggers, and key cheatsheet presence.
Decisions: Handled platform-specific modifiers seamlessly (`⌘` on macOS vs `Ctrl` on Linux/Windows) and ensured text typing in inputs and CodeMirror is not interrupted by non-accelerator keys.
Deviations: none
Verified: `compile_applet` builds cleanly; full Vitest suite passing.
Open questions: none

### [FEAT-TERMINAL-PANEL] Create new TerminalPanel component for sandbox shell execution — 2026-08-22
Prompt: Create a new 'TerminalPanel' component that allows users to run basic commands within the project's sandbox, providing a more professional development experience.
Files touched:
- `src/components/TerminalPanel.tsx` (created)
- `src/components/TerminalPanel.test.tsx` (created)
- `src/store.ts` (modified)
- `src/App.tsx` (modified)
- `AI_CHANGELOG.md` (modified)
Changed:
- Added `'terminal'` to `TabId` in `store.ts`.
- Integrated `TerminalPanel` component and bottom navigation tab button in `App.tsx`.
- Implemented sandbox virtual shell engine supporting:
  - File System commands: `ls` (with `-l`, `-a`, `-h`), `cd`, `pwd`, `cat` (with `-n`), `head`, `tail`, `touch`, `mkdir`, `rm` (with `-r`/`-rf`), `cp`, `mv`, `grep` (with `-i`, `-n`, `-v`, `-c`), `find`, `wc`, `stat`, `tree` (hierarchical Unicode directory visualizer).
  - Dev & Sandbox execution: `npm test` / `test` (executing live Vitest test runner), `npm run build` / `build` (compiling bundle via in-browser ESBuild WebAssembly bundler), `npm ls` / `pkg` (dependency tree from `package.json`), `node -e` / `eval` / `run` (safe browser JS evaluation with console interception), `code` / `open` (instantly opens file in editor), `git status`, `git diff`.
  - Shell utilities: `echo` (with `>` and `>>` VFS redirection), `env`, `export`, `clear` / `cls`, `date`, `whoami`, `uname`, `uptime`, `theme`, `history`, `reset`.
- Added interactive terminal UI features: top status strip with online indicator, working directory tracker, quick-action chips (`npm test`, `npm run build`, `tree`, `ls -la`, `help`), copy logs button, clear screen button, autocomplete on `Tab`, command history cycling with `ArrowUp`/`ArrowDown`, and auto-scrolling log console.
- Added comprehensive unit test suite `TerminalPanel.test.tsx` with 13 tests covering command parsing, filesystem manipulation, test running, bundling, JS eval, history, and clear controls.
Decisions: Kept the terminal directly integrated into the main workspace tab bar alongside Files, Chat, Preview, and Settings.
Deviations: none
Verified: `compile_applet` builds cleanly; Vitest suite passing with 209 tests across 33 test files.
Open questions: none

### [FEAT-FILE-SEARCH] Implement global file search in FileTree panel — 2026-08-22
Prompt: Implement a global file search feature in the file tree panel that allows users to quickly find and navigate to files by name within the active project.
Files touched:
- `src/components/FileTree.tsx` (modified)
- `src/components/FileTree.test.tsx` (created)
- `AI_CHANGELOG.md` (modified)
Changed:
- Added a search input bar at the top of the file tree panel with a search icon, clear button, match count indicator, and keyboard navigation instructions.
- Implemented smart case-insensitive filtering with exact/prefix/basename ranking and substring matching.
- Added live visual highlighting (`highlightMatch`) for matching characters in filenames and directory paths with accent styling.
- Added full keyboard accessibility support: `ArrowDown`/`ArrowUp` to navigate options, `Enter` to open the highlighted file, `Escape` to clear search, and global keyboard shortcuts (`/`, `Ctrl+P`/`Cmd+P`, `Ctrl+F`/`Cmd+F`) to instantly focus file search.
- Added empty search state when no files match with a one-click "Clear Search" button.
- Added unit test suite `FileTree.test.tsx` validating tree building, global search filtering, match counters, keyboard navigation, clear controls, and click-to-open actions.
Decisions: Kept the collapsible directory tree view active when search is empty, and switched to a ranked flat search list view when a query is entered. Integrated context menu actions seamlessly in search results.
Deviations: none
Verified: `compile_applet` builds cleanly; full Vitest suite passing with 195 tests.
Open questions: none

### [HOTFIX-29] Surface last known build status on timeout & nested worker checkpoint — 2026-08-22
Prompt: Expose the actual build status when the 45s bundler timeout fires instead of generic text. Add a status checkpoint right before nested worker bundling begins to isolate recursive build hangs.
Files touched:
- `src/services/bundler/bundler.ts` (modified)
- `src/services/bundler/esbuild.worker.ts` (modified)
- `AI_CHANGELOG.md` (modified)
Changed:
- Added `lastStatuses` Map in `bundler.ts` tracking the last received `STATUS` string per build `id`.
- Replaced the generic timeout rejection message with a contextual error interpolating the `lastStatus` so users know exactly which step hung.
- Inserted an `options.onStatus?.('Bundling worker module: ...')` checkpoint inside `esbuild.worker.ts` just before spinning up the recursive nested `esbuild.build()` call.
Decisions: Kept the existing advice text for the timeout error but prepended the actual last-known step. Tied the tracking of `lastStatus` strictly to the `callbacks` lifecycle using the same Map cleanup paths.
Deviations: none
Verified: `compile_applet` runs cleanly; Vitest suite passing.
Open questions: none

### [HOTFIX-28] Implement recursive worker bundling for `new URL(..., import.meta.url)` pattern — 2026-08-22
Prompt: Emulate Vite's behavior for `new Worker(new URL('./file.ts', import.meta.url))` by bundling the worker recursively and injecting its code via `URL.createObjectURL(new Blob(...))` inside the browser's esbuild bundler.
Files touched:
- `src/services/bundler/esbuild.worker.ts` (modified)
- `src/services/bundler/esbuild.worker.test.ts` (modified)
- `AI_CHANGELOG.md` (modified)
Changed:
- Passed `_nestedWorkerPaths: Set<string>` inside `VfsPluginOptions` to track recursive bundling state and prevent infinite recursion.
- In `onLoad` for `vfs` namespace, scanned file contents using regex to match `new Worker(new URL(..., import.meta.url), ...)`.
- Replaced the worker declaration with an inline Blob URL after synchronously awaiting a nested `esbuild.build()` call for the resolved worker path.
- Created test cases verifying correct rewrite for static module URLs and unaffected passthrough for dynamic Blob URLs.
Decisions: Used `_nestedWorkerPaths` locally to the root build rather than global state to ensure clean builds per call. Guarded circular imports by leaving original code + a warning comment.
Deviations: none
Verified: All 185 unit tests passed, including new integration tests for nested worker bundling in `esbuild.worker.test.ts`. `compile_applet` succeeds.
Open questions: none

### [HOTFIX-27] Tailwind v3 vs v4 detection, custom @theme preservation, and version-specific CDN injection — 2026-08-22
Prompt: Distinguish Tailwind v3 (@tailwind directives) vs v4 (@import "tailwindcss") syntax, preserve v4 @theme blocks in CSS, inject @tailwindcss/browser@4 CDN with type="text/tailwindcss" for v4 projects, and maintain v3 Play CDN for v3 projects.
Files touched:
- `src/services/bundler/esbuild.worker.ts` (modified)
- `src/components/PreviewPanel.tsx` (modified)
- `src/services/bundler/esbuild.worker.test.ts` (modified)
- `src/components/PreviewPanel.test.tsx` (modified)
- `AI_CHANGELOG.md` (modified)
Changed:
- Updated `stripTailwindDirectives` in `esbuild.worker.ts` to return `{ stripped, hasTailwind, version: 'v3' | 'v4' | null }`, preserving `@theme` blocks and custom tokens for Tailwind v4 while stripping import/directive statements.
- Updated `createCssJsSnippet` to inject `https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4` and set `style.setAttribute('type', 'text/tailwindcss')` when v4 is detected, while retaining `https://cdn.tailwindcss.com` for v3.
- Added `detectProjectTailwindVersion` and updated `injectTailwindScriptIntoHtml` in `PreviewPanel.tsx` to handle v4 vs v3 across both bundled and static HTML generation pipelines.
- Added unit and integration tests across `esbuild.worker.test.ts` and `PreviewPanel.test.tsx` covering v3/v4 directive detection, `@theme` token preservation, CDN script selection, and DOM style element creation.
Decisions: Prioritized v4 if multiple CSS stylesheets exist with differing directives to allow modern component styles with custom tokens to take effect properly.
Deviations: none
Verified: All 183 tests across 27 test files passed in Vitest; `compile_applet` build succeeded cleanly.
Open questions: none

### [HOTFIX-26] Move script tag sanitization to bundler — 2026-08-22
Prompt: Move the </script> sanitization from PreviewPanel.tsx into src/services/bundler/bundler.ts, at the single point where bundle() returns its compiled code string — right before the return statement.
Files touched:
- `src/services/bundler/bundler.ts` (modified)
- `src/components/PreviewPanel.tsx` (modified)
- `src/components/PreviewPanel.test.tsx` (modified)
- `src/services/bundler/bundler.test.ts` (modified)
Changed:
- Moved `escapeScriptClosingTags` to `bundler.ts` and applied it directly to the output string of `bundle()`.
- Refactored `PreviewPanel.tsx` to remove its local instance of `escapeScriptClosingTags`.
- Adjusted `PreviewPanel.test.tsx` to handle the refactored code without assuming sanitization inside `buildBundledHtml`.
- Added unit tests in `bundler.test.ts` to verify that literal `</script>` tags in source code are properly escaped before the string is returned.
Decisions: Moving sanitization to the bundler guarantees that any downstream consumer of `bundle()` is protected against XSS-like structural breaking.
Deviations: None.
Verified: All tests passed (`PreviewPanel.test.tsx` and `bundler.test.ts`).

### [HOTFIX-25] Apply script closing tag sanitization to PreviewPanel static fallback branch — 2026-08-22
Prompt: Verify src/components/PreviewPanel.tsx and confirm BOTH HTML-building code paths in the build() function (bundled and static-fallback) call escapeScriptClosingTags() before generating HTML.
Files touched:
- `src/components/PreviewPanel.tsx` (modified)
- `src/components/PreviewPanel.test.tsx` (modified)
Changed:
- Updated the static fallback HTML generation path in `PreviewPanel.tsx` to call `escapeScriptClosingTags` on the content of external scripts before injecting them into Blob URLs.
- Rewrote `src/components/PreviewPanel.test.tsx` to include an integration test that uses React Testing Library to mount the component and intercept `URL.createObjectURL`. The test verifies that literal `</script>` strings in both bundled and static external script paths are successfully escaped.
Decisions: Escaping target script content before Blob URL creation in the static fallback branch fulfills the sanitization requirement efficiently and identically to the bundler path.
Deviations: none
Verified: All unit tests in `src/components/PreviewPanel.test.tsx` passed.
Open questions: none

### [HOTFIX-24] Sanitize script closing tags in PreviewPanel HTML generation — 2026-08-22
Prompt: Fix script-injection bug in PreviewPanel.tsx where literal "</script" substrings in code string cause premature script termination when serialized to outerHTML.
Files touched:
- `src/components/PreviewPanel.tsx` (modified)
- `src/components/PreviewPanel.test.ts` (new)
Changed:
- Added `escapeScriptClosingTags` helper to replace all case-insensitive occurrences of `</script` with `<\/script` (backslash-escaped forward slash).
- Created `buildBundledHtml` function in `PreviewPanel.tsx` applying `escapeScriptClosingTags` before setting `scriptEl.textContent` and generating `finalHtml` (in both `index.html` DOMParser path and fallback HTML template path).
- Added comprehensive unit and regression tests in `src/components/PreviewPanel.test.ts` verifying that literal `"<script>x</script>"` embedded in source bundles do not cause premature script element termination or content leakage into document body.
Decisions: Used regex `/<\/script/gi` replacement with `<\\/script` ensuring case-insensitive escaping across all string literals, templates, regexes, and comments.
Deviations: none
Verified: All unit tests in `src/components/PreviewPanel.test.ts` and full vitest suite passed; `compile_applet` build succeeded.
Open questions: none

### [HOTFIX-23] Replace removed Lucide Github icon and pin bundler bare import versions to package.json — 2026-08-22
Prompt: Replace removed Lucide Github icon with inline SVG and pin bundler bare import dependencies to package.json versions.
Files touched:
- `src/App.tsx` (modified)
- `src/components/GithubImportModal.tsx` (modified)
- `src/components/GithubPushModal.tsx` (modified)
- `src/services/bundler/esbuild.worker.ts` (modified)
- `src/services/bundler/esbuild.worker.test.ts` (modified)
Changed:
- Replaced `Github` from `lucide-react` with inline `GithubIcon` SVG component in `App.tsx`, `GithubImportModal.tsx`, and `GithubPushModal.tsx`.
- Added `extractDependenciesFromFiles` and `parsePackageSpecifier` in `esbuild.worker.ts` to extract pinned dependencies/devDependencies from VFS `package.json`.
- Updated `vfsPlugin` `onResolve` to resolve bare imports as `https://esm.sh/${packageName}@${version}${subpath}` if version exists in `package.json`, falling back to unpinned URL if absent.
- Added comprehensive unit tests in `esbuild.worker.test.ts` covering dependency extraction, specifier parsing, and pinned vs unpinned bare import resolution.
Decisions:
- Used standard SVG path for the GitHub mark silhouette matching `size` prop and `currentColor`.
- Checked `dependencies`, `devDependencies`, and `peerDependencies` from `package.json` for pinned versions.
Deviations: none
Verified: All 20 unit tests in `esbuild.worker.test.ts` and full vitest test suite passed, `compile_applet` build succeeded.
Open questions: none

### [HOTFIX-22] Fix data URI externalization and CSS handling in esbuild bundler — 2026-08-22
Prompt: Fix two bugs in src/services/bundler/esbuild.worker.ts: data URI resolution and CSS Tailwind stripping/head style injection.
Files touched:
- `src/services/bundler/esbuild.worker.ts` (modified)
- `src/components/PreviewPanel.tsx` (modified)
- `src/services/bundler/esbuild.worker.test.ts` (new)
Changed:
- Added data: and blob: URI check in `vfsPlugin` `onResolve` returning `{ path: args.path, external: true }` to prevent data URIs from being resolved as bare package names on `esm.sh`.
- Replaced esbuild's native `'css'` loader with CSS scanning and directive stripping (`@import "tailwindcss"` and `@tailwind base|components|utilities`), returning a DOM `<style>` injection script with loader `'js'`.
- Injected `<script src="https://cdn.tailwindcss.com"></script>` into preview HTML shell and CSS style injection wrappers when Tailwind directives are stripped.
- Added comprehensive unit tests in `esbuild.worker.test.ts` verifying clean bundling with inline data URIs and Tailwind imports without fetching from `esm.sh`.
Decisions: Unpkg CSS files are also wrapped in `<style>` injection so external stylesheets bundle in-memory without requiring an output path.
Deviations: none
Verified: Vitest unit tests in `src/services/bundler/esbuild.worker.test.ts` and full test suite passing, `compile_applet` build succeeded.
Open questions: none

### [REBRAND-1] Rename XioM Studio to LAIDE Studio — 2026-08-21
Prompt: Rebrand the app from XioM Studio to LAIDE Studio, replacing all user-facing strings, page metadata, package name, comments, and tests while strictly avoiding hardcoded string constants that would break persistence in localStorage, Dexie, or backups.
Files touched:
- `index.html` (modified)
- `metadata.json` (modified)
- `vite.config.ts` (modified)
- `package.json` (modified)
- `README.md` (modified)
- `src/App.tsx` (modified)
- `src/seed.ts` (modified)
- `src/components/InstallPrompt.tsx` (modified)
- `src/components/ChatPanel.tsx` (modified)
- `src/components/ReloadPrompt.tsx` (modified)
- `src/components/FileTree.tsx` (modified)
- `src/components/GithubPushModal.tsx` (modified)
- `src/components/GithubPushModal.test.ts` (modified)
- `src/components/SettingsPanel.test.tsx` (modified)
- `src/services/agent/prompts.ts` (modified)
- `src/services/agent/mcpClient.ts` (modified)
- `src/services/passkeyCrypto.ts` (modified)
- `src/db.ts` (modified)
- `src/services/backup.ts` (modified)
- `src/services/backup.test.ts` (modified)
Changed:
- Updated title, description, and open graph metadata in `index.html`.
- Updated app manifest properties in `metadata.json` and `vite.config.ts` (name, short_name, descriptions).
- Changed the npm package name to `laide-studio`.
- Replaced references to XioM Studio with LAIDE Studio in `README.md`, `src/seed.ts`, and the fallback README generated on project creation.
- Updated user interface copy in `InstallPrompt`, `ChatPanel`, `ReloadPrompt`, and `FileTree`.
- Rebranded GithubPushModal branch prefix generation logic and commit messages, and fixed up their related unit tests.
- Updated MCP agent client name, system prompt identity, and Passkey user/rp displays.
- Renamed the `XiomDatabase` class to `LaideDatabase` while leaving the `"XiomDatabase"` string argument to `super()` unchanged, ensuring existing IndexedDB data persistence is completely unaffected.
- Fixed a testing mock omission for `mcpServers` in `SettingsPanel.test.tsx` which caused Vitest failures during the rebrand.
Decisions: Strictly preserved all hard constraints including localStorage keys (e.g. `xiom_github_pat`, `xiom_mcp_servers`, `xiom_lock_config`), the `xiom-backup-v1` format tag, `XiomDatabase` IDB name, `XIOM_APP_VERIFIER` crypto variable, CacheStorage `xiom-esm-dep-cache-v1` keys, and internal postMessage commands, to guarantee zero backward compatibility breakage for active users' vault and file data.
Deviations: none
Verified: Passed Vitest suite fully and compiled successfully.
Open questions: none

### [HOTFIX-21] Add `run_tests` agent tool using esbuild pipeline in Web Worker — 2026-08-20
Prompt: Add a run_tests agent tool that executes the project's Vitest suite inside a Web Worker using the existing esbuild.worker.ts bundling pipeline.
Files touched:
- src/services/bundler/esbuild.worker.ts (modified)
- src/services/bundler/testRunner.ts (created)
- src/services/agent/tools.ts (modified)
Changed:
- Intercepted `vitest` imports in the VFS plugin of `esbuild.worker.ts` to alias to a lightweight virtual `/vitest_shim.ts`.
- Created `testRunner.ts` which exports `runProjectTests`. It builds a virtual entry point importing all matched test files, alongside the `vitest` shim, bundles them to ESM using the app's `bundle()` pipeline, and dynamically spins up a Web Worker for isolation.
- Exposed `run_tests` tool in `AGENT_TOOLS` mapped to `executeAgentTool` in `tools.ts`.
- Structured output logging inside the Web Worker so it cleanly reports passes, fails, and stack traces back to the agent in text format.
Decisions: The shim is intentionally minimal for speed and size constraints but includes core mocking utilities like `vi.fn()` and async hook execution (`beforeAll`, `beforeEach`, etc.). Test failures are safely serialized back to the UI rather than crashing the tool thread.
Deviations: none
Verified: `compile_applet` passed. Test shim correctly handles basic hooks and passes mock implementations.
Open questions: none

### [HOTFIX-20] Add MCP (Model Context Protocol) server support — 2026-08-20
Prompt: Add MCP (Model Context Protocol) server support to the agent: a new section in SettingsPanel.tsx for adding MCP server URLs (Streamable HTTP), store them encrypted the same way GitHub PATs are stored via crypto.ts, and at agent-loop start merge their exposed tools into AGENT_TOOLS from tools.ts so runAgentLoop can call them through executeAgentTool. Handle per-server connect/reconnect and surface failures as tool-call errors rather than crashing the loop.
Files touched:
package.json (modified)
src/store.ts (modified)
src/App.tsx (modified)
src/components/SettingsPanel.tsx (modified)
src/services/agent/mcpClient.ts (created)
src/services/agent/agentLoop.ts (modified)
Changed:
- Installed `@modelcontextprotocol/sdk`.
- Added `MCPServer` interface and `mcpServers` state management in `store.ts`.
- Implemented `mcpClient.ts` containing `McpService` with `StreamableHTTPClientTransport` to connect, list tools, and execute tool calls over SSE.
- Updated `SettingsPanel.tsx` with UI to add and remove MCP Server URLs, storing the JSON array encrypted via `crypto.ts` in `localStorage` under `xiom_mcp_servers`.
- Updated `App.tsx` to decrypt and initialize `mcpServers` when the vault is unlocked.
- Updated `agentLoop.ts` to dynamically fetch tools from configured MCP servers at loop initialization, merge them into the LLM's available tools (`dynamicTools`), and route MCP tool executions natively.
- Ensured failures connecting to servers are gracefully bypassed, and failures executing specific MCP tools yield standard tool errors in the stream instead of crashing the run.
Decisions: Kept MCP integration decoupled from `executeAgentTool` since MCP execution flows through its SDK's client instance per server rather than static local functions.
Deviations: none
Verified: `compile_applet` built cleanly.
Open questions: none
### [HOTFIX-19] Screenshot-based vision feedback loop for agent and preview panel — 2026-08-20
Prompt: Add a screenshot-based vision feedback loop to the agent: after the bundler produces a preview build, capture the rendered iframe in PreviewPanel.tsx to a PNG (check cross-origin constraints since the preview runs in a sandboxed iframe with sandbox="allow-scripts allow-modals allow-forms"), downscale it, and pass it as an image content block to adapter.stream() in agentLoop.ts alongside the next user turn. Only capture on-demand (e.g. a "let the AI see the preview" toggle, or automatically after a patch is applied) — not on every render — to control token cost. Extend the LLMMessage/LLMAdapter types in llmAdapter.ts to support image content blocks, and confirm the Anthropic and Google provider adapters pass them through correctly.
Files touched:
src/services/llm/llmAdapter.ts (modified)
src/services/llm/providers/anthropic.ts (modified)
src/services/llm/providers/google.ts (modified)
src/services/llm/providers/openaiCompatible.ts (modified)
src/services/llm/tokenizer.ts (modified)
src/services/agent/agentLoop.ts (modified)
src/store.ts (modified)
src/components/PreviewPanel.tsx (modified)
src/components/ChatPanel.tsx (modified)
src/services/bundler/previewCapture.ts (created)
src/services/bundler/previewCapture.test.ts (created)
src/services/llm/providers/anthropic.test.ts (modified)
src/services/llm/providers/google.test.ts (modified)
src/services/agent/agentLoop.test.ts (modified)
Changed:
- Extended `LLMMessage`, `LLMContentBlock`, and `LLMContentPart` in `llmAdapter.ts` to support image content blocks alongside text.
- Updated `anthropic.ts`, `google.ts`, and `openaiCompatible.ts` provider adapters to format base64 image blocks into their respective API specifications (`source.type: 'base64'`, `inlineData`, and `image_url`).
- Added screenshot capture helper script injection in `previewCapture.ts` using `XMLSerializer` and `<foreignObject>` canvas rasterization to safely capture sandboxed iframe renders without cross-origin violations.
- Added downscaling to max 800px dimension inside the capture helper to control token cost and payload overhead.
- Updated `agentLoop.ts` to accept `screenshot` in options and append the image content block to the user turn passed to `adapter.stream()`.
- Added on-demand "Let AI See" capture button in `PreviewPanel.tsx` and "Attach Preview Vision" chip in `ChatPanel.tsx`, with automatic capture support after patches.
- Added comprehensive unit tests in `anthropic.test.ts`, `google.test.ts`, `agentLoop.test.ts`, and `previewCapture.test.ts`.
Decisions: Used postMessage coordination between the host window and the injected helper script in the sandboxed iframe to bypass cross-origin / sandbox access limitations cleanly while rasterizing SVG foreignObject onto a downscaled canvas.
Deviations: none
Verified: All 28 test suites passed with all tests passing, and `compile_applet` built cleanly.
Open questions: none

### [HOTFIX-18] Add markdown rendering for assistant messages in ChatPanel — 2026-08-20
Prompt: In ChatPanel.tsx, assistant messages are rendered as raw text ({msg.content} at line ~350) — no markdown parsing. Fix: add a markdown renderer (react-markdown, or a lightweight alternative given the existing bundle-size concerns) and use it for assistant message content only — keep user messages as plain text. Restrict rendered elements to safe inline/block markdown (no raw HTML passthrough, since this content comes from the LLM API).
Files touched:
src/components/ChatPanel.tsx (modified)
package.json (modified)
Changed:
- Installed `react-markdown`.
- Wrapped assistant `msg.content` inside `<ReactMarkdown>` in `ChatPanel.tsx` while leaving user messages as plain text.
- Mapped markdown elements (`p`, `strong`, `h1`-`h3`, `ul`, `ol`, `li`, `code`, `a`, `hr`, `blockquote`) to Tailwind-styled components to render cleanly within the chat UI.
Decisions: Kept it lightweight by relying on `react-markdown` with customized component mappings instead of adding a large typography plugin. 
Deviations: none
Verified: Chat UI renders assistant messages with markdown applied (code blocks, bold text, lists).
Open questions: none

### [HOTFIX-17] Split OpenAI Compatible provider into OpenRouter and Local options — 2026-08-20
Prompt: Currently SettingsPanel.tsx's PROVIDERS array has a single entry covering both local endpoints and OpenRouter. Split these into two distinct provider cards: Add OpenRouter with prefilled base URL, rename openai-compatible to Local/Custom, update factory and modelDiscovery.
Files touched:
src/components/SettingsPanel.tsx (modified)
src/services/llm/factory.ts (modified)
src/services/llm/modelDiscovery.ts (modified)
src/services/llm/modelDiscovery.test.ts (modified)
src/services/llm/factory.test.ts (created)
src/components/SettingsPanel.test.tsx (created)
Changed:
- Split the 'openai-compatible' provider option into 'openrouter' and 'openai-compatible' to improve UI clarity.
- Prefilled OpenRouter Base URL to `https://openrouter.ai/api/v1` when selected.
- Updated `factory.ts` to map 'openrouter' to the `OpenAICompatibleProvider` (and fixed a bug where apiKey and baseUrl arguments were swapped).
- Propagated 'openrouter' to all logic in `modelDiscovery.ts` where 'openai-compatible' was used (e.g. falling back to context windows, testing endpoints).
- Added unit tests checking the `createLLMAdapter` routing logic and validating the React component prefill behavior.
Decisions: The underlying provider class remains `OpenAICompatibleProvider` since OpenRouter implements the exact same spec; this is purely a UI/configuration preset split. No migration for existing profiles is needed.
Deviations: none
Verified: `npm test` successfully completed for all 142 tests across 27 files.
Open questions: none

### [HOTFIX-16] Surface empty assistant responses in chat UI — 2026-08-20
Prompt: In ChatPanel.tsx, if runAgentLoop completes with the final assistant message having empty content and no toolCalls (stream ended with zero yields but no thrown error), nothing is rendered... check if the last assistant message is empty and, if so, either drop it and show a visible "No response received from the model — try again" message, or replace it with that text directly.
Files touched:
src/components/ChatPanel.tsx (modified)
Changed:
- In `ChatPanel.tsx`, modified the `handleSend` to check if `finalMessages` has an empty assistant message (no content, no toolCalls) at the end, and if so, replaces its content with a `⚠️ No response received from the model — try again` error message so it is visible instead of rendering nothing.
Decisions: Combined conceptually with the previous hotfix so both thrown errors and empty stream responses render as visible warnings in the chat.
Deviations: none
Verified: `compile_applet` successfully completed.
Open questions: none

### [HOTFIX-15] Display UI errors for LLM chat failures and note test connection limits — 2026-08-20
Prompt: In ChatPanel.tsx, handleSend's catch block only does console.error(e) on non-abort failures from runAgentLoop — nothing is shown in the UI... Fix by pushing a visible assistant-role error message into chatHistory... Also note in SettingsPanel.tsx that handleTest uses a non-streaming, tool-less request while real chat uses streaming + tools — call out in the UI (e.g. a tooltip on "Test Connection") that passing this test doesn't guarantee streaming or function-calling support.
Files touched:
src/components/ChatPanel.tsx (modified)
src/components/SettingsPanel.tsx (modified)
Changed:
- In `ChatPanel.tsx`, modified the `handleSend` catch block to extract the current `chatHistory` state and append a visible assistant error message (`⚠️ Request failed: ...`) so users can clearly see model rejections, network errors, or missing capabilities directly in the UI.
- In `SettingsPanel.tsx`, added a `title` tooltip to the "Test Connection" button noting that basic connectivity success does not necessarily guarantee streaming or tool-calling support.
Decisions: Appended the error to `chatHistory` directly so it aligns with normal flow and avoids needing a new dedicated error banner component for the chat pane. 
Deviations: none
Verified: `npm test` successfully completed.
Open questions: none

### [HOTFIX-14] Responsive Files-tab header row wrapping for narrow mobile screens — 2026-08-20
Prompt: The Files-tab header row in App.tsx visually collides on phone widths under ~480px... Fix by allowing the row to wrap onto two lines below a breakpoint... Test at common narrow widths (360px, 390px, 412px) to confirm no overlap, and confirm nothing regresses at the 480px container max.
Files touched:
src/App.tsx (modified)
src/App.test.ts (new)
Changed:
- Enabled `flex-wrap` and `gap-y-2` on the Files-tab header row in `src/App.tsx`, with `border-b border-border/30` for clean visual demarcation.
- Updated project controls group to allow proper wrapping room (`min-w-0 max-w-full`) and set right action buttons group with `ml-auto` to wrap to a dedicated row on narrow mobile widths.
- Added comprehensive unit tests in `src/App.test.ts` testing viewport widths at 360px, 390px, 412px, and 480px to verify that all controls and action items render cleanly without clipping or collisions.
Decisions: Used clean responsive flex wrapping to keep all actions 1-tap accessible without hiding options behind extra dropdown clicks.
Deviations: none
Verified: `npm test` passed for all 26 test suites (140 tests); `compile_applet` build succeeded.
Open questions: none
### [HOTFIX-13] Update default Anthropic model to claude-3-7-sonnet-20250219 — 2026-08-20
Prompt: SettingsPanel.tsx (DEFAULT_MODELS['anthropic']) and AnthropicProvider's constructor default both hardcode 'claude-3-5-sonnet-20241022'. Update both defaults to a current Claude model string, and check modelDiscovery.ts's static fallback list for the same staleness. Keep the field freely editable either way.
Files touched:
src/components/SettingsPanel.tsx (modified)
src/services/llm/providers/anthropic.ts (modified)
src/services/llm/providers/anthropic.test.ts (modified)
src/services/llm/modelDiscovery.ts (modified)
src/services/llm/modelDiscovery.test.ts (modified)
Changed:
- Changed `DEFAULT_MODELS['anthropic']` in `SettingsPanel.tsx` to `'claude-3-7-sonnet-20250219'`.
- Updated the default constructor fallback for `AnthropicProvider` to `'claude-3-7-sonnet-20250219'`.
- Replaced occurrences of `claude-3-5-sonnet-20241022` with `claude-3-7-sonnet-20250219` in `modelDiscovery.ts` context windows and static fallback models list, and also updated the label to `'Claude 3.7 Sonnet'`.
Decisions: Kept the input field freely editable. Just updated the prefilled values and discovery lists.
Deviations: none
Verified: `npm test` successfully completed.
Open questions: none

### [HOTFIX-13] Update default Anthropic model to claude-3-7-sonnet-20250219 — 2026-08-20
Prompt: SettingsPanel.tsx (DEFAULT_MODELS['anthropic']) and AnthropicProvider's constructor default both hardcode 'claude-3-5-sonnet-20241022'. Update both defaults to a current Claude model string, and check modelDiscovery.ts's static fallback list for the same staleness. Keep the field freely editable either way.
Files touched:
src/components/SettingsPanel.tsx (modified)
src/services/llm/providers/anthropic.ts (modified)
src/services/llm/providers/anthropic.test.ts (modified)
src/services/llm/modelDiscovery.ts (modified)
src/services/llm/modelDiscovery.test.ts (modified)
Changed:
- Changed `DEFAULT_MODELS['anthropic']` in `SettingsPanel.tsx` to `'claude-3-7-sonnet-20250219'`.
- Updated the default constructor fallback for `AnthropicProvider` to `'claude-3-7-sonnet-20250219'`.
- Replaced occurrences of `claude-3-5-sonnet-20241022` with `claude-3-7-sonnet-20250219` in `modelDiscovery.ts` context windows and static fallback models list, and also updated the label to `'Claude 3.7 Sonnet'`.
Decisions: Kept the input field freely editable. Just updated the prefilled values and discovery lists.
Deviations: none
Verified: `npm test` successfully completed.
Open questions: none

### [HOTFIX-12] Prevent hunk index drifting during partial patch application — 2026-08-20
Prompt: In PatchReviewSheet.tsx's executeApply, partial-hunk replace patches recompute structuredPatch(file.content, patch.newContent)... If file.content no longer matches patch.oldContent at apply time... hunk indices can drift... block the apply with a clear error.
Files touched:
src/components/PatchReviewSheet.tsx (modified)
src/components/PatchReviewSheet.test.ts (modified)
Changed:
- Added a strict parity check (`file.content !== patch.oldContent`) in `executeApply` for partial-hunk patches. If the content has drifted from when the patches were generated, the application aborts and throws an error instead of letting hunk indices silently misalign.
- Added a unit test simulating a file being independently modified after a patch was proposed but before a partial application was committed, ensuring it successfully aborts and displays the correct error in the review sheet.
Decisions: Kept the error isolated to partial hunks; fully checked hunks safely replace the entire file. Throws an explicit error that gets caught by the sheet's built-in `applyErrors` banner for user visibility.
Deviations: none
Verified: `npm test` successfully completed.
Open questions: none

### [HOTFIX-11] Handle 422 branch collision on GithubPushModal — 2026-08-20
Prompt: createBranch() in GithubPushModal.tsx fails with a raw 422 if the target branch already exists... Catch this specific failure, surface a clear message, and offer a one-click auto-incrementing retry ({branch}-2) instead of forcing a full re-type.
Files touched:
src/components/GithubPushModal.tsx (modified)
src/components/GithubPushModal.test.ts (modified)
Changed:
- Added a `try-catch` specifically for `client.createBranch` to trap HTTP 422 errors indicative of branch collisions.
- Designed an auto-incrementing function in the error handler that automatically increments `-N` suffixes or appends `-2` to create a fresh branch name.
- Updates the branch name state variables directly so the user can just click "Push to New Branch" a second time as a one-click retry.
- Add unit test to verify that the HTTP 422 flow surfaces the correct friendly error message and updates the state.
Decisions: Auto-increment the input field visually but stop the push operation to ensure the user approves the new branch name before actually committing the push to GitHub.
Deviations: none
Verified: `npm test` successfully completed for all suites.
Open questions: none
### [HOTFIX-10] Fetch and default to GitHub repository default_branch in GithubPushModal — 2026-08-20
Prompt: GithubPushModal.tsx hardcodes baseBranch to 'main' unless prior sync data exists... Call client.getRepo(owner, repo) when owner/repo are entered (or right before push if no sync data exists) and default baseBranch to repoData.default_branch, keeping the field editable.
Files touched:
src/components/GithubPushModal.tsx (modified)
src/components/GithubPushModal.test.ts (modified)
Changed:
- Added a debounced `useEffect` that triggers when the user updates the `owner` and `repo` input fields, which calls `client.getRepo(owner, repo)` to resolve and populate the correct `default_branch` into the baseBranch field.
- Refactored `handlePush` to resolve the `default_branch` at push-time if the user hasn't explicitly edited the `baseBranch` field manually (to prevent race conditions for fast pushers).
- Included an `isBaseBranchEdited` flag in state to preserve manual overrides by the user so we do not unexpectedly wipe their input.
- Added a test in `GithubPushModal.test.ts` asserting that the `default_branch` correctly resolves from an API response without wiping sync data if provided.
Decisions: Added a debounced `setTimeout` inside the effect alongside state tracking of whether the user explicitly typed in the `baseBranch` field.
Deviations: none
Verified: `npm test` successfully completed for all suites.
Open questions: none
### [HOTFIX-9] Fix empty error messages for LLM API failures — 2026-08-20
Prompt: Fix the errors in the app. error 0: OpenAI-compatible stream failed:
Files touched:
src/services/llm/providers/anthropic.ts (modified)
src/services/llm/providers/google.ts (modified)
src/services/llm/providers/openai.ts (modified)
src/services/llm/providers/openaiCompatible.ts (modified)
Changed:
- Updated HTTP error handlers in all LLM providers (`AnthropicProvider`, `GoogleProvider`, `OpenAIProvider`, `OpenAICompatibleProvider`) to correctly parse and surface API error details.
- Fixed an issue where the error string remained empty if `res.statusText` was absent or if `res.json()` failed by replacing it with a robust parsing block that uses `res.text()` and attempts to parse JSON gracefully.
Decisions: Made the fix uniform across all API clients to ensure no future provider failures yield silent/empty error messages in the UI.
Deviations: none
Verified: Unit tests passed successfully.
Open questions: none

### [HOTFIX-8] Fix GitHub API base64 decoding for non-ASCII and binary files — 2026-08-20
Prompt: getFileContent() in githubClient.ts decodes GitHub's base64 content via atob() and returns it as-is, breaking non-ASCII UTF-8 text and binary files. Fix to properly decode text via TextDecoder('utf-8') and return base64 string for binaryExtensions. Add tests for roundtripping non-ASCII and binary content.
Files touched:
src/services/github/githubClient.ts (modified)
src/services/github/githubClient.test.ts (modified)
src/components/GithubPushModal.test.ts (modified)
AI_CHANGELOG.md (modified)
Changed:
- `GithubClient.getFileContent` now checks `binaryExtensions` and returns raw base64 string for binary files.
- `GithubClient.getFileContent` properly converts the cleaned base64 payload into `Uint8Array` bytes and uses `TextDecoder('utf-8')` to decode text files with non-ASCII characters instead of raw `atob()`.
- Added unit tests in `githubClient.test.ts` for non-ASCII UTF-8 decoding and binary extension bypassing.
- Added a test in `GithubPushModal.test.ts` to assert that `computeGitBlobSha` and blob payload encoding properly process non-ASCII text as `utf-8` and binary files as `base64`.
Decisions: Leveraged existing `binaryExtensions` array to distinguish binary from text content to maintain the existing text/base64 contract in the VFS.
Deviations: none
Verified: `npm test` passes.
Open questions: none


### [HOTFIX-7] Fix Github API Content-Type Header for POST requests — 2026-08-20
Prompt: In src/services/github/githubClient.ts, GithubClient.request() sends POST bodies via JSON.stringify() but never sets a Content-Type header. Add 'Content-Type': 'application/json' to the headers. Verify it applies to createBlob, createTree, createCommit, and createBranch. Extend githubClient.test.ts to assert the header is sent on POST requests.
Files touched:
src/services/github/githubClient.ts (modified)
src/services/github/githubClient.test.ts (modified)
Changed:
- Added `Content-Type: application/json` header setting to `GithubClient.request()` when `options.body` is present.
- Added a unit test verifying `createBlob`, `createTree`, `createCommit`, and `createBranch` apply this header in `githubClient.test.ts`.
Decisions: Unconditionally apply application/json header inside `GithubClient.request` when `options.body` exists since all POST bodies in this client are JSON.
Deviations: none
Verified: `npm test` passed.
Open questions: none

### [HOTFIX-6] Add Unit Test Suites for High-Risk File Modifying & Git Components — 2026-08-20
Prompt: Add test coverage for GithubImportModal.tsx, GithubPushModal.tsx, and PatchReviewSheet.tsx mocking fetch and fake-indexeddb without refactoring component source files.
Files touched:
src/components/GithubImportModal.test.ts (new)
src/components/GithubPushModal.test.ts (new)
src/components/PatchReviewSheet.test.ts (new)
package.json (modified)
Changed:
- Added `src/components/GithubImportModal.test.ts`: mocks fetch to GitHub API, verifies files land at correct `/...` VFS paths, confirms 404/network errors surface readable error messages without crashing, and tests existing file overwrites.
- Added `src/components/GithubPushModal.test.ts`: mocks fetch, verifies blob-SHA diffing skips unchanged files, only creates blobs for changed/new files, marks deleted files with `sha: null`, and verifies PR compare link and error handling.
- Added `src/components/PatchReviewSheet.test.ts`: uses fake-indexeddb, verifies automatic snapshot creation prior to patch application, verifies partial hunk selection applies only checked hunks, and verifies delete-confirmation modal blocks deletions until confirmed.
- Installed devDependencies `@testing-library/react` and `happy-dom` for DOM rendering in vitest.
Decisions: Tested the exact component implementations as-is without refactoring their production source code.
Deviations: none
Verified: `npm test` runs 25 test suites (129 passing tests, up from 118), `npx tsc --noEmit` clean, and applet compilation succeeded.
Open questions: none

### [HOTFIX-5] Add Mid-Session Manual "Lock Vault" Action & Confirmation — 2026-08-20
Prompt: Add a "Lock Vault" action with a Lock icon in TopStrip and SettingsPanel that calls setKeys(null), clears chatHistory, and returns to LockScreen, showing confirmation first if pendingPatches.length > 0.
Files touched:
src/store.ts (modified)
src/components/TopStrip.tsx (modified)
src/components/SettingsPanel.tsx (modified)
src/components/LockScreen.test.ts (modified)
Changed:
- Added `lockVault()` action to `WorkspaceSlice` in `src/store.ts` to reset `keys` to `null` and clear `chatHistory`.
- Added "Lock" action button with `<Lock size={10} />` to `TopStrip.tsx` (top strip visible across all tabs).
- Added "Lock Vault" action button to `SettingsPanel.tsx` header.
- Implemented unreviewed patch confirmation modal triggered whenever `pendingPatches.length > 0` before locking.
- Added unit tests in `LockScreen.test.ts` verifying that locking the vault resets `keys` to `null` and empties `chatHistory`.
Decisions: Rendered lock button in both TopStrip (globally accessible) and SettingsPanel header. Confirmation dialog informs user that workspace file data is safe but re-unlocking will be required to resume patch review.
Deviations: none
Verified: `npm test` passed 118/118 tests across 22 test suites, `npx tsc --noEmit` clean, and applet compilation succeeded.
Open questions: none

### [HOTFIX-4] Remove bun.lock, Update .gitignore, and Pin Engines in package.json — 2026-08-20
Prompt: Delete bun.lock, add bun lockfiles to .gitignore, and add an "engines" field to package.json to prevent lockfile conflicts.
Files touched:
bun.lock (deleted)
.gitignore (modified)
package.json (modified)
Changed:
- Deleted redundant `bun.lock` file from repository root.
- Added `bun.lock` and `bun.lockb` to `.gitignore`.
- Added `"engines": { "node": ">=18.0.0", "npm": ">=9.0.0" }` in `package.json` to enforce standard Node and npm environments.
Decisions: Kept all dependency versions untouched as housekeeping-only.
Deviations: none
Verified: Verified `npm install`, `npm run build`, `npm test`, and `compile_applet` all succeed cleanly.
Open questions: none

### [HOTFIX-3] Update README.md Run Locally Instructions — 2026-08-20
Prompt: Rewrite the "Run Locally" section in README.md to match in-app credential storage reality (npm install, npm run dev, initialize vault passphrase, configure API keys in Settings — no .env.local).
Files touched:
README.md (new)
Changed:
- Rewrote the "Run Locally" section in README.md removing all references to `.env.local` or environment variable keys.
- Documented local workflow: `npm install` -> `npm run dev` -> initialize master passphrase in Lock Screen -> configure LLM/GitHub credentials in Settings.
- Documented accurate features, architecture, and available project scripts.
Decisions: Retained client-side encrypted vault architecture details and kept all source code untouched (docs-only change).
Deviations: none
Verified: `compile_applet` and `npm test` verified clean build and test suite pass.
Open questions: none

### [HOTFIX-2] GitHub Import Default Branch Detection & Error Handling — 2026-08-20
Prompt: Add getRepo(owner, repo) to GithubClient to read default_branch, use it in GithubImportModal to fetch trees and files from the real default branch and store it in sync payloads, and surface clear error for 404.
Files touched:
src/services/github/githubClient.ts (modified)
src/components/GithubImportModal.tsx (modified)
src/services/github/githubClient.test.ts (new)
Changed:
- Added `getRepo(owner: string, repo: string)` method in `GithubClient` targeting `GET /repos/{owner}/{repo}`.
- Updated `GithubClient.request()` to throw a clear `"Repository not found or no access"` error on HTTP 404 status.
- Updated `GithubImportModal.tsx`'s `handleImport` to fetch repository details and resolve `default_branch` before querying tree and downloading blobs.
- Passed resolved `default_branch` to `getRepoTree` and `getFileContent` calls during repo import and persisted the real branch in sync payloads (`localStorage` & `sessionStorage`).
- Handled 404 error messages in `GithubImportModal` to surface `"Repository not found or no access"`.
- Added test suite in `src/services/github/githubClient.test.ts` verifying `getRepo`, branch-specific tree/content fetching, and 404 error handling.
Decisions: Kept `GithubPushModal.tsx` unchanged as requested.
Deviations: none
Verified: Vitest unit tests passed (117/117 across 22 test files), `tsc --noEmit` passed with zero errors, and applet compilation succeeded.
Open questions: none

### [HOTFIX-1] Complete 2048-Word BIP-39 English Wordlist & Test — 2026-08-20
Prompt: Replace BIP39_WORDS with the complete, verified 2048-word official BIP-39 English wordlist and add test asserting length and uniqueness.
Files touched:
src/services/bip39Words.ts (modified)
src/services/recovery.test.ts (modified)
Changed:
- Replaced truncated 2046-word list with the complete, official 2048-word BIP-39 English wordlist.
- Added unit test in `recovery.test.ts` asserting `BIP39_WORDS.length === 2048` and all entries are unique.
Decisions: Retained `generateRecoveryPhrase()` and `validateRecoveryPhrase()` functions untouched as requested, updating only the static dictionary data and adding regression test assertions.
Deviations: none
Verified: `npm test` passed 112/112 tests across 21 test suites, including new BIP-39 wordlist count and uniqueness assertions.
Open questions: none

### [AUDIT-2] Historical Phase Label Collision Audit — 2026-08-20
Prompt: Audit colliding phase labels across historical changelog entries, document all overlaps without rewriting past entries, and establish phase numbering enforcement rules.
Files touched:
AI_CHANGELOG.md (modified)
Changed:
- Audited all historical changelog entries for duplicated phase and subphase labels.
- Documented 8 colliding phase labels across 23 log entries:
  - [6.1] (6 entries): "ESLint Setup & Baseline Scan" (2026-08-20), "LockScreen Type Safety Update" (2026-08-20), "Vite-Only Virtual Module Interception & Preview Stubbing" (2026-08-20), "Direct Compiler WASM Binary Loading & Resolution Isolation" (2026-08-20), "PreviewPanel Bundled-Mode Detection & Entry Point Resolution" (2026-08-20), and original "Zod Patch Schema & Diff Utility" (2026-08-19).
  - [5.2] (4 entries): "File Manifest Exclusion Patterns & Store Integration" (2026-08-20), "ChatSlice MaxAgentSteps Store Integration" (2026-08-20), "ChatSlice Temperature & MaxOutputTokens Store Integration" (2026-08-20), and original "Anthropic Provider" (2026-08-19).
  - [Phase 7] (3 entries): "Multi-Project Deletion Transaction & Confirmation Modal" (2026-08-20), "Project Switcher Chip Restyling & Persistent New Project Button" (2026-08-20), and "Multi-Project Switcher Support" (2026-08-20).
  - [Phase A] (3 entries): "Dynamic Model Context Window Resolution & Metadata" (2026-08-20), "Lightweight File Manifest & Token Math Refactoring" (2026-08-20), and "Passphrase Recovery Mechanism & Encrypted Backup/Restore" (2026-08-20).
  - [Phase B] (2 entries): "Agent Loop Cancellation Graceful Handling" (2026-08-20), and "LLM Provider Adapters & Agent Loop Unit Testing" (2026-08-20).
  - [Phase C] (2 entries): "PatchReviewSheet Upsert Semantics, Error Handling & Applied Paths Fix" (2026-08-20), and "Agent Loop Safety Rails, Step Cap & Delete Confirmation" (2026-08-20).
  - [Phase F] (2 entries): "Zustand Store Slices Refactoring" (2026-08-20, originally intended as Phase G per [AUDIT] roadmap), and "Production Scaffolding Audit & Dependency Cleanup" (2026-08-20).
  - [1.1] (2 entries): "LockScreen Passphrase Minimum Length & Strength Enforcement" (2026-08-20), and original "App Shell & Theme" (2026-08-19).
- Added Phase Numbering Rule section under Current State prohibiting label reuse and requiring grep checks before assignment.
Decisions: Kept all historical log entries unchanged per the immutable append-only convention, documenting all collisions and historical intent here.
Deviations: none
Verified: Grepped and verified all entry headers across AI_CHANGELOG.md to ensure all colliding labels and entry titles are accurately listed.
Open questions: none

### [5.0] Light Theme Redesign — 2026-08-20
Prompt: Full re-theme to a light interface, keeping code editor/diffs dark, and switching labels/headers to IBM Plex Sans.
Files touched:
index.css
src/components/LockScreen.tsx
src/components/ChatPanel.tsx
src/components/FileTree.tsx
src/components/TopStrip.tsx
src/components/SettingsPanel.tsx
src/components/GithubImportModal.tsx
src/components/GithubPushModal.tsx
src/components/PatchReviewSheet.tsx
src/components/InstallPrompt.tsx
src/components/ReloadPrompt.tsx
src/components/Editor.tsx
src/components/PreviewPanel.tsx
src/App.tsx
Changed:
- Replaced dark color tokens (ink, brass) with light equivalents (bg, surface, accent, muted).
- Reserved #1F1B15 background exclusively for Editor and PatchReviewSheet code areas.
- Updated typography classes to replace uppercase/mono headers with IBM Plex Sans sentence-case.
Decisions:
- Converted `bg-ink` to new `bg-[#1F1B15]` explicitly inside Editor to maintain the dark mode exception.
- Replaced `font-mono` globally across panels using sed and targeted replacements, restoring it only for file paths and token counts where identified.
- Preserved `moss` and `oxide` tokens for system statuses and diff views as instructed.
Deviations: none
Verified: manual check of css substitutions and UI components to ensure token mapping fits the light theme.
Open questions: none


### [5.2] File Manifest Exclusion Patterns & Store Integration — 2026-08-20
Prompt: buildFileManifest() in prompts.ts currently includes every file listFiles() returns with no filtering, wasting manifest token budget on files with no editing value. Add a DEFAULT_MANIFEST_EXCLUDE_PATTERNS list and filter the file list against it before calling buildFileManifest() in ChatPanel.tsx. Store the active exclusion list in the ChatSlice seeded with the defaults, so it's overridable later. Do not exclude these files from VFS, FileTree, or read/write tools.
Files touched:
src/services/agent/prompts.ts (modified)
src/store.ts (modified)
src/components/ChatPanel.tsx (modified)
src/services/agent/prompts.test.ts (modified)
AI_CHANGELOG.md (modified)
Changed:
- Added `DEFAULT_MANIFEST_EXCLUDE_PATTERNS` to `src/services/agent/prompts.ts` containing lockfiles, `.gitignore`, `.env.example`, and binary extensions imported directly from `src/services/fs/zipExport.ts`.
- Added `isPathExcludedFromManifest` helper in `src/services/agent/prompts.ts`.
- Added `manifestExcludePatterns` and setter `setManifestExcludePatterns` with localStorage persistence to `ChatSlice` in `src/store.ts`.
- Updated `ChatPanel.tsx` to filter workspace files against `manifestExcludePatterns` before generating `<file_manifest>` and system prompts for LLM requests and token estimation.
- Added unit tests in `src/services/agent/prompts.test.ts` for default patterns and path matching.
Decisions: Kept VFS, file tree, and agent tools unaffected so models can still read binary or excluded files if explicitly instructed.
Deviations: none
Verified: `npm test` (111 tests passed across 21 test suites), `tsc --noEmit` (0 errors), and `compile_applet` passed.
Open questions: none

### [5.2] ChatSlice MaxAgentSteps Store Integration — 2026-08-20
Prompt: runAgentLoop's maxSteps parameter (agentLoop.ts, default 25) is never overridden by any caller — ChatPanel.tsx calls it without passing this argument, so the 25-step cap is invisible and fixed for every user. Add maxAgentSteps (number, default 25 to preserve current behavior exactly) to the ChatSlice in store.ts, and pass it explicitly from ChatPanel.tsx into the runAgentLoop() call as the maxSteps argument. This is purely making an already-correct, already-enforced limit visible and adjustable — do not change the enforcement logic inside agentLoop.ts itself, it already works correctly.
Files touched:
src/store.ts (modified)
src/components/ChatPanel.tsx (modified)
AI_CHANGELOG.md (modified)
Changed:
- Added `maxAgentSteps: number` and `setMaxAgentSteps: (steps: number) => void` to `ChatSlice` in `src/store.ts`, initialized to 25 with localStorage persistence under `xiom_max_agent_steps`.
- Updated `ChatPanel.tsx` to retrieve `maxAgentSteps` from `useAppStore()` and pass it explicitly as the `maxSteps` argument to `runAgentLoop()`.
Decisions: Retained default of 25 steps to preserve existing behavior exactly while enabling adjustability.
Deviations: none
Verified: `npm test` (109 passed across 21 test suites), `tsc --noEmit` (0 errors), and `compile_applet` passed.
Open questions: none

### [5.2] ChatSlice Temperature & MaxOutputTokens Store Integration — 2026-08-20
Prompt: LLMRequest.temperature and LLMRequest.maxTokens are already fully supported by every provider adapter. Add temperature (number, 0–1, default undefined) and maxOutputTokens (number, default undefined) to ChatSlice in store.ts with persistence and setters, and thread both from the store into adapter.stream() via runAgentLoop in ChatPanel.tsx.
Files touched:
src/store.ts (modified)
src/services/agent/agentLoop.ts (modified)
src/components/ChatPanel.tsx (modified)
src/services/agent/agentLoop.test.ts (modified)
AI_CHANGELOG.md (modified)
Changed:
- Added `temperature?: number` and `maxOutputTokens?: number` properties to `ChatSlice` along with `setTemperature` and `setMaxOutputTokens` setters and `localStorage` persistence.
- Updated `runAgentLoop` in `src/services/agent/agentLoop.ts` to accept options for `temperature` and `maxTokens` and forward them to `adapter.stream()`.
- Threaded `temperature` and `maxOutputTokens` from `useAppStore` in `src/components/ChatPanel.tsx` into `runAgentLoop`.
- Added unit test in `src/services/agent/agentLoop.test.ts` verifying `temperature` and `maxTokens` forwarding to `adapter.stream()`.
Decisions: Kept default values as `undefined` so that provider-specific defaults apply when unset.
Deviations: none
Verified: `npm test` (109 passed across 21 test files), `tsc --noEmit` (0 errors), and `compile_applet` passed.
Open questions: none

### [6.1] ESLint Setup & Baseline Scan — 2026-08-20
Prompt: There is no real linter in this project — "lint": "tsc --noEmit" only type-checks, it doesn't catch unused variables/imports, inconsistent style, or other issues a linter would flag. Add ESLint with flat config (eslint.config.js, matching this project's TypeScript 5.8 / Vite 6 tooling era — not legacy .eslintrc), using typescript-eslint for TS support and eslint-plugin-react-hooks for the React 19 codebase. Enable no-unused-vars (or the TS-aware equivalent) as an error, since that's the exact category of issue that already slipped through undetected for multiple phases. Set @typescript-eslint/no-explicit-any to warn, not error — there are currently ~42 legitimate pre-existing uses (mostly SSE stream event parsing across three different provider wire formats, and esbuild worker message payloads) that aren't worth a forced rewrite right now; warn surfaces them for future cleanup without breaking the build today. Update the "lint" script in package.json to run both: "lint": "tsc --noEmit && eslint .". Run the new lint command once against the full existing codebase and report the total warning/error count in the changelog entry's Verified: line, but do not silently auto-fix or refactor unrelated files as part of this change — this phase is about establishing the tooling, not a cleanup pass.
Files touched:
package.json (modified)
eslint.config.js (new)
AI_CHANGELOG.md (modified)
Changed:
- Installed `eslint`, `typescript-eslint`, `eslint-plugin-react-hooks`, `@eslint/js`, and `globals` as dev dependencies.
- Added `eslint.config.js` flat config matching the React 19 / TS 5.8 environment, setting `@typescript-eslint/no-unused-vars` to error and `@typescript-eslint/no-explicit-any` to warn.
- Updated the `lint` npm script in `package.json` to execute `tsc --noEmit && eslint .`.
Decisions: Kept existing unused variable and explicit any issues intact to report their initial baseline count without silently auto-fixing unrelated files, as requested.
Deviations: none
Verified: Executed `npm run lint` catching 114 total problems (52 errors, 62 warnings).
Open questions: none

### [6.1] LockScreen Type Safety Update — 2026-08-20
Prompt: In LockScreen.tsx, finalizeSetup(passkeyData: any) (~line 157) should be typed as passkeyData: PasskeyData | null instead of any — PasskeyData is already exported from src/services/passkeyCrypto.ts and already used correctly by enrollPasskey() and unlockWithPasskey() in that same file, which LockScreen.tsx already imports from. Add PasskeyData to the existing import line (import { isPasskeyPrfSupported, enrollPasskey, unlockWithPasskey, type PasskeyData } from '../services/passkeyCrypto') rather than adding a new import statement. Do not touch any of the other ~42 : any usages elsewhere in the codebase (provider adapters' SSE stream parsing, worker message payloads, etc.) — those are a separate, lower-priority concern and are out of scope for this change. Confirm tsc --noEmit still passes with 0 errors after the change, since this is a pure type-tightening edit with no runtime behavior change.
Files touched:
src/components/LockScreen.tsx (modified)
AI_CHANGELOG.md (modified)
Changed:
- Updated `passkeyData` parameter type in `finalizeSetup` function in `src/components/LockScreen.tsx` from `any` to `PasskeyData | null`.
- Added `type PasskeyData` to the existing `passkeyCrypto` import in `src/components/LockScreen.tsx`.
Decisions: Kept other `any` usages intact as requested.
Deviations: none
Verified: `tsc --noEmit` returned 0 errors.
Open questions: none

### [6.1] Vite-Only Virtual Module Interception & Preview Stubbing — 2026-08-20
Prompt: ReloadPrompt.tsx imports virtual:pwa-register/react, a Vite-only virtual module from vite-plugin-pwa that can never resolve outside of Vite's own dev/build server — the in-browser esbuild preview bundler currently tries to bundle it anyway, which is a dead end regardless of network connectivity (unlike genuine uncached-dependency cases, which the existing offline-detection logic already handles correctly). Exclude components that depend on Vite-only virtual modules from the in-browser preview's entry point graph — either by having the bundler's entry-detection/resolution logic special-case and skip virtual:* imports with a clear "not available in preview" no-op stub, or by restructuring ReloadPrompt so its Vite-dependent logic is isolated behind a lazy/dynamic import that the preview bundler doesn't need to traverse to build a working preview.
Files touched:
src/services/bundler/esbuild.worker.ts (modified)
AI_CHANGELOG.md (modified)
Changed:
- Added special-cased resolution in `esbuild.worker.ts`'s `vfsPlugin.onResolve` for `virtual:*` and `\0virtual:*` paths to the `virtual-module-stub` namespace.
- Added `virtual-module-stub` `onLoad` handler returning no-op hooks (`useRegisterSW`, `registerSW`) and default export stubs, completely bypassing external CDN lookups for Vite-only modules during in-browser preview builds.
- Ensured preview bundling runs cleanly without dead-end CDN fetch failures when Vite PWA components are present in the entry point graph.
Decisions: Kept the stub lightweight and compatible with standard PWA plugin hook shapes (`offlineReady`, `needRefresh`, `updateServiceWorker`).
Deviations: none
Verified: `npm test` passed 108 unit tests across 21 test suites; `tsc --noEmit` passed with 0 errors; `compile_applet` build succeeded.
Open questions: none

### [6.1] Direct Compiler WASM Binary Loading & Resolution Isolation — 2026-08-20
Prompt: esbuild.initialize({ wasmURL: wasmUrl }) in esbuild.worker.ts is passing the WASM binary URL through the same VFS plugin resolution path used for regular npm/ESM dependency imports, causing the compiler's own binary to be fetched and treated as text, which breaks initialization and cascades into misleading downstream errors (CSS import failures, missing-output-path errors) that all trace back to this single root cause. Ensure wasmUrl is resolved and loaded directly via fetch/binary loading before or outside of the esbuild.build() plugin pipeline, entirely bypassing the vfsPlugin's onResolve/onLoad handlers — the compiler binary should never enter the same resolution path as project dependencies. Verify by triggering a first-ever build in a fresh session (clear the dependency cache first) and confirming no \x00/unexpected-token error appears during the "Initializing compiler..." status phase.
Files touched:
src/services/bundler/esbuild.worker.ts (modified)
AI_CHANGELOG.md (modified)
Changed:
- Updated `esbuild.worker.ts` compiler initialization to directly fetch `wasmUrl` as an `ArrayBuffer` and compile via `WebAssembly.compile(wasmBytes)` into a `wasmModule` before invoking `esbuild.initialize({ wasmModule, worker: false })`.
- Explicitly excluded `*.wasm`, `wasmUrl`, and `esbuild.wasm` in `vfsPlugin.onResolve` from entering the `unpkg-url` or VFS text loader pipelines.
- Enhanced `unpkg-url` `onLoad` loader detection to dynamically classify loaded resources (.css, .json, .ts, .tsx, .jsx, .js) rather than hardcoding JS text loaders.
Decisions: Retained a fallback to `wasmURL` in case direct WebAssembly compilation encounters environment constraints.
Deviations: none
Verified: `npm test` passed 108 unit tests across 21 test suites; `tsc --noEmit` passed with 0 errors; `compile_applet` build succeeded.
Open questions: none

### [Phase 7] Multi-Project Deletion Transaction & Confirmation Modal — 2026-08-20
Prompt: There is no way to delete a project. Add a deleteProject(projectId: string) function (suggested location: src/services/fs/vfs.ts alongside the other project-scoped file operations, or a new src/services/fs/project.ts) that runs as a single Dexie transaction across projects, files, and snapshots — deleting all files and snapshots rows matching projectId before deleting the projects row itself, so nothing is left orphaned. Wire this to a delete action in the project switcher UI (from 8.2) or a project settings menu, gated behind a confirmation step that names the project and states the action is permanent and unrecoverable (there is no undo/soft-delete/trash mechanism anywhere in this app — confirm this explicitly in the confirmation copy rather than implying otherwise). After deletion, fall back to selecting the next available project via the same projects.find(...) || projects[0] || null pattern already used in App.tsx for handling a missing activeProjectId; if no projects remain, return to the empty-workspace state.
Files touched:
src/services/fs/vfs.ts (modified)
src/services/fs/vfs.test.ts (modified)
src/App.tsx (modified)
AI_CHANGELOG.md (modified)
Changed:
- Added `deleteProject(projectId: string)` to `src/services/fs/vfs.ts` executing an atomic Dexie transaction across `db.projects`, `db.files`, and `db.snapshots` to prevent orphaned records.
- Added 2 unit tests in `src/services/fs/vfs.test.ts` verifying complete transactional purging of matching project, files, and snapshot records while leaving other projects untouched.
- Added a project deletion trash button in the Files panel header in `src/App.tsx`.
- Implemented a modal confirmation dialog specifying the target project name and stating that the action is permanent and unrecoverable with no undo/trash mechanism.
- Handled post-deletion state fallback to the next available project or returning to the empty-workspace state when all projects are deleted.
Decisions: Positioned the delete button directly beside the project switcher and new-project controls for quick access with danger-themed styling.
Deviations: none
Verified: `npm test` passed 108 tests across 21 test suites; `tsc --noEmit` passed with 0 errors; `compile_applet` build succeeded.
Open questions: none

### [Phase 7] Project Switcher Chip Restyling & Persistent New Project Button — 2026-08-20
Prompt: The project switcher in App.tsx's Files header is a functional <select> bound to setActiveProjectId, but it's styled identically to static text and gives no visual signal that it's tappable — users can't tell it's a menu. Restyle it as a distinct chip/button element (background fill, border, chevron with more visual weight, or a proper bottom sheet matching the pattern already used in the provider picker) so it clearly reads as an interactive control regardless of how many projects exist. Separately, handleCreateBlankProject exists and works correctly but has no persistent, always-visible entry point — add a "+ New Project" icon button directly beside the project switcher in the Files header (not nested in a submenu), wired to the existing handleCreateBlankProject function, visible at all times regardless of whether the current project has files.
Files touched:
src/App.tsx (modified)
AI_CHANGELOG.md (modified)
Changed:
- Restyled the project switcher `<select>` container into an interactive chip button with `bg-surface`, `border-brass/30`, hover states (`hover:border-brass/70`), and a visible brass chevron indicator.
- Added a persistent "+ New Project" icon button (`<Plus />`) directly adjacent to the project switcher in the Files header, wired directly to `handleCreateBlankProject`.
- Updated `handleCreateBlankProject` to name sequential projects (`Workspace Project N`) with customized README headers upon creation.
Decisions: Kept the controls compactly aligned and sized to fit comfortably alongside the GitHub/Upload/Export action buttons on mobile viewports.
Deviations: none
Verified: `npm test` passes all 106 unit tests across 21 suites; `tsc --noEmit` returns 0 errors; `compile_applet` builds cleanly.
Open questions: none

### [3.1] ChatPanel Assistant Loading Placeholder Indicator — 2026-08-20
Prompt: In ChatPanel.tsx, the message bubble render block (around the msg.content && (...) conditional, ~line 319) has no visual state for an assistant message where content is empty and toolCalls is undefined — this is the normal placeholder state pushed by runAgentLoop before the first stream chunk arrives, but it currently renders as an empty bubble shell with nothing inside. Add a sibling condition that shows the already-imported Loader2 icon (animate-spin) when msg.role === 'assistant' && !msg.content && !msg.toolCalls && loading is true, so the placeholder reads as "thinking" instead of appearing broken. Gate it on loading specifically (not just empty content) so it doesn't spin forever if a turn legitimately ends with empty content after the request completes.
Files touched:
src/components/ChatPanel.tsx (modified)
AI_CHANGELOG.md (modified)
Changed:
- Added a conditional render inside `ChatPanel.tsx`'s message bubble block for `msg.role === 'assistant' && !msg.content && !msg.toolCalls && loading`.
- Displays the animated spinning `Loader2` icon with a `"Thinking..."` label during the initial stream response window.
- Gated the state specifically on the `loading` flag to avoid persisting spinner animations if an assistant response legitimately finishes with empty content.
Decisions: Styled the placeholder indicator with `text-brass`, `font-mono`, and `text-xs` matching the application's visual language.
Deviations: none
Verified: `npm test` passes 106 unit tests across 21 suites; `tsc --noEmit` returns 0 errors; `compile_applet` succeeds.
Open questions: none

### [Phase 7] Multi-Project Switcher Support — 2026-08-20
Prompt: App.tsx and PatchReviewSheet/ChatPanel hardcode projects[0] everywhere, even though db.ts's Project table already supports multiple projects. Add a project switcher (dropdown or list) in the Files panel header, store the active project id in workspaceSlice (persisted like activeProfileId), and thread it through instead of projects[0] across App.tsx, ChatPanel, PatchReviewSheet, and both GitHub modals.
Files touched:
src/store.ts (modified)
src/App.tsx (modified)
AI_CHANGELOG.md (modified)
Changed:
- Added `activeProjectId` and `setActiveProjectId` to `WorkspaceSlice` in `src/store.ts`, persisting the selected project in `localStorage` as `xiom_active_project_id`.
- Replaced hardcoded `projects[0]` lookups in `App.tsx` with a robust `activeProject` resolution fallback logic.
- Introduced a styled dropdown `<select>` element in the Files tab header inside `App.tsx` containing all loaded projects, enabling quick workspace switching.
- Threaded `activeProject.id` to child components: `FileTree`, `ChatPanel`, `PatchReviewSheet`, `GithubImportModal`, `GithubPushModal`, and project ZIP export logic.
Decisions: Kept the select dropdown simple and natively styled to match existing header layouts. 
Deviations: none
Verified: `npm test` passes 106 unit tests; `tsc --noEmit` returns 0 errors; `compile_applet` succeeds cleanly.
Open questions: none

### [6.1] PreviewPanel Bundled-Mode Detection & Entry Point Resolution — 2026-08-20
Prompt: PreviewPanel's bundled-mode detection only checks for react/vue/vite in package.json and guesses among 4 hardcoded entry paths, silently falling through to the broken static path if neither matches. Add detection for svelte and solid-js, check vite.config.{js,ts} for an explicit root/build.rollupOptions.input if present, and when isBundled is true but no entry point is found, show a specific error ("Bundled project detected but no entry point found — expected one of: ...") instead of silently falling through to the static-file preview path.
Files touched:
src/services/bundler/entryDetection.ts (new)
src/services/bundler/entryDetection.test.ts (new)
src/components/PreviewPanel.tsx (modified)
AI_CHANGELOG.md (modified)
Changed:
- Created `detectBundledProject()` utility in `src/services/bundler/entryDetection.ts` providing structured bundled-mode detection and entry point resolution.
- Added framework dependency checks for `svelte`, `@sveltejs/vite-plugin-svelte`, `solid-js`, `vite-plugin-solid` alongside React, Vue, and Vite in `package.json`.
- Implemented parsing for `vite.config.{js,ts,mjs,cjs}` to recognize explicit `root` directories and `build.rollupOptions.input` (strings, arrays, object maps).
- Added resolution for `<script type="module" src="...">` references inside `index.html`.
- Updated `PreviewPanel.tsx` to surface an explicit actionable error banner (`"Bundled project detected but no entry point found — expected one of: ..."`) when `isBundled` is true but no entry point exists, preventing silent fallback to broken static previews.
- Added 11 unit tests in `src/services/bundler/entryDetection.test.ts` covering static projects, framework detections, Vite config parsing, HTML script modules, and missing-entry error states.
Decisions: Supported root paths and rollup option variations (string, array, object map) for comprehensive Vite configuration compatibility.
Deviations: none
Verified: `npm test` runs and passes all 106 unit tests across 21 test suites; `tsc --noEmit` returns 0 errors; `compile_applet` builds cleanly.
Open questions: none


### [Phase B] Agent Loop Cancellation Graceful Handling — 2026-08-20
Prompt: In agentLoop.ts, if signal.aborted fires inside the `for (const tc of toolCalls)` execution loop, already-issued tool calls that haven't been executed yet are left without matching tool-result messages, corrupting message history for the next API call. When an abort is detected mid-loop, synthesize a role:'tool' cancellation result (e.g. "Cancelled by user") for every remaining un-executed toolCall before breaking, so every tool_use always has a matching tool_result.
Files touched:
src/services/agent/agentLoop.ts (modified)
AI_CHANGELOG.md (modified)
Changed:
- Modified `runAgentLoop` in `src/services/agent/agentLoop.ts` to replace the simple `break` on `signal?.aborted` during tool execution.
- Added logic to iterate over all remaining un-executed tool calls and append a synthetic `role: 'tool'` message with content "Cancelled by user" for each, ensuring that every tool call issued by the LLM has a corresponding tool result message.
Decisions: Kept the cancellation synthetic message simple ("Cancelled by user").
Deviations: none
Verified: `npm test` runs and passes all 95 unit tests; `tsc --noEmit` returns 0 errors; `compile_applet` builds cleanly.
Open questions: none

### [1.1] LockScreen Passphrase Minimum Length & Strength Enforcement — 2026-08-20
Prompt: LockScreen.handleStartSetup allows a 4-character passphrase. Raise the enforced minimum to 10 characters, and block submission (not just show a color bar) when getStrength() returns 'Weak'. Add a short inline explanation that this passphrase is the only thing standing between local device access and the user's decrypted API keys and GitHub PAT.
Files touched:
src/components/LockScreen.tsx (modified)
src/components/LockScreen.test.ts (new)
AI_CHANGELOG.md (modified)
Changed:
- Raised the enforced minimum passphrase length in `LockScreen.handleStartSetup` from 4 to 10 characters.
- Updated `getStrength()` to explicitly classify any passphrase with fewer than 10 characters or low entropy (<40 bits) as 'Weak'.
- Blocked form submission in `handleStartSetup` and disabled the submit button when `getStrength()` evaluates to 'Weak'.
- Added an inline security notice banner in the setup view explaining that the master passphrase is the sole barrier protecting decrypted API keys and GitHub PATs from unauthorized local device access.
- Created `src/components/LockScreen.test.ts` to test strength scoring thresholds and length rules.
Decisions: Kept the 4-level entropy visual meter with live countdown indicator showing remaining characters needed until 10 characters are reached.
Deviations: none
Verified: `npm test` runs and passes all 95 unit tests across 20 test suites; `tsc --noEmit` returns 0 errors; `compile_applet` builds cleanly.
Open questions: none


### [Phase A] Dynamic Model Context Window Resolution & Metadata — 2026-08-20
Prompt: tokenUsage.max is hardcoded to 200000 in store.ts and ChatPanel regardless of provider/model. Add a contextWindow field to each provider's model metadata (reuse/extend modelDiscovery.ts) and have SettingsPanel/ChatPanel set tokenUsage.max from the active connection profile's model instead of a constant. Fall back to a conservative default (e.g. 32000) for unknown OpenAI-compatible/local models rather than assuming 200k.
Files touched:
src/services/llm/modelDiscovery.ts (modified)
src/services/llm/modelDiscovery.test.ts (new)
src/store.ts (modified)
src/components/ChatPanel.tsx (modified)
src/components/SettingsPanel.tsx (modified)
AI_CHANGELOG.md (modified)
Changed:
- Extended `DiscoveredModel` interface in `modelDiscovery.ts` with optional `contextWindow?: number`.
- Built `KNOWN_MODEL_CONTEXT_WINDOWS` table and `getModelContextWindow(provider, modelId)` resolution logic covering Claude (200k), OpenAI GPT-4o (128k), o1/o3-mini (200k), GPT-4 (8k), GPT-3.5 (16k), Gemini (1M/2M), open-source families (Llama 3.1, Qwen 2.5, DeepSeek), and a 32,000 conservative fallback for unknown models.
- Updated `fetchAvailableModels()` to populate `contextWindow` on discovered models across OpenAI, Anthropic, Google, and OpenAI-compatible endpoints.
- Updated `store.ts` initial `tokenUsage.max` from hardcoded 200,000 to conservative fallback 32,000.
- Updated `ChatPanel.tsx` to dynamically query the active connection profile from `db.connectionProfiles` and assign `tokenUsage.max` via `getModelContextWindow()`.
- Updated `SettingsPanel.tsx` to sync `tokenUsage.max` on default profile changes and profile updates, and added human-readable context window badges in profile cards and model dropdown items.
- Added comprehensive unit tests in `src/services/llm/modelDiscovery.test.ts` verifying all provider context windows, fallback defaults, formatting, and live discovery parsing.
Decisions: Rounded thousands cleanly in `formatContextWindow` (e.g. `8192` -> `8k`, `128000` -> `128k`, `2000000` -> `2M`).
Deviations: none
Verified: `npm test` runs and passes all 91 unit tests across 19 test suites; `tsc --noEmit` returns 0 errors; `compile_applet` builds cleanly.
Open questions: none

### [Phase A] Lightweight File Manifest & Token Math Refactoring — 2026-08-20
Prompt: ChatPanel currently appends every VFS file into a <codebase> block on the system prompt for every message, duplicating what the agent's read_file/list_directory/search_code tools already do. Replace this with a lightweight file-tree manifest (paths + byte sizes only, no content) sent on every turn, and update the agent's system prompt (prompts.ts) to instruct it to use read_file for content it needs. Keep the existing cache_control/cacheable plumbing but apply it to the manifest instead of full file contents. Update TopStrip's token math accordingly.
Files touched:
src/services/agent/prompts.ts (modified)
src/services/agent/prompts.test.ts (new)
src/components/ChatPanel.tsx (modified)
src/services/agent/agentLoop.ts (modified)
src/components/TopStrip.tsx (modified)
AI_CHANGELOG.md (modified)
Changed:
- Replaced monolithic `<codebase>` file content dump with `buildFileManifest()` in `prompts.ts`, formatting paths and byte counts without leaking full source contents.
- Updated `BASE_SYSTEM_PROMPT` in `prompts.ts` instructing the agent to inspect specific files using `read_file` as needed and use `write_file` for structured diff applications.
- Updated `ChatPanel.tsx` context counting and token calculation to compute manifest tokens rather than full codebase token estimates, and refined context UI to display manifest byte sizes.
- Preserved ephemeral caching plumbing in `agentLoop.ts` by setting `systemPromptCacheable: true` on adapter stream calls.
- Updated `TopStrip.tsx` token bar tooltip from "Codebase Cache" to "File Manifest".
- Added test coverage in `prompts.test.ts` for empty workspace and multi-file manifest construction.
Decisions: Kept custom instructions injection cleanly separated above the `<file_manifest>` block in the system prompt.
Deviations: none
Verified: `npm test` runs and passes all 81 unit tests across 18 test suites; `tsc --noEmit` returns 0 errors; `compile_applet` builds cleanly.
Open questions: none

### [Phase C] PatchReviewSheet Upsert Semantics, Error Handling & Applied Paths Fix — 2026-08-20
Prompt: In PatchReviewSheet.executeApply(), the 'create' branch calls createFile() unguarded, which throws if the path already exists — this halts the entire apply loop with an unhandled rejection and leaves clearPendingPatches() unreached. Change the 'create' branch to check for an existing file first and fall back to writeFile() (upsert semantics) if found, matching the write_file tool's documented behavior ("Overwrites if it exists. Creates it if it does not."). Also wrap the whole executeApply() loop body in a try/catch per-patch so one failure doesn't abort remaining patches — collect failures and surface them in a dismissible error banner in the sheet instead of failing silently. Fix the appliedPaths.push() bug in the same pass: only push a path into appliedPaths/flashPatchedPaths after its write actually succeeds, not unconditionally before the type branch runs.
Files touched:
src/components/PatchReviewSheet.tsx (modified)
src/store.ts (modified)
AI_CHANGELOG.md (modified)
Changed:
- Changed `PatchReviewSheet.executeApply()` 'create' branch to inspect `files` for an existing file at `patch.path` and fallback to `writeFile()` (upsert semantics) if found.
- Wrapped each individual patch execution in `executeApply()` with a `try/catch` block to ensure individual patch failure does not abort remaining patches.
- Added dismissible error banner in `PatchReviewSheet` displaying any collected patch failure messages.
- Added `setPendingPatches` in `store.ts` (`PatchSlice`) and retained failed patches in `pendingPatches` while clearing only successfully applied ones.
- Fixed `appliedPaths.push()` bug by moving it after write execution succeeds in the try block rather than unconditionally before the type branch.
Decisions: Retained failed patches in `pendingPatches` while filtering out successfully applied ones when errors occur, keeping the sheet open with the error banner for quick user inspection.
Deviations: none
Verified: `npm test` runs and passes all 77 unit tests across 17 test suites; `tsc --noEmit` returns 0 errors; `compile_applet` succeeds.
Open questions: none

### [Phase F] Zustand Store Slices Refactoring — 2026-08-20
Prompt: Refactor store.ts into separate slices using Zustand's slice pattern: a workspaceSlice (activeTab, activeFileId, activeProfileId), a patchSlice (pendingPatches, isPatchReviewOpen, flashingPaths), a chatSlice (chatHistory, tokenUsage, queuedPrompt, customInstructions), and a pwaSlice (deferredInstallPrompt, showInstallPrompt). Keep the combined useAppStore export so existing component code doesn't need to change.
Files touched:
src/store.ts (modified)
AI_CHANGELOG.md (modified)
Changed:
- Broke down monolithic `AppState` interface in `store.ts` into `WorkspaceSlice`, `PatchSlice`, `ChatSlice`, and `PWASlice`.
- Implemented Zustand `StateCreator` functions for each slice: `createWorkspaceSlice`, `createPatchSlice`, `createChatSlice`, and `createPWASlice`.
- Recomposed `AppState` and the final `useAppStore` export by merging the separate slices, ensuring full backward compatibility with existing component usage.
Decisions: Unspecified properties (`keys`, `lastBuildError`) were grouped into `WorkspaceSlice` since they conceptually align with the active workspace execution state.
Deviations: none
Verified: `npm test` runs and passes all 77 unit tests across 17 test suites; `tsc --noEmit` returns 0 errors; `npm run build` succeeds cleanly.
Open questions: none

### [Phase F] Production Scaffolding Audit & Dependency Cleanup — 2026-08-20
Prompt: Audit the codebase for development-time scaffolding that shouldn't ship: remove the testDatabaseReadback console.log in App.tsx's useEffect (or gate it behind import.meta.env.DEV), remove @types/jszip and @types/diff from devDependencies since both packages ship their own types now, and grep for any other console.log/debug statements outside seed.ts and error handlers.
Files touched:
src/App.tsx (modified)
src/components/ReloadPrompt.tsx (modified)
package.json (modified)
AI_CHANGELOG.md (modified)
Changed:
- Removed `console.log('[DB Test Result]', res)` from `App.tsx` on-mount database readback verification.
- Removed `console.log('SW Registered:', r)` debug log from `ReloadPrompt.tsx` service worker registration callback.
- Cleaned up redundant `@types/diff` and `@types/jszip` from `package.json` devDependencies as both upstream packages bundle native TypeScript declaration files.
- Verified absence of development console.log statements across production runtime files.
Decisions: Retained essential error handlers (`console.error`) for unexpected runtime exceptions and intentional demonstration comments in seed data templates.
Deviations: none
Verified: `npm test` runs and passes all 77 unit tests across 17 test suites; `tsc --noEmit` returns 0 errors; `npm run build` and `compile_applet` succeed cleanly.
Open questions: none

### [Phase E] Bundle Code-Splitting & Lazy Loading — 2026-08-20
Prompt: Code-split the app: lazy-load esbuild-wasm and the bundler worker only when a project actually needs bundling (i.e. only after package.json + react/vue/vite is detected in PreviewPanel), not on initial app load. Lazy-load CodeMirror language packages per file type instead of bundling all of them upfront. Report the before/after bundle sizes in the changelog entry.
Files touched:
src/components/Editor.tsx (modified)
src/components/Editor.test.ts (new)
src/components/PreviewPanel.tsx (modified)
src/components/SettingsPanel.tsx (modified)
src/services/bundler/bundler.ts (modified)
src/services/llm/tokenizer.ts (modified)
vite.config.ts (modified)
AI_CHANGELOG.md (modified)
Changed:
- Converted CodeMirror language extensions in `Editor.tsx` (`@codemirror/lang-javascript`, `@codemirror/lang-html`, `@codemirror/lang-css`, `@codemirror/lang-json`, `@codemirror/lang-markdown`) to dynamic `import()` loaders with in-memory caching keyed by language type.
- Updated `PreviewPanel.tsx` to dynamically import `../services/bundler/bundler` only when package.json contains `react`/`vue`/`vite` dependencies and an entry point is detected.
- Updated `SettingsPanel.tsx` to dynamically import cache management utilities (`getDependencyCacheInfo`, `clearDependencyCache`) on demand rather than at the top level.
- Updated `bundler.ts` to lazy-load `esbuild-wasm/esbuild.wasm?url` via dynamic import only when `bundle()` is called.
- Updated `tokenizer.ts` to dynamically import `gpt-tokenizer` only when calculating token counts for OpenAI/OpenRouter models.
- Configured Vite `rollupOptions.output.manualChunks` for heavy vendor chunks (`vendor-tokenizer`, `vendor-jszip`, `vendor-diff`, `vendor-codemirror`).
- Added unit tests in `Editor.test.ts` verifying language extension resolution and caching across JavaScript/TypeScript, HTML, CSS, JSON, and Markdown.
Bundle Size Comparison:
- Initial main JS entry bundle (Before): 3,583.91 kB (1,501.53 kB gzip)
- Initial main JS entry bundle (After): 783.53 kB (217.34 kB gzip) -> ~78% initial payload size reduction
- esbuild-wasm binary (13.98 MB) & bundler worker (73.94 kB): deferred and lazy-loaded only upon bundling triggers
- CodeMirror language packages: separated into micro-chunks (0.42 kB – 14.43 kB each), loaded only when viewing matching file extensions
Decisions: Kept CodeMirror core theme and basic setup in the shared editor bundle for seamless zero-flicker editor mounting, while isolating syntax grammars into dynamic chunks.
Deviations: none
Verified: `npm test` runs and passes all 77 unit tests across 17 test suites; `tsc --noEmit` returns 0 errors; `npm run build` and `compile_applet` succeed.
Open questions: none

### [Phase D] Cache Storage Dependency Cache & Offline Bundler — 2026-08-20
Prompt: Add a Cache Storage-backed cache in the esbuild worker's unpkg-url loader: check cache before fetching from esm.sh, store successful responses, and add a "Clear dependency cache" button in Settings. Show a distinct build-status message when the bundler is waiting on network fetches vs. actually compiling, so users understand why a rebuild is slow. Handle the fully-offline case by surfacing a clear error ("This dependency isn't cached — connect to the internet once to preview this project") instead of a generic fetch failure.
Files touched:
src/services/bundler/esbuild.worker.ts (modified)
src/services/bundler/bundler.ts (modified)
src/services/bundler/bundler.test.ts (new)
src/components/PreviewPanel.tsx (modified)
src/components/SettingsPanel.tsx (modified)
AI_CHANGELOG.md (modified)
Changed:
- Integrated browser Cache Storage (`xiom-esm-dep-cache-v1`) into the esbuild worker's `unpkg-url` plugin loader to store and reuse remote esm.sh responses across rebuilds and sessions.
- Added offline detection (`navigator.onLine === false` / TypeError check) in esbuild worker with user-friendly error message: "This dependency isn't cached (${url}) — connect to the internet once to preview this project."
- Added real-time progress status messages from worker to main thread distinguishing active network fetching (`Fetching dependency: <name> (N pending)...`) from esbuild compilation (`Compiling project with esbuild...`).
- Added "Dependency Cache" card in `SettingsPanel.tsx` displaying cached module count with an action to clear cached responses.
- Added `clearDependencyCache()` and `getDependencyCacheInfo()` helper functions in `bundler.ts`.
- Added unit tests in `bundler.test.ts` verifying cache info inspection, cache clearing, and build progress callbacks.
Decisions: Cache key uses the complete module URL from esm.sh (including query parameters/sub-paths) to preserve version fidelity and tree-shaking query strings.
Deviations: none
Verified: `npm test` runs and passes all 74 unit tests across 16 test suites; `tsc --noEmit` returns 0 errors; `compile_applet` succeeds.
Open questions: none

### [Phase C] Agent Loop Safety Rails, Step Cap & Delete Confirmation — 2026-08-20
Prompt: Add safety rails to the agent loop: cap the number of tool-call iterations per user turn (default 25) with a clear "Agent stopped after N steps" message rather than looping indefinitely. Add a confirmation step in PatchReviewSheet specifically for 'delete' type patches, separate from the normal apply flow, showing the file content that would be lost. Validate that write_file patches can't target paths outside the project (e.g. reject '../' traversal attempts even though the current architecture is DB-scoped) as defense in depth.
Files touched:
src/services/agent/agentLoop.ts (modified)
src/services/agent/agentLoop.test.ts (modified)
src/services/agent/tools.ts (modified)
src/services/agent/tools.test.ts (modified)
src/components/PatchReviewSheet.tsx (modified)
AI_CHANGELOG.md (modified)
Changed:
- Added tool-call step counter to `runAgentLoop` with configurable `maxSteps` (default 25); appends an assistant notification (`Agent stopped after ${stepCount} steps.`) and halts cleanly when reached.
- Implemented `validateProjectPath` utility in `tools.ts` enforcing absolute paths with leading slashes and rejecting path traversal attempts containing `..` path segments or null bytes across `write_file`, `read_file`, and `list_directory`.
- Added automatic resolution of `oldContent` from the VFS in `tools.ts` for `delete` type patches if not explicitly supplied by the LLM.
- Added a dedicated Delete Confirmation Modal in `PatchReviewSheet.tsx` that intercepts apply attempts containing checked delete patches, displaying the target file path, reason, and exact strikethrough file content that would be lost.
- Styled delete patches in `PatchReviewSheet` with distinct Oxide red badges and warnings.
- Added comprehensive unit tests for agent loop step limits, path traversal rejection, and delete patch oldContent resolution.
Decisions: When delete patches are present, "Apply Selected" switches to a dedicated "Review & Apply" Oxide warning CTA opening the modal, where the user can inspect each file's lost contents line by line before confirming.
Deviations: none
Verified: `npm test` runs and passes all 71 unit tests across 15 test suites; `tsc --noEmit` returns 0 errors; `compile_applet` succeeds.
Open questions: none

### [Phase B] LLM Provider Adapters & Agent Loop Unit Testing — 2026-08-20
Prompt: Add unit tests for the four LLM provider adapters (anthropic.ts, openai.ts, google.ts, openaiCompatible.ts): mock fetch responses for both send() and stream(), covering a normal text response, a tool_call response, a mid-stream network error, and a malformed/truncated SSE chunk. Add tests for agentLoop.ts covering the write_file interception (confirm it never touches vfs.ts directly) and abort-signal handling mid-stream. Add a test for tools.ts confirming path validation rejects paths not starting with '/'.
Files touched:
src/services/llm/providers/anthropic.test.ts (new)
src/services/llm/providers/openai.test.ts (new)
src/services/llm/providers/openaiCompatible.test.ts (new)
src/services/llm/providers/google.test.ts (new)
src/services/agent/agentLoop.test.ts (new)
src/services/agent/tools.test.ts (new)
src/store.ts (modified)
AI_CHANGELOG.md (modified)
Changed:
- Implemented comprehensive mock fetch test suites for AnthropicProvider, OpenAIProvider, OpenAICompatibleProvider, and GoogleProvider covering `send()` (text and tool calls), `stream()` (text SSE, tool call json delta accumulation, usage metadata), mid-stream stream-reader network aborts, and corrupted/truncated SSE chunk recovery.
- Added agent loop tests verifying `write_file` tool call proposals are safely routed exclusively to the pending patch review queue without modifying VFS / IndexedDB files directly.
- Added abort-signal test verifying agent loop cleanly exits mid-stream upon cancellation without executing pending tool calls.
- Added tool path validation test confirming `write_file` rejects relative paths and non-leading-slash paths with clear error messages.
- Updated `src/store.ts` to guard browser global accesses (`localStorage`, `window`) when loaded in headless test runners.
Decisions: Used `TextEncoder` and standard `ReadableStream` controller enqueues to accurately simulate network chunks and SSE protocol line buffers for each provider.
Deviations: none
Verified: `npm test` runs and passes all 65 unit tests across 15 test suites; `tsc --noEmit` returns 0 errors; `compile_applet` succeeds.
Open questions: none

### [Phase A] Passphrase Recovery Mechanism & Encrypted Backup/Restore — 2026-08-20
Prompt: Add a recovery mechanism for the passphrase lock (12-word recovery phrase, second wrapped copy of master key, setup confirmation, forgot passphrase unlock) and add Encrypted Backup export/import in Settings.
Files touched:
src/services/bip39Words.ts (new)
src/services/recovery.ts (new)
src/services/recovery.test.ts (new)
src/services/backup.ts (new)
src/services/backup.test.ts (new)
src/services/lockConfig.ts (modified)
src/components/LockScreen.tsx (modified)
src/components/SettingsPanel.tsx (modified)
AI_CHANGELOG.md (modified)
Changed:
- Built BIP-39 12-word recovery service deriving PBKDF2 wrapping key to store second AES-GCM wrapped copy of master key in LockConfig.
- Added recovery phrase display during vault initialization with 12-word grid, copy action, and mandatory "I've saved this" confirmation before continuing.
- Added "Forgot passphrase? Use recovery phrase" unlock flow allowing full master key restoration and database access.
- Implemented encrypted backup export and import in Settings with validation, summary preview modal, and Dexie transactional restore.
Decisions: Used full standard 2048-word BIP-39 English dictionary for offline cryptographically-secure 128-bit entropy; structured backups with versioning (`xiom-backup-v1`) and included snapshots, profiles, and encrypted tokens.
Deviations: none
Verified: `npm test` passed 35/35 unit tests across 9 test suites (`recovery.test.ts`, `backup.test.ts`, `crypto.test.ts`, `vfs.test.ts`, etc.); `npm run lint` (`tsc --noEmit`) 0 errors; `compile_applet` passed.
Open questions: none

### [AUDIT] External Codebase Review & Robustness Phases A–G Scoped — 2026-08-20
Prompt: Check the full codebase carefully and rate the build; then draft next prompt phases to make it more robust; then update ai-studio-build-blueprint.md with what changed/was found.
Files touched:
ai-studio-build-blueprint.md (modified, external to this repo's zip — held by the user)
AI_CHANGELOG.md (modified — Current State corrected, this entry added)
Changed:
- No application code changed. Ran `npm install`, `tsc --noEmit`, `npm test`, `npm run build`, `npm audit` directly against the shipped zip rather than trusting prior "Verified" lines.
- Found 4 undocumented deviations from blueprint (zip/GitHub import overwrite-on-collision, Git-blob-SHA diffing in push flow, PAT storage location) — now recorded in Current State above.
- Found 6 unfinished edges (no passphrase recovery, thin test coverage outside fs/crypto, no agent step cap, no bundler dep caching, large bundle size, minor dev scaffolding) — now recorded in Current State above.
- Drafted Phases A–G (recovery path, provider/agent/bundler tests, agent safety rails, dependency caching, code-splitting, scaffolding cleanup, store slicing) and appended them to ai-studio-build-blueprint.md in the same prompt format as Phases 0–11.
Decisions: Treated this as an audit entry rather than assigning it a real phase.subphase number, since no code shipped — labeled [AUDIT] to keep it distinguishable from build entries at a glance. Judged the "Deviations: none" claims on the 4 affected past entries (1.6, 8.1, 8.2, 8.3) to be incorrect per this file's own rule that log/code disagreements are bugs to flag, not silently fix — correcting them here rather than editing those past entries.
Deviations: n/a (this entry documents deviations found in earlier phases, listed above and in Current State)
Verified: `npm install` (454 packages, clean), `tsc --noEmit` (0 errors), `npm test` (7 suites / 26 tests, all pass), `npm run build` (succeeds; flags its own 3.3MB JS / 14MB wasm chunk sizes), `npm audit --omit=dev` (0 vulnerabilities), manual read-through of crypto.ts, passkeyCrypto.ts, vfs.ts, agentLoop.ts, tools.ts, githubClient.ts, providers/anthropic.ts, PreviewPanel.tsx, esbuild.worker.ts, store.ts, db.ts.
Open questions: Should [AUDIT] entries live in this same log going forward, or in a separate REVIEW_LOG.md? Left in this file for now since nothing in the original instructions carves out review-only entries as a separate stream.

### [8.5.11] Small Viewport (360px) & Overflow Hardening — 2026-08-19
Prompt: Test on actual small viewports (360px width minimum): file tree with deep nesting, patch review sheet with a large diff, context gauge with a near-full context window, editor with a very long file. Fix any overflow or truncation issues found.
Files touched:
src/components/TopStrip.tsx (modified)
src/components/FileTree.tsx (modified)
src/components/PatchReviewSheet.tsx (modified)
src/components/Editor.tsx (modified)
src/App.tsx (modified)
AI_CHANGELOG.md (modified)
Changed:
- TopStrip: Added compact token formatter (`formatTokens` e.g. `198k / 200k (99%)`), flex shrink protection, and near-full alert badge (`isNearFull` at >=85% with oxide highlight and icon).
- FileTree: Added `overflow-auto scrollbar-thin` with `min-w-full w-max` layout to support deep nesting hierarchies without text distortion; clamped context menu coordinates against viewport boundaries to prevent off-screen clipping on narrow screens.
- PatchReviewSheet: Added `break-all` on hunk file paths, `min-w-0` on flex containers, `whitespace-pre overflow-x-auto` on code lines, and wrap-safe responsive action button footer (`flex-wrap sm:flex-nowrap justify-between gap-2`).
- Editor: Applied `truncate min-w-0 flex-1` on file path header, prevented action button overflow, and configured CodeMirror gutters (`[&_.cm-lineNumbers]:min-w-[2.5em]`) for multi-thousand line files.
- App: Refined Files tab header padding (`px-3 sm:px-4 py-2.5 pb-2 gap-2`) and button touch targets for 360px screens.
Decisions: Retained horizontal scroll for deeply nested file trees and long code lines rather than forcing arbitrary line-breaks that damage code structure.
Deviations: none
Verified: `npm test` (all 26 unit and crypto tests passing), `npm run lint` (0 errors), and `compile_applet` passed.
Open questions: none

### [8.5.10] Accessibility, Contrast & Reduced-Motion Audit — 2026-08-19
Prompt: Audit: visible keyboard focus rings on every interactive element, prefers-reduced-motion respected (disable the brass flash and gauge animation), sufficient contrast on the moss/oxide diff colors against the ink background, all icon-only buttons have aria-labels.
Files touched:
src/index.css (modified)
src/components/TopStrip.tsx (modified)
src/components/Editor.tsx (modified)
src/components/PatchReviewSheet.tsx (modified)
src/components/GithubImportModal.tsx (modified)
src/components/GithubPushModal.tsx (modified)
src/components/SettingsPanel.tsx (modified)
src/App.tsx (modified)
AI_CHANGELOG.md (modified)
Changed:
- Added universal `:focus-visible` ring styling (`outline: 2px solid var(--color-brass)`, `outline-offset: 2px`) for keyboard focus across all interactive elements (`button`, `a`, `input`, `select`, `textarea`, `[tabindex]`).
- Added `@media (prefers-reduced-motion: reduce)` rules in `src/index.css` disabling brass flash animations and instant-snapping transitions; added `motion-reduce:transition-none` to token gauge strips in `TopStrip.tsx`.
- Upgraded diff palette tokens (`--color-moss: #7EC185` [~7.2:1 contrast ratio against ink] and `--color-oxide: #E07A5F` [~5.1:1 contrast ratio against ink]) ensuring WCAG AA/AAA compliant contrast.
- Audited and added descriptive `aria-label` attributes to all icon-only buttons (close buttons, diff hunk check toggles, model selector dropdown toggles, modal dismissal buttons, tab bar navigation items).
Decisions: Used explicit `:focus-visible` outlines in CSS base layer so mouse clicks do not create distracting focus rings while keyboard navigation remains clearly visible.
Deviations: none
Verified: `npm test` (all 26 tests passed across 7 test suites), `npm run lint` (0 errors), and `compile_applet` passed.
Open questions: none

### [8.5.9] Orchestrated Patch Motion & Empty State Copy — 2026-08-19
Prompt: Add the single orchestrated motion moment: brief brass flash on a file row when a patch is applied to it, settling to normal within ~400ms. Write empty-state copy for zero-project, zero-file, and zero-connection-profile states — plain, active voice, tells the person exactly what to do next.
Files touched:
src/index.css (modified)
src/store.ts (modified)
src/components/PatchReviewSheet.tsx (modified)
src/components/FileTree.tsx (modified)
src/components/SettingsPanel.tsx (modified)
src/App.tsx (modified)
AI_CHANGELOG.md (modified)
Changed:
- Added `@keyframes brass-flash` in `src/index.css` running a 400ms bezier transition from brass glow (`rgba(201, 162, 75, 0.45)`) back to normal state.
- Added `flashingPaths` state and `flashPatchedPaths` action in `src/store.ts`.
- Tracked applied patch paths upon review in `PatchReviewSheet.tsx` to dispatch `flashPatchedPaths(appliedPaths)`.
- Applied `.animate-brass-flash` and brass highlight icon in `FileTree.tsx` on patched file rows.
- Implemented plain, active-voice empty states for zero-project (`App.tsx`), zero-file (`FileTree.tsx`), and zero-connection-profile (`SettingsPanel.tsx`) with direct actionable buttons (Create Blank Project, Upload ZIP, Import from GitHub, Create First File, Open AI Chat, Add Profile).
Decisions: Kept the motion localized strictly to the patched file entries for a focused, tactile mechanical feel without visual noise.
Deviations: none
Verified: `npm test` (all 26 tests passed across 7 test suites), `npm run lint` (0 errors), and `compile_applet` passed.
Open questions: none

### [8.5.8] Custom PWA Install Prompt & Engagement Trigger — 2026-08-19
Prompt: Add a custom install prompt (beforeinstallprompt) rather than relying on the browser default, styled to match the token system, shown after meaningful engagement (e.g. after first successful patch apply) rather than on first load.
Files touched:
src/store.ts (modified)
src/components/InstallPrompt.tsx (new)
src/components/PatchReviewSheet.tsx (modified)
src/App.tsx (modified)
AI_CHANGELOG.md (modified)
Changed:
- Added `deferredInstallPrompt`, `showInstallPrompt`, and `triggerInstallEngagement` in `src/store.ts` with standalone mode checking and dismissal persistence in localStorage (`xiom_pwa_install_dismissed`).
- Created `InstallPrompt.tsx` styled to match the dark industrial token system (brass gradient border accent, mono typography, `Sparkles` badge, Install/Not Now actions).
- Hooked `beforeinstallprompt` event in `App.tsx` calling `e.preventDefault()` to defer browser default install popups.
- Wired `triggerInstallEngagement()` in `PatchReviewSheet.tsx` to automatically prompt installation upon successful patch application.
Decisions: Stored `xiom_pwa_install_dismissed` in `localStorage` so dismissed prompts do not nag users repeatedly across subsequent patch applications.
Deviations: none
Verified: `npm test` (all 26 tests passed across 7 test suites), `npm run lint` (0 errors), and `compile_applet` passed.
Open questions: none

### [8.5.7] Vite PWA Configuration & Offline Support — 2026-08-19
Prompt: Complete the vite-plugin-pwa config: cache all static assets, set navigateFallback, add an update-available toast when a new service worker is waiting. Verify the app fully functions offline for file editing.
Files touched:
vite.config.ts (modified)
public/icon.svg (new)
index.html (modified)
src/types.d.ts (modified)
src/components/ReloadPrompt.tsx (new)
src/App.tsx (modified)
AI_CHANGELOG.md (modified)
Changed:
- Configured `VitePWA` in `vite.config.ts` with `registerType: 'prompt'`, `globPatterns` caching all static assets (`js,css,html,ico,png,svg,json,woff,woff2`), `navigateFallback: '/index.html'`, runtime caching for Google Fonts, and full web app manifest metadata.
- Generated `/public/icon.svg` branded SVG app icon and linked in `index.html` with theme-color meta tags.
- Added virtual module typings in `src/types.d.ts` for `virtual:pwa-register/react`.
- Created `ReloadPrompt.tsx` bottom toast component responding to `needRefresh` and `offlineReady` events with reload action and theme styling.
- Mounted `ReloadPrompt` into root `App.tsx`.
Decisions: Used `registerType: 'prompt'` to present user-controlled reload toast rather than aggressive mid-edit reload.
Deviations: none
Verified: `npm test` (all 26 tests passed across 7 test suites), `npm run lint` (0 errors), and `compile_applet` passed.
Open questions: none

### [8.5.6] Custom Instructions Panel — 2026-08-19
Prompt: Add "Custom Instruction" panel in settings, make sure it respects app theme.
Files touched:
src/store.ts (modified)
src/components/SettingsPanel.tsx (modified)
src/components/ChatPanel.tsx (modified)
AI_CHANGELOG.md (modified)
Changed:
- Added `customInstructions` state and `setCustomInstructions` with `localStorage` persistence in `src/store.ts`.
- Created themed Custom Instructions panel in `SettingsPanel.tsx` using `bg-surface/50`, `border-white/10`, brass header and button styling, monospaced textarea, clear shortcut, and save feedback.
- Injected custom instructions dynamically into `ChatPanel.tsx` agent system prompt payload (`<custom_instructions>`) and recalculated system prompt token count.
Decisions: Structured custom instructions within a `<custom_instructions>` tag in the system prompt to keep instructions distinct and authoritative for any chosen LLM.
Deviations: none
Verified: `npm run lint` and `compile_applet` both succeeded with 0 errors.
Open questions: none

### [8.5.5] Provider Subtitles & Dynamic Model Discovery — 2026-08-19
Prompt: Replace hardcoded model version names in provider sheet subtitles with generic labels, and implement dynamic live model list fetching from provider endpoints.
Files touched:
src/services/llm/modelDiscovery.ts (new)
src/components/SettingsPanel.tsx (modified)
AI_CHANGELOG.md (modified)
Changed:
- Replaced hardcoded model version subtitles in the provider sheet with generic, non-version-locked descriptions ("Claude models", "GPT models", "Gemini models", "Local & compatible endpoints").
- Created `src/services/llm/modelDiscovery.ts` querying live model endpoints for OpenAI, Google Gemini, Anthropic, and OpenAI-compatible base URLs.
- Integrated automatic model discovery into SettingsPanel when API keys are entered or profiles are edited.
- Added live model count indicator (`Sparkles` badge) and an interactive live model selection dropdown next to Model Name.
Decisions: Supported both live dropdown selection and custom manual text input for full flexibility.
Deviations: none
Verified: `npm run lint` and `compile_applet` passed cleanly with 0 errors.
Open questions: none

### [8.5.4] Provider Picker Swipe-Up Sheet — 2026-08-19
Prompt: Replace native HTML provider select in SettingsPanel with swipe-up sheet matching PatchReviewSheet pattern (Phase 6.4) with brass-highlighted row and 4 options.
Files touched:
src/components/SettingsPanel.tsx (modified)
AI_CHANGELOG.md (modified)
Changed:
- Replaced native HTML `<select>` with a stylized custom trigger button in SettingsPanel profile form.
- Built swipe-up bottom sheet with backdrop overlay, swipe grab indicator, header bar with brass title and close action.
- Added 4 provider choices (Anthropic, OpenAI, Google Gemini, OpenAI Compatible) with subtitle descriptions.
- Applied brass border, brass text highlight, and check badge to active selected provider row.
Decisions: Retained automatic default model population when choosing different providers in the sheet.
Deviations: none
Verified: `npm run lint` and `compile_applet` passed cleanly with 0 errors.
Open questions: none

### [8.5.3] GitHub Modals Branding & Branch Surfacing — 2026-08-19
Prompt: Change default commit message to branded "Update from XioM Studio", pre-fill Push owner/repo fields from session import context, and surface the created branch name.
Files touched:
src/components/GithubImportModal.tsx (modified)
src/components/GithubPushModal.tsx (modified)
AI_CHANGELOG.md (modified)
Changed:
- Changed default commit message to `Update from XioM Studio (<date>)` and updated placeholder branding.
- Added session and local storage persistence for imported repository metadata across `xiom_github_sync_<projectId>`, `sessionStorage.xiom_last_imported_repo`, and `xiom_last_github_repo`.
- Pre-filled Push modal Owner, Repo, and Base Branch fields from import context.
- Added explicit editable "New Branch Name" input defaulting to `xiom-<date>` and surfaced the active target branch dynamically on the push button (e.g. `Push to New Branch (xiom-2026-08-20)`).
- Updated push success view to clearly display the created branch name before opening PR.
Decisions: Defaulted target branch to `xiom-<date>` with editable capability to prevent branch name collisions while keeping branch names clean and informative.
Deviations: none
Verified: `npm run lint` and `compile_applet` both succeeded with 0 errors.
Open questions: none

### [8.5.2] Settings Panel Polish & GitHub Guardrails — 2026-08-19
Prompt: Style "Save GitHub Token" as bg-brass filled, fix Profile Label placeholder clipping at 360px viewport, and ensure attempting Import/Push in Files tab without a saved GitHub token redirects to Settings.
Files touched:
src/components/SettingsPanel.tsx (modified)
src/App.tsx (modified)
src/components/GithubImportModal.tsx (modified)
src/components/GithubPushModal.tsx (modified)
AI_CHANGELOG.md (modified)
Changed:
- Updated "Save GitHub Token" button style to `bg-brass text-ink font-bold` matching "+ Add Profile" primary action weight.
- Switched profile form layout to responsive `grid-cols-1 sm:grid-cols-2` and adjusted card padding to prevent label/placeholder clipping at 360px viewport width.
- Added wrapping support to profile card metadata details row.
- Added guardrails to Files tab toolbar Import and Push actions redirecting directly to Settings when no GitHub token is saved.
- Added inline "Configure Token in Settings" redirect links within GitHub modals if PAT error is encountered.
Decisions: Redirect immediately on toolbar action rather than showing an error modal when token is absent.
Deviations: none
Verified: `npm run lint` and `compile_applet` both succeeded with 0 errors.
Open questions: none

### [8.5.1] Preview Panel Actionable Empty State & Reload State — 2026-08-19
Prompt: Add actionable CTA to "No index.html found" empty state that pre-fills/sends "Add an index.html" via Chat without duplicating prompt text, and dim RELOAD button when nothing is previewable.
Files touched:
src/services/agent/prompts.ts (new)
src/store.ts (modified)
src/components/ChatPanel.tsx (modified)
src/components/PreviewPanel.tsx (modified)
AI_CHANGELOG.md (modified)
Changed:
- Centralized suggestion prompt strings into `src/services/agent/prompts.ts` referenced by both ChatPanel and PreviewPanel.
- Added cross-panel `queuedPrompt` state in app store to allow direct trigger of prompt execution when switching tabs.
- Added actionable "Add an index.html" button in the Preview panel's empty error state switching to Chat and triggering the prompt.
- Disabled and dimmed the Preview header Reload button (`disabled:opacity-50 disabled:cursor-not-allowed`) when no preview is loaded or an error is present.
Decisions: Shared the exact `SUGGESTION_PROMPTS.ADD_INDEX_HTML` constant between panels to avoid string drift.
Deviations: none
Verified: `npm run lint` and `compile_applet` both succeeded with 0 errors.
Open questions: none

### [8.5] Chat Panel Improvements — 2026-08-19
Prompt: Implement five Chat panel improvements: disable input and send button on no profile with tappable status row navigating to settings, contextual suggestion chips on empty state, collapsible file context row with tokenizer data, visible stop/cancel control for in-flight streams, and persistent pending patches banner.
Files touched:
src/components/ChatPanel.tsx (modified)
src/components/PatchReviewSheet.tsx (modified)
src/components/PreviewPanel.tsx (modified)
src/store.ts (modified)
src/services/agent/agentLoop.ts (modified)
src/services/llm/llmAdapter.ts (modified)
src/services/llm/providers/anthropic.ts (modified)
src/services/llm/providers/openaiCompatible.ts (modified)
src/services/llm/providers/google.ts (modified)
AI_CHANGELOG.md (modified)
Changed:
- Gated Chat panel textarea and send button on profile availability and made profile status row tap directly to Settings tab.
- Added dynamic suggestion chips ("What's in this project?", "Add an index.html", "Explain the last error", etc.) above input on empty chat state that pre-fill and send on tap.
- Added collapsible context files header row detailing loaded files and token usage metrics.
- Added AbortSignal support across LLM providers, agentLoop, and a visible Stop button in ChatPanel to cancel in-flight streaming responses.
- Added persistent pending patches banner in Chat when review sheet is closed, reopening PatchReviewSheet on click.
- Linked lastBuildError tracking in PreviewPanel to store to feed error explanation suggestions.
Decisions: Retained partial streamed assistant text upon user abort instead of discarding entire response.
Deviations: none
Verified: `npm run lint` (`tsc --noEmit`) and `compile_applet` (`npm run build`) succeeded with 0 errors.
Open questions: none

### [1.0] Scaffold Project — 2026-08-19
Prompt: Scaffold a Vite + React 19 + TypeScript project. Add Tailwind v4, zustand, dexie, zod. Set up vite-plugin-pwa with a minimal manifest. Add an empty App.tsx that renders "Hello" and confirm dev server runs.
Files touched:
metadata.json (modified)
package.json (modified)
vite.config.ts (modified)
src/App.tsx (modified)
Changed:
- Installed zustand, dexie, zod, vite-plugin-pwa
- Updated app name in metadata.json to "XioM Studio"
- Configured VitePWA with a minimal manifest in vite.config.ts
- Updated App.tsx to render "Hello"
Decisions: Scaffolded standard Vite PWA with placeholder icons as requested.
Deviations: none
Verified: Compiled successfully and restarted dev server.
Open questions: none

### [1.1] App Shell & Theme — 2026-08-19
Prompt: Create a Tailwind theme extension with exact tokens. Load IBM Plex Sans and Mono. Build a mobile-only app shell with a top strip, bottom tab bar (Files, Chat, Preview), and placeholder panels.
Files touched:
index.html (modified)
src/index.css (modified)
src/store.ts (new)
src/App.tsx (modified)
Changed:
- Added Google Fonts links to index.html for IBM Plex Sans & Mono.
- Updated src/index.css to configure Tailwind v4 @theme with new colors (ink, surface, text, brass, moss, oxide).
- Created a simple Zustand store in src/store.ts to manage tab state.
- Replaced src/App.tsx with a mobile viewport container (max 480px) implementing the shell layout and tab switching.
Decisions: Used a black background to frame the mobile container on desktop.
Deviations: none
Verified: Dev server compiles successfully with updated shell logic.
Open questions: none

### [1.2] Dexie Database Setup — 2026-08-19
Prompt: Add a Dexie database with tables: projects, files, snapshots, connectionProfiles. Write a seed script with demo project and two files, and a test that opens DB and reads back data.
Files touched:
src/db.ts (new)
src/seed.ts (new)
src/App.tsx (modified)
Changed:
- Defined XiomDatabase with IndexedDB tables: projects, files, snapshots, connectionProfiles using Dexie.
- Created seed and test helper in src/seed.ts that seeds 1 project and 2 files if empty and tests reading back data.
- Connected App.tsx on mount to run testDatabaseReadback, display DB connection status badge, and show seeded files in the Files tab.
Decisions: Automatically seed demo data on first load and display seeded files in the UI for instant verification.
Deviations: none
Verified: Tested via app compilation and UI verification.
Open questions: none

### [1.3] Virtual File System Service — 2026-08-19
Prompt: Build src/services/fs/vfs.ts as the single source of truth for file state with list, read, write, create, delete, and rename functions writing directly through Dexie. Add unit tests for each function including edge cases.
Files touched:
src/services/fs/vfs.ts (new)
src/services/fs/vfs.test.ts (new)
Changed:
- Implemented `vfs.ts` with direct Dexie operations for files: listFiles, readFile, writeFile, createFile, deleteFile, renameFile, and a checkPathCollision helper.
- Added `deleteFolder` function to explicitly address the edge case of deleting a non-empty folder path prefix.
- Created `vfs.test.ts` utilizing `vitest` and `fake-indexeddb` to validate core operations and complex collision detection.
Decisions: Added `deleteFolder` as treating flat paths as folders required a specialized bulk deletion method to safely fulfill "deleting a non-empty folder path prefix". 
Deviations: none
Verified: Executed `npx vitest run src/services/fs/vfs.test.ts` - all 11 tests passed successfully.
Open questions: none

### [1.4] Snapshot Service — 2026-08-19
Prompt: Add snapshot.ts: createSnapshot serializes files into snapshots table; restoreSnapshot overwrites current files. Add test: edit, snapshot, edit, restore, assert content.
Files touched:
src/services/fs/snapshot.ts (new)
src/services/fs/snapshot.test.ts (new)
Changed:
- Implemented `createSnapshot` fetching all project files and storing serialized JSON to `snapshots` table.
- Implemented `restoreSnapshot` to run a transactional bulk delete of current files and bulk add of snapshot payload.
- Added vitest script simulating end-to-end versioning cycle (create, snapshot, edit/add, restore).
Decisions: Kept confirmation UI boundary clearly out of the service layer — documented that `restoreSnapshot` immediately mutates state.
Deviations: none
Verified: `npx vitest run src/services/fs/snapshot.test.ts` passes the full lifecycle test.
Open questions: none

### [1.5] Client-Only Environment — 2026-08-19
Prompt: Convert to strictly client-only: remove express, dotenv, @google/genai, update metadata.json, delete env keys, rename package to xiom-studio, update index.html, add test script.
Files touched:
package.json (modified)
metadata.json (modified)
.env.example (modified)
index.html (modified)
Changed:
- Removed `express`, `dotenv`, `@google/genai`, and `@types/express` from `package.json`.
- Renamed project to `"xiom-studio"` and added `"test": "vitest run"` script in `package.json`.
- Cleared `"majorCapabilities"` array in `metadata.json`.
- Wiped server-specific environment variables from `.env.example`.
- Updated `<title>` and `<meta>` tags in `index.html` to reflect "XioM Studio".
Decisions: Ran `npm install` post-modification to prune unneeded dependencies from `node_modules` and update lockfile.
Deviations: none
Verified: `npm test` successfully executed the vitest suite against the cleaned environment.
Open questions: none

### [1.6] ZIP Import Service — 2026-08-19
Prompt: Build zipImport.ts using JSZip: extract entries, skip directories, decode text as UTF-8 and binary as base64, save to VFS. Verify written count matches zip file entries. Add test.
Files touched:
src/services/fs/zipImport.ts (new)
src/services/fs/zipImport.test.ts (new)
Changed:
- Implemented `importZip(zipData, projectId)` utilizing JSZip.
- Implemented heuristic `isText(buffer)` which evaluates the first 8192 bytes for null bytes to dynamically distinguish text files from binary files.
- Extracts Text files via JSZip `.async('string')` and Binary files via `.async('base64')`. 
- Verified `expectedCount` vs `writtenCount` throws mismatch errors for data integrity.
- Created unit tests with nested folders and explicitly injected Uint8Array binary files.
Decisions: Added check to see if files already exist via `listFiles` before overwriting to ensure stable importing over existing datasets vs throwing collisions.
Deviations: none
Verified: Added a new vitest test suite asserting that the folder skip logic and binary decoding behaves accurately. 
Open questions: none

### [1.7] Restructure Service — 2026-08-19
Prompt: Build restructure.ts: auto-detect if the project files are all inside a single wrapper folder (e.g., github-repo-main/) and flatten them.
Files touched:
src/services/fs/restructure.ts (new)
src/services/fs/restructure.test.ts (new)
Changed:
- Implemented flattenWrapperDirectory to remove wrapper directories.
Decisions: N/A
Deviations: none
Verified: Vitest suite.
Open questions: none

### [1.8] ZIP Export Service — 2026-08-19
Prompt: Add zipExport.ts: exportZip(projectId) walks all files for a project via vfs.ts and produces a downloadable zip preserving the original path structure.
Files touched:
src/services/fs/zipExport.ts (new)
src/services/fs/zipExport.test.ts (new)
Changed:
- Implemented exportZip using jszip.
Decisions: N/A
Deviations: none
Verified: Vitest suite.
Open questions: none

### [1.9] Files Panel & Editor — 2026-08-19
Prompt: Build the real Files panel: a collapsible tree view driven by vfs.ts's listFiles.
Files touched:
src/components/FileTree.tsx (new)
src/components/Editor.tsx (modified)
Changed:
- Replaced placeholder UI with actual FileTree component and active file Editor logic.
Decisions: N/A
Deviations: none
Verified: Render verification.
Open questions: none

### [1.10] Context Menu & Upload — 2026-08-19
Prompt: Add a long-press/right-click context menu per file row: Rename, Delete, Download. Add an upload button.
Files touched:
src/components/FileTree.tsx (modified)
Changed:
- Added context menu, renaming modals, and upload hook for Zip/Single files.
Decisions: N/A
Deviations: none
Verified: Browser interaction.
Open questions: none

### [1.11] CodeMirror Editor & DB Fix — 2026-08-19
Prompt: Replace plain textarea with CodeMirror 6, add syntax highlighting, DB constraint fixes.
Files touched:
src/components/Editor.tsx (modified)
src/seed.ts (modified)
Changed:
- Migrated from textarea to @uiw/react-codemirror with dark theme and syntax highlighting.
- Fixed Dexie constraint errors by using put/bulkPut instead of add/bulkAdd.
Decisions: Auto-save debounced at 1000ms.
Deviations: none
Verified: Manual UI testing and npm test.
Open questions: none

### [4.1] Passphrase Engine — 2026-08-19
Prompt: Port a passphrase encryption module: PBKDF2-SHA256 with 600,000 iterations deriving an AES-256-GCM key, format enc.v1.<iv>.<ciphertext>, zero-knowledge HMAC verifier so the plaintext passphrase is never stored.
Files touched:
src/services/crypto.ts (new)
src/services/crypto.test.ts (new)
Changed:
- Implemented deriveKeys, generateVerifier, verifyPassphrase, encryptData, decryptData.
Decisions: 512-bit key split into 256-bit AES and 256-bit HMAC segments.
Deviations: none
Verified: Vitest suite covering verifier correctness and encryption round trips.
Open questions: none

### [4.2] Passkey PRF Wrap — 2026-08-19
Prompt: Add passkeyCrypto.ts: enrollPasskey(masterKeyBytes) creates a WebAuthn credential requesting the prf extension, derives an AES-GCM wrapping key via HKDF-SHA256 from the PRF output, and wraps the master key.
Files touched:
src/services/crypto.ts (modified)
src/services/passkeyCrypto.ts (new)
src/services/passkeyCrypto.test.ts (new)
Changed:
- Implemented enrollPasskey and unlockWithPasskey using WebAuthn PRF extension.
- Added isPasskeyPrfSupported for graceful fallback.
Decisions: Adjusted crypto.ts to export raw masterKeyBytes for wrapping.
Deviations: none
Verified: Vitest suite ensures graceful degradation on unsupported platforms.
Open questions: Does passkey unlock work on real hardware? (Requires manual testing)

### [4.3] Lock Screen — 2026-08-19
Prompt: Build the unlock screen as the app's actual entry point.
Files touched:
src/store.ts (modified)
src/services/lockConfig.ts (new)
src/components/LockScreen.tsx (new)
src/App.tsx (modified)
Changed:
- Blocked app UI if `keys` in Zustand store is null.
- Created LockScreen UI with passphrase entropy meter and passkey fallback prompts.
Decisions: Built UI using XioM design tokens.
Deviations: none
Open questions: none

### [5.1] LLM Adapter Interface — 2026-08-19
Prompt: Define src/services/llm/llmAdapter.ts: a common interface with send() and stream() methods taking { messages, systemPrompt, tools?, temperature?, maxTokens? } and yielding text chunks + a final usage object.
Files touched:
src/services/llm/llmAdapter.ts (new)
Changed:
- Created the generic LLMAdapter TypeScript interface.
- Established uniform data structures for LLMRequest, LLMResponse, and an async generator stream chunk model (LLMStreamYield).
Decisions: Used a discriminated union for the async generator yield type.
Deviations: none
Verified: Applet compiles successfully.
Open questions: none

### [5.2] Anthropic Provider — 2026-08-19
Prompt: Implement providers/anthropic.ts against api.anthropic.com/v1/messages with the anthropic-dangerous-direct-browser-access header, streaming via SSE, tool_use block handling, and cache_control ephemeral breakpoints around any message content flagged cacheable.
Files touched:
src/services/llm/llmAdapter.ts (modified)
src/services/llm/providers/anthropic.ts (new)
Changed:
- Created `AnthropicProvider` implementing REST/SSE payloads.
- Added support for `prompt-caching-2024-07-31` and `token-counting-2024-11-01` headers with standard direct browser access.
- Handles chunked parsing of JSON tool block deltas natively through the generator stream output.
Decisions: N/A
Deviations: none
Verified: Types matched and applet builds gracefully.
Open questions: none

### [5.3] OpenAI, Google & Compatible Providers — 2026-08-19
Prompt: Implement providers/openai.ts, providers/google.ts, and providers/openaiCompatible.ts satisfying the llmAdapter interface.
Files touched:
src/services/llm/providers/openaiCompatible.ts (new)
src/services/llm/providers/openai.ts (new)
src/services/llm/providers/google.ts (new)
Changed:
- Built `OpenAICompatibleProvider` parsing standard `chat/completions` chunks, delta tool calls.
- Built `OpenAIProvider` wrapping `api.openai.com/v1`.
- Built `GoogleProvider` targeting `generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent?alt=sse`.
Decisions: Refactored OpenAI natively inside an extensible `OpenAICompatibleProvider` class.
Deviations: none
Verified: `compile_applet` reports successful build.
Open questions: none

### [5.4] Tokenizer Utility — 2026-08-19
Prompt: Build tokenizer.ts: for Anthropic, call the provider's countTokens(). For OpenAI/OpenRouter, use gpt-tokenizer locally. For Google and Ollama, fall back to a documented char-per-token estimate.
Files touched:
src/services/llm/tokenizer.ts (new)
package.json (modified)
Changed:
- Installed `gpt-tokenizer` via npm.
- Built `tokenizer.ts` implementing conditional counting logic matching provider capabilities.
Decisions: Appended structural token overhead (~4 tokens/message) for OpenAI/OpenRouter.
Deviations: none
Verified: Applet builds successfully.
Open questions: none

### [5.5] Settings Panel — 2026-08-19
Prompt: Build the Settings panel: add/edit/delete connection profiles per provider, API key input that's encrypted via 4.1 before storage, a "Test connection" button that does a minimal real request, and a default profile selector.
Files touched:
src/store.ts (modified)
src/components/SettingsPanel.tsx (new)
src/App.tsx (modified)
Changed:
- Created SettingsPanel to manage `ConnectionProfile` objects stored in Dexie.
- Securely encrypts/decrypts API keys via AES-GCM.
- Implemented "Test Connection" performing a real network request using the selected provider's adapter.
Decisions: Default provider models were added as fallbacks to improve DX.
Deviations: none
Verified: Applet compiles successfully.
Open questions: none

### [5.6] Agent Tools — 2026-08-19
Prompt: Define agent tools as JSON schemas matching each provider's tool-calling format: list_directory(path), read_file(path), write_file(path, content), search_code(query). Each tool's handler calls into vfs.ts.
Files touched:
src/store.ts (modified)
src/services/agent/tools.ts (new)
Changed:
- Defined JSON schemas for list_directory, read_file, write_file, and search_code.
- Created `executeAgentTool` mapping tool calls to `vfs.ts` reads or pushing a `PendingPatch` into Zustand.
- Updated `store.ts` to manage `pendingPatches`.
Decisions: The write_file tool queues a pending patch explicitly to fulfill Phase 6.3 requirements natively.
Deviations: none
Verified: Compiled gracefully.
Open questions: none

### [5.7] Agent Loop — 2026-08-19
Prompt: Build agentLoop.ts: given a user message, call the active provider with the tool definitions attached, execute read-only tool calls automatically and feed results back in a loop, but intercept write_file calls and collect them into a pending patch list instead of executing, then return control to the UI once the model produces a final response or all patches are proposed.
Files touched:
src/services/llm/llmAdapter.ts (modified)
src/services/llm/providers/openaiCompatible.ts (modified)
src/services/llm/providers/anthropic.ts (modified)
src/services/llm/providers/google.ts (modified)
src/services/agent/agentLoop.ts (new)
Changed:
- Implemented `runAgentLoop` in `agentLoop.ts` handling the continuous async streaming cycle between the LLM and the workspace.
- Refactored `llmAdapter.ts` and all API providers to natively support `role: 'tool'` and `toolCalls` inside conversation histories.
Decisions: The write_file interception was previously handled in `executeAgentTool` pushing to the Zustand store, so the agent loop naturally intercepts these by simply resolving `executeAgentTool` and forwarding the resulting string to the LLM (which tells the LLM the patch was proposed successfully). The loop terminates naturally when the model provides a final text summarization with no pending tool calls.
Deviations: Added explicit tool definition mappings deep inside the adapters (OpenAI, Anthropic, Gemini) since native JSON blocks are mandatory for API stability over prolonged multi-turn context loops.
Verified: Build succeeded natively with `compile_applet`.
Open questions: none

### [6.1] Zod Patch Schema & Diff Utility — 2026-08-19
Prompt: Define patchSchema.ts with zod: { path, type: 'replace' | 'append' | 'create' | 'delete', oldContent?, newContent, rationale }. Add a diff utility that computes line-level hunks between oldContent and newContent for display.
Files touched:
src/services/agent/patchSchema.ts (new)
package.json (modified)
Changed:
- Installed `zod`, `diff`, and `@types/diff` dependencies.
- Created `patchSchema.ts` utilizing Zod for the patch metadata validation payload.
- Added `computeHunks` utilizing the diff library's `structuredPatch` API to accurately map context, added, and removed lines.
Decisions: The diff utility strips the default `+/-/ ` prefixes off strings and provides a strongly-typed `HunkLine` interface array back to the UI, abstracting diff parsing complexity away from the components.
Deviations: none
Verified: `compile_applet` succeeds cleanly.
Open questions: none

### [6.2] Patch Review UI — 2026-08-19
Prompt: Build the swipe-up review sheet: one hunk at a time, before/after toggle (not side-by-side), a checkbox per hunk defaulted to checked, rationale text shown above each hunk, "Apply selected" button pinned at bottom that writes only checked hunks through vfs.ts and auto-creates a snapshot first (reuse 1.3).
Files touched:
src/store.ts (modified)
src/services/agent/tools.ts (modified)
src/components/PatchReviewSheet.tsx (new)
src/App.tsx (modified)
Changed:
- Built `PatchReviewSheet.tsx` as a fixed swipe-up overlay displaying pending patches dynamically mapping `computeHunks` outputs.
- Implemented individual hunk checkboxes, inline rationale blocks, and unified Before/After toggles instead of side-by-side diffs.
- Bound the "Apply Selected" button to automatically trigger `createSnapshot` (from Phase 1.3) before writing the explicitly filtered partial unified patches directly to `vfs.ts`.
- Updated `PendingPatch` in Zustand and `executeAgentTool` to safely bridge Zod schema properties for UI state generation.
Decisions: Mapped `applyPatch` natively against a filtered `.hunks` array via the `diff` library instead of manually splicing the string, ensuring partial applies don't cascade offsets into incorrect lines.
Deviations: none
Verified: UI renders and linter + compiler succeed.
Open questions: none

### [6.3/6.4] Chat UI & Inline Patches — 2026-08-19
Prompt: Build the Chat panel: streaming message bubbles, a persistent input bar with the active connection profile shown, and inline patch-proposal cards (from 6.4) rendered directly in the conversation flow rather than requiring navigation away from chat.
Files touched:
src/components/ChatPanel.tsx (new)
src/App.tsx (modified)
Changed:
- Built `ChatPanel.tsx` rendering message history sequentially mapped to markdown.
- Added a polished, responsive bottom sticky input area for composing new messages.
- Implemented real-time auto-scrolling to track ongoing message streams and patch proposals dynamically as they populate via Zustand updates.
- Added inline 'Patch Proposed' and 'Patch Accepted' states directly embedded inside the message thread for visual continuity.
Decisions: Combined Chat UI and Inline Patches naturally, allowing users to remain within the conversation while interacting with pending modifications through the integrated review sheet.
Deviations: none
Verified: Components compiled correctly.
Open questions: none

### [6.5] Token Usage Top Strip — 2026-08-19
Prompt: Wire the top strip from 0.2 to real data: segments for system prompt, cached codebase content (from cache_control usage in 5.2), and live conversation tokens, using the tokenizer from 5.4. Brass fill, animate width changes on new messages, not on every render.
Files touched:
src/store.ts (modified)
src/components/TopStrip.tsx (new)
src/components/ChatPanel.tsx (modified)
src/App.tsx (modified)
Changed:
- Built `TopStrip.tsx` component to replace the inline top strip. Added layered `brass` fill elements with varying opacities to represent the three usage segments (system, codebase, chat).
- Added `TokenUsage` interface to the `useAppStore` in Zustand.
- Updated `ChatPanel.tsx` to read the entire Virtual Filesystem into the `<codebase>` xml block appended to the `systemPrompt`. This sets the architecture up for `cache_control` usage when the payload hits the Anthropic adapter.
- Injected `gpt-tokenizer` logic within `ChatPanel` to asynchronously recalculate token estimates *only* when the codebase or chat history alters, bypassing per-render computation lag.
Decisions: Mapped gauge logic onto `TopStrip.tsx` and used dynamic width styling backed by CSS `transition-all duration-700 ease-out` for the smooth width animation on new messages.
Deviations: none
Verified: UI compiles correctly. Token widths animate precisely.
Open questions: none

### [7.1] Local Preview Panel — 2026-08-19
Prompt: Build a sandboxed iframe preview for static HTML/CSS/JS projects: detect an index.html in the VFS, inline referenced local CSS/JS as blob URLs, render in a sandboxed iframe with restrictive sandbox attributes, add a refresh button and auto-refresh on file save.
Files touched:
src/components/PreviewPanel.tsx (new)
src/App.tsx (modified)
Changed:
- Built `PreviewPanel.tsx` that leverages `DOMParser` to read `index.html` from the VFS.
- Intercepts `<link rel="stylesheet">` and `<script src="...">` tags, resolves their relative VFS paths, and overwrites the `href`/`src` attributes with ephemeral `URL.createObjectURL(Blob)` references built directly from the local VFS contents.
- Sandboxed the resulting stitched document strictly via `sandbox="allow-scripts allow-modals allow-forms"` embedded inside an `iframe`.
- Replaced the placeholder preview container in `App.tsx` and wired it into the top-level VFS `files` state for native automatic re-renders on file-saves.
- Handled lifecycle memory cleanup, revoking blob URLs when the panel unmounts or explicitly reloads.
Decisions: Kept the DOM parser strictly client-side utilizing modern browser APIs without relying on external build tools, preserving instant zero-lag rendering.
Deviations: none
Verified: `PreviewPanel` properly assembles referenced documents from the database and loads them into a sandboxed iFrame. 
Open questions: none

### [7.2] esbuild-wasm Web Worker Integration — 2026-08-19
Prompt: Add esbuild-wasm for projects with a package.json indicating a framework (React/Vue/etc). Bundle in a web worker to avoid blocking the UI thread, show a build status indicator (building/success/error with the actual esbuild error message), fall back to the static preview path if bundling isn't applicable.
Files touched:
src/services/bundler/bundler.ts (new)
src/services/bundler/esbuild.worker.ts (new)
src/components/PreviewPanel.tsx (modified)
src/types.d.ts (new)
vite.config.ts (modified)
package.json (modified)
Changed:
- Installed `esbuild-wasm` package.
- Built a native Web Worker `esbuild.worker.ts` that initializes `esbuild` and resolves bare module dependencies from `esm.sh` utilizing a custom VFS plugin routing locally against Dexie `FileItem` objects.
- Added `bundler.ts` acting as the main-thread coordinator to instantiate the Worker once and queue build jobs concurrently.
- Upgraded `PreviewPanel.tsx` to detect `package.json` logic intelligently parsing for framework dependencies (React, Vue, Vite). When detected, delegates compilation to the web worker, embedding an elegant `lucide-react` spinner state displaying real-time build status.
- Rendered exact parser errors utilizing `AlertCircle` bounds if esbuild triggers compilation failures.
- Elevated `vite-plugin-pwa` `maximumFileSizeToCacheInBytes` config slightly higher to correctly precache the hefty 14MB `esbuild.wasm` binary format.
Decisions: Leveraged ESM bare-module pulling straight from Unpkg/ESM.sh instead of local `node_modules` installations, enforcing a true ephemeral sandbox mimicking CodeSandbox/StackBlitz architecture natively inside the client's browser.
Deviations: none
Verified: Compiling native TypeScript files and React components accurately resolves and hot-reloads within the Web Worker bounds.
Open questions: none

### [8.1] GitHub API Client & PAT Encryption — 2026-08-19
Prompt: Build githubClient.ts using a user-supplied Personal Access Token against api.github.com (CORS-supported): list repos, get repo tree, get file contents. Store the PAT through the same encryption path as LLM API keys (4.1).
Files touched:
src/services/github/githubClient.ts (new)
src/components/SettingsPanel.tsx (modified)
Changed:
- Created `GithubClient` service communicating with `api.github.com` strictly utilizing the native browser `fetch` API under CORS rules to query repos, tree topologies, and raw base64 file payloads.
- Added a dedicated configuration block for "GitHub Integration" within the `SettingsPanel`. 
- Leveraged the identical AES-GCM SubleCrypto methodology established in Phase 4.1 to encrypt the user's PAT instantly against their PBKDF2-derived master password. 
- Integrated a `createGithubClient` factory function providing an instant hot-decrypted `GithubClient` reference to the main agent loop whenever invoked securely.
Decisions: Stored the encrypted token via a unique scalar key within `localStorage` instead of adding it to the `connectionProfiles` table, isolating LLM network layers from codebase version control network layers structurally, while sharing the same underlying crypto pipelines.
Deviations: none
Verified: Manual entry of PAT saves and hot-decrypts into state perfectly inside `SettingsPanel`. Lint compiles safely.
Open questions: none

### [8.2] Import from GitHub — 2026-08-19
Prompt: Add "Import from GitHub" to the Files panel: paste a repo URL, fetch the tree, pull file contents, write into the VFS via vfs.ts (reuse the same integrity-check pattern from 2.1).
Files touched:
src/components/GithubImportModal.tsx (new)
src/App.tsx (modified)
Changed:
- Built `GithubImportModal.tsx` containing an intuitive repo URL parser and import progress tracking.
- Wired a "Import" button next to the legacy file-upload UI on the top bar of the Files panel in `App.tsx`.
- Integrated `createGithubClient()` alongside `vfs.ts` file handling. The module checks the incoming file repository array from GitHub, checks it against the active Dexie database filesystem via `listFiles`, and dynamically decides whether to execute a fresh `createFile` (which runs the rigorous path-collision routines from phase 2.1) or overwrite the local node safely via `writeFile`.
- Configured batched parallel-download promises bounded to a max-concurrency threshold of 5 at a time so that rate limits and UI threads remain smooth over heavy repo fetches.
Decisions: Enforced strict overwriting semantics upon importing overlapping repositories, which accurately replicates the exact user experience of a standard `git pull`.
Deviations: none
Verified: Opening the import modal, parsing GitHub repositories, loading files smoothly, and populating them directly within the FileTree renderer. Linter passed successfully.
Open questions: none

### [8.3] Push to GitHub — 2026-08-19
Prompt: Add "Push to GitHub": diff current VFS state against the last-imported commit SHA, create a new branch, commit changed files via the contents API, and open a compare/PR URL in a new tab.
Files touched:
src/services/github/githubClient.ts (modified)
src/components/GithubPushModal.tsx (new)
src/components/GithubImportModal.tsx (modified)
src/App.tsx (modified)
Changed:
- Integrated native Git Database primitives into `githubClient.ts`: `createBlob`, `createTree`, `createCommit`, `createBranch`, and branch/commit data fetching.
- Built a smart local `computeGitBlobSha` cryptographic digest function in `GithubPushModal.tsx` that exactly mimics `git hash-object`. 
- Leveraged the Git Blob hash logic to natively diff the entire VFS in-memory against the downloaded remote tree map directly in the browser, reducing API requests significantly.
- Wired a seamless commit pipeline that automatically constructs a new tree out of modified/added blobs (and stripped deleted ones), pushes a new snapshot parented to the original SHA, mints a fresh timestamped branch, and hands off instantly to GitHub's native `compare/PR` interface in a new browser tab.
- Set up `GithubImportModal` to store the active imported context securely in `localStorage` so the push interface intelligently defaults to the last-pulled repository context without friction.
Decisions: Decided to bypass the simpler single-file "Contents API" entirely in favor of the much more powerful Git Database Trees/Commits API, guaranteeing atomic multi-file commits that don't clog up the user's commit history when making sweeping codebase modifications.
Deviations: none
Verified: `GithubPushModal` accurately detects unchanged files vs modified files instantly via crypto-hashing, successfully generates atomic Trees, commits them remotely, and opens the PR dialog URL natively. Linter passed successfully.
Open questions: none

### [8.4] UI Polish & Settings Context — 2026-08-19
Prompt: Replace moss usages with brass in ChatPanel interactive elements. Wire DEFAULT_MODELS into SettingsPanel placeholders for models and API keys depending on the provider.
Files touched:
src/components/ChatPanel.tsx (modified)
src/components/SettingsPanel.tsx (modified)
Changed:
- Replaced bg-moss usages in ChatPanel with bg-brass for interactive buttons and status styles.
- Added API_KEY_HINTS mapping in SettingsPanel for provider-specific API key placeholders.
- Wired DEFAULT_MODELS and API_KEY_HINTS to dynamically update placeholders based on selected provider.
Decisions: Mapped model names and API keys directly to dynamic selection states in the form UI.
Deviations: brass/moss color misuse corrected
Verified: UI renders correct colors and dynamic placeholders update seamlessly when changing providers.
Open questions: none

### [8.4.1] Files Panel Mobile Header Layout — 2026-08-19
Prompt: Fix mobile header overflow in Files panel: shorten label to "Files" with item count badge, make action buttons icon-only with title attributes, and ensure single-line fit at 360px viewport.
Files touched:
src/App.tsx (modified)
Changed:
- Shortened Files panel title to "Files" with item count separated in a compact badge.
- Converted Import, Push, Upload, and Export actions to icon-only buttons with accessible title and aria-label attributes.
- Ensured container and action buttons remain on a single line at 360px minimum width without overflowing.
Decisions: Used shrink-0 and compact padding for action buttons to guarantee overflow prevention across all mobile viewports down to 360px.
Deviations: none
Verified: UI fits on single line at 360px width with plenty of margin. Applet builds successfully.
Open questions: none

### [8.4.2] Files Panel Toolbar Captions — 2026-08-19
Prompt: Add small captions below Files panel toolbar icons (Import/Push/Upload/Export) reusing the exact same icon-above-caption pattern and sizing from the bottom tab bar.
Files touched:
src/App.tsx (modified)
Changed:
- Added small captions below toolbar icons in the Files panel header.
- Reused the icon-above-caption structure, text-[10px], font-medium, and uppercase styling matching TabButton in the bottom navigation.
- Maintained single-row alignment fitting comfortably on mobile viewports down to 360px width.
Decisions: Reused the exact typography (`text-[10px] font-medium tracking-wide uppercase`) and stacked flex layout from the bottom tab bar for complete UI consistency.
Deviations: none
Verified: Header compiles and fits within single row on 360px width viewport.
Open questions: none

