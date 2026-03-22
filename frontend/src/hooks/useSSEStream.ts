import { useCallback, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useStreamingStore } from '@/stores/streamingStore'
import { useSubagentStore } from '@/stores/subagentStore'
import { useUIStore } from '@/stores/uiStore'
import { useSessionStore } from '@/stores/sessionStore'
import { useMessageStore, generateLocalId } from '@/stores/messageStore'
import type { LocalMessage } from '@/stores/messageStore'
import { buildAgentActivityContent } from '@/components/chat/AgentActivity'

export interface ToolResultEvent {
  tool: string
  path: string
  preview: string
}

export interface SSECallbacks {
  onToolResult?: (data: ToolResultEvent) => void
  onQA?: (data: { questions: unknown[] }) => void
  onToken?: (chunk: string) => void
  onDone?: (data: { artifactId: string | null; versionNumber: number | null; nextCommand: string | null }) => void
  onError?: (data: { code: string; message: string }) => void
  onDiff?: (data: unknown) => void
  onStep?: (data: { agent: string; node: string }) => void
  onArtifactStart?: (data: { artifactId: string; artifactName: string; artifactType: string; isNew: boolean }) => void
  onSubagentSpawn?: (data: { id: string; name: string; description: string }) => void
  onSubagentRunning?: (data: { id: string }) => void
  onSubagentToken?: (data: { id: string; chunk: string }) => void
  onSubagentToolCall?: (data: { id: string; tool: string }) => void
  onSubagentToolResult?: (data: { id: string; tool: string; path: string; preview: string }) => void
  onSubagentComplete?: (data: { id: string; result: string }) => void
  onSubagentError?: (data: { id: string; error: string }) => void
  onSynthesizing?: () => void
  onStreamEnd?: (receivedDone: boolean) => void
}

/**
 * Hook that manages SSE streaming via fetch + ReadableStream.
 * Dispatches typed events to stores and callbacks.
 *
 * Architecture (post-refactor):
 * - The frontend messageStore is the single source of truth for messages.
 * - When the user sends a message, it is appended to the local store BEFORE
 *   the SSE request is made (done by the caller, e.g. ChatInput).
 * - During streaming, tokens accumulate in the streamingStore's buffer
 *   for live display.
 * - When the stream completes (done event), the assistant's response is
 *   built into one or more LocalMessage objects and appended to messageStore.
 * - After appending, a fire-and-forget sync call persists the new messages
 *   to the backend DB. This completely eliminates the old race condition
 *   between clearBuffer() and invalidateQueries().
 * - Error events are persisted as `error`-type messages in the store so
 *   they survive reloads and are shown inline in the chat pane.
 *
 * Handles all backend SSE event types:
 * - "step"                 — { agent, node }
 * - "token"                — { chunk }
 * - "subagent:spawn"       — { id, name, description }
 * - "subagent:running"     — { id }
 * - "subagent:token"       — { id, chunk }
 * - "subagent:tool_call"   — { id, tool }
 * - "subagent:tool_result" — { id, tool, path, preview }
 * - "subagent:complete"    — { id, result }
 * - "subagent:error"       — { id, error }
 * - "synthesizing"         — {}
 * - "qa"                   — { questions: [...] }
 * - "qa_cancelled"         — { messageId }
 * - "diff"                 — { artifactId, patches, baseVersion, newVersion }
 * - "done"                 — { artifactId, versionNumber, nextCommand }
 * - "error"                — { code, message }
 */
