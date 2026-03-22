import { filterCommands, type SlashCommand } from '@/lib/commands'
import { useUIStore } from '@/stores/uiStore'
import { Button } from '@/components/ui/button'

interface SlashMenuProps {
  query: string
  onSelect: (command: string) => void
  visible: boolean
}

export function SlashMenu({ query, onSelect, visible }: SlashMenuProps) {
  const pendingInterrupt = useUIStore((s) => s.pendingInterrupt)

  if (!visible) return null

  const filtered = filterCommands(query)
  if (filtered.length === 0) return null

  return (
    <div className="absolute bottom-full left-0 right-0 mb-1 overflow-hidden rounded-lg border border-border bg-popover shadow-xl">
      {pendingInterrupt && (
        <div className="border-b border-border bg-amber-500/10 px-2.5 py-1 text-[9px] text-amber-400">
          ⚠ Selecting a command will cancel the pending Q&A
        </div>
      )}
      <div className="max-h-[300px] overflow-y-auto py-1">
        {filtered.map((cmd: SlashCommand) => (
          <Button
            key={cmd.name}
            variant="ghost"
            className="flex h-auto w-full items-center justify-start gap-3 rounded-none px-3 py-2"
            onClick={() => onSelect(cmd.name)}
          >
            <span className="flex h-4 w-4 items-center justify-center rounded bg-muted text-[9px] font-medium text-muted-foreground">
              {cmd.number}
            </span>
            <div className="flex flex-col items-start">
              <span className="text-xs font-medium text-foreground">{cmd.name}</span>
              <span className="text-[10px] text-muted-foreground">{cmd.description}</span>
            </div>
          </Button>
        ))}
      </div>
    </div>
  )
}
