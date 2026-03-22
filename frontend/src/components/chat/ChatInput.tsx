import { useState, useRef, useCallback, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { ArrowUp, Square } from 'lucide-react'
import { useSessionStore } from '@/stores/sessionStore'
import { useStreamingStore } from '@/stores/streamingStore'
import { useUIStore } from '@/stores/uiStore'
import { useSSEStream } from '@/hooks/useSSEStream'
import { useMessageStore, generateLocalId } from '@/stores/messageStore'
import type { LocalMessage } from '@/stores/messageStore'
import { SlashMenu } from './SlashMenu'

export function ChatInput() {
  const activeSessionId = useSessionStore((s) => s.activeSessionId)
  const isStreaming = useStreamingStore((s) => s.isStreaming)
  const pendingInterrupt = useUIStore((s) => s.pendingInterrupt)
  const setSlashMenuOpen = useUIStore((s) => s.setSlashMenuOpen)
  const slashMenuOpen = useUIStore((s) => s.slashMenuOpen)

  const { streamChat, cancelStream } = useSSEStream()
  const appendMessage = useMessageStore((s) => s.appendMessage)
  const updateMessageType = useMessageStore((s) => s.updateMessageType)
  const setPendingInterrupt = useUIStore((s) => s.setPendingInterrupt)

  const [input, setInput] = useState('')
  const [slashQuery, setSlashQuery] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const prevSessionRef = useRef<string | null>(null)

  useEffect(() => {
    if (activeSessionId && activeSessionId !== prevSessionRef.current) {
      setInput('/trigger ')
    }
    prevSessionRef.current = activeSessionId
  }, [activeSessionId])

  useEffect(() => {
    const trimmed = input.trimStart()
    if (trimmed.startsWith('/')) {
      const query = trimmed.split(/\s/)[0]
      setSlashQuery(query)
      const hasSpaceAfterCommand = trimmed.indexOf(' ') > 0
      if (!hasSpaceAfterCommand || trimmed === query) {
        setSlashMenuOpen(true)
      } else {
        setSlashMenuOpen(false)
      }
    } else {
      setSlashMenuOpen(false)
      setSlashQuery('')
    }
  }, [input, setSlashMenuOpen])

  const handleSlashSelect = useCallback(
    (command: string) => {
      setInput(command + ' ')
      setSlashMenuOpen(false)
      inputRef.current?.focus()
    },
    [setSlashMenuOpen]
  )

  const insertCommand = useCallback(
    (command: string) => {
      setInput(command + ' ')
      inputRef.current?.focus()
    },
    []
  )

  useEffect(() => {
    (window as unknown as Record<string, unknown>).__chatInsertCommand = insertCommand
    return () => {
      delete (window as unknown as Record<string, unknown>).__chatInsertCommand
    }
  }, [insertCommand])

  const handleSend = useCallback(async () => {
    const trimmed = input.trim()
    if (!trimmed || !activeSessionId || isStreaming) return

    // If there's a pending Q&A interrupt and the user is sending a new command,
    // cancel the pending Q&A locally by marking the qa_questions message as
    // qa_cancelled. The backend will also mark it in DB and send a qa_cancelled
    // SSE event, but we do it eagerly here for immediate UI feedback.
    if (pendingInterrupt) {
      const messages = useMessageStore.getState().messages
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].type === 'qa_questions') {
          updateMessageType(messages[i].id, 'qa_cancelled')
          break
        }
      }
      setPendingInterrupt(false)
    }

    setInput('')
    setSlashMenuOpen(false)

    // Append user message to local messageStore immediately — no waiting
    // for the backend. This makes the user's message visible instantly.
    const userMessage: LocalMessage = {
      id: generateLocalId(),
      session_id: activeSessionId,
      role: 'user',
      type: 'text',
      content: trimmed,
      created_at: Date.now(),
      pending: true,
    }
    appendMessage(userMessage)

    try {
      // Errors are now persisted as error-type messages in the chat pane
      // by the SSE stream handler, so no toast-based error handling needed here.
      await streamChat(activeSessionId, { message: trimmed })
    } catch (err) {
      console.error('[ChatInput] Failed to send message:', err)
    }
  }, [input, activeSessionId, isStreaming, pendingInterrupt, streamChat, setSlashMenuOpen, appendMessage, updateMessageType, setPendingInterrupt])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
      if (e.key === 'Escape') {
        setSlashMenuOpen(false)
      }
    },
    [handleSend, setSlashMenuOpen]
  )

  useEffect(() => {
    const el = inputRef.current
    if (el) {
      el.style.height = 'auto'
      el.style.height = Math.min(el.scrollHeight, 120) + 'px'
    }
  }, [input])

  return (
    <div className="relative border-t border-border bg-card/50 p-3">
      <SlashMenu
        query={slashQuery}
        onSelect={handleSlashSelect}
        visible={slashMenuOpen}
      />

      <div className="flex items-end gap-2">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder='Describe your epic or ask follow-up questions... ("/" for commands)'
          rows={1}
          disabled={isStreaming}
          className="flex-1 resize-none rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-ring focus:ring-1 focus:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50"
        />
        {isStreaming ? (
          <Button
            size="icon"
            variant="destructive"
            className="h-8 w-8 shrink-0"
            onClick={cancelStream}
          >
            <Square className="h-3 w-3" />
          </Button>
        ) : (
          <Button
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={handleSend}
            disabled={!input.trim() || !activeSessionId}
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {pendingInterrupt && !isStreaming && (
        <p className="mt-1.5 text-[9px] text-amber-400">
          ⚠ Q&A is pending — answer above or type a new command to cancel
        </p>
      )}
    </div>
  )
}
