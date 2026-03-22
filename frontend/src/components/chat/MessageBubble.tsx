import { memo } from 'react'
import { FileText, AlertCircle, Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useUIStore } from '@/stores/uiStore'
import { MarkdownContent } from './MarkdownContent'

interface MessageBubbleProps {
  role: string
  content: string
}

export const MessageBubble = memo(function MessageBubble({ role, content }: MessageBubbleProps) {
  const isUser = role === 'user'

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-lg px-2.5 py-1.5 text-xs ${
          isUser
            ? 'bg-primary/15 text-foreground'
            : 'bg-card text-foreground'
        }`}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap wrap-break-word">{content}</p>
        ) : (
          <MarkdownContent content={content} />
        )}
      </div>
    </div>
  )
})

interface ErrorBubbleProps {
  content: string
}

export const ErrorBubble = memo(function ErrorBubble({ content }: ErrorBubbleProps) {
  const setSettingsOpen = useUIStore((s) => s.setSettingsOpen)
  let errorData: { code?: string; message?: string } = {}
  try {
    errorData = JSON.parse(content)
  } catch {
    errorData = { message: content }
  }

  const isCredentialError = errorData.code === 'credential_failure'

  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] overflow-hidden rounded-lg border border-destructive/30 bg-destructive/10 px-2.5 py-1.5 text-xs">
        <div className="flex items-start gap-2">
          <AlertCircle className="mt-0.5 h-3 w-3 shrink-0 text-destructive" />
          <div className="flex min-w-0 flex-col gap-1">
            <span className="wrap-anywhere text-destructive">{errorData.message || 'An error occurred'}</span>
            {isCredentialError && (
              <Button
                variant="ghost"
                size="xs"
                onClick={() => setSettingsOpen(true)}
                className="h-auto px-1 py-0 text-[11px] text-muted-foreground hover:text-foreground"
              >
                <Settings className="h-2.5 w-2.5" />
                Open Settings
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
})

interface ArtifactRefBubbleProps {
  content: string
  onArtifactClick: (artifactId: string) => void
}

export const ArtifactRefBubble = memo(function ArtifactRefBubble({ content, onArtifactClick }: ArtifactRefBubbleProps) {
  let refData: { artifactId?: string; versionNumber?: number; action?: string } = {}
  try {
    refData = JSON.parse(content)
  } catch {
    return null
  }
  if (!refData.artifactId) return null

  const actionText = refData.action === 'created' ? 'Created' : 'Updated'

  return (
    <div className="flex justify-start">
      <Button
        variant="outline"
        size="xs"
        onClick={() => onArtifactClick(refData.artifactId!)}
        className="max-w-[85%] gap-2 text-left"
      >
        <FileText className="h-3 w-3 shrink-0 text-primary" />
        <span className="text-[11px] text-foreground">
          {actionText} artifact
          {refData.versionNumber != null && (
            <span className="text-[11px] text-muted-foreground"> · v{refData.versionNumber}</span>
          )}
        </span>
      </Button>
    </div>
  )
}, (prevProps, nextProps) => prevProps.content === nextProps.content)

interface ToolResultLineProps {
  tool: string
  path: string
}

export const ToolResultLine = memo(function ToolResultLine({ tool, path }: ToolResultLineProps) {
  return (
    <div className="flex items-center gap-1.5 py-0.5 text-[10px] text-muted-foreground/70">
      <span className="font-mono">{tool}</span>
      {path && (
        <>
          <span className="text-muted-foreground/40">→</span>
          <span className="truncate font-mono text-muted-foreground/50">{path}</span>
        </>
      )}
    </div>
  )
})
