# Automatic Uploads MVP

## Overview

Automatic Uploads lets a `domain_owner` or `global_admin` review a supported
auction page as editable drafts and approve selected lots into a TasteMatcher
gallery. Phillips is the first and currently only registered provider; the
server resolves a provider adapter from the submitted URL so additional auction
houses can be added without changing the workflow service.

Preview is read-only: it fetches and parses Phillips HTML but does not write to
Cosmos DB, Blob Storage, queues, or Azure Functions. Approval is the only step
that writes artwork and images, and it uses the existing Web API ingestion path.
No new Azure infrastructure or Functions changes are required.

## User Flow

1. Open `/automatic-uploads` from the `Automatic Uploads` navigation item.
2. Enter an auction URL. The page identifies its provider and shows whether the
   domain is supported before enabling preview. A `global_admin` must also
   select the target gallery; a `domain_owner` uses their own domain.
3. Select `Review content`. The API returns provisional drafts held in frontend
   state only.
4. Review images and issues, edit artwork fields, and include or exclude lots.
   Title, artist, source image, and an auction end date are blocking requirements.
5. Use the bulk editor to set auction end date, price visibility, Taster usage,
   or privacy for all currently included drafts. Each property is applied only
   when its own Apply action is selected; excluded drafts are unchanged. Values
   from `datetime-local` controls are normalized to explicit ISO UTC timestamps
   before approval.
6. Select `Upload <count> selected` after all included drafts are valid. The
   frontend automatically sends selections over 20 as sequential requests of
   at most 20 drafts.
7. Review the per-item result. Created and already-imported drafts leave the
   review list. Failed drafts remain available for correction or retry.

Leaving or refreshing the page discards the current preview. There is no saved
draft batch or cross-session resume in the MVP. Draft selection, bulk controls,
and editable fields are frozen while preview or approval requests are active.

## Access Control

- Both API endpoints require authentication and allow only `domain_owner` and
  `global_admin`.
- A `domain_owner` can use only the domain attached to their account.
- A `global_admin` can select a target domain using the existing domain access
  behavior.
- The frontend route and desktop/mobile navigation enforce the same role list,
  but the Web API remains the authoritative access check.

## API And Contracts

Both endpoints are under `/domains/:domainId/automatic-uploads`. Shared request
and response types are exported from
`common/src/types/automatic-upload.types.ts`.

### Preview

`POST /domains/:domainId/automatic-uploads/preview`

Request:

```json
{
  "url": "https://www.phillips.com/auction/NY030826"
}
```

The response contains:

- `provider`: the parser selected from the source URL; currently `phillips`.
- `source`: auction URL, code, title, location, and available start/end dates.
- `drafts`: `draftId`, source reference data, editable artwork data, inclusion
  state, and field/draft issues. Approval does not trust the returned source
  values when they are sent back by the browser.
- `issues`: batch warnings such as no lots found or preview truncation.

The preview response is provisional and is not persisted server-side.

### Approval

`POST /domains/:domainId/automatic-uploads/approve`

Request:

```json
{
  "provider": "phillips",
  "sourceUrl": "https://www.phillips.com/auction/NY030826",
  "drafts": [
    {
      "draftId": "phillips-ny030826-1-1",
      "source": {
        "identity": {
          "provider": "phillips",
          "sourceAuctionUrl": "https://www.phillips.com/auction/NY030826",
          "sourceLotNumber": "1",
          "sourceLotUrl": "https://www.phillips.com/detail/artist/NY030826/1"
        },
        "sourceImageUrl": "https://dist.phillips.com/image-1.jpg",
        "originalEstimateText": "$3,000-5,000",
        "originalEstimateCurrency": "USD",
        "originalEstimateLow": 3000,
        "originalEstimateHigh": 5000,
        "pricingConversionStatus": "not_required"
      },
      "artwork": {
        "title": "Blue Work",
        "description": "",
        "artist": "Ada Artist",
        "date": "2025",
        "isAuction": true,
        "price": 3000,
        "maxPrice": 5000,
        "shouldDisplayPrice": false,
        "useForTaster": true,
        "isPrivate": false,
        "endDate": "2026-04-30T20:00:00Z",
        "tags": ["phillips"]
      }
    }
  ]
}
```

