# Workers — Ingest & Indexing (Azure Functions)

**Purpose:** queue-driven Azure Functions that process images uploaded through the WebAPI. For each `IndexingJobMessage` the worker must: download the original blob, validate, create derivatives, extract metadata, compute embeddings, upsert to Azure Cognitive Search, update the artwork item in **Cosmos DB**, log/emit metrics and handle retries/DLQ. All shared logic (uploader, naming, DTOs) must live in the `common` package and be reused by WebAPI and Worker.

---

## Quick facts / assumptions

* Runtime: **Node 20 + TypeScript**
* Worker type: **Azure Functions (queue-triggered)** listening to Azure Storage Queue
* Storage: **Azure Blob Storage** (`originals` and `derivatives` containers)
* DB: **Azure Cosmos DB** (SQL API) — artworks stored in Cosmos
* Search: **Azure Cognitive Search** (vector + metadata)
* Embeddings: pluggable (`StubEmbedder` for dev; `AzureOpenAIEmbedder` or CLIP in prod)
* Shared code: everything that is cross-cutting must live in **`common/`** — types, `uploader.ts`, `naming.ts`, DTOs
* No use of the word *slug* — use `domainId` (UUID) everywhere
* Queue message model exactly as specified below

---

## Exact shared types (place in `common/src/types/*`)

**`common/src/types/artwork.ts`** (strip of full model; ensure alignment with Cosmos schema)

```ts
export type ArtworkId = string; // uuid
export type DomainId = string;  // uuid

export interface Artwork {
  id: ArtworkId;
  domainId: DomainId;
  title?: string;
  artist?: string;
  price?: number | null;
  currency?: string | null;
  originalBlob: string; // blob key
  thumbnailUrls?: Record<string, string>;
  metadata?: Record<string, unknown>;
  checksum?: string;
  isIndexed?: boolean;
  indexingError?: string | null;
  lastIndexedAt?: number | null; // epoch ms
  createdAt?: number | null;
  // optional: embedding metadata
  embeddingModel?: string | null;
  embeddingDim?: number | null;
}
```

**`common/src/types/queue.ts`** — **exact** `IndexingJobMessage` you requested:

```ts
export interface IndexingJobMessage {
  messageId: string;
  artId: string;
  domainId: string;
  blobName: string;
  artwork: Artwork;      // full artwork object for enrichment & defaults
  attempt: number;
  enqueuedAt?: number;   // timestamp (epoch ms)
}
```

Export these from `common/src/index.ts`.

---

## Shared utilities to move into `common` (mandatory)

1. **`common/src/utils/uploader.ts`** — centralized blob logic (used by WebAPI & Worker)

   * `downloadBlob(container: string, blobName: string): Promise<Buffer>`
   * `uploadBuffer(container: string, blobName: string, buffer: Buffer, contentType: string): Promise<string /* blobUrl */>`
   * `blobExists(container: string, blobName: string): Promise<boolean>`
   * Use `@azure/storage-blob` and `DefaultAzureCredential` if available; fallback to env key for local dev.
   * Log actions with correlation id, do not log binary content.

2. **`common/src/utils/naming.ts`** — canonical name functions:

   * `getOriginalBlobPath(domainId, artId, ext)`
   * `getDerivativeBlobPath(domainId, artId, size)` (e.g. 320,640,1200)
   * `getSearchDocId(domainId, artId)`
   * `getQueueName(env)` — returns `tastematcher-[env]-queue-indexing` (match provisioning)
   * All code must call these helpers — no inline string concatenation.

3. **`common/src/types/index.ts`** — re-export types.

> **Do not duplicate** uploader or naming utilities — worker & webapi must import from `common`.

---

## Worker responsibilities (full detailed list)

For each **single** `IndexingJobMessage`:

1. **Message handling**

   * Worker triggered by Azure Queue; receives base64-encoded JSON.
   * Decode → validate shape against `IndexingJobMessage` type from `common`.
   * Attach `correlationId` = `messageId` in logs/metrics for the process.

2. **Idempotency & pre-checks**

   * Read artwork document from Cosmos DB using `artId`.
   * If missing: write `indexingError = "missing-artwork"` to Cosmos and **ack** (do not retry), or optionally move message to DLQ.
   * If `artwork.isIndexed === true && artwork.lastIndexedAt >= enqueuedAt`, treat as processed → ack.
   * Optionally store `processedMessageId` on artwork to guarantee one-time.

3. **Download original**

   * Call `common.uploader.downloadBlob(originalsContainer, blobName)`.
   * If not found: update `artwork.indexingError = "missing-blob"`; ack (or requeue depending on policy).

