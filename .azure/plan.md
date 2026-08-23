# Azure Deployment Plan

> **Status:** Validated

Generated: 2026-08-22

---

## 1. Project Overview

**Goal:** Replace the always-on hosting used by TasteMatcher's Functions, API,
static frontend, and Cosmos DB minimum RU/s baseline with consumption-based
Azure services while preserving the existing public functionality. Customer-data
preservation is not required for the Cosmos DB phase.

**Path:** Modernize Existing

---

## 2. Requirements

| Attribute | Value |
|---|---|
| Classification | POC / test product (confirmed: no customer data) |
| Scale | Small / intermittent |
| Budget | Cost-Optimized |
| Subscription | Visual Studio Enterprise Subscription (`e105e38a-7820-4c7e-b1da-de05227d6355`) — pending user confirmation |
| Location | Central US — pending user confirmation |
| Data / compliance | No real customer data; Cosmos DB may be reset or reseeded. Retain existing Storage, Key Vault, Vision, and Communication Services |

## 3. Components Detected

| Component | Type | Technology | Path |
|---|---|---|---|
| API | REST API | NestJS / Node.js 24 | `webapi/` |
| Frontend | SPA | React / Vite | `frontend/` |
| Background processing | Queue + timer functions | Azure Functions v4 / Node.js 24 | `functions/` |
| Shared services | Libraries/contracts | TypeScript | `common/` |

Current production has two single-instance P0v3 Linux App Service plans: one
for Functions and one shared by API plus frontend. They cost $115.71 over the
last 30 days. Cosmos DB currently has provisioned throughput at the database
and container levels.

---

## 4. Recipe Selection

**Selected:** AZCLI with versioned Bicep deployment definitions.

**Rationale:** Production is currently managed by Azure CLI scripts and GitHub
Actions, with no `azure.yaml`, Bicep, Terraform, or Dockerfiles. The migration
will add reviewable Bicep and narrowly scoped deployment scripts while retaining
the existing production credential and deployment boundary.

---

## 5. Architecture

**Stack:** Containers + Serverless + Static Hosting

### Service Mapping

| Component | Azure Service | SKU / configuration |
|---|---|---|
| Queue and timer processing | Azure Functions | Flex Consumption, Node.js 24, no always-ready instances |
| REST API | Azure Container Apps | Consumption; 0 minimum replicas, bounded max replicas, external HTTPS ingress |
| React SPA | Azure Static Web Apps | Free plan, global static hosting, existing custom domain |
| Object storage/queues | Existing Azure Storage | Unchanged |
| Data/vector store | Cosmos DB for NoSQL | Parallel serverless account, single region, vector search enabled |
| Image embedding | Existing AI Vision | Unchanged |
| Email | Existing Azure Communication Services | Unchanged |

### Supporting Services

| Service | Purpose |
|---|---|
| Application Insights | Keep Functions/API monitoring with a bounded daily cap and sampling |
| Key Vault | Retain existing secret storage and references |
| Managed Identity | Prefer it for new platform resources where supported; preserve existing access during cutover |
| Log Analytics | Use the least-cost retention setting compatible with the test product |

### Cutover Rules

1. New services run alongside the current apps until smoke tests pass.
2. The new Function App starts with triggers disabled; old triggers are disabled
   before the new triggers are enabled to prevent duplicate queue work or email.
3. API and frontend domain changes use lowered DNS TTLs and retain the old apps
   for a seven-day rollback window.
4. No plan, app, DNS record, or other live resource is deleted without a
   separate explicit deletion approval.
5. Cosmos DB cutover uses a parallel serverless account. The old
   provisioned-throughput account stays intact until smoke tests pass and a
   separate deletion approval is granted.

### DNS, Domains, and TLS Cutover

DNS is externally hosted at Namecheap (`dns1.registrar-servers.com` and
`dns2.registrar-servers.com`), not in Azure DNS. The current live bindings are:

| Public hostname | Current record / target | Current TLS binding | Replacement |
|---|---|---|---|
| `tastematcher.art` | Apex A record to `52.165.184.170` | App Service SNI certificate, expires 2026-12-12 | Static Web Apps custom domain with its automatically managed certificate |
| `api.tastematcher.art` | CNAME to `tastematcher-prd-api.azurewebsites.net` | App Service SNI certificate, expires 2026-12-12 | Container Apps custom domain with a managed DigiCert certificate |

Before provisioning a cutover:

1. Record all Namecheap DNS records and reduce the two traffic-record TTLs to
   300 seconds at least 24 hours before the change.
2. Add the Static Web Apps `_dnsauth.www.tastematcher.art` TXT validation
   record. This validates ownership before the apex traffic record changes.
3. Add the Container Apps `asuid.api` TXT verification record, then obtain and
   verify the generated Container Apps CNAME target.
4. Check the DNS zone for CAA records. If any exist, allow `digicert.com`, or
   the Container Apps managed-certificate issuance/renewal will fail.
