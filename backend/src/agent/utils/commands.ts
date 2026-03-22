// ─── Command Registry ───────────────────────────────────────────────────────
// Single source of truth for all slash command behavior.
// The Chat Router reads from this to determine execution behavior.

export interface CommandDescriptor {
  name: string;
  skillName: string;
  producesArtifact: boolean;
  canEditArtifacts: string[];
  artifactType: "spec" | "ticket" | null;
}

const PRD: CommandDescriptor = {
  name: "/prd",
  skillName: "prd",
  artifactType: "spec",
  canEditArtifacts: [],
  producesArtifact: true,
};

const FLOWS: CommandDescriptor = {
  name: "/flows",
  skillName: "flows",
  artifactType: "spec",
  canEditArtifacts: [],
  producesArtifact: true,
};

const TRIGGER: CommandDescriptor = {
  name: "/trigger",
  artifactType: null,
  canEditArtifacts: [],
  skillName: "trigger",
  producesArtifact: false,
};

const TECH_PLAN: CommandDescriptor = {
  name: "/tech_plan",
  artifactType: "spec",
  canEditArtifacts: [],
  producesArtifact: true,
  skillName: "tech-plan",
};

const VALIDATE_PRD: CommandDescriptor = {
  artifactType: null,
  name: "/validate_prd",
  producesArtifact: false,
  skillName: "validate-prd",
  canEditArtifacts: ["PRD", "Flows"],
};

const TICKET_BREAKDOWN: CommandDescriptor = {
  canEditArtifacts: [],
  producesArtifact: true,
  artifactType: "ticket",
  name: "/ticket_breakdown",
  skillName: "ticket-breakdown",
};

const VALIDATE_ARTIFACT: CommandDescriptor = {
  artifactType: null,
  producesArtifact: false,
  name: "/validate_artifact",
  skillName: "validate-artifact",
  canEditArtifacts: ["PRD", "Flows", "Tech Plan", "Ticket Breakdown"],
};

const VALIDATE_ARCHITECTURE: CommandDescriptor = {
  artifactType: null,
  producesArtifact: false,
  name: "/validate_architecture",
  skillName: "validate-architecture",
  canEditArtifacts: ["PRD", "Flows", "Tech Plan"],
};

const REVISE_REQUIREMENTS: CommandDescriptor = {
  artifactType: null,
  producesArtifact: false,
  name: "/revise_requirements",
  skillName: "revise-requirements",
  canEditArtifacts: ["PRD", "Flows", "Tech Plan", "Ticket Breakdown"],
};

// ─── Registry ───────────────────────────────────────────────────────────────

const COMMAND_MAP: ReadonlyMap<string, CommandDescriptor> = new Map([
  [PRD.name, PRD],
  [FLOWS.name, FLOWS],
  [TRIGGER.name, TRIGGER],
  [TECH_PLAN.name, TECH_PLAN],
  [VALIDATE_PRD.name, VALIDATE_PRD],
  [TICKET_BREAKDOWN.name, TICKET_BREAKDOWN],
  [VALIDATE_ARTIFACT.name, VALIDATE_ARTIFACT],
  [REVISE_REQUIREMENTS.name, REVISE_REQUIREMENTS],
  [VALIDATE_ARCHITECTURE.name, VALIDATE_ARCHITECTURE],
]);

/**
 * The intended command sequence (nudge order).
 * Users can execute out of order, but the system nudges this sequence.
 */
export const COMMAND_SEQUENCE: readonly string[] = [
  "/trigger",
  "/prd",
  "/flows",
  "/validate_prd",
  "/tech_plan",
  "/validate_architecture",
  "/ticket_breakdown",
  "/validate_artifact",
  "/revise_requirements",
] as const;

/**
 * Look up a command descriptor by name.
 * Returns undefined if the command is not recognized.
 */
export function getCommand(name: string): CommandDescriptor | undefined {
  return COMMAND_MAP.get(name);
}

/**
 * Returns all command descriptors in the intended sequence order.
 */
export function getAllCommands(): CommandDescriptor[] {
  return COMMAND_SEQUENCE.map((name) => COMMAND_MAP.get(name)!);
}

/**
 * Check whether a given string is a recognized slash command.
 */
export function isSlashCommand(text: string): boolean {
  const command = text.trim().split(/\s/)[0];

  return COMMAND_MAP.has(command);
}

/**
 * Extract the command name from a user message.
 * Returns the command name (e.g. "/prd") or null if not a command.
 */
export function extractCommandName(text: string): string | null {
  const command = text.trim().split(/\s/)[0];

  return COMMAND_MAP.has(command) ? command : null;
}

/**
 * Determine the suggested next command based on the last executed command.
 * Returns the next command name in the sequence, or null if at the end.
 */
export function getNextCommand(currentCommand: string): string | null {
  const idx = COMMAND_SEQUENCE.indexOf(currentCommand);

  if (idx === -1 || idx >= COMMAND_SEQUENCE.length - 1) return null;
  return COMMAND_SEQUENCE[idx + 1];
}