4. **File validation**

   * Validate `Content-Type` and size (`MAX_UPLOAD_BYTES`, default 25MB).
   * Allowed types: `image/jpeg`, `image/png`, `image/webp`, (optionally `image/heic`).
   * On permanent invalidation → update `indexingError` and ack (no retry).

5. **Checksum & metadata**

   * Compute `sha256` checksum.
   * Extract EXIF & metadata with `sharp.metadata()` (width, height, orientation).
   * Optionally compute dominant colors (small utility).

6. **Create derivatives**

   * Using `sharp`:

     * `thumb-320.webp` (long edge 320px)
     * `thumb-640.webp`
     * `full-1200.webp` or largest
   * Ensure sRGB colorspace, strip EXIF, reasonable compression.
   * Upload derivatives via `common.uploader.uploadBuffer(derivativesContainer, path, buffer, 'image/webp')`.
   * Derivative paths must be generated via `common.utils.naming`.

7. **Embeddings**

   * Use `Embedder` interface (in `worker/embedder/index.ts`):

     ```ts
     interface Embedder { embedImage(buffer: Buffer): Promise<number[]>; }
     ```
   * Default to `StubEmbedder` for dev: deterministic vector from checksum (fixed length e.g., 128).
   * Provide `AzureOpenAIEmbedder` or `CLIPEmbedder` for production; workers must be pluggable by env `EMBEDDER_KIND`.
   * Validate the vector length & numeric content (no NaNs).

8. **Index to Azure Cognitive Search**

   * Document fields: `docId = common.naming.getSearchDocId(domainId, artId)`, `artworkId`, `domainId`, `caption` (if any), `tags`, `price`, `thumbnailUrls`, `embedding_vector`.
   * Use `@azure/search-documents` `mergeOrUploadDocuments([doc])`.
   * Include `embeddingModel` and `embeddingDim` metadata.

9. **Update Cosmos DB artwork & idempotency markers**

   * Upsert: `isIndexed = true`, `lastIndexedAt = Date.now()`, `checksum`, `thumbnailUrls`, `metadata`, `indexingError = null`, `embeddingModel`, `embeddingDim`, optionally `processedMessageId`.
   * Use optimistic concurrency or ETag checks if needed.

10. **Logging & metrics**

    * Structured logs at **entry**, **each major step** (download, derivatives, embed, search, db update), and **exit** with durations.
    * Metrics: `ingest_received`, `ingest_success`, `ingest_error`, histogram `ingest_processing_time_ms`.
    * Use `messageId` as correlation id.

11. **Error & retry policy**

    * For **transient** failures (network, 5xx from Cognitive Search/OpenAI) -> throw to let Azure Functions retry (configurable retry times, e.g., 3).
    * For **permanent** errors (invalid file type, missing artwork): update `indexingError` and **ack** (no retry).
    * On exhausting retries -> move message to DLQ `tastematcher-[env]-queue-indexing-dlq` and set `indexingError` with DLQ pointer.

12. **Observability**

    * All error logs include stacktrace and context.
    * Do not log secrets or raw image bytes.
    * Expose a small health endpoint on a separate management function if desired (optional).

---

## Worker architecture & file layout (recommended)

```
azure-function/
 ├─ host.json
 ├─ local.settings.json
 ├─ package.json
 ├─ tsconfig.json
 └─ src/
    ├─ index.ts                  # Azure Function queue trigger (entry)
    ├─ worker/
    │   ├─ processJob.ts         # orchestration
    │   ├─ validators.ts
    │   ├─ derivative.ts
    │   ├─ metadata.ts
    │   ├─ embedder/
    │   │   ├─ index.ts
    │   │   ├─ stubEmbedder.ts
    │   │   └─ azureOpenAIEmbedder.ts
    │   ├─ searchClient.ts
    │   ├─ db.ts                  # Cosmos DB wrapper (SDK) - uses common types
    │   ├─ logger.ts              # pino config
    │   └─ metrics.ts
    └─ tests/
       ├─ unit/
       └─ integration/
```

Shared `common/` artifacts imported by both WebAPI and Worker:

* `common/src/utils/uploader.ts`
* `common/src/utils/naming.ts`
* `common/src/types/*` (artwork, queue)

---

## Environment variables (minimum; keep in Key Vault in prod)

