// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { migrateLocalStorage } from './storageMigration';

describe('migrateLocalStorage', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('migrates all xiom_ prefixed localStorage keys to laide_ and deletes the old keys', () => {
    localStorage.setItem('xiom_github_pat', 'enc.v1.pat');
    localStorage.setItem('xiom_netlify_token', 'enc.v1.netlify');
    localStorage.setItem('xiom_vercel_token', 'enc.v1.vercel');
    localStorage.setItem('xiom_mcp_servers', '[{"id":"1","url":"http://localhost"}]');
    localStorage.setItem('xiom_lock_config', '{"saltBase64":"abc"}');
    localStorage.setItem('xiom_active_profile_id', 'prof-123');
    localStorage.setItem('xiom_active_project_id', 'proj-456');
    localStorage.setItem('xiom_temperature', '0.7');
    localStorage.setItem('xiom_max_output_tokens', '4096');
    localStorage.setItem('xiom_max_agent_steps', '30');
    localStorage.setItem('xiom_custom_instructions', 'Be concise');
    localStorage.setItem('xiom_attach_preview_vision', 'true');
    localStorage.setItem('xiom_auto_vision_on_patch', 'false');
    localStorage.setItem('xiom_ensemble_mode', 'true');
    localStorage.setItem('xiom_ensemble_candidate_b_id', 'prof-b');
    localStorage.setItem('xiom_pwa_install_dismissed', 'true');
    localStorage.setItem('xiom_github_sync_proj-1', '{"owner":"org","repo":"repo"}');
    localStorage.setItem('xiom_deploy_history_proj-1', '[{"id":"d1"}]');
    localStorage.setItem('unrelated_key', 'keep_me');

    migrateLocalStorage();

    // Verify all laide_ keys received exact values
    expect(localStorage.getItem('laide_github_pat')).toBe('enc.v1.pat');
    expect(localStorage.getItem('laide_netlify_token')).toBe('enc.v1.netlify');
    expect(localStorage.getItem('laide_vercel_token')).toBe('enc.v1.vercel');
    expect(localStorage.getItem('laide_mcp_servers')).toBe('[{"id":"1","url":"http://localhost"}]');
    expect(localStorage.getItem('laide_lock_config')).toBe('{"saltBase64":"abc"}');
    expect(localStorage.getItem('laide_active_profile_id')).toBe('prof-123');
    expect(localStorage.getItem('laide_active_project_id')).toBe('proj-456');
    expect(localStorage.getItem('laide_temperature')).toBe('0.7');
    expect(localStorage.getItem('laide_max_output_tokens')).toBe('4096');
    expect(localStorage.getItem('laide_max_agent_steps')).toBe('30');
    expect(localStorage.getItem('laide_custom_instructions')).toBe('Be concise');
    expect(localStorage.getItem('laide_attach_preview_vision')).toBe('true');
    expect(localStorage.getItem('laide_auto_vision_on_patch')).toBe('false');
    expect(localStorage.getItem('laide_ensemble_mode')).toBe('true');
    expect(localStorage.getItem('laide_ensemble_candidate_b_id')).toBe('prof-b');
    expect(localStorage.getItem('laide_pwa_install_dismissed')).toBe('true');
    expect(localStorage.getItem('laide_github_sync_proj-1')).toBe('{"owner":"org","repo":"repo"}');
    expect(localStorage.getItem('laide_deploy_history_proj-1')).toBe('[{"id":"d1"}]');

    // Verify unrelated key was untouched
    expect(localStorage.getItem('unrelated_key')).toBe('keep_me');

    // Verify old xiom_ keys are removed
    expect(localStorage.getItem('xiom_github_pat')).toBeNull();
    expect(localStorage.getItem('xiom_netlify_token')).toBeNull();
    expect(localStorage.getItem('xiom_vercel_token')).toBeNull();
    expect(localStorage.getItem('xiom_mcp_servers')).toBeNull();
    expect(localStorage.getItem('xiom_lock_config')).toBeNull();
    expect(localStorage.getItem('xiom_active_profile_id')).toBeNull();
    expect(localStorage.getItem('xiom_active_project_id')).toBeNull();
    expect(localStorage.getItem('xiom_temperature')).toBeNull();
    expect(localStorage.getItem('xiom_max_output_tokens')).toBeNull();
    expect(localStorage.getItem('xiom_max_agent_steps')).toBeNull();
    expect(localStorage.getItem('xiom_custom_instructions')).toBeNull();
    expect(localStorage.getItem('xiom_github_sync_proj-1')).toBeNull();
    expect(localStorage.getItem('xiom_deploy_history_proj-1')).toBeNull();
  });

  it('migrates sessionStorage keys correctly', () => {
    sessionStorage.setItem('xiom_last_imported_repo', '{"owner":"test","repo":"app"}');
    sessionStorage.setItem('other_session', '123');

    migrateLocalStorage();

    expect(sessionStorage.getItem('laide_last_imported_repo')).toBe('{"owner":"test","repo":"app"}');
    expect(sessionStorage.getItem('xiom_last_imported_repo')).toBeNull();
    expect(sessionStorage.getItem('other_session')).toBe('123');
  });

  it('is idempotent when run multiple times', () => {
    localStorage.setItem('xiom_github_pat', 'pat_token');
    migrateLocalStorage();
    expect(localStorage.getItem('laide_github_pat')).toBe('pat_token');
    expect(localStorage.getItem('xiom_github_pat')).toBeNull();

    // Run again
    migrateLocalStorage();
    expect(localStorage.getItem('laide_github_pat')).toBe('pat_token');
    expect(localStorage.getItem('xiom_github_pat')).toBeNull();
  });

  it('does not overwrite existing laide_ key if already present and removes old xiom_ key', () => {
    localStorage.setItem('laide_github_pat', 'new_laide_pat');
    localStorage.setItem('xiom_github_pat', 'old_xiom_pat');

    migrateLocalStorage();

    expect(localStorage.getItem('laide_github_pat')).toBe('new_laide_pat');
    expect(localStorage.getItem('xiom_github_pat')).toBeNull();
  });
});
