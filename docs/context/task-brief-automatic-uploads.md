# Task Brief

## Objective
- Deliver an `Automatic Uploads` workflow for `domain_owner` and `global_admin` users that accepts a supported Phillips auction URL, returns editable artwork drafts for review in the frontend, and uploads only user-approved drafts to the selected domain gallery.
- Keep preview data provisional until approval. Parsed records must never be written to Cosmos DB or Blob Storage during preview.
- Reuse the current artwork upload behavior for image validation, Blob Storage, vectorization, Cosmos persistence, response cleanup, and uploader attribution rather than creating a second ingestion implementation.

## Scope
- In scope:
  - Add an authenticated `/automatic-uploads` frontend route and navigation item visible only to `domain_owner` and `global_admin`.
  - Enforce the same role restriction at route-rendering and API levels; a `domain_owner` may act only on their own domain, while a `global_admin` may act on another selected domain under the existing domain-access rules.
  - Build the first usable page, not a marketing screen: a URL form, preview progress/error/empty states, batch summary, editable artwork drafts with remote image previews, field-level issues, selection controls, and an explicit approval action.
  - Keep fetched preview drafts in frontend state. Users can edit supported artwork fields, exclude individual lots, correct validation issues, and review the final selected count before approval.
  - Add shared strict TypeScript contracts in `common/` for preview and approval requests/responses, draft artwork input, source identity, validation issues, and per-item upload results.
  - Add a NestJS `automatic-uploads` module with preview and approval endpoints under the domain route, explicit role guards, domain authorization, typed validation, structured logging, timeouts, response-size limits, and safe remote-fetch behavior.
  - Support Phillips auction pages only for the MVP. Extract provider-independent parser interfaces while adapting the proven selectors and normalization behavior from `scripts/scapper/parse_philip.js` into testable server-side code.
  - Parse available lot title, artist, description, date, medium, signature, estimate, source links, lot identity, image URL, and auction metadata without inventing missing values. Missing or uncertain fields must be represented as draft issues for human review.
  - Preserve source audit data in `Artwork.metadata`, including provider, source auction URL, source lot URL/number, source image URL, original estimate text/currency, and pricing conversion status when available.
  - Perform remote auction HTML and image retrieval in the backend. Permit only HTTPS URLs for the recognized Phillips host and explicitly allowed Phillips image hosts; reject private/local network targets, unsafe redirects, unsupported content types, oversized responses, and timed-out requests.
  - Make approval best-effort at the item level: valid selected drafts can succeed when another draft fails, and the response must identify each created, skipped, or failed draft without silently retrying writes.
  - Add deterministic frontend, controller/service, parser-fixture, authorization, validation, and upload-orchestration tests. Tests must not depend on live Phillips availability.
  - TasteMatcher has no staging environment because it was intentionally disabled to reduce operating cost. Validate with isolated local/mocked checks, then, after explicit deployment approval, deploy the production Web API followed by the frontend and run a 1-3 lot canary in a dedicated production test gallery. Use existing deployment mechanisms only.
- Out of scope:
  - Auction providers other than Phillips, arbitrary website scraping, PDF ingestion, OCR, browser automation, authenticated auction pages, and anti-bot bypasses.
  - Scheduled imports, recurring URL monitoring, background scraping jobs, Azure Functions changes, new queues, new storage accounts/containers, or other Azure infrastructure changes.
  - Persisting draft batches, resuming a draft on another device/session, approval history UI, or collaborative review.
  - Automatic AI rewriting, enrichment of missing catalog fields, image editing, deduplication based on visual similarity, or automated currency-rate retrieval.
  - Atomic all-or-nothing batch uploads. The MVP reports per-item outcomes and preserves successful uploads.
  - Refactoring unrelated upload UI, roles, navigation, or ingestion scripts beyond extracting/reusing logic required for this feature.

