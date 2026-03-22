// ─── API Types ──────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string
  github_login: string
  display_name: string
  email: string | null
  github_avatar_url: string | null
}

export interface Session {
  id: string
  name: string
  created_at: number
  last_active_at: number
  github_repo: string | null
}

export interface Message {
  id: string
  content: string
  session_id: string
  created_at: number
  role: 'user' | 'assistant' | 'system'
  type: 'text' | 'qa_questions' | 'qa_answers' | 'qa_cancelled' | 'artifact_ref' | 'next_step_nudge' | 'error' | 'agent_activity'
}

export interface Artifact {
  id: string
  name: string
  session_id: string
  created_at: number
  updated_at: number
  type: 'spec' | 'ticket'
}

export interface ArtifactVersion {
  id: string
  label: string
  content: string
  created_at: number
  artifact_id: string
  version_number: number
}

export interface GitHubRepo {
  id: number
  private: boolean
  full_name: string
  description: string | null
}

export interface SettingsResponse {
  maskedKey: string | null
  githubConnected: boolean
  provider: 'openai' | 'anthropic' | null
}

// ─── Token Refresh Logic ────────────────────────────────────────────────────

let refreshPromise: Promise<boolean> | null = null

async function refreshAccessToken(): Promise<boolean> {
  try {
    const res = await fetch('/auth/refresh', { method: 'POST', credentials: 'include' })
    return res.ok
  } catch {
    return false
  }
}

// ─── Fetch Helpers ──────────────────────────────────────────────────────────

async function fetchJSON<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })

  if (res.status === 401 && !url.includes('/auth/')) {
    // Deduplicate concurrent refresh attempts
    if (!refreshPromise) {
      refreshPromise = refreshAccessToken().finally(() => {
        refreshPromise = null
      })
    }
    const refreshed = await refreshPromise

    if (refreshed) {
      // Retry the original request with a fresh access token
      const retryRes = await fetch(url, {
        ...options,
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...options?.headers,
        },
      })
      if (!retryRes.ok) {
        const body = await retryRes.json().catch(() => ({ error: retryRes.statusText }))
        throw new Error(body.error || `HTTP ${retryRes.status}`)
      }
      return retryRes.json()
    }

    // Refresh failed — trigger logout
    const { useAuthStore } = await import('@/stores/authStore')
    useAuthStore.getState().logout()
    throw new Error('Session expired')
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return res.json()
}

async function fetchWithAuth(url: string, options?: RequestInit): Promise<Response> {
  const res = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      ...options?.headers,
    },
  })

  if (res.status === 401 && !url.includes('/auth/')) {
    // Deduplicate concurrent refresh attempts
    if (!refreshPromise) {
      refreshPromise = refreshAccessToken().finally(() => {
        refreshPromise = null
      })
    }
    const refreshed = await refreshPromise

    if (refreshed) {
      // Retry the original request
      return fetch(url, {
        ...options,
        credentials: 'include',
        headers: {
          ...options?.headers,
        },
      })
    }

    // Refresh failed — trigger logout
    const { useAuthStore } = await import('@/stores/authStore')
    useAuthStore.getState().logout()
    throw new Error('Session expired')
  }

  return res
}

// ─── Auth ───────────────────────────────────────────────────────────────────

export const authApi = {
  me: () => fetchJSON<AuthUser>('/api/auth/me'),
  logout: () => fetch('/auth/logout', { method: 'POST', credentials: 'include' }),
}

// ─── Sessions ───────────────────────────────────────────────────────────────

export const sessionsApi = {
  list: () => fetchJSON<Session[]>('/api/sessions'),

  delete: (id: string) =>
    fetchWithAuth(`/api/sessions/${id}`, { method: 'DELETE' }),

  create: (data: { name: string; github_repo?: string | null }) =>
    fetchJSON<Session>('/api/sessions', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
}

// ─── Messages ───────────────────────────────────────────────────────────────

export const messagesApi = {
  list: (sessionId: string) =>
    fetchJSON<Message[]>(`/api/sessions/${sessionId}/messages`),
}

// ─── Artifacts ──────────────────────────────────────────────────────────────

export const artifactsApi = {
  list: (sessionId: string) =>
    fetchJSON<Artifact[]>(`/api/artifacts?sessionId=${sessionId}`),

  getVersions: (artifactId: string) =>
    fetchJSON<ArtifactVersion[]>(`/api/artifacts/${artifactId}/versions`),

  getCurrentVersion: (artifactId: string) =>
    fetchJSON<ArtifactVersion>(`/api/artifacts/${artifactId}/versions/current`),

  create: (sessionId: string, name: string, type: 'spec' | 'ticket') =>
    fetchJSON<Artifact>('/api/artifacts', {
      method: 'POST',
      body: JSON.stringify({ sessionId, name, type }),
    }),

  saveVersion: (artifactId: string, content: string, baseVersion: number, label?: string) =>
    fetchJSON<ArtifactVersion>(`/api/artifacts/${artifactId}/versions`, {
      method: 'POST',
      body: JSON.stringify({ content, baseVersion, ...(label ? { label } : {}) }),
    }),
}

// ─── GitHub ─────────────────────────────────────────────────────────────────

export const githubApi = {
  repos: () => fetchJSON<GitHubRepo[]>('/api/github/repos'),

  status: () => fetchJSON<{ connected: boolean }>('/api/github/status'),

  disconnect: () => fetchWithAuth('/api/github/token', { method: 'DELETE' }),
}

// ─── Settings ───────────────────────────────────────────────────────────────
export const settingsApi = {
  get: () => fetchJSON<SettingsResponse>('/api/settings'),

  update: (provider: string, apiKey: string) =>
    fetchJSON<{ provider: string; maskedKey: string }>('/api/settings', {
      method: 'PUT',
      body: JSON.stringify({ provider, apiKey }),
    }),
}
