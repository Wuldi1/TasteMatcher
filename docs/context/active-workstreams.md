# Active Workstreams

Keep this file updated so sub-agents can prioritize the same way.

## Current Priorities

1. `WIP` Define and stabilize sales flow contracts across FE/BE.
2. `WIP` Improve AI suggestions quality and explainability.
3. `WIP` Harden background jobs (idempotency, retries, observability).
4. `WIP` Standardize HTML parser agent extraction coverage for ingestion.
5. `WIP` Validate the completed Phillips Automatic Uploads MVP.

## Workstream Template

```md
### <Workstream Name>
- Owner:
- Status: (`planned` | `wip` | `blocked` | `done`)
- Objective:
- Scope:
- Dependencies:
- Current PRs/Branches:
- Next Milestone:
- Risks:
```

### Automatic Uploads
- Owner: TasteMatcher feature agents
- Status: `wip` (implementation and final review fixes complete; validation in progress)
- Objective: Let domain owners and global admins preview, edit, and approve Phillips auction lots into a selected gallery.
- Scope: Shared contracts, role-gated frontend review and chunked approval, Phillips-only trusted-source preview/approval, safe remote fetching, partial per-item results, deterministic duplicate protection, tests, and operational docs; no Functions or new Azure infrastructure.
- Dependencies: Existing authentication/domain access, Web API, Cosmos DB artwork container, Blob Storage, vectorization service, and Phillips public auction/image pages.
- Current PRs/Branches: `feature/automatic-uploads`
- Next Milestone: Complete package validation and the documented staging checks before considering production rollout. Local live parsing succeeded for `NY030826`; no live upload or staging deployment has been performed.
- Risks: Phillips request blocking or selector drift, expiring image URLs, DNS/IP connection pinning, partial chunk retries, and manual-upload regressions from the shared ingestion service.
