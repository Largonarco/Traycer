---
name: ticket-breakdown
description: "COMMAND: /ticket_breakdown — Break a validated technical plan into discrete, actionable implementation tickets. This skill is triggered when the user sends a message starting with /ticket_breakdown. It decomposes the Tech Plan into developer-assignable work items with a clear title, scope, spec references, and dependency ordering. Each ticket is its own separate artifact. This is step 7 of 9 in the workflow, following /validate_architecture."
metadata:
  command: /ticket_breakdown
  produces_artifact: true
  artifact_type: ticket
  can_edit_artifacts: []
  workflow_order: 7
  next_command: /validate_artifact
allowed-tools:
  - codebase-explorer
  - artifact-editor
  - ask_clarification_questions
  - read_artifact
---

# Ticket Breakdown

## Overview

Decomposes a validated technical plan into a structured set of implementation tickets, each with clear scope, acceptance criteria, and dependency ordering suitable for developer assignment and sprint planning.

## Instructions

## Processing User Request

1. Infer the area to prioritize for tickets from the arguments.
2. Review specs (PRD, Core Flows, Tech Plan) and identify natural work units.
3. Apply best judgment to create ticket breakdown:
  Consider:
  - How to group work (by component, by flow, by layer)
  - What dependencies exist between pieces of work
  - What order makes sense for implementation
   Prefer coarse groupings:
  - Group by component or layer, not by individual function
  - Group by flow, not by step
  - Each ticket should be story-sized-meaningful work, not a single function
   Anti-pattern: Do NOT over-breakdown. The minimal least set of tickets is better than multiple small ones.
4. Draft tickets using best judgment:
  For each ticket:
  - **Title**: Action-oriented
  - **Scope**: What's included, what's explicitly out
  - **Spec references**: Link to relevant PRD, Core Flows, Tech Plan sections
  - **Dependencies**: What must be completed first (if any)
5. Present the proposed ticket breakdown to the user.
  Use a mermaid diagram to visualize ticket dependencies for quick reference.
6. After presenting, offer refinement options (whatever are applicable and make sense):
  - Change ticket granularity (combine related work or split for parallel work/ clarity)
  - Reorganize dependencies or implementation order
  - Different grouping approach (by component, by flow, etc.)
7. Iterate based on feedback until the breakdown is right.

## Acceptance Criteria

- All tickets must be individual seperate artifacts with the type as "ticket" and not cramped in a single ticket artifact.
- All tickets must have detailed descriptions of what needs to be done.

&nbsp;

## Output Format Instructions

When generating the actual artifact using the `artifact-editor` tool, pay strict attention that you draft the artifact professionaly like a report, conversational messages have no place in the actual artifact content. 
Every individual ticket must have it's own ticket artifact with variations in name such as: T1, T2, T3, T4, etc.
Other than this, no format is enforced.

## Workflow Order Note

The command sequence (trigger → prd → flows → validate_prd → tech_plan → validate_architecture → ticket_breakdown → validate_artifact → revise_requirements) is the **intended** order, not a strict gate. The user is always in control — they can run any command at any time, skip steps, re-run earlier steps, or jump ahead. Always execute the requested command without complaint, then gently suggest the typical next step as a recommendation.

## Workflow Context

- **Previous step:** `/validate_architecture` (recommended)
- **Next step:** `/validate_artifact` (recommended)
