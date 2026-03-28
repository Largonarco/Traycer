export interface SlashCommand {
  name: string
  label: string
  number: number
  description: string
}

export const SLASH_COMMANDS: SlashCommand[] = [
  { name: '/trigger', label: 'Trigger', description: 'Analyze request & explore codebase', number: 1 },
  { name: '/prd', label: 'PRD', description: 'Generate Product Requirements Document', number: 2 },
  { name: '/flows', label: 'Core Flows', description: 'Generate Core Flows document', number: 3 },
  { name: '/validate_prd', label: 'Validate PRD', description: 'Review PRD & Core Flows for gaps', number: 4 },
  { name: '/tech_plan', label: 'Tech Plan', description: 'Generate Technical Plan', number: 5 },
  { name: '/validate_architecture', label: 'Validate Architecture', description: 'Review all specs for soundness', number: 6 },
  { name: '/ticket_breakdown', label: 'Ticket Breakdown', description: 'Break plan into implementation tickets', number: 7 },
  { name: '/validate_artifact', label: 'Validate Artifact', description: 'Final validation pass on all artifacts', number: 8 },
  { name: '/revise_requirements', label: 'Revise Requirements', description: 'Revise based on new context', number: 9 },
]

export function filterCommands(query: string): SlashCommand[] {
  if (!query || query === '/') return SLASH_COMMANDS
  const lower = query.toLowerCase().replace(/^\//, '')
  return SLASH_COMMANDS.filter(
    (cmd) =>
      cmd.name.toLowerCase().includes(lower) ||
      cmd.label.toLowerCase().includes(lower) ||
      cmd.description.toLowerCase().includes(lower)
  )
}
