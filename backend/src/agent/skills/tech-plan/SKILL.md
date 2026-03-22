---
name: tech-plan
description: "COMMAND: /tech_plan — Generate a detailed Technical Plan that defines the architecture, technology choices, data models, API contracts, and implementation strategy. Activated when the user sends a message starting with /tech_plan. This is step 5 of the workflow, after /validate_prd and before /validate_architecture."
metadata:
  command: /tech_plan
  produces_artifact: true
  artifact_type: spec
  can_edit_artifacts: []
  workflow_order: 5
  next_command: /validate_architecture
allowed-tools:
  - codebase-explorer
---

# Tech Plan Generation

## Overview

Generates a comprehensive Technical Plan that translates the Product Requirements Document and Core Flows into a detailed technical blueprint covering architecture decisions, technology stack, data models, API designs, and implementation strategy.

## Instructions

## Interactive Process Required

This workflow command requires step-by-step collaboration. Do not skip clarification for efficiency.

## Role

Technical architect who considers the complete system picture.

**Focus on:**

- Seeing each component in context of the whole system
- Grounding recommendations in the actual codebase, not generic assumptions
- Starting simple with a clear path to scale
- Letting user journeys inform technical choices
- Designing for change and adaptation-requirements will evolve
- Letting data requirements shape the architecture
- Tracing requests end-to-end through the proposed design
- Considering failure modes-what breaks, what recovers
- Balancing technical ideals with practical constraints

## Core Philosophy

The goal is alignment, not artifacts. Specs are records of decisions made together, not deliverables to rush toward.

Value system:

- Questions are investments in correctness, not overhead
- Surfacing assumptions early is cheap; fixing wrong artifacts is expensive
- Getting it right the first time is faster than iterating on wrong drafts
- Multiple rounds of clarification is normal and encouraged

Before drafting any artifact:

1. Surface your key assumptions
2. Continue using interview questions until genuinely confident
3. Only draft when you and the user have shared understanding

## Processing User Request

1. Internalize the problem from the epic brief and core flows. Understand what we're solving and why.
2. Analyze the existing codebase thoroughly - architecture patterns, technical constraints, integration points. Ground all recommendations in what you actually observe, not assumptions about how systems typically work.
3. Think through the high-level design approach before clarifying with the user.
  Thoroughly think through your mental model:  
      - Trace a request through the proposed architecture end-to-end  
      - Change a requirement - what ripples through the design?  
      - Inject failures at each point - what breaks, what recovers?
4. Surface assumptions and use interview questions to align on the approach.
  Present your proposed direction, key assumptions, and anything that surfaced during step 3. Align on the overall approach before diving into sections. Multiple rounds of clarification is acceptable.
5. For each section, reach alignment through interview questions before documenting.
  Work through sections one at a time (Architectural Approach → Data Model → Component Architecture):
  Think through the details:  
  Trace through this section's implications. What are the key decisions? What has non-obvious consequences? What are you uncertain about?
  Interview the user:  
  Surface key decisions and uncertainties to the user as interview questions. Don't assume - get input on choices that shape the architecture. Iterate until you have shared understanding.
  Then document:  
  Write the section only after alignment. The spec captures decisions made, not ongoing deliberation.
  Complete each section (think → clarify → document) before moving to the next.
  Structure each section as described in the Tech Plan Template section below.

## Tech Plan Template

### Architectural Approach

Define the key decisions and constraints that shape the design:

1. Identify major architectural choices (patterns, paradigms, technologies)
2. Explain trade-offs and rationale for each decision
3. Surface constraints (technical, business, or regulatory) that bound the solution
4. Keep brief under 100 lines.

### Data Model

Define new data models and how they integrate with existing schema:

1. Identify new entities required for the enhancement
2. Define relationships with existing data models
3. Plan database schema changes (additions, modifications)
4. Keep brief under 100 lines.

### Component Architecture

Define new components and their integration with existing architecture:

1. Identify new components required for the enhancement
2. Define interfaces with existing components
3. Establish clear boundaries and responsibilities
4. Plan integration points and data flow
5. No code repository structure should be documented
6. No business logic implementation details

Note: Keep the tech plan structured and readable. Code snippets only for schemas and interfaces. You MUST NOT include code snippets for business logic or implementation details.

Note: Draft only these 3 sections. DO NOT draft any other sections.

## Acceptance Criteria

- The architectural approach is aligned with the user, with all assumptions clarified
- Key decisions and trade-offs have been captured with user alignment
- User confirms the technical direction

&nbsp;

## Output Format

<!-- TODO: Define the expected output format -->

## Workflow Context

- **Previous step:** `/validate_prd`
- **Next step:** `/validate_architecture`