The approval envelope (`provider`, `sourceUrl`, and a non-empty `drafts` array)
must be valid and may contain at most 20 drafts. Once the envelope is valid, a
schema problem in one draft is returned as that item's `validation_failed`
result; it does not reject or roll back other valid drafts.

The browser sends `source` for lot correlation, but those values are not
authoritative. The API fetches and parses `sourceUrl` once per approval request,
matches each requested lot against that trusted parse, and replaces the
client-supplied source identity, image URL, raw estimate, sold result, currency,
estimate bounds, and conversion status. A mismatched auction URL, lot URL, or
missing or ambiguous lot is a per-item `source_validation_failed` result. Only
the explicit `artwork` fields remain client-editable.

Editable artwork fields are title, description, artist, date, signature,
medium, width, height, depth, auction flag, minimum/maximum price, price
visibility, taster/private flags, end date, and tags. Server-owned values such
as artwork ID, domain ID, filename, vectors, timestamps, and uploader are not
accepted as authoritative input.

The response separates `created`, `skipped`, and `failed` items. Each result is
keyed by `draftId` and source identity. Created items include `artworkId`;
already-imported items can include `existingArtworkId`; failed items include a
failure code, message, `retryable` flag, and optional validation issues.

Approval is best-effort rather than transactional. A failure does not roll back
other successful items in the same request. When more than 20 drafts are
selected, the frontend aggregates the per-item results from sequential chunks.
If a whole chunk request fails, processing stops; results from completed chunks
are retained and unprocessed drafts remain in the review list.

## Provider Resolution

`AutomaticUploadProviderRegistry` owns server-side URL-to-parser resolution.
Each provider implements `AutomaticUploadProviderAdapter`, including its stable
provider key, display name, URL matcher, overview parser, and optional lot-detail
enricher. Preview and approval both resolve the adapter from the source URL;
approval additionally requires the request provider to match that adapter.

To add another auction provider:

1. Add its provider definition and exact source/image hosts to
   `common/src/types/automatic-upload.types.ts`.
2. Implement a provider adapter under
   `webapi/src/automatic-uploads/providers/` and register it in
   `automatic-uploads.module.ts`.
3. Add the browser-safe provider entry in
   `frontend/src/pages/AutomaticUploads/automaticUploadProviders.ts` so URL
   support feedback stays aligned with the server.
4. Add parser fixtures, adapter/registry tests, fetch allowlist tests, and a UI
   support-state test for the new domain.

Provider hosts are exact allowlists, not suffix matches. Registering an adapter
without registering its hosts will therefore remain blocked by the remote
fetcher.

## URL And Content Policy

Auction pages must use HTTPS, the exact host `phillips.com` or
`www.phillips.com`, and one of these paths:

- `/auction/<auction-code>`
- `/auctions/<auction-code>`

An optional trailing slash is accepted. Auction codes may contain letters,
numbers, underscores, and hyphens. URLs with credentials, a custom port, a
different host, or an arbitrary Phillips path are blocked. Subdomains other
than `www` are not accepted as auction sources.

Images must use HTTPS and the exact host `assets.phillips.com` or
`dist.phillips.com`. Approval downloads images server-side and accepts JPEG or
PNG content only. Every redirect is revalidated against the corresponding
source or image allowlist.

Residual SSRF risk remains because outbound connections are not pinned to a
DNS resolution/IP address for the lifetime of the request. The current
mitigation is a strict allowlist of four exact provider-owned hosts: the two
auction hosts and two image hosts above, with HTTPS, no credentials, no custom
ports, and redirect revalidation. Revisit connection pinning if the provider or
network trust boundary expands.

## Parser Assumptions

The pure Phillips parser uses the current auction-page HTML and does not run a
browser or execute page JavaScript.

- Auction metadata comes from the first JSON-LD `Event`. Invalid JSON-LD is
  ignored. The title falls back to the first `h1`, then the document title.
- Lots are links matching
  `a.seldon-object-tile.pah-lot-object-tile`.
- Lot number, title, artist, estimate, sold result, lot URL, and image are read
  from the current `seldon-object-tile` markup.
- Preview fetches each trusted lot-detail URL with six concurrent workers. The
  `lot-cataloging-section` enriches date, medium, imperial/metric dimensions,
  and signature. A failed detail request leaves the overview draft editable and
  adds the non-blocking `lot_detail_unavailable` warning.
- The largest width candidate from the image `srcset`/`src` is selected, but it
  must resolve to an allowed Phillips image host.
