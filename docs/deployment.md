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
10. **Security** — never print secrets in logs. Never commit secrets. Use `.env` or Key Vault.
11. **Documentation** — update README, endpoints docs, and the `CHANGELOG.md` for behavior changes or added features.
12. **Frontend quality & accessibility** — every FE change must be clean and smooth (no janky UI/UX), must support mobile and desktop layouts responsively, and must meet Accessibility requirements (follow WCAG AA at minimum). Include accessibility attributes (aria-*) where relevant, keyboard navigation, focus states, semantic HTML, and automated/audited accessibility tests in the PR.

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

   * Backend unit: `backend/src/module/service.spec.ts`
   * Backend integration: `backend/test/integration/feature.integration.spec.ts`
   * Frontend: `frontend/src/components/Component.spec.tsx`
2. Run tests locally `pnpm --filter backend test` (or `pnpm --filter frontend test`) — fix failing tests first.
3. Implement code until tests pass.
4. Add E2E or Playwright smoke test if the change touches user flow.
5. Add test coverage to ensure the changed module has >= 80% coverage; critical modules must be >= 90%.
6. Include accessibility and basic responsive checks — add automated accessibility tests (axe or equivalent) and a Playwright/mobile-viewport smoke test that verifies critical flows render & function on both mobile and desktop viewports.


**Test structure guidelines**

* Unit tests must mock external dependencies (db, storage, network) and validate behavior and edge cases.
* Integration tests use local dev stack (Azurite, sqlite) and are permitted to be slower. Keep a small test dataset.
* Use consistent test fixtures in `backend/test/fixtures` and `frontend/test/fixtures`.

---

## 3 — Logging & observability (template rules)

For every public API or worker task:

* Add `logger.debug()` at entry with: `{ path, method, correlationId?, inputsSummary }`
* Add `logger.info()` on success: `{ path, method, correlationId, durationMs }`
* Add `logger.error()` on failure with full error and context: `{ path, method, correlationId, errMessage, stack }`
* Use correlation/request id across async calls; generate one in middleware if not provided.
* Metrics: call `metrics.increment('name', { tags })` for domain events (e.g., `ingest_received`, `ingest_processed.ok`, `ingest_processed.error`).

Example (NestJS style):

```ts
const start = Date.now();
logger.debug({ route: '/domains/:id/uploads', domainId, userId });
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

* Before generating code, **search the repository** for similar functions/classes (e.g., `search for "uploadFile" or "enqueueJob"`). If a similar implementation exists:

  * Reuse it by calling the existing service, or
  * Extract the common part into a new service/util with a clear name, add it to `common` if shared across FE/BE, and update both callers.
* If extracting a common utility, add it under:

  * `common/src/utils/` (for shared TS-only helpers)
  * `backend/src/lib/` (backend-only infra)
  * `frontend/src/lib/` (frontend-only)
* New utilities must include JSDoc, unit tests, and small example usage in the README.

---

## 5 — PR & commit rules (auto-checks Copilot must generate in PR template)

When opening a PR, include this checklist in the PR description; Copilot should auto-populate as part of PR template:

* [ ] I wrote unit tests for new/changed code (link to test files).
* [ ] I wrote integration/e2e tests where applicable.
* [ ] All tests pass locally: `pnpm -w -r test`.
* [ ] Type-check passed: `pnpm -w -r -filter backend typecheck`.
* [ ] Lint passed: `pnpm -w -r lint`.
* [ ] Logging & metrics added.
* [ ] Public contract changes updated in `common` and API docs.
* [ ] Design note included (1 paragraph) describing architecture choices.
* [ ] At least one reviewer assigned.

**Commit message style**: use Conventional Commits:

```
feat(module): short description

Longer description if needed.

