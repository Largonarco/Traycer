import { create } from 'zustand'

// Module-level timer for throttled flushes — not stored in Zustand state
let flushTimer: ReturnType<typeof setTimeout> | null = null

// Module-level mutable buffer for O(1) appends (no copying)
const bufferChunks: string[] = []

const FLUSH_INTERVAL_MS = 66 // ~15fps

interface StreamingStore {
  isStreaming: boolean
  streamingArtifactId: string | null
  /** Array-based buffer for O(1) appends. Use getBuffer() to read. */
  _bufferChunks: string[]
  streamBuffer: string // Keep for backward compat — computed on throttled flush
  setIsStreaming: (streaming: boolean) => void
  setStreamingArtifactId: (id: string | null) => void
  appendToBuffer: (chunk: string) => void
  clearBuffer: () => void
  reset: () => void
  getBuffer: () => string
}

function cancelPendingFlush() {
  if (flushTimer !== null) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
}

function clearInternalBuffer() {
  bufferChunks.length = 0
}

export const useStreamingStore = create<StreamingStore>((set, get) => ({
  isStreaming: false,
  streamingArtifactId: null,
  _bufferChunks: bufferChunks,
  streamBuffer: '',

  setIsStreaming: (streaming) => set({ isStreaming: streaming }),
  setStreamingArtifactId: (id) => set({ streamingArtifactId: id }),

  appendToBuffer: (chunk) => {
    // O(1) append — mutate in place, no state update triggered
    bufferChunks.push(chunk)

    // Schedule a throttled flush if one isn't already pending
    if (flushTimer === null) {
      flushTimer = setTimeout(() => {
        flushTimer = null
        // Join and push to Zustand state so subscribers re-render
        set({ streamBuffer: bufferChunks.join('') })
      }, FLUSH_INTERVAL_MS)
    }
  },

  clearBuffer: () => {
    cancelPendingFlush()
    clearInternalBuffer()
    set({ _bufferChunks: bufferChunks, streamBuffer: '' })
  },

  reset: () => {
    cancelPendingFlush()
    clearInternalBuffer()
    set({
      isStreaming: false,
      streamingArtifactId: null,
      _bufferChunks: bufferChunks,
      streamBuffer: '',
    })
  },

  // Always returns the latest content, even between throttled flushes
  getBuffer: () => bufferChunks.join(''),
}))
