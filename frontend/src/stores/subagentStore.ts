import { create } from 'zustand'

export interface TrackedSubagent {
  id: string
  name: string
  description: string
  status: 'pending' | 'running' | 'complete' | 'error'
  tokenBuffer: string
  result: string | undefined
  error: string | undefined
  startedAt: number | undefined
  completedAt: number | undefined
  toolCalls: Array<{ tool: string; timestamp: number }>
  toolResults: Array<{ tool: string; path: string; preview: string; timestamp: number }>
}

interface SubagentStore {
  subagents: Map<string, TrackedSubagent>
  isSynthesizing: boolean

  spawn: (id: string, name: string, description: string) => void
  markRunning: (id: string) => void
  appendToken: (id: string, chunk: string) => void
  addToolCall: (id: string, tool: string) => void
  addToolResult: (id: string, tool: string, path: string, preview: string) => void
  markComplete: (id: string, result: string) => void
  markError: (id: string, error: string) => void
  setSynthesizing: (synthesizing: boolean) => void
  getSubagents: () => Map<string, TrackedSubagent>
  reset: () => void
}

// ---------------------------------------------------------------------------
// Module-level mutable state — mutated in place for high-frequency operations
// so we avoid creating a new Map reference (and triggering Zustand re-renders)
// on every single token / tool event.
// ---------------------------------------------------------------------------
const liveSubagents: Map<string, TrackedSubagent> = new Map()
let flushTimer: ReturnType<typeof setTimeout> | null = null
const FLUSH_INTERVAL_MS = 66 // ~15 fps

function cancelPendingFlush() {
  if (flushTimer !== null) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
}

/** Copy liveSubagents into Zustand state, triggering a single batched re-render. */
function flushToStore(set: (partial: Partial<SubagentStore>) => void) {
  set({ subagents: new Map(liveSubagents) })
}

/** Schedule a throttled flush if one isn't already pending. */
function scheduleFlush(set: (partial: Partial<SubagentStore>) => void) {
  if (flushTimer === null) {
    flushTimer = setTimeout(() => {
      flushTimer = null
      flushToStore(set)
    }, FLUSH_INTERVAL_MS)
  }
}

export const useSubagentStore = create<SubagentStore>((set) => ({
  subagents: new Map(),
  isSynthesizing: false,

  // -------------------------------------------------------------------
  // Structural / low-frequency — mutate liveSubagents AND flush immediately
  // -------------------------------------------------------------------

  spawn: (id, name, description) => {
    liveSubagents.set(id, {
      id,
      name,
      description,
      status: 'pending',
      tokenBuffer: '',
      result: undefined,
      error: undefined,
      startedAt: undefined,
      completedAt: undefined,
      toolCalls: [],
      toolResults: [],
    })
    flushToStore(set)
  },

  markRunning: (id) => {
    const sub = liveSubagents.get(id)
    if (sub && sub.status === 'pending') {
      liveSubagents.set(id, { ...sub, status: 'running', startedAt: Date.now() })
    }
    flushToStore(set)
  },

  markComplete: (id, result) => {
    const sub = liveSubagents.get(id)
    if (sub) {
      liveSubagents.set(id, {
        ...sub,
        status: 'complete',
        result,
        completedAt: Date.now(),
      })
    }
    flushToStore(set)
  },

  markError: (id, error) => {
    const sub = liveSubagents.get(id)
    if (sub) {
      liveSubagents.set(id, {
        ...sub,
        status: 'error',
        error,
        completedAt: Date.now(),
      })
    }
    flushToStore(set)
  },

  setSynthesizing: (isSynthesizing) => set({ isSynthesizing }),

  // -------------------------------------------------------------------
  // High-frequency — mutate liveSubagents in place, schedule throttled flush
  // -------------------------------------------------------------------

  appendToken: (id, chunk) => {
    const sub = liveSubagents.get(id)
    if (sub) {
      // Mutate in place — avoid spreading a new object on every single token
      sub.tokenBuffer += chunk
    }
    scheduleFlush(set)
  },

  addToolCall: (id, tool) => {
    const sub = liveSubagents.get(id)
    if (sub) {
      sub.toolCalls = [...sub.toolCalls, { tool, timestamp: Date.now() }]
    }
    scheduleFlush(set)
  },

  addToolResult: (id, tool, path, preview) => {
    const sub = liveSubagents.get(id)
    if (sub) {
      sub.toolResults = [...sub.toolResults, { tool, path, preview, timestamp: Date.now() }]
    }
    scheduleFlush(set)
  },

  // -------------------------------------------------------------------
  // Accessors
  // -------------------------------------------------------------------

  /** Returns the live mutable map for code that needs the absolute latest data. */
  getSubagents: () => liveSubagents,

  reset: () => {
    cancelPendingFlush()
    liveSubagents.clear()
    set({ subagents: new Map(), isSynthesizing: false })
  },
}))
