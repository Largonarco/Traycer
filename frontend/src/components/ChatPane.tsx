import { useCallback } from 'react'
import { useSessionStore } from '@/stores/sessionStore'
import { useUIStore } from '@/stores/uiStore'
import { useSessions } from '@/hooks/useQueries'
import { MessageList } from '@/components/chat/MessageList'
import { ChatInput } from '@/components/chat/ChatInput'
import { Separator } from '@/components/ui/separator'

export function ChatPane() {
  const activeSessionId = useSessionStore((s) => s.activeSessionId)
  const { data: sessions } = useSessions()
  const activeSession = sessions?.find((s) => s.id === activeSessionId)

  const insertCommand = useUIStore((s) => s.insertCommand)
  const handleCommandInsert = useCallback((command: string) => {
    insertCommand(command)
  }, [insertCommand])

  return (
    <div className="flex h-full w-full flex-col overflow-hidden border-l border-border bg-card/30">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2">
        <div className="flex flex-col">
          <h2 className="text-xs font-semibold text-foreground">
            {activeSession?.name ?? 'Chat'}
          </h2>
          {activeSessionId && (
            <span className="text-[9px] text-muted-foreground">Session active</span>
          )}
        </div>
      </div>
      <Separator />

      {/* Messages */}
      <MessageList onCommandInsert={handleCommandInsert} />

      {/* Input */}
      <ChatInput />
    </div>
  )
}
