import { create } from 'zustand'

interface AuthUser {
  id: string
  github_login: string
  github_avatar_url: string | null
  display_name: string
  email: string | null
}

interface AuthStore {
  user: AuthUser | null
  isLoading: boolean
  isAuthenticated: boolean
  setUser: (user: AuthUser | null) => void
  setIsLoading: (loading: boolean) => void
  logout: () => void
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  setUser: (user) => set({ user, isAuthenticated: !!user }),
  setIsLoading: (isLoading) => set({ isLoading }),
  logout: () => {
    // Fire-and-forget the server-side logout
    fetch('/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {})
    set({ user: null, isAuthenticated: false })
  },
}))
