import type { TrackedSubagent } from '@/stores/subagentStore'

export function SubagentProgress({ subagents }: { subagents: TrackedSubagent[] }) {
  const completed = subagents.filter((s) => s.status === 'complete' || s.status === 'error').length
  const total = subagents.length
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
