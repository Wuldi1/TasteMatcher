# Azure Deployment Plan

> **Status:** Validated

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

- [ ] Not requested in this task

---

## 7. Validation Proof

| Check | Command Run | Result | Timestamp |
|-------|-------------|--------|-----------|
| Shared validation | `pnpm --filter @tastematcher/common typecheck` and `pnpm --filter @tastematcher/common test` | Pass: 17 tests | 2026-08-15 |
| Web API validation | `pnpm --filter @tastematcher/webapi typecheck` and focused Jest suites | Pass: 34 tests | 2026-08-15 |
| Frontend validation | `pnpm --filter @tastematcher/frontend typecheck` and focused Vitest suite | Pass: 16 tests | 2026-08-15 |
| Production builds | `pnpm run build:webapi` and `pnpm run build:frontend` | Pass | 2026-08-15 |
| Static checks | Web API lint and `git diff --check` | Pass | 2026-08-15 |
| Live parser sample | Parse downloaded `NY030826` HTML with `PhillipsProvider` | Pass: 110 lots; no upload | 2026-08-15 |
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

> Current: Locally validated; staging verification pending

1. Run the documented staging role, preview, and small-subset upload checks.
2. Confirm source metadata and duplicate behavior in the staging gallery.
3. Use the existing deployment process only after explicit deployment approval.
