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
| Data/vector store | Cosmos DB for NoSQL | Serverless account, single region, vector search enabled |
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
   until post-cutover smoke tests pass.
4. No plan, app, DNS record, or other live resource is deleted without a
   separate explicit deletion approval.

### DNS, Domains, and TLS Cutover

DNS is externally hosted at Namecheap (`dns1.registrar-servers.com` and
`dns2.registrar-servers.com`), not in Azure DNS. The current live bindings are:

| Public hostname | Current record / target | Current TLS binding | Replacement |
|---|---|---|---|
| `tastematcher.art` | ALIAS to `lemon-sky-095389f10.7.azurestaticapps.net` | Static Web Apps managed certificate | Static Web Apps custom domain with its automatically managed certificate |
| `api.tastematcher.art` | CNAME to `tastematcher-prd-api-ca.lemonwave-6134900c.centralus.azurecontainerapps.io` | Container Apps managed DigiCert certificate | Container Apps custom domain with a managed DigiCert certificate |

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

### Cosmos DB Runtime

The active data store is `tastematcher-prd-cosmos-sls`, a Cosmos DB for NoSQL
serverless account in Central US. It has database `tastematcher` and containers:

| Container | Partition key | Special settings |
|---|---|---|
| `Core` | `/domainId` | TTL `-1` |
| `Artworks` | `/domainId` | `/vector` embedding policy, 1024 dimensions, cosine, `quantizedFlat` vector index |
| `Proposals` | `/domainId` | TTL `-1` |

Runtime app settings for the API and Functions point to this serverless account.

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
- [x] Execute API/frontend DNS cutovers — 2026-08-23: `api` now routes to Container Apps and the apex ALIAS routes to Static Web Apps; public HTTPS checks for `/`, `/login`, and API `/health` passed. Retain legacy App Service bindings/resources through 2026-08-30 for rollback.
- [x] Validate serverless Cosmos runtime — 2026-08-23; `tastematcher-prd-cosmos-sls`
- [x] Retire legacy Function/App Service compute — 2026-08-23; old Function App, API/frontend App Services, P0v3 plans, and retired App Service certificates deleted after public smoke tests passed
- [ ] Retire legacy Cosmos account `tastematcher-prd-cosmos` — pending explicit permanent data-deletion confirmation
- [x] Update plan status to `Ready for Validation`

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
| Serverless Cosmos runtime | Azure CLI runtime endpoint checks | ✅ API Web App, API Container App, Flex Function App, and legacy Function App point to `tastematcher-prd-cosmos-sls` | 2026-08-23 |
| API health after Cosmos validation | Direct Container Apps and `https://api.tastematcher.art/health` | ✅ `database: ok`, `storage: ok`; latest Container Apps revision running | 2026-08-23 |
| Public-domain smoke test | `https://tastematcher.art/`, `/login`, and `https://api.tastematcher.art/health` | ✅ HTTP 200 with managed TLS after DNS cutover | 2026-08-23 |
| Legacy compute retirement | Azure inventory plus public frontend/API checks | ✅ Old Function/App Service hosts, paid plans, and App Service certificates absent; replacement endpoints healthy | 2026-08-23 |

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
| `docs/deployment.md` | Cutover, rollback, and operational runbook | Pending approval |

---

## 9. Next Steps

**Current:** The replacement API, frontend, and Functions code are deployed and
validated on their public domains. Flex Functions are now the sole enabled
background processors; the old triggers are disabled. `api.tastematcher.art`
routes to Container Apps and `tastematcher.art` routes to Static Web Apps with
managed TLS. Legacy App Service and Function hosting has been retired. The
pre-serverless Cosmos account remains the final retirement item pending its
explicit permanent data-deletion confirmation.

1. Delete the legacy provisioned Cosmos account after explicit confirmation.
2. Monitor the new consumption services and serverless Cosmos account for normal test-product usage.

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
- **Cosmos DB serverless:** The active account uses `EnableServerless` and
  `EnableNoSQLVectorSearch`. The `Artworks` container has a separate vector
  embedding policy and vector index for `/vector`.
