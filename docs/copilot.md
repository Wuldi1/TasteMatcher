# GitHub Copilot — Mandatory coding & review commands (paste into `docs/copilot-prompt.md`)

**Important: when you use Copilot to generate or change any code in this repo, follow these exact commands without exception.**

## 0 — Global rules (always)

1. **TypeScript strict** — generate code with `tsconfig.json` `strict: true`. No `any` unless accompanied by a `// @ts-expect-error` and a short justification comment.
2. **Use shared `common` package** types for all API contracts and DTOs. Never invent ad-hoc types in BE/FE that duplicate `common`. If a type is missing, add it to `common/src/types/` and export it from `common/src/index.ts`.
3. **One responsibility per function/class** — keep modules small and focused. Follow SOLID principles.
4. **No copy-paste** — if you see code similar to an existing class/function, refactor to extract a shared util or service in `common` (for shared abstractions) or in the appropriate package (backend/frontend) with dependency injection.
5. **Think before changing** — for any non-trivial change (>= 10 lines or touching core logic), generate a **one-paragraph design note** at the top of the PR describing the intent, alternatives considered, and why this approach was chosen. Add this to the PR description.
6. **Always add tests first** — write unit tests (and simple integration test where applicable) before implementing the feature. Tests must be included in the same PR.
7. **Logging & metrics** — add structured logs at entry/exit/error points for each public API and worker. Use `pino` style structured logs (or your chosen logger). Include correlation id / request id where relevant. Add a metric increment for significant events (ingest_received, ingest_failed, ingest_succeeded).
8. **Errors** — never swallow exceptions. Use typed error classes and map them to proper HTTP codes in controllers (401,403,404,422,500). Log the error with context and throw / return proper response.
9. **Idempotency** — for any background job or external side-effect operation, implement idempotency checks. Use DB flags or messageId checks.
10. **Security** — never print or commit secrets. Use ignored local configuration files and production GitHub Actions secrets.
11. **Documentation** — update README, endpoints docs, and the `CHANGELOG.md` for behavior changes or added features.
12. **Frontend quality & accessibility** — every FE change must be clean and smooth (no janky UI/UX), must support mobile and desktop layouts responsively, and must meet Accessibility requirements (follow WCAG AA at minimum). Include accessibility attributes (aria-\*) where relevant, keyboard navigation, focus states, semantic HTML, and automated/audited accessibility tests in the PR.

---

## 1 — Code generation checklist (Copilot must follow each item when creating code)

When generating code, **prepend** this checklist as a comment in the created file (the file header):

```text
// ---------- CODEGEN CHECKLIST (must be satisfied) ----------
// 1. Uses TypeScript strict types (no `any`). If any `any` present, justify with comment.
// 2. Uses shared `common` types for API contracts where applicable.
// 3. Includes unit tests written first (test file present next to implementation).
// 4. Adds structured logging at function entry/exit and on errors.
// 5. Adds at least one assertion or guard for input validation.
// 6. No duplicate logic — reuse existing service/util or extract shared module.
// 7. Adds or updates README or docs if public API changes.
// 8. Adds meaningful JSDoc for exported functions/classes.
// 9. CI-friendly: code passes lint, typecheck, and tests locally.\
// 10. Frontend-specific: UI changes must be responsive (mobile + desktop) and smooth (no visual regressions). Include accessibility considerations (semantic markup, aria attributes, keyboard navigation, focus management) and automated accessibility checks (axe, Playwright/accessibility audit) where applicable.
// -----------------------------------------------------------
```

Copilot must ensure the generated files satisfy all items above.

---

## 2 — Test-first behavior (exact commands)

When asked to implement a new endpoint or feature, **always** follow this order:

1. Create or update test files first (unit tests + minimal integration test). Example file paths:
   - Web API unit: `webapi/src/module/service.spec.ts`
   - Functions integration: `functions/src/module/function.integration.spec.ts`
   - Frontend: `frontend/src/components/Component.spec.tsx`

2. Run tests locally with the relevant workspace filter — fix failing tests first.
3. Implement code until tests pass.
4. Add E2E or Playwright smoke test if the change touches user flow.
5. Add test coverage to ensure the changed module has >= 80% coverage; critical modules must be >= 90%.
6. Include accessibility and basic responsive checks — add automated accessibility tests (axe or equivalent) and a Playwright/mobile-viewport smoke test that verifies critical flows render & function on both mobile and desktop viewports.

