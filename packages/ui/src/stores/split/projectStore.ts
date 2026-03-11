import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Project } from '@claude-agent/core';
import { createStorage } from './storage';

// ============================================================================
// Project Store - Multi-project management
// ============================================================================

export interface ProjectState {
  projects: Project[];
  activeProject: Project | null;

  setProjects: (projects: Project[]) => void;
  setActiveProject: (projectId: string) => void;
  addProject: (project: Project) => void;
  updateProject: (id: string, updates: Partial<Project>) => void;
  removeProject: (id: string) => void;
}

export const useProjectStore = create<ProjectState>()(
  persist(
    (set) => ({
      projects: [],
      activeProject: null,

      setProjects: (projects) => set({ projects }),

      setActiveProject: (projectId) =>
        set((state) => ({
          activeProject: state.projects.find((p) => p.id === projectId) || null,
        })),

      addProject: (project) =>
        set((state) => ({
          projects: [...state.projects, project],
          activeProject: project,
        })),

      updateProject: (id, updates) =>
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === id ? { ...p, ...updates } : p
          ),
          activeProject:
            state.activeProject?.id === id
              ? { ...state.activeProject, ...updates }
              : state.activeProject,
        })),

      removeProject: (id) =>
        set((state) => ({
          projects: state.projects.filter((p) => p.id !== id),
          activeProject:
            state.activeProject?.id === id ? null : state.activeProject,
        })),
    }),
    {
      name: 'claude-agent-projects',
      storage: createStorage(),
    }
  )
);