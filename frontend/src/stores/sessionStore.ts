import { create } from 'zustand'

interface SessionStore {
  activeSessionId: string | null
  activeArtifactId: string | null
  activeArtifactType: 'spec' | 'ticket' | null
  setActiveSessionId: (id: string | null) => void
  setActiveArtifactId: (id: string | null) => void
  setActiveArtifactType: (type: 'spec' | 'ticket' | null) => void
  reset: () => void
}

export const useSessionStore = create<SessionStore>((set) => ({
  activeSessionId: null,
  activeArtifactId: null,
  activeArtifactType: null,
  setActiveSessionId: (id) => set({ activeSessionId: id, activeArtifactId: null, activeArtifactType: null }),
  setActiveArtifactId: (id) => set({ activeArtifactId: id }),
  setActiveArtifactType: (type) => set({ activeArtifactType: type }),
  reset: () => set({ activeSessionId: null, activeArtifactId: null, activeArtifactType: null }),
}))
