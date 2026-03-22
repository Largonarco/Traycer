import { Loader2 } from 'lucide-react'

export function SynthesizingIndicator({ subagentCount }: { subagentCount: number }) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-primary/10 px-2.5 py-1.5 text-[11px] font-medium text-primary">
      <Loader2 className="h-2.5 w-2.5 animate-spin" />
      Synthesizing results from {subagentCount} subagent{subagentCount !== 1 ? 's' : ''}…
    </div>
  )
}