5. Confirm the replacement managed certificates are `Secured` and test their
   generated service hostnames before changing public traffic records.
6. Cut over `api` by changing its CNAME directly to the Container Apps FQDN;
   cut over the apex using the Static Web Apps provider-supported ALIAS/ANAME
   or CNAME-flattening record. Use its A-record fallback only if Namecheap
   cannot provide flattening and explicitly accept the loss of global routing.
7. Run HTTPS, CORS, SPA deep-link, upload, and API smoke tests after DNS
   propagation. Retain the old bindings and certificate resources for the
   seven-day rollback window; restore the recorded records to roll back.

The existing App Service hostname bindings must not be removed until the new
domains have validated, traffic has cut over, and the rollback window ends.

### Cosmos DB Serverless Cutover

Live inspection on 2026-08-23 found `tastematcher-prd-cosmos` in Central US
with `EnableNoSQLVectorSearch`, no free tier, periodic backup, and fixed
provisioned throughput on the `tastematcher` database plus the `Core`,
`Artworks`, and `Proposals` containers. The minimum provisioned baseline is
therefore approximately 1,600 RU/s before storage. Live data volume is small:
`Artworks` has 5,785 documents / 44 MB, `Core` has 215 documents / 3 MB, and
`Proposals` has 228 documents / less than 1 MB.

The target is `tastematcher-prd-cosmos-sls`, a parallel Cosmos DB for NoSQL
serverless account in Central US. It has database `tastematcher` and
containers:

| Container | Partition key | Special settings |
|---|---|---|
| `Core` | `/domainId` | TTL `-1` |
| `Artworks` | `/domainId` | `/vector` embedding policy, 1024 dimensions, cosine, `quantizedFlat` vector index |
| `Proposals` | `/domainId` | TTL `-1` |

Cutover updates runtime app settings only after the target account exists and
bootstrap data is reset or reseeded. Rollback restores the previous Cosmos app
settings; no reverse data migration is required.

---

## 6. Execution Checklist

### Phase 1: Planning
- [x] Analyze workspace
- [x] Gather currently known requirements
- [x] Confirm subscription and location with user — Visual Studio Enterprise Subscription (`e105e38a-7820-4c7e-b1da-de05227d6355`), Central US
- [x] Scan codebase
- [x] Select recipe
- [x] Plan architecture
- [x] **User approved this plan** — 2026-08-22

### Phase 2: Execution
- [x] Research Container Apps, Static Web Apps, and Flex Consumption requirements
- [ ] Generate Bicep and Azure CLI migration artifacts
- [ ] Generate API Dockerfile and Container Apps deployment configuration
- [ ] Update GitHub Actions deployment workflows
- [ ] Configure monitoring caps/sampling
- [ ] Provision parallel services and deploy code
- [x] Execute Functions trigger cutover — 2026-08-23; old triggers disabled before Flex triggers enabled
- [ ] Execute API/frontend DNS cutovers — 2026-08-23: Namecheap validation TXT records submitted and globally visible; Azure validation/certificate issuance pending before traffic records change
- [x] Run serverless Cosmos preflight — 2026-08-23; no resources changed
- [x] Provision parallel serverless Cosmos account — 2026-08-23; `tastematcher-prd-cosmos-sls`
- [x] Seed or reset Cosmos bootstrap data — 2026-08-23; copied current small dataset
- [x] Execute Cosmos app-setting cutover and smoke tests — 2026-08-23; old Cosmos account retained for rollback
- [ ] Update plan status to `Ready for Validation`

### Phase 3: Validation
- [ ] Invoke azure-validate skill
- [ ] All validation checks pass
- [ ] Update plan status to `Validated`
- [ ] Record validation proof below

### Phase 4: Deployment
- [ ] Invoke azure-deploy skill
- [ ] Deployment successful
- [ ] Update plan status to `Deployed`

---

## 7. Validation Proof

