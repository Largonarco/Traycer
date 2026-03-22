import { create } from 'zustand'

interface UIStore {
  settingsOpen: boolean
  sessionModalOpen: boolean
  slashMenuOpen: boolean
  slashMenuQuery: string
  pendingInterrupt: boolean
  newArtifactId: string | null
  activeProvider: 'openai' | 'anthropic' | null
  setSettingsOpen: (open: boolean) => void
  setSessionModalOpen: (open: boolean) => void
  setSlashMenuOpen: (open: boolean) => void
  setSlashMenuQuery: (query: string) => void
  setPendingInterrupt: (pending: boolean) => void
  setNewArtifactId: (id: string | null) => void
  setActiveProvider: (provider: 'openai' | 'anthropic' | null) => void
}

export const useUIStore = create<UIStore>((set) => ({
  settingsOpen: false,
  sessionModalOpen: true, // Auto-open on load
  slashMenuOpen: false,
  slashMenuQuery: '',
  pendingInterrupt: false,
  newArtifactId: null,
  activeProvider: null,
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  setSessionModalOpen: (open) => set({ sessionModalOpen: open }),
  setSlashMenuOpen: (open) => set({ slashMenuOpen: open }),
  setSlashMenuQuery: (query) => set({ slashMenuQuery: query }),
  setPendingInterrupt: (pending) => set({ pendingInterrupt: pending }),
  setNewArtifactId: (id) => set({ newArtifactId: id }),
  setActiveProvider: (provider) => set({ activeProvider: provider }),
}))