**Test structure guidelines**

- Unit tests must mock external dependencies (db, storage, network) and validate behavior and edge cases.
- Integration tests must use isolated mocks or explicit emulators and must never point at production data.
- Keep fixtures beside the package that owns the behavior.

---

## 3 — Logging & observability (template rules)

For every public API or worker task:

- Add `logger.debug()` at entry with: `{ path, method, correlationId?, inputsSummary }`
- Add `logger.info()` on success: `{ path, method, correlationId, durationMs }`
- Add `logger.error()` on failure with full error and context: `{ path, method, correlationId, errMessage, stack }`
- Use correlation/request id across async calls; generate one in middleware if not provided.
- Metrics: call `metrics.increment('name', { tags })` for domain events (e.g., `ingest_received`, `ingest_processed.ok`, `ingest_processed.error`).

Example (NestJS style):

```ts
const start = Date.now();
logger.debug({ route: "/domains/:id/uploads", domainId, userId });
try {
  // ...
  logger.info({ route, domainId, durationMs: Date.now() - start });
} catch (err) {
  logger.error({ route, domainId, err: err.message, stack: err.stack });
  throw err;
}
```

---

## 4 — No duplication / DRY enforcement (how Copilot should act)

- Before generating code, **search the repository** for similar functions/classes (e.g., `search for "uploadFile" or "enqueueJob"`). If a similar implementation exists:
  - Reuse it by calling the existing service, or
  - Extract the common part into a new service/util with a clear name, add it to `common` if shared across FE/BE, and update both callers.

- If extracting a common utility, add it under:
  - `common/src/utils/` (for shared TS-only helpers)
  - `backend/src/lib/` (backend-only infra)
  - `frontend/src/lib/` (frontend-only)

- New utilities must include JSDoc, unit tests, and small example usage in the README.

---

## 5 — PR & commit rules (auto-checks Copilot must generate in PR template)

When opening a PR, include this checklist in the PR description; Copilot should auto-populate as part of PR template:

- [ ] I wrote unit tests for new/changed code (link to test files).
- [ ] I wrote integration/e2e tests where applicable.
- [ ] All tests pass locally: `pnpm -w -r test`.
- [ ] Type-check passed: `pnpm -w -r -filter backend typecheck`.
- [ ] Lint passed: `pnpm -w -r lint`.
- [ ] Logging & metrics added.
- [ ] Public contract changes updated in `common` and API docs.
- [ ] Design note included (1 paragraph) describing architecture choices.
- [ ] At least one reviewer assigned.

**Commit message style**: use Conventional Commits:

```
feat(module): short description

Longer description if needed.

Refs: #ISSUE
```

---

## 6 — CI enforcement (commands Copilot should ensure CI runs)

Add (or update) CI workflow steps to run these commands in order:

1. `corepack pnpm install --frozen-lockfile`
2. `pnpm run lint`
3. `pnpm run typecheck`
4. `pnpm run test`
5. `pnpm run build`
6. `pnpm run validate:repo`

If any step fails, CI must block merge.

---

## 7 — Refactor & change process (Copilot must simulate this)

For any refactor touching >1 file or shared code:

1. Create a small migration PR that introduces the new abstraction _and_ keeps old API working (backward-compatible) — the dual-write approach. Add tests for both old & new behavior.
2. In a follow-up PR, switch callers to the new abstraction and remove legacy code (with tests).
3. Update `common` types if API changed, bump `common` version and update references in BE/FE in the same PR to avoid mismatches.

---

## 8 — Error handling & retries (workers / external calls)

- Any call to external systems (Blob, Queue, Cosmos DB, Vision, or Communication Services) must use bounded retry behavior appropriate to that SDK and operation.
- After retry exhaustion, set a clear `indexingError` in DB and send `metrics.increment('indexing_failed')` and `logger.error` with full context.
- Implement a dead-letter mechanism for background jobs and surface failed jobs in admin UI.

---

## 9 — Minimal logging level guidelines (what to log/avoid)

- **Debug**: detailed internal data (only during guarded local execution)
- **Info**: high-level actions (ingest received, user logged in, job enqueued)
- **Warn**: recoverable unexpected conditions
- **Error**: failures requiring attention — include stack and context
- **Never** log secrets (API keys, raw tokens, private keys)