- USD estimates populate editable `price` and `maxPrice`. Non-USD estimates are
  preserved in source metadata but are not converted. Missing values are not
  invented and instead produce review issues where relevant.
- Draft defaults are `isAuction: true`, `shouldDisplayPrice: false`,
  `useForTaster: true`, `isPrivate: false`, and `tags: ["phillips"]`.

Selector or JSON-LD changes can produce an empty preview or missing-field
issues. Update the Phillips fixture and parser tests together when adapting to
new markup.

## Limits

| Control                             |                                              MVP value |
| ----------------------------------- | -----------------------------------------------------: |
| HTML response                       |                                          2 MiB maximum |
| Image response                      |                                         10 MiB maximum |
| Remote request timeout              |                                             15 seconds |
| Redirects                           |                                              5 maximum |
| Global JSON/urlencoded request body |                                          2 MiB maximum |
| Preview drafts                      |                                            200 maximum |
| Preview detail workers              |                                      6 concurrent lots |
| Preview detail scheduling budget    | 30 seconds; remaining lots stay editable with warnings |
| Approval drafts per API request     |                                             20 maximum |
| Frontend approval chunk             |                                              20 drafts |
| Approval workers                    |                                     3 concurrent items |

The HTML and image limits are checked against both `Content-Length` and bytes
read from the response stream. A preview containing more than 200 parsed lots
is truncated to the first 200 and receives a non-blocking `preview_truncated`
batch warning. An approval request containing more than 20 drafts is rejected,
while the frontend automatically chunks a larger selection into valid requests.

The Web API globally limits JSON and URL-encoded bodies to 2 MiB. Multipart
parsing is not registered globally; existing upload endpoints keep route-scoped
Multer handling. The 20-draft approval maximum ensures a valid transport payload
fits under the global 2 MiB cap. These values are code constants in the MVP, not
deployment configuration.

## Source Metadata And Duplicates

Approved artwork stores the following under
`Artwork.metadata.automaticUpload`:

- `provider`
- `sourceAuctionUrl`
- `sourceLotNumber`
- `sourceLotUrl`
- `sourceImageUrl`
- `originalEstimateText`
- `originalEstimateCurrency`
- `originalEstimateLow`
- `originalEstimateHigh`
- `soldPriceText`
- `soldPriceCurrency`
- `soldPriceAmount`
- `pricingConversionStatus`

Duplicate identity is scoped to the target domain and consists of provider,
trusted source auction URL, and trusted source lot number. Automatic artwork IDs
are deterministic UUID v5 values derived from that domain-scoped identity.
Before downloading an image, approval queries for an existing artwork; a match
is returned as `skipped` with reason `already_imported`.

The deterministic ID also closes the concurrent check/create race. If two
requests pass the pre-check for the same lot, Cosmos accepts one create and
returns a conflict for the other. The API maps that conflict to
`already_imported` with the same artwork ID. A duplicate identity repeated
inside one approval request is returned as a non-retryable validation failure.

## Errors And Retry Behavior

Preview rejects malformed requests, unsupported URLs, unsafe redirects,
non-HTML content, oversized responses, timeouts, network failures, and Phillips
HTTP failures. A page that parses successfully without matching lot cards
returns an empty preview with `no_lots_found` rather than writing anything.

Approval re-fetches and parses the source auction once for each request, binds
each valid draft to the trusted source identity/image/estimate data, validates
the editable artwork fields, and then checks duplicates. It downloads and
validates the trusted image, uploads it to Blob Storage, attempts vectorization,
and creates the Cosmos artwork record. Vectorization failure is logged but does
not prevent artwork persistence, matching the existing manual upload behavior.

Envelope errors such as an unsupported provider, invalid `sourceUrl`, empty
draft list, or more than 20 drafts reject the request. With a valid envelope,
individual draft schema and trusted-source binding errors are per-item failures,
so other valid drafts can continue.

No approval write is silently retried by the API. Network failures, timeouts,
HTTP 429/5xx responses, duplicate-check failures, and selected upload failures
may be marked retryable. Validation, unsafe source/image, unsupported content,
and persistence failures require review rather than an automatic retry. The UI
keeps failed drafts and displays the returned message; retry only those items
after correcting data or confirming the transient dependency has recovered.
Already-created items are protected by the duplicate check on a repeated
approval attempt.

