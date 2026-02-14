import * as fs from 'fs/promises';
import * as path from 'path';
import { nanoid } from 'nanoid';
import type { Project, ProjectSettings, ICheckpointTree } from '../types';

const PROJECTS_FILE = 'projects.json';

export interface ProjectManagerOptions {
  configDir: string;
}

/**
 * ProjectManager - Manages multiple projects
 */
export class ProjectManager {
  private configDir: string;
  private projects: Map<string, Project> = new Map();
  private activeProjectId: string | null = null;

  constructor(options: ProjectManagerOptions) {
    this.configDir = options.configDir;
  }

  get active(): Project | null {
    return this.activeProjectId ? this.projects.get(this.activeProjectId) || null : null;
  }

  get all(): Project[] {
    return Array.from(this.projects.values()).sort(
      (a, b) => b.lastOpened - a.lastOpened
    );
  }

  /**
   * Initialize project manager and load saved projects
   */
  async initialize(): Promise<void> {
    await fs.mkdir(this.configDir, { recursive: true });
    await this.loadProjects();
  }

  /**
   * Create a new project
   */
  async createProject(
    projectPath: string,
    name?: string
  ): Promise<Project> {
    const id = nanoid();
    const projectName = name || path.basename(projectPath);

    const project: Project = {
      id,
      name: projectName,
      path: projectPath,
      lastOpened: Date.now(),
      createdAt: Date.now(),
      checkpointTree: {
        root: null,
        nodes: {},
        currentId: null,
        activeLineage: [],
      },
      sessions: [],
      activeSessionId: null,
      settings: this.getDefaultSettings(),
    };

    this.projects.set(id, project);
    await this.saveProjects();

    return project;
  }

  /**
   * Open a project (create if doesn't exist)
   */
  async openProject(projectPath: string): Promise<Project> {
    // Check if project already exists
    const existing = this.findByPath(projectPath);
    if (existing) {
      existing.lastOpened = Date.now();
      this.activeProjectId = existing.id;
      await this.saveProjects();
      return existing;
    }

    // Create new project
    const project = await this.createProject(projectPath);
    this.activeProjectId = project.id;
    return project;
  }

  /**
   * Get a project by ID
   */
  getProject(id: string): Project | null {
    return this.projects.get(id) || null;
  }

  /**
   * Find project by path
   */
  findByPath(projectPath: string): Project | null {
    const normalizedPath = path.resolve(projectPath);
    for (const project of this.projects.values()) {
      if (path.resolve(project.path) === normalizedPath) {
        return project;
      }
    }
    return null;
  }

  /**
   * Set active project
   */
  setActive(projectId: string): boolean {
    if (!this.projects.has(projectId)) {
      return false;
    }
    this.activeProjectId = projectId;
    const project = this.projects.get(projectId)!;
    project.lastOpened = Date.now();
    this.saveProjects();
    return true;
  }

  /**
   * Update project settings
   */
  async updateSettings(
    projectId: string,
    settings: Partial<ProjectSettings>
  ): Promise<void> {
    const project = this.projects.get(projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    project.settings = { ...project.settings, ...settings };
    await this.saveProjects();
  }

  /**
   * Update project checkpoint tree
   */
  async updateCheckpointTree(
    projectId: string,
    tree: ICheckpointTree
  ): Promise<void> {
    const project = this.projects.get(projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    project.checkpointTree = tree;
    await this.saveProjects();
  }

  /**
   * Delete a project (removes from list, not from disk)
   */
  async deleteProject(projectId: string): Promise<boolean> {
    const success = this.projects.delete(projectId);
    if (success) {
      if (this.activeProjectId === projectId) {
        this.activeProjectId = null;
      }
      await this.saveProjects();
    }
    return success;
  }

  /**
   * Get recent projects
   */
  getRecentProjects(limit = 10): Project[] {
    return this.all.slice(0, limit);
  }

  /**
   * Load projects from disk
   */
  private async loadProjects(): Promise<void> {
    const filePath = path.join(this.configDir, PROJECTS_FILE);

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(content) as {
        projects: Project[];
        activeProjectId: string | null;
      };

      this.projects.clear();
      for (const project of data.projects) {
        this.projects.set(project.id, project);
      }
      this.activeProjectId = data.activeProjectId;
    } catch {
      // No projects file yet
    }
  }

  /**
   * Save projects to disk
   */
  private async saveProjects(): Promise<void> {
    const filePath = path.join(this.configDir, PROJECTS_FILE);

    const data = {
      projects: Array.from(this.projects.values()),
      activeProjectId: this.activeProjectId,
    };

    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
  }

  /**
   * Get default project settings
   */
  private getDefaultSettings(): ProjectSettings {
    return {
      autoCheckpoint: true,
      checkpointOnToolCall: true,
      maxCheckpoints: 100,
      gitBranch: 'main',
    };
  }
}