```
# Storage
AZURE_STORAGE_ACCOUNT=tastematcher-dev-storage
AZURE_BLOB_CONTAINER_ORIGINALS=originals
AZURE_BLOB_CONTAINER_DERIVATIVES=derivatives
AZURE_QUEUE_NAME=tastematcher-dev-queue-indexing
AZURE_QUEUE_DLQ_NAME=tastematcher-dev-queue-indexing-dlq

# Cosmos
COSMOS_ENDPOINT=https://tastematcher-dev-cosmos.documents.azure.com:443/
COSMOS_KEY=...
COSMOS_DATABASE=tastematcher
COSMOS_CONTAINER=artworks

# Search
AZURE_SEARCH_ENDPOINT=https://tastematcher-dev-search.search.windows.net
AZURE_SEARCH_ADMIN_KEY=...

# Embedding
EMBEDDER_KIND=stub                                 # stub | azureOpenAI | clip
AZURE_OPENAI_ENDPOINT=
AZURE_OPENAI_KEY=
CLIP_SERVICE_URL=

# Worker behavior / tuning
MAX_UPLOAD_BYTES=26214400     # 25MB
THUMBNAIL_SIZES=320,640,1200
WORKER_CONCURRENCY=2
LOG_LEVEL=info
```

---

## Local dev & testing setup

* **Azurite** for Blob + Queue emulation:

  ```bash
  npm i -g azurite
  azurite --silent --location ./azurite-data --debug ./azurite/debug.log &
  ```
* **Cosmos DB local emulator** (Windows) or use an Azure dev Cosmos account; you can also use `cosmos-sql-emulator` containers if needed.
* **Azure Functions Core Tools** to run function locally:

  ```bash
  npm i -g azure-functions-core-tools@4 --unsafe-perm true
  cd azure-function
  pnpm install
  func start
  ```
* Use `.env.func` / `local.settings.json` to map env values to local Azurite / Cosmos dev keys.

---

## Tests (TDD-first, mandatory)

**Unit tests (Jest) — write first**

* `embedder` tests: stub deterministic outputs; shape & length asserts.
* `uploader` tests: mock azure blob client.
* `derivative` tests: produce correct sizes for input fixture.
* `validators` tests: wrong content types, oversize file.

**Integration tests**

* Run Azurite + Cosmos emulator + function locally.
* End-to-end scenario:

  1. Create artwork doc in Cosmos (simulate upload).
  2. Upload fixture to Azurite `originals` container under `common.naming.getOriginalBlobPath`.
  3. Push base64 queue message into Azurite queue `tastematcher-dev-queue-indexing`.
  4. Wait/poll for `artwork.isIndexed === true` in Cosmos (timeout 60s).
  5. Assert derivatives exist in Azurite `derivatives` container and `thumbnailUrls` present in Cosmos doc.
  6. Assert searchClient upsert was invoked (mockable or verify index document existence if running real Cognitive Search).

**Contract tests**

* Ensure `IndexingJobMessage` compatibility between WebAPI and Worker (shared `common` ensures this).

---

## Implementation plan (atomic PR tasks) — follow TDD and Copilot rules

> Each bullet is a recommended PR. Tests must be added first for the code in that PR.

1. **PR-0 — Common: types & utilities**

   * Add `common/src/types/artwork.ts`, `common/src/types/queue.ts` with `IndexingJobMessage`.
   * Add `common/src/utils/uploader.ts` (copy logic from Webapi-Upload).
   * Add `common/src/utils/naming.ts`.
   * Add unit tests for naming & uploader (mock blob client).
   * **DoD**: unit tests pass; WebAPI imports compile.

2. **PR-1 — Worker skeleton & CI**

   * Create Azure Function project and entry `src/index.ts` (queue trigger) that decodes message and calls `processJob`.
   * Add `package.json`, `tsconfig.json`, `host.json`, `local.settings.json`.
   * Add CI job stub for unit tests.
   * **DoD**: `func start` runs locally; message decode path unit test passes.

3. **PR-2 — Embedder (stub)**

   * Implement `worker/embedder/stubEmbedder.ts` & interface.
   * Unit tests for deterministic behavior & length.
   * **DoD**: tests pass; `processJob` can import stub.

4. **PR-3 — Uploader usage & download test**

   * Use shared `common.uploader` in `processJob`; implement `downloadBlob` usage.
   * Unit tests: mock `downloadBlob` and assert process calls correct path.
   * **DoD**: tests pass.

5. **PR-4 — Derivatives & metadata**

   * Implement `derivative.ts` using `sharp`, upload derivatives via `common.uploader`.
   * Unit tests with sample fixtures; integration test that derivative blobs are created in Azurite.
   * **DoD**: tests pass; thumbnails uploaded.

6. **PR-5 — Cosmos DB wrapper**

   * Implement `db.ts` (Cosmos SDK wrapper) for reading/updating artwork documents.
   * Unit tests mocking Cosmos client.
   * **DoD**: tests pass.

7. **PR-6 — Search client wrapper**

   * Implement `searchClient.ts` wrapper for `mergeOrUploadDocuments`.
   * Unit tests mocking `@azure/search-documents`.
   * **DoD**: tests pass.

