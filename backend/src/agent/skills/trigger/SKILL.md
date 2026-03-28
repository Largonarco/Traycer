---
name: trigger
description: "COMMAND: /trigger — Entry point for new workflows. Activated when the user sends a message starting with /trigger. Analyzes the user's incoming request, analyzes the codebase context, asks clarification questions to resolve ambiguities. This is step 1 of 9 in the workflow, a fresh start. Use this skill whenever the user's message begins with /trigger."
metadata:
  command: /trigger
  produces_artifact: false
  artifact_type: null
  can_edit_artifacts: []
  workflow_order: 1
  next_command: /prd
allowed-tools:
  - codebase-explorer
  - ask_clarification_questions
---

# Trigger — Analyze Request & Explore Codebase

## Overview

This skill analyzes the user's incoming request and systematically explores the codebase to build a comprehensive understanding of the project structure, conventions, and relevant code paths before any planning or specification work begins.

## Instructions

## Collaboration Philosophy

The philosophy and goal of this workflow is alignment, coming to a set of decisions made together, not deliverables to rush toward.

Value system:

- Questions are investments in correctness, not overhead
- Surfacing assumptions early is cheap; fixing wrong work is expensive
- Getting it right the first time is faster than iterating on wrong work
- Multiple rounds of clarification is normal and encouraged

Before proceeding to the next step:

1. Surface your key assumptions with genuine honesty
2. Continue asking questions until genuinely confident
3. Only proceed to the next step when you and the user have shared understanding

## Multi-Round Clarification

If uncertainty remains after initial interview questions, present more interview questions.

- Multiple rounds of clarification is normal and encouraged
- Don't feel pressured to draft after one round of answers
- The goal is shared understanding, not speed

## Processing User Request

1. Understand the user's request and use interview questions to resolve ambiguous requirements, fill in missing details, etc. Multiple rounds of clarification are expected. Reach alignment and shared understanding with the user.
2. Once clarified, present a very concise summary of the agreed requirements. Then suggest proceeding with the workflow's next commands.
  Note: This step is for REQUIREMENT GATHERING only. It is a readonly step in the sense that this doesn't involve creation of any artifacts.

## Acceptance Criteria

- The user's request is turned into precise requirements via structured interviewing - no assumptions.
- The user is satisfied with the requirements.

## Principles

- User intent first: Workflow guides but user directs.

&nbsp;

## Workflow Order Note

The command sequence (trigger → prd → flows → validate_prd → tech_plan → validate_architecture → ticket_breakdown → validate_artifact → revise_requirements) is the **intended** order, not a strict gate. The user is always in control — they can run any command at any time, skip steps, re-run earlier steps, or jump ahead. Always execute the requested command without complaint, then gently suggest the typical next step as a recommendation.

## Workflow Context

- **Previous step:** None (recommended entry point)
- **Next step:** `/prd` — Generate Product Requirements Document (recommended)
