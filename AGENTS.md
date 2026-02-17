# TasteMatcher Agent Operating Guide

This file defines how to run multi-agent (sub-agent) development flows in this repository.

## Purpose

Use specialized agents with strict handoffs to reduce context switching and increase delivery speed.

## Agent Roles

1. `planner-agent`: break requests into scoped tasks, and define acceptance criteria and risks.
2. `backend-agent`: implement `webapi/` changes, contracts, validations, and tests.
3. `frontend-agent`: implement `frontend/` UI/UX changes and client-side tests.
4. `functions-agent`: implement `functions/` jobs, queue workflows, and reliability controls.
5. `html-parser-agent`: parse source HTML into upload-ready artwork folders under `scripts/scapper/inventory/`.
6. `shared-types-agent`: update `common/` shared types and exports for cross-package consistency.
7. `review-agent`: run final review for regressions, test gaps, and contract mismatches.
8. `docs-agent`: update documentation, decision notes, and rollout instructions.

## Standard Flow

1. Planner creates a task brief using `docs/context/task-brief-template.md`.
2. Execution agents implement scoped changes in parallel where possible.
3. Review agent verifies tests, type safety, and behavior.
4. Docs agent updates relevant docs and migration notes.
5. Final owner posts release-ready summary with file references.

## Handoff Contract (Mandatory)

Each agent handoff must include:

1. `Goal`: what this step must achieve.
2. `Inputs`: links to docs, files, and constraints.
3. `Output`: exact artifact expected (code, test, doc, decision).
4. `Validation`: command(s) that prove completion.
5. `Risks`: known uncertainty or follow-up work.

## Done Criteria

1. Shared contracts in `common/` are aligned with FE/BE/function usage.
2. Tests for touched behavior are added or updated.
3. README/docs are updated for user-facing or workflow changes.
4. A final review confirms no unresolved high-severity findings.

## Context Files

Primary context files for sub-agent work:

1. `docs/context/project-context.md`
2. `docs/context/sub-agent-flows.md`
3. `docs/context/task-brief-template.md`
4. `docs/context/active-workstreams.md`
5. `docs/context/agents/html-parser-agent.md`