## Acceptance Criteria
1. A signed-in `domain_owner` or `global_admin` sees `Automatic Uploads` in desktop and mobile navigation and can open `/automatic-uploads`; a `dealer` or `customer` does not see the link and direct navigation does not render the page.
2. Both automatic-upload endpoints require authentication and explicitly allow only `domain_owner` and `global_admin`; a domain owner receives a rejected response for a different `domainId`, while a global admin follows the existing cross-domain access behavior.
3. Submitting a syntactically invalid URL, a non-HTTPS URL, or a non-Phillips auction URL produces a clear validation error and performs no remote fetch or persistence.
4. `POST /domains/:domainId/automatic-uploads/preview` accepts a typed request containing the auction URL and returns a typed Phillips preview containing source summary, editable draft records, source identity, field-level issues, and batch-level issues.
5. Preview fetches and parses remote content only; tests verify that it does not upload blobs, generate vectors, enqueue messages, or write artwork records.
6. A Phillips HTML fixture with known lots produces the expected title, artist, lot/source links, largest available image URL, estimate values, auction defaults, and source metadata. Missing fields remain empty/undefined and create review issues instead of fabricated data.
7. Remote fetching enforces host allowlists, HTTPS, redirect validation, timeouts, maximum response/image sizes, and HTML/image content types; tests cover blocked private/local targets, an unsafe redirect, timeout, oversized response, and unsupported content type.
8. The frontend shows distinct idle, loading, success, empty, and error states. A successful preview renders every returned lot as an editable draft with an image preview or image-error state, validation indicators, include/exclude control, and stable responsive layout.
9. Editing any supported field updates the local draft sent for approval. The approval action remains disabled when no drafts are selected or a selected draft has blocking validation errors, and the confirmation text states the selected artwork count and target domain.
10. Shared approval input exposes only client-editable artwork fields plus immutable source identity; server-owned fields such as `id`, `domainId`, `filename`, `vector`, `vectorModel`, `createdAt`, and `uploadedBy` cannot be supplied as authoritative client values.
11. `POST /domains/:domainId/automatic-uploads/approve` revalidates every selected draft and source image, downloads each permitted image server-side, and sends valid records through the same ingestion behavior used by the current manual upload flow, including image validation, Blob upload, vectorization attempt, Cosmos creation, uploader attribution, and response cleanup.
12. Approval returns a typed per-draft result with created artwork identifiers and actionable failure details. Tests prove that one failed draft does not roll back or duplicate successful drafts and that the frontend preserves failed drafts for correction/retry while removing or marking successful drafts.
13. Repeated approval of the same Phillips source lot in the same domain is detected by stable provider/source identity and is reported as skipped or already imported; it does not create a duplicate artwork record.
14. Preview and approval log provider, domain, actor, source URL host/path, lot counts, duration, and categorized failures without logging auth tokens, fetched HTML, image bytes, or unrelated sensitive payloads.
15. `common`, `webapi`, and `frontend` builds pass; focused shared/backend/frontend tests pass without live-network dependency; the release plan requires Web API-first production deployment, frontend deployment, and a 1-3 lot canary in a dedicated test gallery without any Functions or infrastructure deployment.

## Constraints
- Technical:
  - Cross-package request/response contracts live in `common/` and use strict TypeScript without `any`.
  - High-level preview request: `{ url: string }`. High-level preview response: `{ provider: "phillips", source, drafts, issues }`, where each draft has a client-only `draftId`, editable artwork input, immutable source identity, inclusion state, and validation issues.
  - High-level approval request: `{ provider: "phillips", sourceUrl: string, drafts: ApprovedAutomaticUploadDraft[] }`. High-level approval response: `{ created, skipped, failed }`, keyed by `draftId` and stable source identity.
  - Editable artwork input is an explicit allowlist derived from `Artwork` fields, not `Partial<Artwork>`. It includes catalog fields such as title, artist, description, date, medium, signature, dimensions, prices, auction end date, display/taster/privacy flags, and tags.
  - Parser logic must be a pure, fixture-testable provider adapter (for example, `canParse(url)` and `parse(html, context)`). Network retrieval, parsing, validation, and persistence remain separate concerns.
  - Use bounded concurrency and configured batch/response limits so a large sale cannot exhaust API memory or create unbounded vectorization work. Return a visible batch issue when a source exceeds the supported limit.
  - The approval service must share or extract the existing manual-upload orchestration. Existing `POST /domains/:domainId/uploads` behavior and response shape must remain backward compatible.
  - No browser-side fetching of third-party auction HTML or image bytes for upload. Browser image previews may use approved returned URLs, with a clear fallback when hotlinking is blocked.
  - Do not depend on hardcoded FX rates as authoritative pricing. Preserve raw estimate data and expose conversion status; any reused conversion behavior must be explicit, test-covered, and editable before approval.
  - No new Azure resource or infrastructure definition is permitted for the MVP.
- Product:
  - The page label is `Automatic Uploads`; the preview records are visually described as drafts and are never represented as already uploaded.
  - Phillips is the only supported provider shown to users in the MVP. Unsupported providers receive a precise message rather than a generic scrape failure.
  - Human approval is mandatory. There is no automatic write immediately after URL submission.
  - Defaults such as `isAuction`, `useForTaster`, `isPrivate`, and price visibility must be visible and editable before approval.
  - Partial parsing is acceptable when issues are clear; a draft with blocking requirements cannot be approved until corrected or excluded.
- Time:
  - Implement in vertical slices: contracts and fixture-backed parser, preview API, editable frontend review, approval orchestration, then review/docs and controlled production rollout.
  - Optimize the MVP for a single Phillips auction URL per preview and bounded batch sizes; defer persisted/background batches until production evidence requires them.