---

## 10 — Examples Copilot must follow before generating code

When asked to implement `upload.service.uploadFileAndEnqueue`, Copilot must:

1. Search repo for existing upload logic.
2. If none, create `UploadService` with:
   - `uploadFileAndEnqueue(domainId, buffer, filename, contentType, metadata)` signature.
   - Use the shared Cosmos DB service to create the Artwork record.
   - Use `@azure/storage-blob` to upload buffer safely.
   - Use `@azure/storage-queue` to enqueue base64 message.
   - Add unit tests mocking blob & queue clients.
   - Add structured logs and metrics.

3. Add or update `common` type `ArtworkCreateDto` if necessary.

---

## 11 — Tooling & developer ergonomics (commands to run locally)

Use the scripts already defined in root `package.json`. Developers must run
`pnpm run ci:check` before opening a PR.

---

## 12 — Final encouragement to Copilot (meta-instruction)

When generating code, **simulate a senior engineer**:

- Ask "is this the simplest correct solution?" before writing.
- Prefer small, well-tested, opinionated functions over clever one-liners.
- Add comments that explain _why_ (not what).
- When uncertain, produce a short design note in the PR and propose two alternatives with pros/cons.

---

## 13 — Azure Configuration and Production Safety

### Azure Platform: Linux (all services)

**Why Linux across the board?**

- ✅ **Platform consistency** - Development (macOS/Linux) matches production (Linux)
- ✅ **Native module compatibility** - No cross-compilation issues with `sharp`, `canvas`, native Node.js modules
- ✅ **Better performance** - Linux containers have better cold-start times and resource utilization
- ✅ **Industry standard** - Modern serverless and container platforms default to Linux
- ✅ **Cost effective** - Linux App Service plans are typically 10-15% cheaper than Windows

**Configured Azure resources:**

- Azure Functions: Flex Consumption with Node.js 24
- Backend API: Azure Container Apps Consumption
- Frontend: Azure Static Web Apps Free

The repository CI workflows validate Node.js 24 before deploying each component.

### Local Development (Functions)

- Configuration comes from `local.settings.json` (auto-loaded by Azure Functions Core Tools)
- **Never use `.env` files** in Functions projects
- **Never commit `local.settings.json`** to git (add to `.gitignore`)
- Provide `local.settings.example.json` as a template
- Generate the ignored production-backed settings with
  `scripts/azure/sync-local-production-config.sh`; do not paste credentials into
  the example file.
- Keep every local trigger disabled by default. Use only the guarded,
  one-trigger opt-in documented in `functions/README.md` because a trigger can
  consume production messages or mutate live data.

### Azure Deployment (Functions & Web Apps)

- Configuration comes from **Application Settings** (configured via provision script)
- **No environment files are deployed** - Application Settings are set via Azure CLI
- Values are available as `process.env.*` at runtime
- All services run on **Linux containers** for consistency
- Production (`prd`) is the only Azure environment. Never generate or select
  another Azure target or credential.
- Pull requests to `main` lint, type-check, test, and build without deploying.
  Matching pushes to `main` automatically deploy the affected component to the
  `prd` GitHub environment after every gate passes, then run a production
  health check. Manual dispatch follows the same gated path.
- Never run the broad provisioning script merely to change a runtime.

### Configuration Loading Pattern

```typescript
// ✅ CORRECT - Read from process.env (works both locally and in Azure)
const config = {
  storageConnection: process.env.AzureWebJobsStorage!,
  queueName: process.env.IMAGE_PROCESSING_QUEUE_NAME!,
};

// ❌ WRONG - Don't use dotenv in Azure Functions
import { config } from "dotenv";
config(); // This won't work in Azure!
```

### Validation

- Always validate required environment variables at startup
- Throw clear errors if missing
- Include helpful messages pointing to `local.settings.json` (local) or Application Settings (Azure)

### Native Module Handling (Linux benefits)

With Linux on all Azure resources, native modules like `sharp` work seamlessly:

- Local development (macOS) and production (Linux) both use POSIX-compatible binaries
- No need for `--platform` or `--arch` flags during deployment
- npm/pnpm automatically installs the correct binaries for the target platform
- Consistent behavior across all environments