| Check | Command Run | Result | Timestamp |
|---|---|---|---|
| Azure migration preflight | `bash scripts/azure/provision-cost-optimized-hosting.sh` | ✅ Central US Flex + Node 24 available; no resource changes | 2026-08-22 |
| API | Node 24 typecheck and lint | ✅ Pass | 2026-08-22 |
| Frontend | Node 24 typecheck and production build | ✅ Pass | 2026-08-22 |
| Functions | Node 24 typecheck, lint, tests, and build | ✅ Pass (2 suites / 4 tests) | 2026-08-22 |
| Shell and workspace | `bash -n ...` and `git diff --check` | ✅ Pass | 2026-08-22 |
| Flex Function deployment artifact | Node 24 typecheck, lint, Jest (2 suites / 4 tests), and build | ✅ Pass; triggers remain disabled | 2026-08-22 |
| API container image | ACR quick build `cj2` | ✅ Published `tastematcher-api:20260822-2` | 2026-08-22 |
| Replacement API smoke test | Direct HTTPS `/health` on Container Apps FQDN | ✅ Database and Storage checks healthy | 2026-08-22 |
| Replacement frontend smoke test | Static Web Apps Azure hostname `/` and `/login` | ✅ HTTP 200; SPA fallback and security headers verified | 2026-08-22 |
| Flex Functions deployment | Core Tools OneDeploy | ✅ Deployment completed; 3 functions indexed; all triggers remain disabled | 2026-08-23 |
| Serverless Cosmos preflight | `./scripts/azure/provision-serverless-cosmos.sh` | ✅ Source baseline 1,600 RU/s minimum; target did not exist; no changes | 2026-08-23 |
| Serverless Cosmos provisioning | `./scripts/azure/provision-serverless-cosmos.sh --apply` | ✅ Created `tastematcher-prd-cosmos-sls` with `EnableServerless` and `EnableNoSQLVectorSearch`; `Artworks` vector policy/index present | 2026-08-23 |
| Cosmos data copy | `node scripts/azure/copy-cosmos-data-to-serverless.mjs --apply` | ✅ Copied `Core` 215, `Artworks` 5,785, `Proposals` 227; post-copy counts matched before cutover | 2026-08-23 |
| Cosmos app-setting cutover | `./scripts/azure/cutover-serverless-cosmos.sh --apply` | ✅ API Web App, API Container App, Flex Function App, and legacy Function App point to serverless Cosmos endpoint | 2026-08-23 |
| API health after Cosmos cutover | Direct Container Apps and `https://api.tastematcher.art/health` | ✅ `database: ok`, `storage: ok`; latest Container Apps revision running | 2026-08-23 |

**Validated by:** azure-validate skill
**Validation timestamp:** 2026-08-22

---

## 8. Files to Generate

| File | Purpose | Status |
|---|---|---|
| `.azure/plan.md` | Migration source-of-truth plan | Complete |
| `infra/main.bicep` | Parallel Functions, Container Apps, and Static Web Apps infrastructure | Pending approval |
| `webapi/Dockerfile` | Reproducible API image | Pending approval |
| Deployment scripts/workflows | Deploy and safely cut over each replacement service | Pending approval |
| `scripts/azure/provision-serverless-cosmos.sh` | Parallel serverless Cosmos DB creation | Complete |
| `scripts/azure/cutover-serverless-cosmos.sh` | Cosmos runtime app-setting cutover and rollback boundary | Complete |
| `scripts/azure/copy-cosmos-data-to-serverless.mjs` | Optional one-shot copy from provisioned Cosmos to serverless Cosmos | Complete |
| `docs/deployment.md` | Cutover, rollback, and operational runbook | Pending approval |

---

## 9. Next Steps

**Current:** The replacement API, frontend, and Functions code are deployed and
validated on their generated Azure hostnames. Flex Functions are now the sole
enabled background processors; the old triggers are disabled. The API and
frontend custom-domain ownership records are live in Namecheap; Azure
validation/certificate issuance must complete before routing traffic. Legacy
resource retirement remains pending.

1. Validate generated artifacts before parallel provisioning.
2. Provision new services, deploy code, and validate generated service hostnames.
3. Perform separately reviewed trigger and DNS cutovers; request separate approval before retiring old resources.
4. Run `scripts/azure/provision-serverless-cosmos.sh` preflight, then create the
   parallel account with `--apply` after review.
5. Seed, reset, or copy required Cosmos bootstrap data with
   `scripts/azure/copy-cosmos-data-to-serverless.mjs`.
6. Run `scripts/azure/cutover-serverless-cosmos.sh` preflight, then apply the
   app-setting cutover and smoke tests.

---

## Research Summary

- **Functions Flex Consumption:** Central US and Node.js 24 are available in
  the active Azure CLI. Flex uses One Deploy and must be a new application;
  the new app therefore starts with every existing trigger disabled.
- **Container Apps:** Consumption supports `minReplicas: 0`; the API uses
  port 8080, external HTTPS ingress, a maximum of three replicas, and health
  probes based on its dependency-aware `/health` endpoint. The environment is
  configured with `logs-destination none` to avoid creating a new billable Log
  Analytics workspace during this POC migration.
- **Static Web Apps:** Central US supports Static Web Apps. The Free SKU needs
  an SPA navigation fallback and can host the existing apex custom domain with
  Azure-managed TLS.
- **Security:** Existing application settings are copied into Container Apps
  secrets without printing values. The Container App receives a system managed
  identity with `AcrPull` on the new private registry. Existing Cosmos, Storage,
  Vision, email, and JWT configuration remains unchanged.
- **Cosmos DB serverless:** Azure CLI serverless account creation uses
  `EnableServerless`; vector search uses `EnableNoSQLVectorSearch`. The
  `Artworks` vector embedding policy must be supplied separately from the
  indexing policy via the CLI `--vector-embeddings` argument.