## Suggested Agent Plan
1. `planner-agent`: hand off this brief and keep Phillips-only scope, testable acceptance criteria, and infrastructure constraints explicit.
2. `shared-types-agent`: define/export automatic-upload contracts and editable-field allowlists in `common/`; validate with the common build and type tests.
3. `backend-agent`: add provider parsing, guarded preview/approval endpoints, safe remote retrieval, reusable upload orchestration, duplicate-source checks, and isolated tests using HTML/image fixtures and mocked Azure services.
4. `frontend-agent`: add role-aware route/navigation, typed API client methods, draft-review UI, local editing/selection/validation, approval result handling, responsive/accessibility behavior, and component tests using mocked API responses.
5. `review-agent`: check FE/BE/shared contract alignment, authorization and SSRF boundaries, duplicate prevention, partial-failure behavior, manual-upload regressions, test coverage, and builds; report unresolved high-severity findings before rollout.
6. `docs-agent`: document Phillips support and limitations, configuration/limits, isolated local verification, selector maintenance, operational failure categories, and production canary/rollback steps.

## Files Likely Affected
- `common/src/types/automatic-upload.types.ts`
- `common/src/index.ts`
- `webapi/src/automatic-uploads/automatic-uploads.module.ts`
- `webapi/src/automatic-uploads/automatic-uploads.controller.ts`
- `webapi/src/automatic-uploads/automatic-uploads.service.ts`
- `webapi/src/automatic-uploads/providers/automatic-upload-provider.interface.ts`
- `webapi/src/automatic-uploads/providers/phillips.provider.ts`
- `webapi/src/automatic-uploads/**/*.spec.ts`
- `webapi/src/upload/upload.controller.ts`
- `webapi/src/upload/upload.service.ts`
- `webapi/src/upload/upload.module.ts`
- `webapi/src/app.module.ts`
- `frontend/src/pages/AutomaticUploads/AutomaticUploadsPage.tsx`
- `frontend/src/pages/AutomaticUploads/AutomaticUploadsPage.spec.tsx`
- `frontend/src/routes/AppRoutes.tsx`
- `frontend/src/routes/ProtectedRoute.tsx` or a new role-aware route guard
- `frontend/src/constants/navigation.ts`
- `frontend/src/utils/api.ts`
- Phillips HTML/image fixtures under the owning backend test directory
- Relevant workflow/configuration documentation selected by `docs-agent`

## Validation Commands
- `git diff --check`
- `pnpm run build:common`
- `pnpm --filter @tastematcher/common test -- --runInBand`
- `pnpm --filter @tastematcher/webapi test -- --runInBand automatic-uploads upload`
- `pnpm --filter @tastematcher/frontend test -- --watchAll=false AutomaticUploads AppRoutes navigation`
- `pnpm run build:webapi`
- `pnpm run build:frontend`
- Production canary after explicit deployment approval: deploy Web API then frontend, preview a supported Phillips sale in a dedicated test gallery, approve 1-3 lots, confirm per-item results/source metadata, and repeat one approval to confirm duplicate handling. This is a release step, not completed validation.

## Risks
- Phillips may block server requests, require browser-rendered content, rate-limit traffic, or change selectors. Mitigation: Phillips-only host allowlist, bounded retries/timeouts, fixture-based parser tests, coverage metrics, explicit user errors, read-only local live parsing, and a controlled production canary; do not add anti-bot bypass behavior.
- Remote URL and redirect handling creates SSRF and resource-exhaustion risk. Mitigation: HTTPS/provider/image-host allowlists, DNS/IP and redirect validation, content-type checks, byte/time limits, bounded concurrency, and security-focused tests.
- Phillips image URLs may expire or reject hotlinking. Mitigation: show a frontend fallback, fetch and validate the image again during approval, and return an item-level failure that leaves the draft editable.
- Selector drift or incomplete lot data can create misleading records. Mitigation: preserve raw source metadata, report field-level issues, require human approval, and never synthesize missing catalog facts.
- Hardcoded currency conversion can become stale. Mitigation: retain raw estimate/currency and conversion status, make prices editable, and avoid presenting converted values as authoritative.
- Multi-item approval can run slowly because Blob upload and vectorization are currently synchronous. Mitigation: enforce a bounded batch size/concurrency, expose progress at request level, retain per-item results, and defer asynchronous infrastructure until measured production need.
- Refactoring the upload controller into reusable orchestration may regress manual uploads. Mitigation: preserve its public contract, add characterization tests before extraction, and include manual-upload regression checks in review.
- Retrying after a partial response could create duplicates. Mitigation: use stable provider/source lot identity scoped to a domain, check before create, and return explicit already-imported results.
- Frontend-only role visibility is insufficient authorization. Mitigation: enforce explicit NestJS roles and domain checks independently and test both layers.
- New Azure infrastructure would expand rollout and operations risk. Mitigation: use the existing Web API, Blob Storage, Cosmos DB, vectorization service, and deployment configuration only; no Functions or resource provisioning changes are in scope.
