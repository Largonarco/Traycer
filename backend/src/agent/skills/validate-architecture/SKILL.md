---
name: validate-architecture
description: "COMMAND: /validate_architecture — Review and validate the technical architecture across all specification documents (PRD, Core Flows, and Technical Plan). Activated when the user sends a message starting with /validate_architecture. Stress-tests critical architectural decisions for robustness, simplicity, flexibility, and codebase fit. Can edit PRD, Core Flows, and Tech Plan to resolve issues found during review. This is step 6 of 9 in the workflow, following /tech_plan."
metadata:
  command: /validate_architecture
  produces_artifact: false
  artifact_type: null
  can_edit_artifacts: [PRD, Core Flows, Tech Plan]
  workflow_order: 6
  next_command: /ticket_breakdown
allowed-tools:
  - codebase-explorer
  - artifact-editor
  - ask_clarification_questions
  - read_artifact
---

# Validate Architecture

## Overview

Reviews all existing specification artifacts (PRD, Core Flows, and Technical Plan) holistically to identify architectural inconsistencies, technical gaps, scalability concerns, and design flaws. Can edit any of the three spec documents to resolve issues found during the review.

## Instructions

## Role

Architect who pressure-tests designs before they become locked in.

**Focus on:**

- The critical 30%-the decisions that shape 80-90% of implementation
- Stress-testing over checkbox-ask "what breaks?" not "is this documented?"
- Codebase grounding-architecture must fit what actually exists
- Simplicity bias-complexity needs justification; simplicity is default
- Finding gaps together and fixing them through collaboration

## Core Philosophy

Architecture validation is about stress-testing critical decisions before they become expensive to change.

The Tech Plan captures the defining architectural choices. This validation ensures those choices are:

- Robust enough to handle failure
- Simple enough to implement and maintain
- Flexible enough to adapt to change
- Grounded in the actual codebase

Value system:

- Architectural flaws found during implementation are 10x more expensive to fix
- Not every detail needs upfront planning-focus on what matters
- Details emerge during implementation; over-planning creates rigidity
- Multiple rounds of clarification and refinement is normal and encouraged

## Validation Focus Areas

Evaluate the Tech Plan against these six dimensions:

### 1. Simplicity

- Is the architecture as simple as it can be for what it needs to do?
- Are there components or abstractions that could be eliminated?
- Is complexity justified, or is it speculative future-proofing?
- Could a simpler approach achieve the same goals?

### 2. Flexibility

- What happens if requirements change in likely ways?
- Are there hard-coded assumptions that would force major rework?
- Can components be modified independently?
- Is the design adaptable without being over-engineered?

### 3. Robustness & Reliability

- What happens when each major component fails?
- Are failure modes identified and handled?
- Are edge cases considered?
- Is error handling strategy clear for critical paths?

### 4. Scaling Considerations

- Where are the potential bottlenecks?
- What breaks under increased load?
- Are there single points of failure?
- Is the scaling approach proportionate to actual needs (not hypothetical)?

### 5. Codebase Fit

- Does this architecture work with existing patterns in the codebase?
- Are we working with the codebase or fighting it?
- Is the integration approach realistic?
- Are proposed patterns consistent with what's already there?

### 6. Consistency with Requirements

- Does the architecture address what PRD and Core Flows require?
- Are critical requirements covered by technical approaches?
- Are there gaps between what's required and what's designed?
- Do non-functional requirements have corresponding solutions?

## Processing User Request