export function useSSEStream() {
  const queryClient = useQueryClient()
  const abortRef = useRef<AbortController | null>(null)

  const streamChat = useCallback(
    async (
      sessionId: string,
      body: {
        message?: string
        answers?: Array<{ questionId: string; selectedOptions: string[] }>
        activeCommand?: string | null
      },
      callbacks?: SSECallbacks
    ) => {
      // Cancel any existing stream
      if (abortRef.current) {
        abortRef.current.abort()
      }

      const abortController = new AbortController()
      abortRef.current = abortController

      const { setIsStreaming, appendToBuffer, clearBuffer, setStreamingArtifactId } =
        useStreamingStore.getState()
      const { setPendingInterrupt } = useUIStore.getState()
      const subagentStore = useSubagentStore.getState()

      // Reset streaming state
      clearBuffer()
      subagentStore.reset()
      setIsStreaming(true)

      // Track accumulated token text for building the final message
      let tokenBuffer = ''
      let receivedDone = false
      let receivedError = false
      let receivedQA = false

      try {
        // Build request headers
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        }

        const response = await fetch(`/api/sessions/${sessionId}/chat`, {
          method: 'POST',
          headers,
          credentials: 'include',
          body: JSON.stringify(body),
          signal: abortController.signal,
        })

        if (!response.ok || !response.body) {
          const errBody = await response.json().catch(() => ({ error: response.statusText }))
          throw new Error(errBody.error || `HTTP ${response.status}`)
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        // SSE parser state — persisted across chunks so that an event
        // split across two TCP segments is still parsed correctly.
        let currentEvent = ''
        let currentData = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })

          // Parse SSE events from buffer
          const lines = buffer.split('\n')
          buffer = lines.pop() || '' // Keep incomplete line in buffer

          for (const line of lines) {
            if (line.startsWith(':')) {
              // SSE comment (heartbeat) — ignore
              continue;
            }
            if (line.startsWith('event: ')) {
              currentEvent = line.slice(7).trim()
            } else if (line.startsWith('data: ')) {
              currentData = line.slice(6)
            } else if (line === '') {
              // Empty line = end of event
              if (currentEvent && currentData) {
                try {
                  const parsed = JSON.parse(currentData)
                  await handleSSEEvent(currentEvent, parsed, {
                    callbacks,
                    sessionId,
                    queryClient,
                    setIsStreaming,
                    appendToBuffer,
                    setStreamingArtifactId,
                    setPendingInterrupt,
                    setReceivedDone: () => { receivedDone = true },
                    setReceivedError: () => { receivedError = true },
                    setReceivedQA: () => { receivedQA = true },
                    appendTokenBuffer: (chunk: string) => { tokenBuffer += chunk },
                    getTokenBuffer: () => tokenBuffer,
                  })
                } catch (parseErr) {
                  console.warn('[sse] Failed to parse event data:', currentData)
                }
              }
              currentEvent = ''
              currentData = ''
            }
          }
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          // Stream was intentionally cancelled
          return
        }

        const msg = err instanceof Error ? err.message : 'Stream failed'

        // Persist the connection-level error as a message in the store
        const msgStore = useMessageStore.getState()
        const errorMsg: LocalMessage = {
          id: generateLocalId(),
          session_id: sessionId,
          role: 'assistant',
          type: 'error',
          content: JSON.stringify({ code: 'stream_failed', message: msg }),
          created_at: Date.now(),
          pending: true,
        }
        msgStore.appendMessage(errorMsg)
        await msgStore.syncToBackend(sessionId)

        callbacks?.onError?.({ code: 'stream_failed', message: msg })
      } finally {
        const { setIsStreaming: finalSetStreaming } = useStreamingStore.getState()
        finalSetStreaming(false)

        // Reset synthesizing state when stream ends
        useSubagentStore.getState().setSynthesizing(false)

        if (!receivedDone) {
          // Stream ended without a done event — if we have accumulated tokens,
          // still persist them as a text message so the user doesn't lose the response.
          // But skip this if we received an explicit error event from the backend,
          // since the partial content may be invalid/garbage.
          if (tokenBuffer.length > 0 && !receivedError && !receivedQA) {
            const msgStore = useMessageStore.getState()
            const now = Date.now()
            const fallbackMessages: LocalMessage[] = []

            // Snapshot subagent activity so it persists even on unexpected disconnect
            const currentSubagents = Array.from(useSubagentStore.getState().getSubagents().values())
            if (currentSubagents.length > 0) {
              const activityData = buildAgentActivityContent(currentSubagents)
              fallbackMessages.push({
                id: generateLocalId(),
                session_id: sessionId,
                role: 'assistant',
                type: 'agent_activity',
                content: JSON.stringify(activityData),
                created_at: now,
                pending: true,
              })
            }

            fallbackMessages.push({
              id: generateLocalId(),
              session_id: sessionId,
              role: 'assistant',
              type: 'text',
              content: tokenBuffer,
              created_at: now + 1,
              pending: true,
            })

            msgStore.appendMessages(fallbackMessages)

            // Clear the streaming buffer now that it's been captured in the message
            useStreamingStore.getState().clearBuffer()

            await msgStore.syncToBackend(sessionId)
          }
          callbacks?.onStreamEnd?.(false)
        } else {
          callbacks?.onStreamEnd?.(true)
        }

        abortRef.current = null
      }
    },
    [queryClient]
  )

  const cancelStream = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
    }
    useStreamingStore.getState().reset()
    useSubagentStore.getState().reset()
  }, [])

  return { streamChat, cancelStream }
}

