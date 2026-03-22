---
name: ticket-breakdown
description: "COMMAND: /ticket_breakdown — Break a validated technical plan into discrete, actionable implementation tickets. This skill is triggered when the user sends a message starting with /ticket_breakdown. It decomposes the Tech Plan into developer-assignable work items with clear scope, acceptance criteria, and dependency ordering."
metadata:
  command: /ticket_breakdown
  produces_artifact: true
  artifact_type: ticket
  can_edit_artifacts: []
  workflow_order: 7
  next_command: /validate_artifact
allowed-tools:
  - codebase-explorer
---

# Ticket Breakdown

## Overview

Decomposes a validated technical plan into a structured set of implementation tickets, each with clear scope, acceptance criteria, and dependency ordering suitable for developer assignment and sprint planning.

## Instructions

## Processing User Request

1. Infer the area to prioritize for tickets from the arguments.
2. Review specs (Epic Brief, Core Flows, Tech Plan) and identify natural work units.
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
  - **Spec references**: Link to relevant Epic Brief, Core Flows, Tech Plan sections
  - **Dependencies**: What must be completed first (if any)
5. Present the proposed ticket breakdown to the user.
  Use a mermaid diagram to visualize ticket dependencies for quick reference.
6. After presenting, offer refinement options (whatever are applicable and make sense):
  - Change ticket granularity (combine related work or split for parallel work/ clarity)
  - Reorganize dependencies or implementation order
  - Different grouping approach (by component, by flow, etc.)
7. Iterate based on feedback until the breakdown is right.

&nbsp;

## Output Format

<!-- TODO: Define the expected output format -->

## Workflow Context

- **Previous step:** `/validate_architecture`
- **Next step:** `/validate_artifact`
