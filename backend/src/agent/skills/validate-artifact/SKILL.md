---
name: validate-artifact
description: "COMMAND: /validate_artifact — Perform a final cross-cutting validation pass on all generated artifacts (PRD, Core Flows, Tech Plan, Ticket Breakdown) to ensure consistency, completeness, and correctness across artifact boundaries before implementation begins. Activate this skill when the user sends a message starting with /validate_artifact. This is step 8 of 9 in the workflow, following /ticket_breakdown."
metadata:
  command: /validate_artifact
  produces_artifact: false
  artifact_type: null
  can_edit_artifacts: [PRD, Flows, Tech Plan, Ticket Breakdown]
  workflow_order: 8
  next_command: /revise_requirements
allowed-tools:
  - codebase-explorer
  - artifact-editor
---

# Validate Artifact

## Overview

Performs a comprehensive final validation pass across all generated artifacts — PRD, Core Flows, Technical Plan, and Ticket Breakdown — to ensure they are internally consistent, complete, and ready for implementation.

## Instructions

## Role

Reviewer who validates consistency across artifact boundaries — the seams where specs connect with each other and where tickets derive from specs.

**Focus on:**

- Cross-cutting analysis — how specs relate to each other, not internal quality of individual specs
- The joints between specs, not re-reviewing their internals (that's what the existing prd-validation and architecture-validation commands already do)
- Grounding findings in specific references — cite which spec says what, not vague assessments
- Calibrating the depth of interaction to the significance of the finding

## Core Philosophy

This command answers one question: "Are the artifacts in a state we can confidently act on?"

Specs are the source of truth — ground those first. Tickets are derivatives — check them against the grounded specs. The effort is front-loaded in analysis, not in conversation. Read deeply, cross-reference thoroughly, form conclusions — then present.

## Processing User Request

### 1. Internalize All Artifacts

Read and internalize the Epic Brief, Core Flows, Tech Plan, and any existing tickets. Build a mental model of how the specs connect — what concepts flow across spec boundaries, where one spec depends on or references another, where assumptions in one spec constrain decisions in another. Tickets provide additional context for the full picture.

### 2. Cross-Referential Analysis

Analyze the specs against these dimensions, focusing on the boundaries between them. Tickets can serve as additional signal here — a ticket referencing a concept absent from specs, or implementing a descoped flow, hints at drift worth investigating in the specs themselves.

**Conceptual Consistency** — The same concepts, entities, and terms should be described compatibly across all specs. Watch for terminology drift (same thing, different names) and contradictory characterizations (Brief scopes a feature to admin users, but a Core Flow shows a regular user performing it).

**Coverage Traceability** — Trace bidirectionally: requirements in the Brief should have corresponding flows and technical support. Tech decisions should trace back to a requirement. Orphans in either direction — a requirement with no flow, a tech decision solving an unstated problem — are findings.

**Interface Alignment** — Where specs meet, they should agree on the contract. Data that flows reference should exist in the data model. Interactions described in flows should have corresponding components in the Tech Plan. State transitions implied by flows should be architecturally supported.

**Specificity** — Identify areas where a downstream implementation agent would be forced to make a design decision because the spec hand-waves. Vague descriptions, unresolved decision points, placeholder-level content that pushes real decisions to implementation time.

**Assumption Coherence** — Constraints and assumptions stated or implied in one spec shouldn't contradict decisions in another. If the Brief assumes real-time updates but the Tech Plan designs a batch processing approach, that's a finding.

Categorize findings by significance. Use your judgment — the classification is yours to make based on the nature of each finding.

### 3. Present Findings

Lead with your overall assessment — do the specs tell one coherent story or not, and why? Give the user the diagnosis before the details.

Then walk through the findings. Lead with what matters most — the things that would cause real confusion or wrong implementation if left unresolved. For each significant finding, explain what the inconsistency is, cite the specific specs involved, and why it matters for downstream work. For findings that need user judgment, present interview questions.

For minor fixes (naming drift, trivial wording inconsistencies), group them together concisely with your proposed corrections and let the user approve them as a batch.

Consolidate related findings — if two issues stem from the same root cause, present them as one finding, not two. Every finding you present should be distinct.

### 4. Update Specs

Based on resolutions from the user:

- Make targeted updates to the affected specs
- When updating one spec, verify the change doesn't introduce new inconsistencies with other specs
- Keep changes surgical — don't rewrite sections that are fine

### 5. Ticket Reconciliation

If no tickets exist, skip to step 6.

With specs now grounded, compare each ticket against the updated specs. Look for:

- Tickets whose scope or description references outdated decisions, superseded architecture, or stale terminology
- Tickets for work that has been descoped or is no longer relevant
- Missing tickets — new scope in the specs that no existing ticket covers
- Tickets whose dependencies have shifted because the specs changed
- Tickets that need splitting (one ticket spans what are now clearly separate concerns) or merging (multiple tickets cover what is now one cohesive piece of work)

Apply best judgment to update, create, or obsolete tickets as needed. Then present what was done — what changed and why. If any in-progress or completed tickets were modified, flag those explicitly since they represent work already underway. The user can refine from there.

If the drift is so extensive that the ticket set needs to be reconceived from scratch rather than patched, suggest re-running ticket-breakdown instead of trying to reconcile incrementally.

### 6. Suggest Next Steps

- If tickets were reconciled: the artifacts are now holistically consistent — specs and tickets are aligned. Suggest proceeding to execution.
- If no tickets exist: suggest ticket-breakdown to create tickets from the now-consistent specs.
- If ticket-breakdown was recommended over incremental reconciliation: suggest that as the next step.

## Acceptance Criteria

- Cross-spec consistency has been evaluated across all analysis dimensions
- Findings that need user judgment have been resolved through clarification
- Minor fixes have been approved and applied
- Affected specs have been updated with targeted, consistent changes
- Specs tell one coherent story
- If tickets exist, they have been reconciled against the grounded specs
- The user can confidently act on the current artifact state

&nbsp;

## Output Format

<!-- TODO: Define the expected output format -->

## Workflow Context

- **Previous step:** `/ticket_breakdown`
- **Next step:** `/revise_requirements` (if issues are found, otherwise workflow is complete)
