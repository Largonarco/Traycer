import { useQuery, useMutation, useQueryClient, QueryClient } from '@tanstack/react-query'
import { sessionsApi, artifactsApi, githubApi, settingsApi, authApi } from '@/lib/api'
import type { Session } from '@/lib/api'
import { useAuthStore } from '@/stores/authStore'

// ─── Query Client ───────────────────────────────────────────────────────────

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000, // 30s before refetch
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

// ─── Auth Hooks ─────────────────────────────────────────────────────────────

/**
 * Fetches the current authenticated user profile via GET /api/auth/me.
 * Only enabled when the user is authenticated (session cookie is present).
 */
export function useAuthMe() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  return useQuery({
    queryKey: ['auth', 'me'],
    queryFn: authApi.me,
    enabled: isAuthenticated,
    staleTime: 5 * 60_000, // 5 minutes
    retry: false, // Don't retry auth failures — let the app handle 401
  })
}

// ─── Session Hooks ──────────────────────────────────────────────────────────

export function useSessions() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  return useQuery({
    queryKey: ['sessions'],
    queryFn: sessionsApi.list,
    enabled: isAuthenticated,
  })
}

export function useCreateSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { name: string; github_repo?: string | null }) =>
      sessionsApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sessions'] })
    },
  })
}

export function useDeleteSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => sessionsApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sessions'] })
    },
  })
}

// ─── Artifact Hooks ─────────────────────────────────────────────────────────

export function useArtifacts(sessionId: string | null) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  return useQuery({
    queryKey: ['artifacts', sessionId],
    queryFn: () => artifactsApi.list(sessionId!),
    enabled: !!sessionId && isAuthenticated,
  })
}

export function useArtifactVersions(artifactId: string | null) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  return useQuery({
    queryKey: ['artifact-versions', artifactId],
    queryFn: () => artifactsApi.getVersions(artifactId!),
    enabled: !!artifactId && isAuthenticated,
  })
}

export function useArtifactContent(artifactId: string | null) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  return useQuery({
    queryKey: ['artifact-content', artifactId],
    queryFn: () => artifactsApi.getCurrentVersion(artifactId!),
    enabled: !!artifactId && isAuthenticated,
  })
}

// ─── GitHub Hooks ───────────────────────────────────────────────────────────

export function useGitHubStatus() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  return useQuery({
    queryKey: ['github-status'],
    queryFn: githubApi.status,
    staleTime: 60_000, // 1 minute
    enabled: isAuthenticated,
  })
}

export function useGitHubRepos() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  return useQuery({
    queryKey: ['github-repos'],
    queryFn: githubApi.repos,
    enabled: false, // Only fetch on demand (via refetch)
  })
}

// ─── Settings Hooks ─────────────────────────────────────────────────────────

export function useSettings() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  return useQuery({
    queryKey: ['settings'],
    queryFn: settingsApi.get,
    staleTime: 60_000,
    enabled: isAuthenticated,
  })
}