8. **PR-7 — processJob orchestration**

   * Implement `processJob.ts` orchestrating all steps, with structured logs and metrics.
   * Add unit tests mocking all helpers (uploader, derivative, embedder, searchClient, db).
   * **DoD**: unit tests pass; good coverage (>=80%).

9. **PR-8 — Integration test**

   * Full integration run in local environment (Azurite + local Cosmos): ensure end-to-end ingestion passes for a test image.
   * **DoD**: integration test passes in CI or dev pipeline.

10. **PR-9 — Production embedder switch**

    * Add `AzureOpenAIEmbedder` or `CLIPEmbedder` implementation, environment toggle `EMBEDDER_KIND`.
    * Add rate-limiting, retries, and mapping.
    * **DoD**: tests (mocked) pass; manual validation against real model optional.

11. **PR-10 — DLQ + monitoring + hardening**

    * Configure DLQ, Application Insights instrumentation, alerting, and add runbook.
    * **DoD**: alerts preset, DLQ receives failed messages; runbook documented.

---

## Definition of Done (final checklist for the entire worker feature)

* [ ] **Shared**: `common` contains types (`Artwork`, `IndexingJobMessage`) and utilities (`uploader`, `naming`) used by WebAPI & Worker. No duplication.
* [ ] **Worker**: queue-trigger function processes messages end-to-end for at least one image in local env (Azurite + Cosmos).
* [ ] **Derivatives**: thumbnails created & uploaded to `derivatives` container with naming from `common.naming`.
* [ ] **Embedding**: stub embedder implemented and used; production embedder pluggable.
* [ ] **Search**: document upsert to Azure Cognitive Search called with `embedding_vector` and metadata.
* [ ] **DB**: Cosmos DB artwork document updated with `isIndexed=true`, `thumbnailUrls`, `checksum`, `lastIndexedAt`.
* [ ] **Idempotency**: duplicate messages do not cause duplicate indexing or inconsistent state.
* [ ] **Error handling**: transient errors retried, permanent errors recorded and acked; DLQ receives dead messages.
* [ ] **Logging & metrics**: structured logs & metrics present (entry/exit/error/durations).
* [ ] **Tests**: unit tests for helpers + process orchestration (TDD-first); at least one integration test for full pipeline.
* [ ] **CI**: tests & lint/typecheck run in CI and passing.
* [ ] **Docs**: README with local dev instructions and runbook for DLQ/alerts.

---

## Examples & snippets (short) — to paste into Copilot prompt

* Use this orchestration skeleton in `processJob.ts` as the single source for Copilot to expand:

```ts
export async function processJob(job: IndexingJobMessage) {
  const start = Date.now();
  logger.info({ event: 'ingest.start', messageId: job.messageId, artId: job.artId, domainId: job.domainId });

  // Idempotency
  const art = await db.getArtwork(job.artId);
  if (!art) { await db.setIndexingError(job.artId, 'missing-artwork'); return; }
  if (art.isIndexed && art.lastIndexedAt && art.lastIndexedAt >= (job.enqueuedAt || 0)) {
    logger.info({ event: 'ingest.alreadyIndexed', artId: job.artId }); return;
  }

  // Download
  const buffer = await uploader.downloadBlob(process.env.AZURE_BLOB_CONTAINER_ORIGINALS!, job.blobName);

  // Validate
  validators.assertImage(buffer, { maxBytes: Number(process.env.MAX_UPLOAD_BYTES) });

  // Metadata & derivatives
  const meta = await metadata.extract(buffer);
  const thumbs = await derivative.createThumbnails(buffer);

  // upload derivatives
  const urls = {};
  for (const [size, buf] of Object.entries(thumbs)) {
    const path = naming.getDerivativeBlobPath(job.domainId, job.artId, Number(size));
    urls[size] = await uploader.uploadBuffer(process.env.AZURE_BLOB_CONTAINER_DERIVATIVES!, path, buf, 'image/webp');
  }

  // Embedding
  const embedVec = await embedder.embedImage(buffer);

  // Search upsert
  await searchClient.upsert({
    id: naming.getSearchDocId(job.domainId, job.artId),
    artworkId: job.artId,
    domainId: job.domainId,
    thumbnailUrls: urls,
    embedding_vector: embedVec,
    // other fields...
  });

  // DB update
  await db.markIndexed(job.artId, {
    checksum: meta.checksum,
    metadata: meta,
    thumbnailUrls: urls,
    isIndexed: true,
    lastIndexedAt: Date.now()
  });

  logger.info({ event: 'ingest.complete', artId: job.artId, durationMs: Date.now() - start });
}
```