Refs: #ISSUE
```

---

## 6 — CI enforcement (commands Copilot should ensure CI runs)

Add (or update) CI workflow steps to run these commands in order:

1. `pnpm -w install`
2. `pnpm -w -r lint` (eslint + prettier)
3. `pnpm -w -r typecheck` (tsc --noEmit)
4. `pnpm -w -r test` (run fast unit tests)
5. `pnpm --filter backend run test:integration` (optional stage)
6. `pnpm -w -r build` (ensure compile)

If any step fails, CI must block merge.

---

## 7 — Refactor & change process (Copilot must simulate this)

For any refactor touching >1 file or shared code:

1. Create a small migration PR that introduces the new abstraction *and* keeps old API working (backward-compatible) — the dual-write approach. Add tests for both old & new behavior.
2. In a follow-up PR, switch callers to the new abstraction and remove legacy code (with tests).
3. Update `common` types if API changed, bump `common` version and update references in BE/FE in the same PR to avoid mismatches.

---

## 8 — Error handling & retries (workers / external calls)

* Any call to external systems (Blob, Queue, Search, OpenAI) must be wrapped with retry logic (exponential backoff) with bounded retries and proper circuit-breaker semantics if repeated failures happen.
* After retry exhaustion, set a clear `indexingError` in DB and send `metrics.increment('indexing_failed')` and `logger.error` with full context.
* Implement a dead-letter mechanism for background jobs and surface failed jobs in admin UI.

---

## 9 — Minimal logging level guidelines (what to log/avoid)

* **Debug**: detailed internal data (only in dev)
* **Info**: high-level actions (ingest received, user logged in, job enqueued)
* **Warn**: recoverable unexpected conditions
* **Error**: failures requiring attention — include stack and context
* **Never** log secrets (API keys, raw tokens, private keys)

---

## 10 — Examples Copilot must follow before generating code

When asked to implement `upload.service.uploadFileAndEnqueue`, Copilot must:

1. Search repo for existing upload logic.
2. If none, create `UploadService` with:

   * `uploadFileAndEnqueue(domainId, buffer, filename, contentType, metadata)` signature.
   * Use Prisma to create Artwork row in a transaction.
   * Use `@azure/storage-blob` to upload buffer safely.
   * Use `@azure/storage-queue` to enqueue base64 message.
   * Add unit tests mocking blob & queue clients.
   * Add structured logs and metrics.
3. Add or update `common` type `ArtworkCreateDto` if necessary.

---

## 11 — Tooling & developer ergonomics (commands to run locally)

Include these scripts in root `package.json` and Copilot should use them in examples:

```json
{
  "scripts": {
    "dev": "pnpm --parallel --filter backend dev --filter frontend dev",
    "lint": "pnpm --filter backend lint && pnpm --filter frontend lint",
    "typecheck": "pnpm --filter backend typecheck && pnpm --filter frontend typecheck",
    "test": "pnpm -w -r test",
    "test:backend": "pnpm --filter backend test",
    "test:frontend": "pnpm --filter frontend test",
    "ci-check": "pnpm install && pnpm lint && pnpm typecheck && pnpm test"
  }
}
```

Developers must run `pnpm run ci-check` before opening a PR.

---

## 12 — Final encouragement to Copilot (meta-instruction)

When generating code, **simulate a senior engineer**:

* Ask "is this the simplest correct solution?" before writing.
* Prefer small, well-tested, opinionated functions over clever one-liners.
* Add comments that explain *why* (not what).
* When uncertain, produce a short design note in the PR and propose two alternatives with pros/cons.

---

# Deploying Azure Functions

### Manual Deployment

```bash
# Deploy to development
./scripts/azure/deploy-functions.sh dev

# Deploy to production
./scripts/azure/deploy-functions.sh prd
```

### Configure Function App Settings

```bash
# Configure Function App with required settings
./scripts/azure/configure-function-app.sh dev
```

### Automatic Deployment

**Azure Functions:**
- Triggers on push to `main` branch with changes in `functions/` or `common/`
- Workflow: `.github/workflows/deploy-functions.yml`
- Target: Azure Functions App

### Monitoring Functions

**View Function logs:**
```bash
az functionapp log tail --resource-group tastematcher-dev-rg --name tastematcher-dev-func
az functionapp log deployment list --resource-group tastematcher-dev-rg --name tastematcher-dev-func
```

**Check Function status:**
```bash
az functionapp show \
  --resource-group tastematcher-dev-rg \
  --name tastematcher-dev-func \
  --query "state" -o tsv
```

**View queue messages:**
```bash
az storage message peek \
  --queue-name tastematcher-dev-indexing-jobs \
  --account-name tastematcherdevsa \
  --num-messages 10
```

### Troubleshooting Functions

1. **Function not triggering on queue messages**
   - Check queue connection string in Function App settings
   - Verify queue name matches configuration
   - Check Function App logs for binding errors

2. **Build fails during deployment**
   - Ensure common package is built first
   - Check TypeScript compilation errors
   - Verify all dependencies are installed

3. **Function times out**
   - Check `functionTimeout` in `host.json` (default: 10 minutes)
   - Review Function execution time in Application Insights
   - Consider breaking large images into smaller chunks

4. **Memory issues**
   - Function App plan is EP1 (Elastic Premium)
   - Monitor memory usage in Azure Portal
   - Consider upgrading to EP2/EP3 for larger images

## Azure Functions Platform

### Operating System: Linux

**Why Linux?**
- ✅ **Platform consistency** - Development (macOS/Linux) matches production (Linux)
- ✅ **Native module compatibility** - No cross-compilation issues with `sharp`, `canvas`, etc.
- ✅ **Better performance** - Linux containers typically have better performance characteristics
- ✅ **Industry standard** - Most serverless platforms default to Linux
- ✅ **Cost effective** - Linux App Service plans are generally less expensive

**Configuration:**
- OS Type: `Linux`
- Runtime: `Node.js 22`
- Function App Plan: `EP1` (Elastic Premium for production workloads)

### Native Module Handling

With Linux Functions, native modules like `sharp` work seamlessly:
- Local development (macOS) and production (Linux) both use POSIX-compatible binaries
- No need for `--platform` or `--arch` flags during deployment
- npm/pnpm automatically installs the correct binaries for the target platform