import { create } from 'zustand'
import type { Message } from '@/lib/api'
import { messagesApi } from '@/lib/api'

// ─── Types ──────────────────────────────────────────────────────────────────

/** Locally-created messages use a client-generated ID prefixed with `local_` */
export type LocalMessage = Message & {
  /** True while this message hasn't been persisted to the backend yet */
  pending?: boolean
}

interface MessageStore {
  /** The local messages array — single source of truth for the UI */
  messages: LocalMessage[]

  /** Which session these messages belong to */
  sessionId: string | null

  /** True while we're fetching messages from the backend on session load */
  isLoading: boolean

  /** Error from the last loadMessages call */
  loadError: string | null

  /** True while a sync request is in flight */
  isSyncing: boolean

  // ─── Actions ────────────────────────────────────────────────────────

  /**
   * Load messages from the backend for a session (initial hydration).
   * Replaces the entire local array with what the DB returns.
   */
  loadMessages: (sessionId: string) => Promise<void>

  /**
   * Append a single message to the local array.
   * Used when the user sends a message or when the stream completes.
   */
  appendMessage: (message: LocalMessage) => void

  /**
   * Append multiple messages at once (e.g. assistant text + artifact_ref + nudge).
   */
  appendMessages: (messages: LocalMessage[]) => void

  /**
   * Update the type of a message by ID (e.g. mark qa_questions as qa_cancelled).
   */
  updateMessageType: (messageId: string, newType: Message['type']) => void

  /**
   * Replace the entire messages array (used when sync returns canonical IDs).
   */
  setMessages: (messages: LocalMessage[]) => void

  /**
   * Persist all pending local messages to the backend.
   * Calls POST /api/sessions/:id/messages/sync with the new messages.
   * On success, marks them as no longer pending.
   * Uses an internal queue so concurrent calls are serialized.
   */
  syncToBackend: (sessionId: string) => Promise<void>

  /**
   * Clear local state (e.g. when switching sessions or logging out).
   */
  clear: () => void

  // ─── Derived Helpers ────────────────────────────────────────────────

  /**
   * Returns true if there is a pending Q&A interrupt — i.e. the last
   * qa_questions message has no subsequent qa_answers message.
   */
  hasPendingQA: () => boolean

  /**
   * Returns true if the given qa_questions message ID has a subsequent
   * qa_answers message, meaning it has already been answered.
   */
  isQAAnswered: (qaMessageId: string) => boolean

  /**
   * Finds the last user-sent slash command from the message history.
   * Used to send the active command alongside Q&A answers so the backend
   * doesn't need to look it up from the DB.
   */
  findLastCommand: () => string | null
}

// ─── Helpers ────────────────────────────────────────────────────────────────

let localIdCounter = 0

/**
 * Generate a deterministic local ID that is clearly distinguishable
 * from server-generated UUIDs so we know which messages need syncing.
 */
export function generateLocalId(): string {
  localIdCounter += 1
  return `local_${Date.now()}_${localIdCounter}`
}

// ─── Sync Queue ─────────────────────────────────────────────────────────────
// Serializes sync calls so concurrent invocations don't overlap,
// preventing duplicate sends and unexpected pending-state races.

let syncQueue: Promise<void> = Promise.resolve()

function enqueueSyncCall(fn: () => Promise<void>): Promise<void> {
  const next = syncQueue.then(fn, fn)
  syncQueue = next
  return next
}

// ─── Store ──────────────────────────────────────────────────────────────────

export const useMessageStore = create<MessageStore>((set, get) => ({
  messages: [],
  sessionId: null,
  isLoading: false,
  loadError: null,
  isSyncing: false,

  loadMessages: async (sessionId: string) => {
    set({ isLoading: true, loadError: null, sessionId, messages: [] })

    try {
      const serverMessages = await messagesApi.list(sessionId)
      // Server already filters qa_cancelled, but be defensive
      set({ messages: serverMessages, isLoading: false })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load messages'
      console.error('[messageStore] Failed to load messages:', msg)
      set({ isLoading: false, loadError: msg })
    }
  },

  appendMessage: (message: LocalMessage) => {
    set((state) => ({
      messages: [...state.messages, message],
    }))
  },

  appendMessages: (messages: LocalMessage[]) => {
    if (messages.length === 0) return
    set((state) => ({
      messages: [...state.messages, ...messages],
    }))
  },

  updateMessageType: (messageId: string, newType: Message['type']) => {
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === messageId ? { ...m, type: newType } : m
      ),
    }))
  },

  setMessages: (messages: LocalMessage[]) => {
    set({ messages })
  },

  syncToBackend: (sessionId: string) => {
    return enqueueSyncCall(async () => {
      const state = get()
      const pendingMessages = state.messages.filter((m) => m.pending)

      if (pendingMessages.length === 0) return

      set({ isSyncing: true })

      const MAX_RETRIES = 5
      const RETRY_DELAY_MS = 1000
      const payload = JSON.stringify({
        messages: pendingMessages.map((m) => ({
          id: m.id,
          role: m.role,
          type: m.type,
          content: m.content,
          created_at: m.created_at,
        })),
      })

      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          const response = await fetch(`/api/sessions/${sessionId}/messages/sync`, {
            method: 'POST',
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json',
            },
            body: payload,
          })

          if (!response.ok) {
            const errBody = await response.json().catch(() => ({ error: response.statusText }))
            throw new Error(errBody.error || `HTTP ${response.status}`)
          }

          // Mark all previously-pending messages as synced
          set((state) => ({
            messages: state.messages.map((m) =>
              m.pending ? { ...m, pending: false } : m
            ),
            isSyncing: false,
          }))
          return // Success — exit the retry loop
        } catch (err) {
          console.error(`[messageStore] Sync attempt ${attempt}/${MAX_RETRIES} failed:`, err)

          if (attempt < MAX_RETRIES) {
            // Wait before retrying
            await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))
          } else {
            // All retries exhausted — messages stay pending so a future
            // syncToBackend call (e.g. after the next stream completes)
            // will pick them up again.
            console.error('[messageStore] Sync failed after all retries. Messages remain pending.')
            set({ isSyncing: false })
          }
        }
      }
    })
  },

  clear: () => {
    set({
      messages: [],
      sessionId: null,
      isLoading: false,
      loadError: null,
      isSyncing: false,
    })
  },

  // ─── Derived Helpers ────────────────────────────────────────────────

  hasPendingQA: () => {
    const { messages } = get()
    // Walk backwards to find the last qa_questions or qa_answers
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]
      if (msg.type === 'qa_answers') {
        // Most recent Q&A-related message is an answer — no pending interrupt
        return false
      }
      if (msg.type === 'qa_questions') {
        // Most recent Q&A-related message is a question — pending interrupt
        return true
      }
    }
    return false
  },

  isQAAnswered: (qaMessageId: string) => {
    const { messages } = get()
    // Find the index of the qa_questions message, then check if any
    // subsequent message is a qa_answers
    const qaIndex = messages.findIndex((m) => m.id === qaMessageId)
    if (qaIndex === -1) return false

    for (let i = qaIndex + 1; i < messages.length; i++) {
      if (messages[i].type === 'qa_answers') {
        return true
      }
    }
    return false
  },

  findLastCommand: () => {
    const { messages } = get()
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]
      if (msg.role === 'user' && msg.type === 'text') {
        const command = msg.content.trim().split(/\s/)[0]
        if (command.startsWith('/')) {
          return command
        }
      }
    }
    return null
  },
}))