// ─── Event Handler ──────────────────────────────────────────────────────────

async function handleSSEEvent(
  event: string,
  data: unknown,
  ctx: {
    callbacks?: SSECallbacks
    sessionId: string
    queryClient: ReturnType<typeof import('@tanstack/react-query').useQueryClient>
    setIsStreaming: (v: boolean) => void
    appendToBuffer: (chunk: string) => void
    setStreamingArtifactId: (id: string | null) => void
    setPendingInterrupt: (v: boolean) => void
    setReceivedDone: () => void
    setReceivedError: () => void
    setReceivedQA: () => void
    appendTokenBuffer: (chunk: string) => void
    getTokenBuffer: () => string
  }
) {
  const d = data as Record<string, unknown>
  const subagentStore = useSubagentStore.getState()

  switch (event) {
    // ── Artifact streaming start ──────────────────────────────────────
    case 'artifact:start': {
      const startData = d as { artifactId: string; artifactName: string; artifactType: string; isNew: boolean }
      ctx.setStreamingArtifactId(startData.artifactId)
      // Auto-select the artifact so the viewer shows it
      const store = useSessionStore.getState()
      store.setActiveArtifactId(startData.artifactId)
      store.setActiveArtifactType(startData.artifactType as 'spec' | 'ticket')
      ctx.callbacks?.onArtifactStart?.(startData)
      break
    }

    // ── Main agent step progress ──────────────────────────────────────
    case 'step':
      ctx.callbacks?.onStep?.(d as { agent: string; node: string })
      break

    // ── Main agent token streaming ────────────────────────────────────
    case 'token': {
      const chunk = (d.chunk as string) || ''
      ctx.appendToBuffer(chunk)
      ctx.appendTokenBuffer(chunk)
      ctx.callbacks?.onToken?.(chunk)
      break
    }

    // ── Subagent lifecycle events ─────────────────────────────────────
    case 'subagent:spawn': {
      const spawnData = d as { id: string; name: string; description: string }
      subagentStore.spawn(spawnData.id, spawnData.name, spawnData.description)
      ctx.callbacks?.onSubagentSpawn?.(spawnData)
      break
    }

    case 'subagent:running': {
      const runData = d as { id: string }
      subagentStore.markRunning(runData.id)
      ctx.callbacks?.onSubagentRunning?.(runData)
      break
    }

    case 'subagent:token': {
      const tokenData = d as { id: string; chunk: string }
      subagentStore.appendToken(tokenData.id, tokenData.chunk)
      ctx.callbacks?.onSubagentToken?.(tokenData)
      break
    }

    case 'subagent:tool_call': {
      const toolCallData = d as { id: string; tool: string }
      subagentStore.addToolCall(toolCallData.id, toolCallData.tool)
      ctx.callbacks?.onSubagentToolCall?.(toolCallData)
      break
    }

    case 'subagent:tool_result': {
      const toolResultData = d as { id: string; tool: string; path: string; preview: string }
      subagentStore.addToolResult(
        toolResultData.id,
        toolResultData.tool,
        toolResultData.path,
        toolResultData.preview
      )
      // Also forward to the legacy onToolResult callback for backward compat
      ctx.callbacks?.onToolResult?.({
        tool: toolResultData.tool,
        path: toolResultData.path,
        preview: toolResultData.preview,
      })
      ctx.callbacks?.onSubagentToolResult?.(toolResultData)
      break
    }

    case 'subagent:complete': {
      const completeData = d as { id: string; result: string }
      subagentStore.markComplete(completeData.id, completeData.result)
      ctx.callbacks?.onSubagentComplete?.(completeData)
      break
    }

    case 'subagent:error': {
      const errorData = d as { id: string; error: string }
      subagentStore.markError(errorData.id, errorData.error)
      ctx.callbacks?.onSubagentError?.(errorData)
      break
    }

    // ── Synthesizing indicator ─────────────────────────────────────────
    case 'synthesizing':
      subagentStore.setSynthesizing(true)
      ctx.callbacks?.onSynthesizing?.()
      break

    // ── Q&A interrupt ─────────────────────────────────────────────────
    case 'qa': {
      ctx.setReceivedQA()
      ctx.setPendingInterrupt(true)

      // Build the qa_questions message locally and append to the store
      const msgStore = useMessageStore.getState()
      const qaMsg: LocalMessage = {
        id: generateLocalId(),
        session_id: ctx.sessionId,
        role: 'assistant',
        type: 'qa_questions',
        content: JSON.stringify(d),
        created_at: Date.now(),
        pending: true,
      }
      msgStore.appendMessage(qaMsg)

      await msgStore.syncToBackend(ctx.sessionId)

      ctx.callbacks?.onQA?.(d as { questions: unknown[] })
      break
    }

    // ── Q&A cancelled by backend (user sent new command over pending interrupt) ─
    case 'qa_cancelled': {
      const cancelData = d as { messageId?: string }
      ctx.setPendingInterrupt(false)

      // Update the local qa_questions message type to qa_cancelled
      if (cancelData.messageId) {
        const msgStore = useMessageStore.getState()
        msgStore.updateMessageType(cancelData.messageId, 'qa_cancelled')
      }
      break
    }

    // ── Diff (artifact patch) ─────────────────────────────────────────
    case 'diff':
      // Invalidate artifact caches so the viewer picks up the new version
      ctx.queryClient.invalidateQueries({ queryKey: ['artifacts', ctx.sessionId] })
      ctx.queryClient.invalidateQueries({ queryKey: ['artifact-versions'] })
      ctx.queryClient.invalidateQueries({ queryKey: ['artifact-content'] })
      ctx.callbacks?.onDiff?.(d)
      break

    // ── Stream completion ─────────────────────────────────────────────
    case 'done': {
      ctx.setReceivedDone()
      ctx.setIsStreaming(false)
      ctx.setPendingInterrupt(false)
      subagentStore.setSynthesizing(false)

      const doneData = d as {
        artifactId: string | null
        versionNumber: number | null
        nextCommand: string | null
      }

      // Build the local messages from the completed stream.
      // Order: agent_activity → response (artifact_ref or text) → nudge
      const msgStore = useMessageStore.getState()
      const now = Date.now()
      const newMessages: LocalMessage[] = []

      // Snapshot subagent activity into an agent_activity message.
      // This is inserted BEFORE the assistant response so the timeline reads:
      //   user command → agent_activity → assistant response → nudge
      const currentSubagents = Array.from(useSubagentStore.getState().getSubagents().values())
      if (currentSubagents.length > 0) {
        const activityData = buildAgentActivityContent(currentSubagents)
        newMessages.push({
          id: generateLocalId(),
          session_id: ctx.sessionId,
          role: 'assistant',
          type: 'agent_activity',
          content: JSON.stringify(activityData),
          created_at: now,
          pending: true,
        })
      }

      const tokenContent = ctx.getTokenBuffer()

      if (doneData.artifactId) {
        // Artifact was created/updated — add artifact_ref message
        ctx.setStreamingArtifactId(null)
        const store = useSessionStore.getState()
        store.setActiveArtifactId(doneData.artifactId)

        newMessages.push({
          id: generateLocalId(),
          session_id: ctx.sessionId,
          role: 'assistant',
          type: 'artifact_ref',
          content: JSON.stringify({
            artifactId: doneData.artifactId,
            versionNumber: doneData.versionNumber,
            action: doneData.versionNumber === 1 ? 'created' : 'updated',
          }),
          created_at: now + 1, // +1ms after activity for correct ordering
          pending: true,
        })
      } else if (tokenContent.length > 0) {
        // Non-artifact text response — add text message
        newMessages.push({
          id: generateLocalId(),
          session_id: ctx.sessionId,
          role: 'assistant',
          type: 'text',
          content: tokenContent,
          created_at: now + 1, // +1ms after activity for correct ordering
          pending: true,
        })
      }

      // Add next_step_nudge if the backend provided one
      if (doneData.nextCommand) {
        newMessages.push({
          id: generateLocalId(),
          session_id: ctx.sessionId,
          role: 'assistant',
          type: 'next_step_nudge',
          content: JSON.stringify({ nextCommand: doneData.nextCommand }),
          created_at: now + 2, // +2ms to ensure correct ordering after response
          pending: true,
        })
      }

      // Append all new messages to the local store
      msgStore.appendMessages(newMessages)

      // Now clear the streaming buffer — the content is safely captured
      // in the messageStore, so there is no visual gap.
      useStreamingStore.getState().clearBuffer()

      // Invalidate artifact queries (messages no longer use react-query)
      ctx.queryClient.invalidateQueries({ queryKey: ['artifacts', ctx.sessionId] })
      ctx.queryClient.invalidateQueries({ queryKey: ['artifact-versions'] })
      ctx.queryClient.invalidateQueries({ queryKey: ['artifact-content'] })

      // Persist new messages to the backend DB (retries up to 5 times)
      await msgStore.syncToBackend(ctx.sessionId)

      ctx.callbacks?.onDone?.(doneData)
      break
    }

    // ── Stream error ──────────────────────────────────────────────────
    case 'error': {
      ctx.setReceivedError()
      ctx.setIsStreaming(false)
      useStreamingStore.getState().clearBuffer()
      ctx.setPendingInterrupt(false)
      subagentStore.setSynthesizing(false)

      const errData = d as { code: string; message: string }

      const msgStore = useMessageStore.getState()
      const now = Date.now()
      const errorMessages: LocalMessage[] = []

      // Snapshot subagent activity before the error message so the
      // user can see what the agent was doing when the error occurred.
      const currentSubagents = Array.from(useSubagentStore.getState().getSubagents().values())
      if (currentSubagents.length > 0) {
        const activityData = buildAgentActivityContent(currentSubagents)
        errorMessages.push({
          id: generateLocalId(),
          session_id: ctx.sessionId,
          role: 'assistant',
          type: 'agent_activity',
          content: JSON.stringify(activityData),
          created_at: now,
          pending: true,
        })
      }

      // Persist error as a message so it appears inline in the chat
      // and survives reloads.
      errorMessages.push({
        id: generateLocalId(),
        session_id: ctx.sessionId,
        role: 'assistant',
        type: 'error',
        content: JSON.stringify(errData),
        created_at: now + 1,
        pending: true,
      })
      msgStore.appendMessages(errorMessages)

      await msgStore.syncToBackend(ctx.sessionId)

      ctx.callbacks?.onError?.(errData)
      break
    }

    default:
      // Unknown events are logged but not treated as errors — the backend
      // may add new event types in the future.
      console.debug('[sse] Unhandled event:', event, data)
  }
}
