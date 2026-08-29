import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  FolderPlus, 
  Sparkles, 
  Layers, 
  FileCode2, 
  Globe, 
  Check, 
  Code,
  FileText,
  Boxes
} from 'lucide-react';
import { 
  PROJECT_TEMPLATES, 
  type TemplateId, 
  type ProjectTemplate 
} from '../../services/templates/projectTemplates';

export interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateProject: (name: string, templateId: TemplateId) => Promise<void>;
  existingProjectCount?: number;
}

export function CreateProjectModal({
  isOpen,
  onClose,
  onCreateProject,
  existingProjectCount = 0,
}: CreateProjectModalProps) {
  const [selectedTemplateId, setSelectedTemplateId] = useState<TemplateId>('react-ts');
  const [projectName, setProjectName] = useState(() => {
    const t = PROJECT_TEMPLATES[0];
    return existingProjectCount > 0 
      ? `${t.defaultProjectName} ${existingProjectCount + 1}`
      : t.defaultProjectName;
  });
  const [prevOpen, setPrevOpen] = useState(isOpen);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showFileList, setShowFileList] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Sync state when modal transitions from closed to open
  if (isOpen !== prevOpen) {
    setPrevOpen(isOpen);
    if (isOpen) {
      const currentTemplate = PROJECT_TEMPLATES.find(t => t.id === selectedTemplateId) || PROJECT_TEMPLATES[0];
      const defaultName = existingProjectCount > 0 
        ? `${currentTemplate.defaultProjectName} ${existingProjectCount + 1}`
        : currentTemplate.defaultProjectName;
      setProjectName(defaultName);
      setError(null);
    }
  }

  // Auto-focus input when opened
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        if (nameInputRef.current) {
          nameInputRef.current.focus();
          nameInputRef.current.select();
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen) return null;

  const selectedTemplate = PROJECT_TEMPLATES.find(t => t.id === selectedTemplateId) || PROJECT_TEMPLATES[0];

  const handleSelectTemplate = (template: ProjectTemplate) => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(10);
    }
    setSelectedTemplateId(template.id);
    const defaultName = existingProjectCount > 0 
      ? `${template.defaultProjectName} ${existingProjectCount + 1}`
      : template.defaultProjectName;
    setProjectName(defaultName);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = projectName.trim();
    if (!trimmed) {
      setError('Project name cannot be empty');
      return;
    }
    if (trimmed.length > 60) {
      setError('Project name cannot exceed 60 characters');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      await onCreateProject(trimmed, selectedTemplateId);
      onClose();
    } catch (err) {
      console.error('Failed to create project from template', err);
      setError(err instanceof Error ? err.message : 'Failed to create project');
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderTemplateIcon = (iconName: ProjectTemplate['iconName']) => {
    switch (iconName) {
      case 'react':
        return <Code className="w-5 h-5 text-sky-400" />;
      case 'tailwind':
        return <Sparkles className="w-5 h-5 text-emerald-400" />;
      case 'empty':
        return <FileCode2 className="w-5 h-5 text-amber-400" />;
      case 'javascript':
        return <Globe className="w-5 h-5 text-yellow-400" />;
      default:
        return <Layers className="w-5 h-5 text-accent" />;
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-black/80 backdrop-blur-xs z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-project-title"
      onClick={isSubmitting ? undefined : onClose}
    >
      <div 
        className="bg-surface border border-border/90 shadow-2xl w-full font-mono flex flex-col fixed inset-x-0 bottom-0 z-50 max-h-[88vh] rounded-t-2xl sm:inset-auto sm:max-w-lg sm:rounded-2xl sm:max-h-[90vh] overflow-hidden animate-in slide-in-from-bottom-6 sm:zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with Mobile Drag Handle */}
        <div className="px-4 pt-2 pb-3.5 sm:pt-3.5 border-b border-border bg-surface-elevated/50 flex flex-col shrink-0">
          {/* Centered mobile drag-handle indicator */}
          <div className="w-8 h-1 bg-border rounded-full mx-auto my-1.5 sm:hidden shrink-0" aria-hidden="true" />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-accent/15 text-accent border border-accent/30 shadow-xs">
                <FolderPlus size={16} />
              </div>
              <div>
                <h2 id="create-project-title" className="text-xs font-bold text-text uppercase tracking-wider">
                  Create New Project
                </h2>
                <p className="text-[10px] text-muted">
                  Select a starter skeleton or clean template
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              aria-label="Close dialog"
              className="p-1 text-muted hover:text-text rounded-md hover:bg-surface-elevated transition-colors cursor-pointer disabled:opacity-50"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Scrollable Content Body with Bottom Cushion */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 pb-6 sm:pb-4 space-y-4 scrollbar-thin">
          {/* Project Name Input */}
          <div className="space-y-1.5">
            <label htmlFor="project-name-input" className="block text-[11px] font-bold text-accent/90 uppercase tracking-wider">
              Project Name
            </label>
            <input
              id="project-name-input"
              ref={nameInputRef}
              type="text"
              value={projectName}
              onChange={(e) => {
                setProjectName(e.target.value);
                if (error) setError(null);
              }}
              placeholder="e.g. My Awesome App"
              disabled={isSubmitting}
              className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-xs text-text placeholder-muted/60 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all font-mono"
            />
            {error && (
              <p className="text-[10px] text-error flex items-center gap-1 mt-1 font-medium">
                <span>⚠️</span> {error}
              </p>
            )}
          </div>

          {/* Template Selection Cards */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-[11px] font-bold text-accent/90 uppercase tracking-wider">
                Choose Starter Template
              </label>
              <span className="text-[10px] text-muted">
                {PROJECT_TEMPLATES.length} skeletons available
              </span>
            </div>

            <div className="grid grid-cols-1 gap-2">
              {PROJECT_TEMPLATES.map((template) => {
                const isSelected = template.id === selectedTemplateId;
                return (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => handleSelectTemplate(template)}
                    disabled={isSubmitting}
                    aria-pressed={isSelected}
                    className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer relative flex items-start gap-3 ${
                      isSelected
                        ? 'bg-accent/10 border-accent shadow-md shadow-accent/5 ring-1 ring-accent'
                        : 'bg-bg/60 border-border/70 hover:border-accent/40 hover:bg-surface-elevated/40'
                    }`}
                  >
                    {/* Icon Box */}
                    <div className={`p-2 rounded-lg shrink-0 mt-0.5 border ${
                      isSelected 
                        ? 'bg-surface border-accent/40' 
                        : 'bg-surface border-border'
                    }`}>
                      {renderTemplateIcon(template.iconName)}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 pr-6">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <span className="text-xs font-bold text-text">
                          {template.name}
                        </span>
                        {template.badge && (
                          <span className={`px-1.5 py-0.2 rounded text-[9px] font-semibold uppercase tracking-wider border ${
                            template.badge === 'Popular'
                              ? 'bg-sky-500/15 text-sky-400 border-sky-500/30'
                              : template.badge === 'Recommended'
                              ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                              : 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                          }`}>
                            {template.badge}
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-muted leading-relaxed">
                        {template.description}
                      </p>

                      {/* Tag badges */}
                      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                        {template.tags.map((tag) => (
                          <span
                            key={tag}
                            className="px-1.5 py-0.5 rounded bg-surface border border-border/80 text-[9px] text-muted font-mono"
                          >
                            {tag}
                          </span>
                        ))}
                        <span className="text-[9px] text-muted/70 font-mono">
                          • {template.files.length} {template.files.length === 1 ? 'file' : 'files'}
                        </span>
                      </div>
                    </div>

                    {/* Selected Checkmark */}
                    <div className={`absolute top-3 right-3 w-5 h-5 rounded-full flex items-center justify-center border transition-all ${
                      isSelected
                        ? 'bg-accent border-accent text-accent-text-on shadow-xs'
                        : 'border-border/80 bg-surface text-transparent'
                    }`}>
                      <Check size={12} strokeWidth={3} />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Files Preview Toggle */}
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setShowFileList(prev => !prev)}
              className="text-[10px] text-accent/80 hover:text-accent flex items-center gap-1.5 transition-colors cursor-pointer py-1 font-semibold"
            >
              <Boxes size={12} />
              <span>{showFileList ? 'Hide skeleton files' : `View files included in "${selectedTemplate.name}"`}</span>
            </button>

            {showFileList && (
              <div className="mt-2 p-2.5 rounded-xl bg-bg/80 border border-border/80 space-y-2 text-[10px] font-mono animate-in fade-in duration-150">
                <div className="text-muted text-[9px] font-bold uppercase tracking-wider flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <FileText size={11} className="text-accent" />
                    <span>Skeleton Structure ({selectedTemplate.files.length} {selectedTemplate.files.length === 1 ? 'file' : 'files'})</span>
                  </div>
                  <span className="text-[9px] text-muted/60 lowercase">ready on create</span>
                </div>
                <div className="flex flex-wrap gap-1.5 text-muted">
                  {selectedTemplate.files.map((file) => (
                    <div 
                      key={file.path} 
                      className="px-2 py-0.5 rounded-md bg-surface border border-border/70 flex items-center gap-1 text-text/80 text-[10px] font-mono shadow-2xs"
                    >
                      <span className="text-accent text-[9px]">•</span>
                      <span>{file.path}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </form>

        {/* Modal Footer */}
        <div className="px-4 py-3 pb-safe sm:pb-3 border-t border-border bg-surface-elevated/40 flex items-center justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-3.5 py-1.5 bg-surface border border-border hover:bg-surface-elevated text-text rounded-lg text-xs transition-colors cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || !projectName.trim()}
            className="px-4 py-1.5 bg-accent hover:bg-accent/90 text-accent-text-on font-bold text-xs rounded-lg transition-all flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
          >
            {isSubmitting ? (
              <>
                <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                <span>Creating...</span>
              </>
            ) : (
              <>
                <FolderPlus size={13} />
                <span>Create Project</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
