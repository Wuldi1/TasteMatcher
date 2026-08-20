# Azure Deployment Plan

> **Status:** Validated

> Local validation only. TasteMatcher has no staging environment because it was
> intentionally disabled to reduce operating cost. No production deployment or
> upload is recorded in this plan.

Generated: 2026-08-15

---

## 1. Project Overview

**Goal:** Add an Automatic Uploads workflow that previews artwork data from a
supported auction URL, lets an authorized user edit the draft, and uploads the
approved artwork into the existing TasteMatcher gallery.

**Path:** Modify Existing Azure-Backed Application

This milestone is an application-only change. It reuses the current API,
Cosmos DB artwork storage, and Blob Storage image pipeline and does not create
or modify Azure resources.

---

## 2. Requirements

| Attribute | Value |
|-----------|-------|
| Classification | Existing production application |
| Scale | Existing application scale; unchanged |
| Budget | No new Azure services or SKUs |
| Subscription | Not required for an application-only change |
| Location | Existing deployment location; unchanged |
| Access | `domain_owner` and `global_admin` only |
| Initial provider | Phillips auction pages |
| Release environments | Isolated local validation, then production canary; no staging environment |

---

## 3. Components Detected

| Component | Type | Technology | Path |
|-----------|------|------------|------|
| frontend | SPA | React 18, TypeScript, React Router | `frontend/` |
| webapi | API | NestJS 11, TypeScript | `webapi/` |
| common | Shared library | TypeScript | `common/` |
| functions | Background worker | Azure Functions, TypeScript | `functions/` |
| scraper scripts | Ingestion tooling | Node.js, Cheerio | `scripts/scapper/` |

---

## 4. Recipe Selection

**Selected:** Existing deployment process

**Rationale:** The requested feature adds routes, contracts, parsing logic, and
UI to already deployed components. No infrastructure recipe or deployment
configuration is needed, so adding AZD/Bicep/Terraform would expand the scope
without supporting a new runtime requirement.

---

## 5. Architecture

**Stack:** Existing SPA and API services

### Service Mapping

| Component | Azure Service | Change |
|-----------|---------------|--------|
| frontend | Existing frontend hosting | Application code only |
| webapi | Existing API hosting | Application code only |
| artwork documents | Cosmos DB | Reuse existing artwork write path |
| artwork images | Blob Storage | Reuse existing image upload path |

### Supporting Services

| Service | Purpose |
|---------|---------|
| Existing authentication | Enforce domain access and admin/owner roles |
| Existing logging | Record preview and approval failures without secrets |

---

## 6. Execution Checklist

### Phase 1: Planning

- [x] Analyze workspace
- [x] Gather feature requirements from the approved product plan
- [x] Confirm no subscription or location change is required
- [x] Scan codebase
- [x] Preserve the existing deployment recipe
- [x] Plan application architecture
- [x] User approved implementation by requesting work to start

### Phase 2: Execution

- [x] Research existing Azure-backed storage and API components
- [x] Add shared preview and approval contracts
- [x] Add the role-gated frontend review workflow
- [x] Add Phillips preview and approval API endpoints
- [x] Add focused tests and documentation
- [x] Set status to `Ready for Validation`

### Phase 3: Validation

- [x] Build and type-check changed packages
- [x] Run focused tests
- [x] Record validation proof below

### Phase 4: Deployment

- [ ] Obtain explicit production deployment approval
- [ ] Deploy the Web API application to production and verify health
- [ ] Deploy the frontend application to production after the API check
- [ ] Run a 1-3 lot canary in a dedicated production test gallery
- [ ] Confirm no Functions, queues, infrastructure, or Azure resources are deployed

---

## 7. Validation Proof

| Check | Command Run | Result | Timestamp |
|-------|-------------|--------|-----------|
| Shared validation | `pnpm --filter @tastematcher/common typecheck` and `pnpm --filter @tastematcher/common test` | Pass: 17 tests | 2026-08-15 |
| Web API validation | Web API lint/typecheck and focused Jest suites | Pass: 48 tests | 2026-08-15 |
| Frontend validation | `pnpm --filter @tastematcher/frontend typecheck` and focused Vitest suite | Pass: 16 tests | 2026-08-15 |
| Functions regression validation | Functions typecheck, Jest suite, and production build | Pass: 4 tests | 2026-08-15 |
| Production builds | `pnpm run build:webapi`, `pnpm run build:frontend`, and `pnpm run build:functions` run serially | Pass | 2026-08-15 |
| Static checks | Web API lint and `git diff --check` | Pass | 2026-08-15 |
| Live server preview sample | Read-only preview of `NY030826` through `AutomaticUploadsService` | Pass: 110 lots and 110 detail pages enriched in 22.4 seconds; no upload | 2026-08-15 |
| Azure footprint | Confirm no `azure.yaml`, Bicep, Terraform, Functions, or resource changes were introduced | Pass: application-only change | 2026-08-15 |

---

## 8. Files to Generate

| File/Area | Purpose | Status |
|-----------|---------|--------|
| `.azure/plan.md` | Application and Azure-impact plan | Complete |
| `common/src/types/` | Shared automatic-upload contracts | Complete |
| `frontend/src/pages/AutomaticUploads/` | Preview and editing UI | Complete |
| `webapi/src/automatic-uploads/` | Provider parsing and approval API | Complete |
| Azure infrastructure | No changes required | Not applicable |

---

## 9. Next Steps

> Current: Locally validated; production deployment and canary not performed

1. Confirm any local write tests use explicitly configured isolated storage and
   database resources; otherwise keep local checks read-only and mocked.
2. After explicit approval, deploy the production Web API first and verify
   health/authentication before deploying the frontend.
3. Run the documented 1-3 lot canary only in a dedicated production test
   gallery, then confirm source metadata and duplicate behavior.
4. On failure after both deployments, roll back the frontend first and then the
   Web API. Do not deploy or modify Functions or infrastructure.
