import { useEffect, useRef, useState, useCallback, memo } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useSessionStore } from '@/stores/sessionStore'
import { useStreamingStore } from '@/stores/streamingStore'
import { useSubagentStore } from '@/stores/subagentStore'
import { useUIStore } from '@/stores/uiStore'
import { useMessageStore, generateLocalId } from '@/stores/messageStore'
import type { LocalMessage } from '@/stores/messageStore'
import { useSSEStream } from '@/hooks/useSSEStream'
import { MessageBubble, ErrorBubble, ArtifactRefBubble } from './MessageBubble'
import { MarkdownContent } from './MarkdownContent'
import { QACarousel, type Question } from './QACarousel'
import { AnswersSummary } from './AnswersSummary'
import { NextStepNudge } from './NextStepNudge'
import { AgentActivity, parseAgentActivityContent } from './AgentActivity'
import type { Message } from '@/lib/api'

interface MessageListProps {
  onCommandInsert: (command: string) => void
}

// ─── Isolated Streaming Content ─────────────────────────────────────────────
// This component subscribes to high-frequency streaming stores (streamBuffer,
// subagents, isSynthesizing) in isolation so that token updates only re-render
// THIS subtree — not the entire MessageList and all its persisted messages.

function StreamingContent({ onHeightChange }: { onHeightChange: () => void }) {
  const isStreaming = useStreamingStore((s) => s.isStreaming)
  const streamBuffer = useStreamingStore((s) => s.streamBuffer)
  const subagents = useSubagentStore((s) => s.subagents)
  const isSynthesizing = useSubagentStore((s) => s.isSynthesizing)

  const prevHeightRef = useRef(0)
  const containerRef = useRef<HTMLDivElement>(null)

  // Notify parent when our rendered height changes so it can auto-scroll.
  // We use a layout-based check after every render rather than depending on
  // every individual piece of state, which is more reliable and decoupled.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const h = el.scrollHeight
    if (h !== prevHeightRef.current) {
      prevHeightRef.current = h
      onHeightChange()
    }
  })

  const subagentList = Array.from(subagents.values())
  const hasLiveActivity = subagentList.length > 0

  if (!isStreaming) return null

  return (
    <div ref={containerRef}>
      {/* Live Agent Activity — shown during an active stream when the
          subagent store has data. This is the real-time view that updates
          as subagents spawn, run tools, and complete. Once the stream
          finishes, this data is snapshotted into an agent_activity message
          (by useSSEStream) and the subagent store is reset on the next
          stream, so the persisted version above takes over. */}
      {hasLiveActivity && (
        <AgentActivity
          mode="live"
          subagents={subagentList}
          isSynthesizing={isSynthesizing}
          isStreaming={isStreaming}
          streamBuffer={streamBuffer}
        />
      )}

      {/* Live streaming buffer — when streaming tokens arrive from the
          main agent (not inside a subagent), show them here as a live
          typing indicator. Only shown when there's no subagent activity
          (otherwise the streaming buffer is shown inside AgentActivity). */}
      {streamBuffer && !hasLiveActivity && (
        <div className="flex justify-start">
          <div className="max-w-[85%] rounded-lg bg-card px-2.5 py-1.5 text-xs text-foreground">
            <MarkdownContent content={streamBuffer} />
            <span className="inline-block h-4 w-0.5 animate-pulse bg-primary" />
          </div>
        </div>
      )}

      {/* Minimal thinking indicator — shown when streaming has started
          but no tokens or subagent activity have arrived yet. */}
      {!streamBuffer && !hasLiveActivity && (
        <div className="flex justify-start">
          <div className="flex items-center gap-1.5 rounded-lg bg-card px-2.5 py-1.5 text-xs text-muted-foreground">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-primary [animation-delay:150ms]" />
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-primary [animation-delay:300ms]" />
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Memoized Message Item ──────────────────────────────────────────────────
// Wrapping each rendered message in React.memo prevents re-rendering persisted
// messages when only streaming state changes.

interface MessageItemProps {
  msg: Message | LocalMessage
  isQAAnswered: (id: string) => boolean
  submittingQA: string | null
  onQASubmit: (messageId: string, answers: Array<{ questionId: string; selectedOptions: string[] }>) => void
  onArtifactClick: (artifactId: string) => void
  onCommandInsert: (command: string) => void
}

const MessageItem = memo(function MessageItem({
  msg,
  isQAAnswered,
  submittingQA,
  onQASubmit,
  onArtifactClick,
  onCommandInsert,
}: MessageItemProps) {
  switch (msg.type) {
    case 'text':
      return <MessageBubble role={msg.role} content={msg.content} />

    case 'qa_questions': {
      let questions: Question[] = []
      try {
        const parsed = JSON.parse(msg.content)
        questions = parsed.questions ?? parsed
      } catch {
        return <MessageBubble role="assistant" content={msg.content} />
      }
      if (!Array.isArray(questions) || questions.length === 0) {
        return <MessageBubble role="assistant" content={msg.content} />
      }

      const locked = isQAAnswered(msg.id)

      return (
        <QACarousel
          questions={questions}
          onSubmit={(answers) => onQASubmit(msg.id, answers)}
          locked={locked}
          isSubmitting={submittingQA === msg.id}
        />
      )
    }

    case 'qa_answers':
      return <AnswersSummary content={msg.content} />

    case 'artifact_ref':
      return <ArtifactRefBubble content={msg.content} onArtifactClick={onArtifactClick} />

    case 'next_step_nudge': {
      let nudgeData: { nextCommand?: string } = {}
      try { nudgeData = JSON.parse(msg.content) } catch { return null }
      if (!nudgeData.nextCommand) return null
      return <NextStepNudge nextCommand={nudgeData.nextCommand} onCommandClick={onCommandInsert} />
    }

    case 'error':
      return <ErrorBubble content={msg.content} />

    case 'agent_activity': {
      // Persisted agent activity — render from saved message content
      const activityData = parseAgentActivityContent(msg.content)
      if (!activityData || activityData.subagents.length === 0) return null
      return <AgentActivity mode="persisted" data={activityData} />
    }

    case 'qa_cancelled':
      return null

    default:
      return <MessageBubble role={msg.role} content={msg.content} />
  }
}, (prev, next) => {
  // Custom comparator — only re-render if message-relevant props changed.
  // The callbacks are stable (useCallback) so reference equality works.
  return (
    prev.msg === next.msg &&
    prev.submittingQA === next.submittingQA &&
    prev.onQASubmit === next.onQASubmit &&
    prev.onArtifactClick === next.onArtifactClick &&
    prev.onCommandInsert === next.onCommandInsert
    // isQAAnswered is a store method — stable reference from Zustand
  )
})

// ─── Main MessageList Component ─────────────────────────────────────────────

export function MessageList({ onCommandInsert }: MessageListProps) {
  const activeSessionId = useSessionStore((s) => s.activeSessionId)
  const setActiveArtifactId = useSessionStore((s) => s.setActiveArtifactId)

  // We only subscribe to isStreaming (boolean) here — NOT streamBuffer or
  // subagents. Those high-frequency subscriptions live in StreamingContent.
  const isStreaming = useStreamingStore((s) => s.isStreaming)

  const setPendingInterrupt = useUIStore((s) => s.setPendingInterrupt)

  // ─── Message Store (local source of truth) ────────────────────────
  const messages = useMessageStore((s) => s.messages)
  const isLoadingMessages = useMessageStore((s) => s.isLoading)
  const loadMessages = useMessageStore((s) => s.loadMessages)
  const appendMessage = useMessageStore((s) => s.appendMessage)
  const messageStoreSessionId = useMessageStore((s) => s.sessionId)
  const hasPendingQA = useMessageStore((s) => s.hasPendingQA)
  const isQAAnswered = useMessageStore((s) => s.isQAAnswered)
  const findLastCommand = useMessageStore((s) => s.findLastCommand)

  const { streamChat } = useSSEStream()

  const [submittingQA, setSubmittingQA] = useState<string | null>(null)

  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  // ─── Throttled Auto-Scroll ──────────────────────────────────────────
  // Instead of calling scrollIntoView on every state change (which creates
  // competing smooth-scroll animations that cause visible jitter), we use
  // a rAF-throttled scroll that fires at most once per animation frame.
  // During streaming we use instant scroll to avoid animation stacking;
  // for discrete events (new messages) we use smooth scroll.
  const scrollRafRef = useRef<number | null>(null)
  const isStreamingRef = useRef(false)
  isStreamingRef.current = isStreaming

  const scrollToBottom = useCallback((instant?: boolean) => {
    // Coalesce multiple scroll requests into a single rAF
    if (scrollRafRef.current !== null) return
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null
      bottomRef.current?.scrollIntoView({
        behavior: instant || isStreamingRef.current ? 'instant' : 'smooth',
      })
    })
  }, [])

  // Cleanup rAF on unmount
  useEffect(() => {
    return () => {
      if (scrollRafRef.current !== null) {
        cancelAnimationFrame(scrollRafRef.current)
      }
    }
  }, [])

  // Load messages from the backend when the active session changes
  useEffect(() => {
    if (activeSessionId && activeSessionId !== messageStoreSessionId) {
      loadMessages(activeSessionId)
      setSubmittingQA(null)
    }
  }, [activeSessionId, messageStoreSessionId, loadMessages])

  // Restore pendingInterrupt state from loaded messages.
  useEffect(() => {
    if (!isLoadingMessages && messages.length > 0) {
      setPendingInterrupt(hasPendingQA())
    }
  }, [messages, isLoadingMessages, hasPendingQA, setPendingInterrupt])

  // Auto-scroll when messages change (new message appended, messages loaded).
  // This handles discrete events — NOT high-frequency streaming updates.
  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  // Callback for StreamingContent to notify us that its height changed
  // (i.e. new tokens arrived, subagent status changed, etc.)
  const handleStreamingHeightChange = useCallback(() => {
    scrollToBottom(true)
  }, [scrollToBottom])

  // Filter out qa_cancelled messages for display
  const filteredMessages = messages.filter((m) => m.type !== 'qa_cancelled')

  const handleQASubmit = useCallback(async (
    messageId: string,
    answers: Array<{ questionId: string; selectedOptions: string[] }>
  ) => {
    if (!activeSessionId) return

    // Guard: if this Q&A has already been answered, ignore the re-submission.
    if (isQAAnswered(messageId)) {
      console.warn('[MessageList] Ignoring duplicate Q&A submission for', messageId)
      return
    }

    setSubmittingQA(messageId)

    // Append the qa_answers message locally
    const answersMsg: LocalMessage = {
      id: generateLocalId(),
      session_id: activeSessionId,
      role: 'user',
      type: 'qa_answers',
      content: JSON.stringify({ answers }),
      created_at: Date.now(),
      pending: true,
    }
    appendMessage(answersMsg)

    // Find the active command from local message history so the backend
    // doesn't need to look it up from the DB (which may not be synced yet).
    const activeCommand = findLastCommand()

    try {
      await streamChat(activeSessionId, { answers, activeCommand })
    } finally {
      setSubmittingQA(null)
    }
  }, [activeSessionId, isQAAnswered, appendMessage, findLastCommand, streamChat])

  const handleArtifactClick = useCallback((artifactId: string) => {
    setActiveArtifactId(artifactId)
  }, [setActiveArtifactId])

  const hasMessages = filteredMessages.length > 0

  return (
    <ScrollArea className="min-h-0 flex-1" ref={scrollContainerRef}>
      <div className="flex flex-col gap-3 p-3">
        {/* Empty state */}
        {!hasMessages && !isStreaming && !isLoadingMessages && (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <p className="text-[11px] text-muted-foreground">
              Describe your engineering request below.
            </p>
            <p className="text-[10px] text-muted-foreground/60">
              Type <span className="font-mono text-primary">/trigger</span> to begin.
            </p>
          </div>
        )}

        {/* Loading state */}
        {isLoadingMessages && (
          <div className="flex items-center justify-center py-8">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
              Loading messages…
            </div>
          </div>
        )}

        {/* Persisted messages (includes agent_activity rendered inline) */}
        {filteredMessages.map((msg) => (
          <div key={msg.id}>
            <MessageItem
              msg={msg}
              isQAAnswered={isQAAnswered}
              submittingQA={submittingQA}
              onQASubmit={handleQASubmit}
              onArtifactClick={handleArtifactClick}
              onCommandInsert={onCommandInsert}
            />
          </div>
        ))}

        {/* Live streaming content — isolated in its own component so
            high-frequency token/subagent updates only re-render this
            subtree, not the entire message list above. */}
        <StreamingContent onHeightChange={handleStreamingHeightChange} />

        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  )
}
