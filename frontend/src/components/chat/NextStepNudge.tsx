import { Button } from '@/components/ui/button'
import { SLASH_COMMANDS } from '@/lib/commands'

interface NextStepNudgeProps {
  nextCommand: string
  onCommandClick: (command: string) => void
}

export function NextStepNudge({ nextCommand, onCommandClick }: NextStepNudgeProps) {
  const commandInfo = SLASH_COMMANDS.find((c) => c.name === nextCommand)

  return (
    <div className="rounded-lg border border-border bg-card px-2.5 py-2">
      <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
        Suggested Next Step
      </p>
      <Button
        variant="ghost"
        size="xs"
        onClick={() => onCommandClick(nextCommand)}
        className="bg-primary/15 text-[11px] font-medium text-primary hover:bg-primary/25"
      >
        {nextCommand}
        {commandInfo && (
          <span className="text-primary/60">— {commandInfo.description}</span>
        )}
      </Button>
    </div>
  )
}
