## Current State
- Phase: HOTFIX-82
- Last verified working: Official LAIDE Studio SVG monogram logo added to public/icon.svg and integrated as reusable LaideLogo component across TopStrip header, LockScreen (intro, setup, and unlock screens), InstallPrompt banner, and SettingsPanel. Unit tests in LaideLogo.test.tsx, TopStrip.test.tsx, and LockScreen.test.tsx pass cleanly (18/18 tests). Linter and compiler builds are clean.
- Known issues / incomplete: none
- Deviations from blueprint so far: none

## Log

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
