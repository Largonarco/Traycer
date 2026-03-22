import { useState } from 'react'
import { ChevronDown, ChevronRight, Clock, CheckCircle, XCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { TrackedSubagent } from '@/stores/subagentStore'

interface SubagentCardProps {
  subagent: TrackedSubagent
}

export function SubagentCard({ subagent }: SubagentCardProps) {
  const [expanded, setExpanded] = useState(false)

  const elapsed = subagent.startedAt != null
    ? (((subagent.completedAt ?? Date.now()) - subagent.startedAt) / 1000)
    : 0
  const elapsedStr = elapsed > 0 ? `${elapsed.toFixed(0)}s` : ''

  const statusConfig = {
    pending: { icon: Clock, label: 'Pending', classes: 'text-muted-foreground bg-muted' },
    running: { icon: Loader2, label: 'Running', classes: 'text-primary bg-primary/15' },
    complete: { icon: CheckCircle, label: 'Complete', classes: 'text-emerald-400 bg-emerald-500/15' },
    error: { icon: XCircle, label: 'Error', classes: 'text-destructive bg-destructive/15' },
  }

  const config = statusConfig[subagent.status]
  const StatusIcon = config.icon

  const displayContent = subagent.status === 'complete'
    ? (subagent.result ?? '') || subagent.tokenBuffer
    : subagent.tokenBuffer

  return (
    <div className="rounded-lg border border-border bg-card">
      <Button
        variant="ghost"
        onClick={() => setExpanded(!expanded)}
        className="flex h-auto w-full items-center gap-2 rounded-none px-3 py-2 text-left"
      >
        {expanded ? (
          <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
        )}
        <div className="flex flex-1 items-center gap-2 overflow-hidden">
          <span className="truncate text-[11px] font-medium text-foreground">{subagent.name}</span>
          <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-medium ${config.classes}`}>
            <StatusIcon className={`h-2.5 w-2.5 ${subagent.status === 'running' ? 'animate-spin' : ''}`} />
            {config.label}
          </span>
          {elapsedStr && (
            <span className="text-[9px] text-muted-foreground">{elapsedStr}</span>
          )}
        </div>
      </Button>

      {expanded && (
        <div className="border-t border-border px-3 py-2">
          {subagent.description && (
            <p className="mb-1.5 text-[10px] text-muted-foreground">{subagent.description}</p>
          )}
          {subagent.toolResults.length > 0 && (
            <div className="mb-1.5 space-y-0.5">
              {subagent.toolResults.map((tr, i) => (
                <div key={i} className="flex items-center gap-1 text-[9px] text-muted-foreground/60">
                  <span className="font-mono">{tr.tool}</span>
                  {tr.path && <span className="truncate font-mono">→ {tr.path}</span>}
                </div>
              ))}
            </div>
          )}
          {displayContent && (
            <div className="max-h-32 overflow-y-auto rounded bg-background p-2 text-[11px] text-foreground/80">
              <p className="whitespace-pre-wrap break-words">{displayContent}</p>
              {subagent.status === 'running' && (
                <span className="inline-block h-3 w-0.5 animate-pulse bg-primary" />
              )}
            </div>
          )}
          {subagent.error != null && subagent.error !== '' && (
            <p className="mt-1 text-[11px] text-destructive">{subagent.error}</p>
          )}
        </div>
      )}
    </div>
  )
}
