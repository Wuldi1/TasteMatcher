# Active Workstreams

Keep this file updated so sub-agents can prioritize the same way.

## Current Priorities

1. `WIP` Define and stabilize sales flow contracts across FE/BE.
2. `WIP` Improve AI suggestions quality and explainability.
3. `WIP` Harden background jobs (idempotency, retries, observability).
4. `WIP` Standardize HTML parser agent extraction coverage for ingestion.
5. `WIP` Validate the completed Phillips Automatic Uploads MVP.
6. `WIP` Complete the local-production and Node.js 24 production rollout.

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
- Status: `wip` (implementation and local validation complete; production release approval and canary pending)
- Objective: Let domain owners and global admins preview, edit, and approve Phillips auction lots into a selected gallery.
- Scope: Shared contracts, role-gated frontend review and chunked approval, Phillips-only trusted-source preview/approval, safe remote fetching, partial per-item results, deterministic duplicate protection, tests, and operational docs; no Functions or new Azure infrastructure.
- Dependencies: Existing authentication/domain access, Web API, Cosmos DB artwork container, Blob Storage, vectorization service, and Phillips public auction/image pages.
- Current PRs/Branches: `feature/automatic-uploads`
- Next Milestone: After explicit deployment approval, deploy the production Web API, then frontend, and run the documented 1-3 lot canary in a dedicated production test gallery. No production upload has been performed.
- Risks: Phillips request blocking or selector drift, expiring image URLs, DNS/IP connection pinning, partial chunk retries, and manual-upload regressions from the shared ingestion service.

### Local Production and Node.js 24

- Owner: TasteMatcher platform agents
- Status: `complete` (repository implementation, credential rotation, validation, protected local-production sync, and live Node.js 24 rollout completed 2026-08-21)
- Objective: Run the Web API and frontend locally against guarded production-backed services and align the repository and Azure runtimes on Node.js 24 LTS.
- Scope: Production-only local configuration sync, production-data safety guards, disabled-by-default local Functions triggers, Node.js 24 package/CI/provisioning configuration, gated automatic production deployment on matching pushes to `main`, scoped runtime preflight/update tooling, tests, and operational docs.
- Dependencies: Completed against approved subscription `e105e38a-7820-4c7e-b1da-de05227d6355`; Node.js 24 availability, production change approval, and credential rotation were confirmed during rollout.
- Current PRs/Branches: Current workspace changes; no PR recorded.
- Next Milestone: Commit/review the completed repository changes and monitor production telemetry for delayed runtime regressions.
- Risks: Local API requests can mutate live production data; opted-in Functions can consume production queues or send notifications; previously committed secrets remain recoverable from Git history until rotated; live Azure runtime state is not yet verified or updated.
