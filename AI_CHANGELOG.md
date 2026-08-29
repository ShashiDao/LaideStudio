## Current State
- Phase: HOTFIX-81
- Last verified working: Snapshot restore and Version History modal (SnapshotsModal.tsx) integrated with ProjectActionsMenu, App.tsx, and FindWhatBrokeModal. Deploy token deletion wired in DeployModal.tsx. All unit tests passed (23/23 in modified suites), linter has 0 errors, and applet builds cleanly.
- Known issues / incomplete: none
- Deviations from blueprint so far: none

## Log

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
