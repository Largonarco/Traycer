import { useState, useEffect, useMemo } from 'react'
import { ChevronDown, ChevronRight, Activity, Clock, CheckCircle, XCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MarkdownContent } from './MarkdownContent'


// ─── Persisted Data Shape ───────────────────────────────────────────────────
// This is the JSON structure stored in the `content` field of an
// `agent_activity` message. It captures a snapshot of the subagent lifecycle
// and tool results at the time the stream completed.

export interface PersistedToolCall {
  tool: string
  timestamp: number
}

export interface PersistedToolResult {
  tool: string
  path: string
  preview: string
  timestamp: number
}

export interface PersistedSubagent {
  id: string
  name: string
  description: string
  status: 'pending' | 'running' | 'complete' | 'error'
  tokenBuffer: string
  result: string | undefined
  error: string | undefined
  startedAt: number | undefined
  completedAt: number | undefined
  toolCalls: PersistedToolCall[]
  toolResults: PersistedToolResult[]
}

export interface AgentActivityData {
  subagents: PersistedSubagent[]
}

// ─── Live Data Shape (from stores) ──────────────────────────────────────────
// These mirror the store types so the component can accept either source.

export interface LiveSubagent {
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

// ─── Props ──────────────────────────────────────────────────────────────────

interface AgentActivityLiveProps {
  mode: 'live'
  subagents: LiveSubagent[]
  isSynthesizing: boolean
  isStreaming: boolean
  streamBuffer: string
}

interface AgentActivityPersistedProps {
  mode: 'persisted'
  data: AgentActivityData
}

type AgentActivityProps = AgentActivityLiveProps | AgentActivityPersistedProps

// ─── Component ──────────────────────────────────────────────────────────────

export function AgentActivity(props: AgentActivityProps) {
  const [expanded, setExpanded] = useState(false)
  const [wasStreaming, setWasStreaming] = useState(false)

  const isLive = props.mode === 'live'
  const isStreaming = isLive ? props.isStreaming : false
  const isSynthesizing = isLive ? props.isSynthesizing : false

  // Extract the relevant data sources so useMemo depends on specific
  // references rather than the entire props object (which changes every render
  // because it contains streamBuffer and other primitives).
  const sourceSubagents = isLive ? (props as AgentActivityLiveProps).subagents : null
  const persistedData = !isLive ? (props as AgentActivityPersistedProps).data : null

  const subagents: PersistedSubagent[] = useMemo(() => {
    if (persistedData) return persistedData.subagents
    if (!sourceSubagents) return []
    return sourceSubagents.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      status: s.status,
      tokenBuffer: s.tokenBuffer,
      result: s.result,
      error: s.error,
      startedAt: s.startedAt,
      completedAt: s.completedAt,
      toolCalls: s.toolCalls,
      toolResults: s.toolResults,
    }))
  }, [sourceSubagents, persistedData])

  const streamBuffer = isLive ? props.streamBuffer : ''

  const hasSubagents = subagents.length > 0
  const hasAnyContent = hasSubagents

  // Compute total tool activity across all subagents for the summary badge
  const totalToolCalls = subagents.reduce((sum, s) => sum + s.toolCalls.length + s.toolResults.length, 0)

  // Auto-expand when streaming starts and there's activity,
  // auto-collapse when streaming ends.
  useEffect(() => {
    if (!isLive) return
    if (isStreaming && hasAnyContent && !wasStreaming) {
      setExpanded(true)
      setWasStreaming(true)
    }
    if (!isStreaming && wasStreaming) {
      setExpanded(false)
      setWasStreaming(false)
    }
  }, [isLive, isStreaming, hasAnyContent, wasStreaming])

  if (!hasAnyContent) return null

  const completedCount = subagents.filter(
    (s) => s.status === 'complete' || s.status === 'error'
  ).length
  const totalSubagents = subagents.length
  const allSubagentsDone = totalSubagents > 0 && completedCount === totalSubagents && !isStreaming

  return (
    <div className="rounded-lg border border-border/60 bg-card/50">
      {/* ── Header — always visible ────────────────────────────────── */}
      <Button
        variant="ghost"
        onClick={() => setExpanded(!expanded)}
        className="flex h-auto w-full items-center gap-2 rounded-none rounded-t-lg px-3 py-2 text-left hover:bg-accent/50"
      >
        {expanded ? (
          <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
        )}
        <Activity className="h-3 w-3 shrink-0 text-muted-foreground" />
        <span className="flex-1 text-[11px] font-medium text-muted-foreground">
          Agent Activity
        </span>

        {/* Summary badges */}
        {hasSubagents && (
          <span
            className={`text-[9px] font-medium ${
              allSubagentsDone ? 'text-emerald-400' : 'text-primary'
            }`}
          >
            {completedCount}/{totalSubagents} subagent
            {totalSubagents !== 1 ? 's' : ''}
            {totalToolCalls > 0 && ` · ${totalToolCalls} tool call${totalToolCalls !== 1 ? 's' : ''}`}
          </span>
        )}
        {isStreaming && (
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
        )}
      </Button>

      {/* ── Collapsible body ───────────────────────────────────────── */}
      {expanded && (
        <div className="space-y-2 border-t border-border/40 px-3 py-2">
          {/* Subagent progress bar */}
          {hasSubagents && (
            <SubagentProgressInline
              completed={completedCount}
              total={totalSubagents}
            />
          )}

          {/* Subagent cards */}
          {subagents.map((subagent) => (
            <SubagentCardInline key={subagent.id} subagent={subagent} isLive={isLive} />
          ))}

          {/* Synthesizing indicator */}
          {isSynthesizing && hasSubagents && (
            <div className="flex items-center gap-2 rounded-lg bg-primary/10 px-2.5 py-1.5 text-[11px] font-medium text-primary">
              <Loader2 className="h-2.5 w-2.5 animate-spin" />
              Synthesizing results from {totalSubagents} subagent
              {totalSubagents !== 1 ? 's' : ''}…
            </div>
          )}

          {/* Live streaming buffer (main agent tokens while inside activity) */}
          {isStreaming && streamBuffer && (
            <div className="rounded bg-background p-2 text-[11px] text-foreground/80">
              <p className="whitespace-pre-wrap wrap-break-word">{streamBuffer}</p>
              <span className="inline-block h-3 w-0.5 animate-pulse bg-primary" />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Inline Subagent Progress Bar ───────────────────────────────────────────

function SubagentProgressInline({
  completed,
  total,
}: {
  completed: number
  total: number
}) {
  const pct = total > 0 ? (completed / total) * 100 : 0

  return (
    <div className="flex items-center gap-2">
      <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[9px] text-muted-foreground">
        {completed}/{total}
      </span>
    </div>
  )
}

// ─── Inline Subagent Card ───────────────────────────────────────────────────

const statusConfig = {
  pending: { icon: Clock, label: 'Pending', classes: 'text-muted-foreground bg-muted' },
  running: { icon: Loader2, label: 'Running', classes: 'text-primary bg-primary/15' },
  complete: { icon: CheckCircle, label: 'Complete', classes: 'text-emerald-400 bg-emerald-500/15' },
  error: { icon: XCircle, label: 'Error', classes: 'text-destructive bg-destructive/15' },
}

function SubagentCardInline({
  subagent,
  isLive,
}: {
  subagent: PersistedSubagent
  isLive: boolean
}) {
  const [cardExpanded, setCardExpanded] = useState(false)

  const elapsed =
    subagent.startedAt != null
      ? ((subagent.completedAt ?? (isLive ? Date.now() : subagent.startedAt)) -
          subagent.startedAt) /
        1000
      : 0
  const elapsedStr = elapsed > 0 ? `${elapsed.toFixed(0)}s` : ''

  const config = statusConfig[subagent.status]
  const StatusIcon = config.icon

  const displayContent =
    subagent.status === 'complete'
      ? (subagent.result ?? '') || subagent.tokenBuffer
      : subagent.tokenBuffer

  return (
    <div className="rounded-lg border border-border bg-card">
      <Button
        variant="ghost"
        onClick={() => setCardExpanded(!cardExpanded)}
        className="flex h-auto w-full items-center gap-2 rounded-none px-3 py-2 text-left"
      >
        {cardExpanded ? (
          <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
        )}
        <div className="flex flex-1 items-center gap-2 overflow-hidden">
          <span className="truncate text-[11px] font-medium text-foreground">
            {subagent.name}
          </span>
          <span
            className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-medium ${config.classes}`}
          >
            <StatusIcon
              className={`h-2.5 w-2.5 ${subagent.status === 'running' ? 'animate-spin' : ''}`}
            />
            {config.label}
          </span>
          {elapsedStr && (
            <span className="text-[9px] text-muted-foreground">{elapsedStr}</span>
          )}
        </div>
      </Button>

      {cardExpanded && (
        <div className="border-t border-border px-3 py-2">
          {subagent.description && (
            <p className="mb-1.5 text-[10px] text-muted-foreground">
              {subagent.description}
            </p>
          )}

          {/* Tool calls */}
          {subagent.toolCalls.length > 0 && (
            <div className="mb-1.5 space-y-0.5">
              <p className="text-[9px] font-medium text-muted-foreground/80">Tool calls:</p>
              {subagent.toolCalls.map((tc, i) => (
                <div
                  key={i}
                  className="flex items-center gap-1 text-[9px] text-muted-foreground/60"
                >
                  <span className="font-mono">{tc.tool}</span>
                </div>
              ))}
            </div>
          )}

          {/* Tool results */}
          {subagent.toolResults.length > 0 && (
            <div className="mb-1.5 space-y-0.5">
              <p className="text-[9px] font-medium text-muted-foreground/80">Results:</p>
              {subagent.toolResults.map((tr, i) => (
                <div
                  key={i}
                  className="flex items-center gap-1 text-[9px] text-muted-foreground/60"
                >
                  <span className="font-mono">{tr.tool}</span>
                  {tr.path && (
                    <span className="truncate font-mono">→ {tr.path}</span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Token buffer / result content */}
          {displayContent && (
            <div className="max-h-32 overflow-y-auto rounded bg-background p-2 text-[11px] text-foreground/80">
              <p className="whitespace-pre-wrap wrap-break-word">
                {displayContent}
              </p>
              {isLive && subagent.status === 'running' && (
                <span className="inline-block h-3 w-0.5 animate-pulse bg-primary" />
              )}
            </div>
          )}

          {/* Error display */}
          {subagent.error != null && subagent.error !== '' && (
            <p className="mt-1 wrap-anywhere text-[11px] text-destructive">{subagent.error}</p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Parses the JSON content of an `agent_activity` message into typed data.
 * Returns null if parsing fails.
 */
export function parseAgentActivityContent(content: string): AgentActivityData | null {
  try {
    const parsed = JSON.parse(content)
    if (parsed && Array.isArray(parsed.subagents)) {
      return parsed as AgentActivityData
    }
  } catch {
    // Invalid JSON
  }
  return null
}

/**
 * Builds the `AgentActivityData` payload to persist as a message's content.
 * Call this when a stream completes (done/error) to snapshot the live state.
 */
export function buildAgentActivityContent(
  subagents: LiveSubagent[]
): AgentActivityData {
  return {
    subagents: subagents.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      status: s.status,
      tokenBuffer: s.tokenBuffer,
      result: s.result,
      error: s.error,
      startedAt: s.startedAt,
      completedAt: s.completedAt,
      toolCalls: s.toolCalls.map((tc) => ({ tool: tc.tool, timestamp: tc.timestamp })),
      toolResults: s.toolResults.map((tr) => ({
        tool: tr.tool,
        path: tr.path,
        preview: tr.preview,
        timestamp: tr.timestamp,
      })),
    })),
  }
}