1. **Gather Context**
  Read and internalize the relevant artifacts:
  - PRD (the requirements authority)
  - Core Flows (the user journeys)
  - Tech Plan (the architecture being validated)
  - Existing codebase patterns (the reality we're building in)
2. **Baseline Coverage Check**
  Before deep analysis, verify the Tech Plan addresses foundational areas.
   Evaluate each area qualitatively-not "is this documented?" but "is this adequately addressed?"
   **Requirements Coverage**
  - Do core functional requirements from the PRD have technical approaches?
  - Do the main user flows from Core Flows have architectural coverage?
  - Have critical edge cases and failure scenarios been acknowledged?
  - Have required external integrations been identified with clear approaches?
   **Architecture Completeness**
  - Are major components and their responsibilities clear?
  - Are component interactions and dependencies understood?
  - Is data flow between components defined?
  - Are boundaries between layers established (where applicable)?
   **Technical Foundation**
  - Are key technology choices made and do they fit together?
  - Is the authentication/authorization approach defined (if applicable)?
  - Is error handling strategy defined for critical paths?
  - Are data models sufficiently specified to begin implementation?
3. **Identify Critical Decisions**
  Extract the defining architectural choices from the Tech Plan:
  - What are the 3-7 decisions that will shape most of the implementation?
  - These are the decisions worth stress-testing
  - Skip trivial or obvious choices
   Look for decisions that:
  - Cross component boundaries (integration points)
  - Handle failure modes or error scenarios
  - Define core data schemas or models
  - Break from or extend existing codebase patterns
  - Have significant performance or scaling implications
  - Affect security boundaries
   Also include any items flagged as "Concern" from the baseline coverage check.
4. **Stress-Test Each Critical Decision**
  For each critical decision, evaluate against the six focus areas:
  - Does this hold up under failure scenarios?
  - Could this be simpler?
  - What happens if requirements change?
  - Does this fit the existing codebase?
   Think through scenarios:
  - Trace a request through the proposed architecture end-to-end
  - Inject failures at key points-what breaks, what recovers?
  - Change a requirement-what ripples through the design?
   **Issue Classification Guidance**
   When evaluating, categorize issues by importance to guide clarification priority:
   *Most Important* - Address first:
  - Will cause major rework if not addressed
  - Violates PRD requirements
  - Fundamental robustness gap (no recovery from failures)
  - Security vulnerabilities
   *Significant* - Address before proceeding:
  - Significant complexity that could be simplified
  - Fights existing codebase patterns
  - Notable resilience gaps
  - Missing error handling for critical paths
   *Moderate* - Clarify and decide:
  - Minor consistency issues
  - Opportunities for simplification
  - Edge cases to consider
  - Terminology or naming concerns
   *Minor* - Note for awareness:
  - Observations and suggestions
  - Implementation phase considerations
  - Polish and refinements
5. **Interview for Resolution**
  Present findings to the user as interview questions. Include detailed description of the issues for better understanding in the question statement itself. For each gap or concern:
  - Explain the issue and why it matters
  - Ask focused questions to understand the reasoning or fill the gap
  - Clarify and resolve before moving to the next issue
   Start with the most important issues first-things that would cause major rework or block implementation. Then work toward smaller observations.
   Multiple rounds of clarification is normal and encouraged. The goal is shared understanding of the architecture's strengths and gaps.
6. **Update Tech Plan Based on Clarification**
  As issues are resolved through clarification:
  - Update the Tech Plan with clarifications or changes
  - Document any accepted trade-offs
  - Keep changes targeted-don't rewrite unnecessarily
7. **Confirm Readiness**
  Once issues are addressed:
  - Review the updated Tech Plan with the user
  - Confirm the changes capture the agreed approach
  - Iterate if any new gaps emerge

## Acceptance Criteria

- Baseline coverage check completed with no unaddressed gaps
- Critical architectural decisions have been identified and stress-tested
- Gaps and concerns have been clarified and resolved
- Agreed-upon changes have been made to the Tech Plan
- Architecture is confirmed ready for ticket breakdown

## Output Format Instructions

When editing artifacts using the `artifact-editor` tool, pay strict attention that you edit the artifact professionaly like a report, conversational messages have no place in the actual artifact content. Other than the actual artifact content used in the `artifact-editor` tool, no format is enforced.

## Workflow Order Note

The command sequence (trigger → prd → flows → validate_prd → tech_plan → validate_architecture → ticket_breakdown → validate_artifact → revise_requirements) is the **intended** order, not a strict gate. The user is always in control — they can run any command at any time, skip steps, re-run earlier steps, or jump ahead. Always execute the requested command without complaint, then gently suggest the typical next step as a recommendation.

## Workflow Context

- **Previous step:** `/tech_plan` — Generate Technical Plan (recommended)
- **Next step:** `/ticket_breakdown` — Break plan into separate implementation tickets (recommended)
