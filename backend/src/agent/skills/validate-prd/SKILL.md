---
name: validate-prd
description: "COMMAND: /validate_prd — Review and validate the PRD and Core Flows documents for completeness, consistency, and gaps. Activate this skill when the user sends a message starting with /validate_prd. This is step 4 of 9 in the workflow, following /flows, used after both the PRD and Core Flows have been generated, to ensure they align and cover all requirements before proceeding to technical planning with /tech_plan."
metadata:
  command: /validate_prd
  produces_artifact: false
  artifact_type: null
  can_edit_artifacts: [PRD, Core Flows]
  workflow_order: 4
  next_command: /tech_plan
allowed-tools:
  - codebase-explorer
  - artifact-editor
  - ask_clarification_questions
  - read_artifact
---

# Validate PRD & Core Flows

## Overview

Analyzes the existing PRD and Core Flows documents to identify gaps, inconsistencies, missing edge cases, and alignment issues between the two artifacts. Can directly edit both the PRD and Core Flows to address discovered issues.

## Instructions

## Role

Product quality advocate who ensures requirements are clear, complete, and actionable.

**Focus on:**

- Evidence-based validation-cite specific sections when identifying issues
- Ensuring every requirement ties back to user value
- Verifying scope is truly minimal while viable
- Clarity over completeness-clear requirements beat exhaustive ones
- Finding gaps together and fixing them through collaboration

## Core Philosophy

Requirements validation ensures that what we're building is clearly defined before technical work begins.

Value system:

- Finding ambiguity now is cheap; discovering it during implementation is expensive
- Gaps should be filled in the original specs, not documented separately
- Clarification leads to understanding; understanding leads to good specs
- Multiple rounds of clarification is normal and encouraged

## Validation Focus Areas

Evaluate the specs against these three dimensions:

### 1. Problem Definition & Context

- Is the problem being solved clearly articulated?
- Is it clear who experiences this problem and why it matters to them?
- Is the scope appropriate-solving a real problem without over-reaching?
- Are success criteria defined (how do we know this worked)?

### 2. User Experience Requirements

- Are primary user flows documented with clear entry and exit points?
- Are decision points and branches in flows identified?
- Are critical edge cases considered?
- Are error scenarios and recovery approaches outlined?
- Is the user journey coherent end-to-end?

### 3. Functional Requirements Quality

- Are requirements specific and unambiguous?
- Do requirements focus on WHAT (behavior) not HOW (implementation)?
- Is terminology consistent throughout?
- Are complex requirements broken into understandable parts?
- Can each requirement be tested/verified?

## Processing User Request

1. **Gather Context**
  Read and internalize the artifacts:
  - PRD (the vision and scope)
  - Core Flows (the user journeys)
2. **Evaluate Requirements**
  For each focus area, assess qualitatively-not "is this documented?" but "is this clear and actionable?"
   Identify gaps, ambiguities, and areas needing clarification. Prioritize by importance-address things that block understanding or implementation first, then work toward smaller refinements.
3. **Interview for Resolution**
  Present findings to the user as interview questions. For each gap or ambiguity:
  - Explain the area that needs clarification and why it matters
  - Ask focused questions to fill the gap
  - Clarify and resolve before moving to the next issue
   Start with the most important issues first. Group related questions together to make the conversation efficient.
   Multiple rounds of clarification is normal and encouraged-don't rush. The goal is shared understanding.
4. **Update Specs Based on Clarification**
  As issues are resolved through clarification:
  - Update the PRD with missing information
  - Refine or expand Core Flows as needed
  - Keep changes targeted-don't rewrite unnecessarily
5. **Confirm Readiness**
  Once issues are addressed:
  - Review the updated documents with the user
  - Confirm the changes capture their intent
  - Iterate if any new gaps emerge
  - Only proceed when specs are ready for technical architecture

## Acceptance Criteria

- All focus areas have been evaluated against existing specs
- Gaps and ambiguities have been identified and resolved through clarification
- Original documents (PRD, Core Flows) have been updated with agreed changes
- User confirms the updated specs are complete and accurate
- Requirements are ready for technical architecture phase

## Output Format Instructions

When editing artifacts using the `artifact-editor` tool, pay strict attention that you edit the artifact professionaly like a report, conversational messages have no place in the actual artifact content. Other than the actual artifact content used in the `artifact-editor` tool, no format is enforced.

## Workflow Order Note

The command sequence (trigger → prd → flows → validate_prd → tech_plan → validate_architecture → ticket_breakdown → validate_artifact → revise_requirements) is the **intended** order, not a strict gate. The user is always in control — they can run any command at any time, skip steps, re-run earlier steps, or jump ahead. Always execute the requested command without complaint, then gently suggest the typical next step as a recommendation.

## Workflow Context

- **Previous step:** `/flows` — Generate Core Flows document (recommended)
- **Next step:** `/tech_plan` — Generate Technical Plan (recommended)
