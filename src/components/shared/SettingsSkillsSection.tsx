import React, { useState, useEffect, useCallback } from 'react';
import { db, type Skill } from '../../db';
import { seedDefaultSkills } from '../../services/agent/skills';
import { countTokensForText } from '../../services/usage/tokenSpend';
import { 
  BookOpen, 
  Plus, 
  Edit3, 
  Trash2, 
  Save, 
  RotateCcw, 
  Tag, 
  FileText, 
  ChevronDown, 
  ChevronUp, 
  Check, 
  Sparkles 
} from 'lucide-react';

export const SettingsSkillsSection: React.FC = () => {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedSkillId, setExpandedSkillId] = useState<string | null>(null);

  // Form state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [keywordsInput, setKeywordsInput] = useState('');
  const [content, setContent] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const reloadSkillsList = useCallback(async () => {
    try {
      let list = await db.skills.toArray();
      if (list.length === 0) {
        list = await seedDefaultSkills();
      }
      setSkills(list.sort((a, b) => b.updatedAt - a.updatedAt));
    } catch (err) {
      console.error('Failed to load skills:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    async function fetchSkills() {
      try {
        let list = await db.skills.toArray();
        if (list.length === 0) {
          list = await seedDefaultSkills();
        }
        if (active) {
          setSkills(list.sort((a, b) => b.updatedAt - a.updatedAt));
        }
      } catch (err) {
        console.error('Failed to load skills:', err);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }
    fetchSkills();
    return () => {
      active = false;
    };
  }, []);

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setDescription('');
    setKeywordsInput('');
    setContent('');
    setFormError(null);
  };

  const handleEdit = (skill: Skill) => {
    setEditingId(skill.id);
    setName(skill.name);
    setDescription(skill.description);
    setKeywordsInput(skill.keywords.join(', '));
    setContent(skill.content);
    setFormError(null);
  };

  const handleDelete = async (id: string) => {
    try {
      await db.skills.delete(id);
      if (editingId === id) resetForm();
      await reloadSkillsList();
    } catch (err) {
      console.error('Failed to delete skill:', err);
    }
  };

  const handleResetDefaults = async () => {
    try {
      setLoading(true);
      await seedDefaultSkills(true);
      resetForm();
      await reloadSkillsList();
    } catch (err) {
      console.error('Failed to reset default skills:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const trimmedName = name.trim();
    const trimmedContent = content.trim();

    if (!trimmedName) {
      setFormError('Skill name is required.');
      return;
    }
    if (!trimmedContent) {
      setFormError('Skill markdown content is required.');
      return;
    }

    const parsedKeywords = keywordsInput
      .split(',')
      .map(k => k.trim())
      .filter(Boolean);

    const now = Date.now();
    const skillRecord: Skill = {
      id: editingId || `skill-${crypto.randomUUID()}`,
      name: trimmedName,
      description: description.trim(),
      keywords: parsedKeywords,
      content: trimmedContent,
      createdAt: editingId ? (skills.find(s => s.id === editingId)?.createdAt || now) : now,
      updatedAt: now,
    };

    try {
      await db.skills.put(skillRecord);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
      resetForm();
      await reloadSkillsList();
    } catch (err) {
      console.error('Failed to save skill:', err);
      setFormError('Failed to save skill to database.');
    }
  };

  return (
    <div id="settings-skills-section" className="rounded-xl border border-border bg-surface/30 p-4 sm:p-5 space-y-4">
      {/* Section Header */}
      <div className="flex items-center justify-between pb-3 border-b border-border/50">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-surface-elevated border border-border flex items-center justify-center text-accent">
            <BookOpen size={15} />
          </div>
          <div>
            <h3 className="text-xs font-semibold text-text tracking-tight">Skills Library</h3>
            <p className="text-[11px] text-muted">
              Reusable markdown snippets matched by keyword and injected into the agent system prompt
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleResetDefaults}
            disabled={loading}
            className="text-[11px] font-medium flex items-center gap-1.5 bg-surface-elevated hover:bg-surface border border-border text-muted hover:text-text px-2 py-1 rounded transition-colors disabled:opacity-50 cursor-pointer"
            title="Reset to default example skills"
          >
            <RotateCcw size={11} />
            <span>Reset Defaults</span>
          </button>
          <span className="font-mono text-[10px] px-2 py-0.5 rounded-md bg-surface-elevated border border-border text-muted font-medium">
            {skills.length === 0 ? '0 Skills' : `${skills.length} ${skills.length === 1 ? 'Skill' : 'Skills'}`}
          </span>
        </div>
      </div>

      {/* Existing Skills List */}
      {skills.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/80 bg-surface/40 p-4 sm:p-5 text-center flex flex-col items-center">
          <div className="w-9 h-9 rounded-lg bg-accent/10 border border-accent/30 flex items-center justify-center text-accent mb-2.5">
            <Sparkles size={16} />
          </div>
          <h4 className="text-xs font-semibold text-text mb-1">No Skills Configured</h4>
          <p className="text-[11px] text-muted max-w-sm leading-relaxed mb-3.5">
            Skills are targeted modular guidelines that help the agent write idiomatic code for your project.
          </p>
          <button
            type="button"
            onClick={handleResetDefaults}
            className="px-3 py-1 text-xs font-medium bg-accent text-bg rounded-lg hover:opacity-90 transition-opacity cursor-pointer flex items-center gap-1.5"
          >
            <Sparkles size={13} />
            <span>Load Default Skills</span>
          </button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {skills.map(skill => {
            const isEditing = editingId === skill.id;
            const isExpanded = expandedSkillId === skill.id;
            const tokenEstimate = countTokensForText(skill.content);

            return (
              <div
                key={skill.id}
                id={`skill-card-${skill.id}`}
                className={`border rounded-lg p-3.5 transition-all flex flex-col gap-2.5 ${
                  isEditing
                    ? 'border-accent bg-accent/5 ring-1 ring-accent/30 shadow-xs'
                    : 'border-border/80 bg-surface/40 hover:border-border'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-md bg-surface-elevated border border-border flex items-center justify-center text-accent text-xs font-bold font-mono">
                      <FileText size={12} />
                    </div>
                    <span className="font-semibold text-xs text-text">{skill.name}</span>
                    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-surface-elevated border border-border text-muted">
                      ~{tokenEstimate} tokens
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setExpandedSkillId(isExpanded ? null : skill.id)}
                      className="p-1 rounded text-muted hover:text-text hover:bg-surface-elevated transition-colors cursor-pointer"
                      title={isExpanded ? 'Hide content' : 'View content'}
                      aria-label="Toggle preview"
                    >
                      {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleEdit(skill)}
                      className="p-1 rounded text-muted hover:text-accent hover:bg-surface-elevated transition-colors cursor-pointer"
                      title="Edit skill"
                      aria-label={`Edit ${skill.name}`}
                    >
                      <Edit3 size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(skill.id)}
                      className="p-1 rounded text-muted hover:text-oxide hover:bg-surface-elevated transition-colors cursor-pointer"
                      title="Delete skill"
                      aria-label={`Delete ${skill.name}`}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                {skill.description && (
                  <p className="text-[11px] text-muted leading-relaxed">
                    {skill.description}
                  </p>
                )}

                {skill.keywords.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <span className="text-[10px] font-mono text-muted flex items-center gap-1">
                      <Tag size={10} /> Keywords:
                    </span>
                    {skill.keywords.map((kw, idx) => (
                      <span
                        key={`${kw}-${idx}`}
                        className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface-elevated border border-border/80 text-text/80"
                      >
                        #{kw}
                      </span>
                    ))}
                  </div>
                )}

                {isExpanded && (
                  <div className="mt-2 pt-2 border-t border-border/50">
                    <div className="text-[10px] font-mono text-muted mb-1 font-semibold uppercase tracking-wider">
                      Prompt Injection Markdown:
                    </div>
                    <pre className="p-2.5 rounded bg-surface-elevated/90 border border-border text-[11px] font-mono text-text/90 whitespace-pre-wrap break-words max-h-52 overflow-y-auto">
                      {skill.content}
                    </pre>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Skill Form */}
      <div className="rounded-lg border border-border/80 bg-surface/50 p-4 space-y-4">
        <div className="flex items-center justify-between pb-2.5 border-b border-border/40">
          <div className="flex items-center gap-2">
            {editingId ? <Save size={13} className="text-accent" /> : <Plus size={13} className="text-accent" />}
            <h4 className="text-xs font-semibold text-text tracking-tight">
              {editingId ? 'Edit Skill' : 'Add New Skill'}
            </h4>
          </div>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="text-[11px] text-muted hover:text-text px-2 py-0.5 rounded hover:bg-surface-elevated transition-colors cursor-pointer"
            >
              Cancel Edit
            </button>
          )}
        </div>

        <form onSubmit={handleSave} className="space-y-3">
          {formError && (
            <div className="p-2 rounded bg-oxide/10 border border-oxide/30 text-oxide text-xs">
              {formError}
            </div>
          )}

          <div className="space-y-1">
            <label htmlFor="skill-name-input" className="block text-[11px] font-medium text-muted">
              Skill Name *
            </label>
            <input
              id="skill-name-input"
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Tailwind conventions used in this repo"
              className="w-full bg-surface-elevated border border-border rounded-lg px-3 py-1.5 text-xs text-text placeholder-muted/60 focus:outline-none focus:border-accent"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="skill-desc-input" className="block text-[11px] font-medium text-muted">
              Description (Used for keyword & intent matching)
            </label>
            <input
              id="skill-desc-input"
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="e.g. Conventions and utility patterns for styling UI components with Tailwind CSS"
              className="w-full bg-surface-elevated border border-border rounded-lg px-3 py-1.5 text-xs text-text placeholder-muted/60 focus:outline-none focus:border-accent"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="skill-keywords-input" className="block text-[11px] font-medium text-muted">
              Trigger Keywords (Comma separated)
            </label>
            <input
              id="skill-keywords-input"
              type="text"
              value={keywordsInput}
              onChange={e => setKeywordsInput(e.target.value)}
              placeholder="e.g. tailwind, css, style, styling, theme, layout, ui"
              className="w-full bg-surface-elevated border border-border rounded-lg px-3 py-1.5 text-xs text-text placeholder-muted/60 focus:outline-none focus:border-accent"
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label htmlFor="skill-content-input" className="block text-[11px] font-medium text-muted">
                Markdown Instructions *
              </label>
              <span className="text-[10px] font-mono text-muted">
                ~{countTokensForText(content)} tokens
              </span>
            </div>
            <textarea
              id="skill-content-input"
              rows={6}
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="### Skill Instructions&#10;- Markdown guidelines injected into system prompt when triggered..."
              className="w-full bg-surface-elevated border border-border rounded-lg px-3 py-2 text-xs font-mono text-text placeholder-muted/60 focus:outline-none focus:border-accent resize-y leading-relaxed"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="px-3 py-1.5 rounded-lg border border-border text-muted hover:text-text hover:bg-surface-elevated text-xs font-medium transition-colors cursor-pointer"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              id="save-skill-button"
              className="px-4 py-1.5 rounded-lg bg-accent text-bg text-xs font-medium hover:opacity-90 transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              {saveSuccess ? (
                <>
                  <Check size={13} />
                  <span>Saved!</span>
                </>
              ) : editingId ? (
                <>
                  <Save size={13} />
                  <span>Update Skill</span>
                </>
              ) : (
                <>
                  <Plus size={13} />
                  <span>Add Skill</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
