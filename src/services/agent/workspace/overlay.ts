import type { FileItem } from '../../../db';
import type { PatchDefinition } from '../patchSchema';

export interface WorkspaceOverlay {
  read(path: string): Promise<string | null>;
  list(path: string): Promise<string[]>;
  write(
    path: string, 
    content: string, 
    rationale?: string,
    metadata?: { model?: string; provider?: string; messageId?: string }
  ): Promise<void>;
  delete(path: string, rationale?: string): Promise<void>;

  diff(): PatchDefinition[];
  materialize(): Promise<FileItem[]>;
  getBaseRevision?(): string;

  // Stubbing for later phases
  // build(): Promise<BuildResult>;
  // test(): Promise<TestResult>;
  // preview(options: PreviewOptions): Promise<PreviewResult>;
}

export class AgentWorkspaceOverlay implements WorkspaceOverlay {
  private baseFiles: Map<string, FileItem>;
  private modifiedFiles: Map<string, string>;
  private deletedFiles: Set<string>;
  private fileRationales: Map<string, string>;
  private fileMetadata: Map<string, { model?: string; provider?: string; messageId?: string }>;
  private projectId: string;
  private baseRevision: string;

  constructor(projectId: string, baseFiles: FileItem[], baseRevision: string = 'base') {
    this.projectId = projectId;
    this.baseFiles = new Map(baseFiles.map(f => [this.resolvePath(f.path), f]));
    this.modifiedFiles = new Map();
    this.deletedFiles = new Set();
    this.fileRationales = new Map();
    this.fileMetadata = new Map();
    this.baseRevision = baseRevision;
  }

  public getBaseRevision(): string {
    return this.baseRevision;
  }

  private resolvePath(path: string): string {
    // Ensure absolute-like paths start with /
    return path.startsWith('/') ? path : `/${path}`;
  }

  async read(path: string): Promise<string | null> {
    const normalized = this.resolvePath(path);
    if (this.deletedFiles.has(normalized)) {
      return null;
    }
    if (this.modifiedFiles.has(normalized)) {
      return this.modifiedFiles.get(normalized)!;
    }
    const baseFile = this.baseFiles.get(normalized);
    if (baseFile) {
      return baseFile.content;
    }
    return null;
  }

  async list(path: string): Promise<string[]> {
    const normalized = this.resolvePath(path);
    const prefix = normalized === '/' ? '/' : `${normalized}/`;
    
    const results = new Set<string>();
    
    // Add from base files
    for (const [filePath] of this.baseFiles) {
      if (!this.deletedFiles.has(filePath) && filePath.startsWith(prefix)) {
        results.add(filePath);
      }
    }
    
    // Add from modified files
    for (const [filePath] of this.modifiedFiles) {
      if (filePath.startsWith(prefix)) {
        results.add(filePath);
      }
    }
    
    return Array.from(results);
  }

  async write(
    path: string, 
    content: string, 
    rationale?: string,
    metadata?: { model?: string; provider?: string; messageId?: string }
  ): Promise<void> {
    const normalized = this.resolvePath(path);
    this.modifiedFiles.set(normalized, content);
    this.deletedFiles.delete(normalized);
    if (rationale) {
      this.fileRationales.set(normalized, rationale);
    }
    if (metadata) {
      this.fileMetadata.set(normalized, metadata);
    }
  }

  async delete(path: string, rationale?: string): Promise<void> {
    const normalized = this.resolvePath(path);
    this.modifiedFiles.delete(normalized);
    this.deletedFiles.add(normalized);
    if (rationale) {
      this.fileRationales.set(normalized, rationale);
    }
  }

  diff(): PatchDefinition[] {
    const patches: PatchDefinition[] = [];

    // Check for deleted files
    for (const path of this.deletedFiles) {
      const base = this.baseFiles.get(path);
      if (base) {
        const meta = this.fileMetadata.get(path);
        patches.push({
          path,
          type: 'delete',
          oldContent: base.content,
          newContent: '',
          rationale: this.fileRationales.get(path) || `Deleted ${path}`,
          model: meta?.model,
          provider: meta?.provider,
          messageId: meta?.messageId
        });
      }
    }

    // Check for modified and new files
    for (const [path, newContent] of this.modifiedFiles) {
      const base = this.baseFiles.get(path);
      const meta = this.fileMetadata.get(path);
      
      if (!base) {
        patches.push({
          path,
          type: 'create',
          newContent,
          rationale: this.fileRationales.get(path) || `Created ${path}`,
          model: meta?.model,
          provider: meta?.provider,
          messageId: meta?.messageId
        });
      } else if (base.content !== newContent) {
        patches.push({
          path,
          type: 'replace',
          oldContent: base.content,
          newContent,
          rationale: this.fileRationales.get(path) || `Updated ${path}`,
          model: meta?.model,
          provider: meta?.provider,
          messageId: meta?.messageId
        });
      }
    }

    // Sort to make deterministic
    return patches.sort((a, b) => a.path.localeCompare(b.path));
  }

  async materialize(): Promise<FileItem[]> {
    const materialized: FileItem[] = [];
    const timestamp = Date.now();

    // Add unmodified base files
    for (const [path, base] of this.baseFiles) {
      if (!this.deletedFiles.has(path) && !this.modifiedFiles.has(path)) {
        materialized.push(base);
      }
    }

    // Add modified files
    for (const [path, content] of this.modifiedFiles) {
      const base = this.baseFiles.get(path);
      materialized.push({
        id: base?.id || crypto.randomUUID(),
        projectId: this.projectId,
        path,
        content,
        updatedAt: timestamp
      });
    }

    return materialized;
  }
}