Application logs record provider, domain, actor, source host/path, lot/result
counts, duration, and categorized failures. They do not intentionally log auth
tokens, fetched HTML, or image bytes.

## Local Verification

Run deterministic checks from the repository root. They use the checked-in
Phillips fixture and mocked network/Azure dependencies; they do not require live
Phillips access.

```sh
pnpm --filter @tastematcher/common typecheck
pnpm --filter @tastematcher/common test
pnpm --filter @tastematcher/webapi typecheck
pnpm --filter @tastematcher/webapi test -- --runInBand automatic-uploads upload.service
pnpm --filter @tastematcher/webapi lint
pnpm --filter @tastematcher/frontend typecheck
pnpm --filter @tastematcher/frontend exec vitest run src/pages/AutomaticUploads/AutomaticUploadsPage.spec.tsx
pnpm run build:webapi
pnpm run build:frontend
git diff --check
```

For an interactive local check, start the existing Web API and frontend using
the repository commands. Sign in as each supported role and verify gallery
selection behavior. Preview a supported live Phillips page only when outbound
network access is intentionally enabled; do not approve unless the local
storage and database are isolated from shared and production data.

Final review included a local live parse of
`https://www.phillips.com/auction/NY030826`. It found 110 lots without
truncation. A subsequent read-only server preview enriched all 110 lot-detail
pages in 22.4 seconds with no detail failures and retained 68 sold results. The
first lot's date, medium, dimensions, signature, estimate, sold result, and
selected largest image matched the live source. No live or production upload
was performed.

## Release Target

Production is the sole deployment target for this feature.

Before deployment, complete the deterministic local checks above. Local write
tests may be performed only when explicitly configured credentials point to
isolated local storage and database resources. A local environment must not be
described as isolated merely because it runs on a developer machine; when the
resource boundary is unknown, keep local validation read-only and mocked.

## Production Canary

After explicit deployment approval, use this controlled release sequence. This
is a plan, not a record of completed production validation.

1. Confirm local builds, focused tests, fixture parsing, read-only live parsing,
   and `git diff --check` pass. Record the Web API and frontend versions selected
   for release and their previous rollback versions.
2. Confirm a dedicated production test gallery has been created and explicitly
   approved for canary data. Its name alone does not prove data isolation or
   authorize writes.
3. Deploy the Web API application to production first. Do not deploy Functions,
   queues, infrastructure definitions, or Azure resources. Verify API health and
   authentication before continuing.
4. Deploy the frontend application to production. Confirm only `domain_owner`
   and `global_admin` users can see and open Automatic Uploads.
5. In the dedicated test gallery, preview a supported Phillips auction and
   approve only 1-3 selected lots. Confirm target domain, images, edited artwork
   fields, uploader, and `metadata.automaticUpload` before and after approval.
6. Re-approve one canary lot and confirm it returns `already_imported` without a
   second artwork record.
7. Review production logs and per-item results for source-binding, image,
   duplicate, persistence, and latency failures. Stop the canary on any domain
   mismatch, unexpected duplicate, malformed metadata, or elevated error rate.

No production canary or production upload has been performed as part of the
implementation or documentation work recorded here.

## Rollout And Rollback

Roll out only through the production canary sequence above. Monitor preview
failure categories, empty/truncated previews, approval
created/skipped/failed counts, request duration, and reports of Phillips
selector drift. Do not deploy Functions or infrastructure changes.

The MVP has no feature flag. If the Web API fails before the frontend release,
stop and redeploy the previous Web API version. If both applications have been
released, roll back the frontend first to stop new user attempts, then redeploy
the previous Web API version so contracts and routes remain aligned. Recheck API
health and the existing manual upload flow after rollback.

Rollback does not remove canary artwork already approved. Record exact artwork
IDs and use the existing gallery management workflow only after the test-gallery
owner decides whether correction or removal is appropriate. Never bulk delete
by source metadata without a separately reviewed data-change plan.

## Out Of Scope

- Providers other than Phillips, arbitrary websites, PDFs, OCR, browser
  automation, authenticated pages, or anti-bot bypasses.
- Scheduled or recurring imports, background scraping, persisted drafts,
  approval history, cross-session resume, or collaborative review.
- Azure Functions, queues, new storage resources, or other infrastructure.
- AI-generated metadata or rewriting, visual deduplication, image editing, or
  live currency conversion.
- Atomic all-or-nothing approval and automatic retries of gallery writes.
