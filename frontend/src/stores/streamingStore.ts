import { create } from 'zustand'

// Module-level timer for throttled flushes — not stored in Zustand state
let flushTimer: ReturnType<typeof setTimeout> | null = null

// Module-level mutable buffer for O(1) appends (no copying).
// We maintain both the raw chunks array AND a running joined string so that
// getBuffer() and the throttled flush never need to re-join from scratch.
const bufferChunks: string[] = []

// Tracks how many chunks have already been joined into `runningJoined`.
// On each flush or getBuffer() call, we only join the NEW chunks since the
// last join and concatenate them onto the running result — O(new chunks)
// instead of O(all chunks).
let joinedUpTo = 0
let runningJoined = ''

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
  joinedUpTo = 0
  runningJoined = ''
}

/**
 * Incrementally joins only the new chunks appended since the last call,
 * then concatenates them onto the running result. This is O(new chunks)
 * per call instead of O(all chunks) — a significant improvement for long
 * streaming responses that accumulate hundreds of token chunks.
 */
function getJoinedBuffer(): string {
  if (joinedUpTo < bufferChunks.length) {
    // Only join the chunks we haven't processed yet
    const newPart = bufferChunks.slice(joinedUpTo).join('')
    runningJoined += newPart
    joinedUpTo = bufferChunks.length
  }
  return runningJoined
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
        // Incrementally join only new chunks and push to Zustand state
        set({ streamBuffer: getJoinedBuffer() })
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

  // Always returns the latest content, even between throttled flushes.
  // Uses the same incremental join so repeated calls are O(1) when no
  // new chunks have been appended.
  getBuffer: () => getJoinedBuffer(),
}))
