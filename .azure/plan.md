# Azure Deployment Plan

> **Status:** Validated

Generated: 2026-08-20

---

## 0. Local Command: Automatic Azure CLI Preparation

**Goal:** Make `pnpm run start:local:production` self-contained so a developer
does not need to run `az login` or `az account set` manually first.

**Path:** Modify the existing read-only local-production sync script and keep
the established Azure CLI recipe. No Azure resource or application setting will
be changed.

### Planned behavior

1. Reuse the current Azure CLI session when it is valid.
2. If no valid session exists, launch `az login` against the confirmed tenant.
3. Automatically select the confirmed production subscription.
4. Verify the exact tenant, subscription, production resource group, Web App,
   and Function App before reading settings.
5. Continue generating protected local configuration without printing secret
   values, then start the existing local frontend/API processes.
6. Fail closed before reading settings or starting the app if authentication,
   tenant selection, subscription selection, or resource identity validation
   fails.

### Confirmed Azure context

- Subscription: Visual Studio Enterprise Subscription
  (`e105e38a-7820-4c7e-b1da-de05227d6355`)
- Tenant: `043348b8-3c3a-488d-a337-62a7ce2e4ae8`
- Production location: `centralus`

### Checklist

- [x] Analyze the existing pnpm command and sync script
- [x] Reuse the confirmed production Azure context
- [x] **User approves this command automation plan** (2026-08-21)
- [x] Add guarded automatic login and subscription selection
- [x] Add mock-Azure coverage for existing-session, login-required, and refusal paths
- [x] Update local setup documentation
- [x] Run Node 24 tests, repository validation, and read-only Azure validation

---

## 0. Live Change: Retire the Remaining Dev Azure Environment

**Goal:** Permanently remove the Azure Dev environment that still exists even
though the repository and delivery workflows now target production only.

**Path:** Delete three dedicated Dev-only resource groups through Azure CLI.
No production resource or production resource group is in scope.

### Confirmed Azure context

- Subscription: Visual Studio Enterprise Subscription
  (`e105e38a-7820-4c7e-b1da-de05227d6355`)
- Dev location: `israelcentral` (one Vision resource is in `francecentral`)
- Production group retained: `tastematcher-prd-rg` in `centralus`

### Exact destructive scope

1. The former primary Dev resource group — 23 resources, including Dev
   Storage, Key Vault, Functions, API, frontend, two App Service plans,
   Communication/Email, Vision, Application Insights, alerts, and five
   user-assigned identities.
2. The Dev API telemetry managed resource group — one Log Analytics workspace.
3. The Dev frontend telemetry managed resource group — one Log Analytics workspace.

The Dev Storage account still contains four blob containers and three queues.
The Dev Key Vault still contains enabled secret records. Deleting the resource
group will permanently remove the storage data and compute resources; Key Vault
soft-delete retention may preserve the vault temporarily unless it is purged.
No deletion locks are present.

### Execution checklist

- [x] Inventory the subscription and exact Dev resources
- [x] Verify the active subscription and distinguish production resources
- [x] Check deletion locks and confirm Dev data/secrets still exist
- [x] **User confirms the exact subscription, locations, and irreversible deletion scope** (2026-08-21)
- [x] Invoke azure-validate for the deletion preflight
- [x] Invoke azure-deploy and delete the Dev environment; Azure automatically removed both managed logging groups
- [x] Wait for completion and verify no Dev TasteMatcher resources remain
- [x] Record deletion proof and mark this plan `Deployed`

### Explicitly out of scope

- `tastematcher-prd-rg` and every production data/compute resource
- The two zero-traffic production deployment slots
- Production Key Vault, frontend Application Insights, and production OIDC identity
- Purging any soft-deleted Key Vault

---

## 0. Current Change: Production-Only Resource Reference Cleanup

**Goal:** Keep executable configuration, scripts, tests, and documentation aligned exclusively with the active production Azure resources, while preserving required language/tooling concepts such as `NODE_ENV=development`, package `devDependencies`, and local API execution.

**Path:** Modify the existing Azure CLI + GitHub Actions repository configuration. No Azure resource will be created, updated, or deleted.

### Audit findings and planned cleanup

1. Keep only the guarded local-production Web API profile and its value-free example.
2. Model scraper endpoints as explicit `Local API`/`Production API` targets. Both targets remain production-data capable; the local target is a local process, not an Azure environment.
3. Remove unused resource-name helpers and their tests.
4. Keep Functions configuration exclusively in `local.settings.json`, as required by Functions Core Tools, with generic ignore rules that prevent accidental secret tracking.
5. Remove obsolete migration commentary and completed historical context that describes resources outside the current architecture.
6. Strengthen static validation to reject any non-production Azure app/resource/credential targets without preserving operational fallback paths.
7. Retain only legitimate non-resource uses of development terminology: `NODE_ENV=development` is a required local safety control, `devDependencies`/`--omit=dev` are package-manager concepts, and frontend development build configuration is framework-owned.

### Cleanup checklist

- [x] Audit executable configuration and documentation
- [x] Confirm production remains the sole Azure target under subscription `e105e38a-7820-4c7e-b1da-de05227d6355` in `centralus`
- [x] **User approved this cleanup plan** (2026-08-21)
- [x] Remove obsolete scripts, helpers, templates, and resource references
- [x] Update tests and production-only documentation
- [x] Run lint, typecheck, all tests, all builds, static scans, and Azure validation

---

## 0.1 Completed Change: Continuous Production Deployment and Quality Gates

**Goal:** Automatically deploy each affected production component after a successful push to `main`, while adding comprehensive local and CI quality gates before commits, builds, and deployments.

**Path:** Modify existing Azure CLI + GitHub Actions delivery configuration. No Azure resource creation, deletion, scaling, or region change is planned.

### Planned release behavior

1. Pull requests targeting `main` run validation and build jobs but never deploy.
2. Pushes to `main` run the full relevant quality gate, package the affected component, and automatically deploy it to the existing production resource only after all required jobs pass.
3. Manual dispatch remains available and uses the same gates; it cannot bypass validation.
4. Each deployment performs a component-specific post-deploy smoke check and fails visibly if production is unhealthy.
5. Workflow permissions remain least-privilege, production environment protection remains in place, and only the confirmed production app/resource names and credentials are accepted.

### Planned quality gates

- Add root scripts for repository lint, typecheck, tests, builds, static configuration validation, and an aggregate `ci:check` command.
- Add Husky `pre-commit` and `pre-push` hooks. Pre-commit runs staged-file checks plus the fast correctness suite; pre-push runs the complete CI gate including production builds.
- Enable API and Functions tests in their workflows; add missing typecheck/tests to frontend; validate Common wherever a dependent package is built.
- Add pull-request triggers and root dependency/configuration paths so lockfile, Node, package-manager, and workflow changes cannot bypass CI.
- Add YAML/shell/JSON, tracked-secret, build-artifact secret, and stale production-target/runtime checks to CI.
- Run the broadest stable test suites. Any currently failing pre-existing suite must be fixed or explicitly isolated with a documented reason before it can become a required gate.

### Change checklist

- [x] Analyze existing workflows, package scripts, and hook configuration
- [x] Preserve the existing Azure CLI/App Service/Functions deployment recipe and production architecture
- [x] Reuse the confirmed subscription `e105e38a-7820-4c7e-b1da-de05227d6355` and `centralus` resources without infrastructure changes
- [x] **User approved this CI/CD plan** (2026-08-21)
- [x] Implement local hooks and aggregate validation scripts
- [x] Update all three GitHub Actions workflows for PR validation and gated automatic production deployment from `main`
- [x] Run validation under Node 24 / pnpm 10.20.0
- [x] Invoke azure-validate and record proof

---

## 1. Project Overview

**Goal:** Restore a supported local developer workflow that runs the frontend and API on the developer machine while using the existing production Azure data services, and upgrade the repository plus the existing production Node hosting resources from Node.js 22 to Node.js 24 LTS.

**Path:** Add Components / Modify Existing Azure Application

This plan does not recreate a development Azure environment. It preserves the current production architecture and introduces a deliberate, clearly named local-to-production workflow.

---

## 2. Requirements

| Attribute        | Value                                                                                                              |
| ---------------- | ------------------------------------------------------------------------------------------------------------------ |
| Classification   | Production application with a local developer client                                                               |
| Scale            | Preserve current production scale and SKUs                                                                         |
| Budget           | No new Azure resources; retain existing spend                                                                      |
| Compliance       | Production credentials must remain untracked and must never be printed; preserve current Central US data placement |
| **Subscription** | Visual Studio Enterprise Subscription (`e105e38a-7820-4c7e-b1da-de05227d6355`) - confirmed 2026-08-20              |
| **Location**     | `centralus` - confirmed 2026-08-20                                                                                 |

### Local-to-production safety requirements

1. Local frontend calls a local API by default.
2. Local API may use production Cosmos DB, Storage, Vision, and related dependencies only through an ignored, machine-local configuration generated from authorized Azure access.
3. No production credential is added to Git, build artifacts, logs, command output, or documentation.
4. Background Functions are not started by the default local command because doing so can consume production queues and trigger production side effects. A separately documented opt-in command/profile may be provided if explicitly needed.
5. The local-production mode must be unmistakable in command names and startup output/documentation.
6. Local-to-production data targeting must be separate from `NODE_ENV`: the current code enables development-only authentication behavior when `NODE_ENV=development` and real email behavior when `NODE_ENV=prd`, so neither value is a safe implicit local-production switch.

---

## 3. Components Detected

| Component                 | Type                      | Technology                                       | Path                                   |
| ------------------------- | ------------------------- | ------------------------------------------------ | -------------------------------------- |
| Shared contracts/services | Library                   | TypeScript, Azure SDKs                           | `common/`                              |
| Web API                   | API                       | NestJS on Azure App Service                      | `webapi/`                              |
| Frontend                  | SPA                       | React on Azure App Service                       | `frontend/`                            |
| Background processing     | Serverless worker         | Azure Functions v4, Node.js programming model v4 | `functions/`                           |
| Provisioning              | Infrastructure automation | Azure CLI shell script                           | `scripts/azure/provision-resources.sh` |
| CI/CD                     | Build and deployment      | GitHub Actions                                   | `.github/workflows/`                   |

### Dependencies

| Component | Depends On                                                       | Type                        |
| --------- | ---------------------------------------------------------------- | --------------------------- |
| Web API   | Cosmos DB, Blob/Queue Storage, AI Vision, Communication Services | Azure managed/data services |
| Frontend  | Web API                                                          | HTTP                        |
| Functions | Cosmos DB, Blob/Queue Storage, AI Vision, Communication Services | Azure managed/data services |

### Existing infrastructure findings

| Item                             | Status                                                                                       |
| -------------------------------- | -------------------------------------------------------------------------------------------- |
| `azure.yaml` / Bicep / Terraform | Not present                                                                                  |
| Azure CLI provisioning           | Present; production defaults to `centralus`                                                  |
| App Service runtime              | Node.js 24 LTS                                                                               |
| Azure Functions runtime          | Functions v4 with Node.js 24                                                                 |
| GitHub Actions runtime           | Node.js 24.x in all three workflows                                                          |
| GitHub Actions environments      | Production-only deployment through the `prd` environment                                     |
| Package engines                  | Node.js `>=24 <25` across the workspace                                                      |
| Version manager file             | `.nvmrc` selects Node.js 24                                                                  |
| Secret safety                    | Local settings are ignored, value-free examples are tracked, and build artifacts are scanned |

---

## 4. Recipe Selection

**Selected:** Azure CLI (preserve existing recipe)

**Rationale:** The repository already provisions and configures all production services through `scripts/azure/provision-resources.sh`. This change should modernize that established automation rather than introduce a second IaC/deployment system during a runtime and developer-environment migration.

---

## 5. Architecture

**Stack:** App Service + Serverless (existing architecture)

### Service Mapping

| Component    | Azure Service            | SKU                                                      |
| ------------ | ------------------------ | -------------------------------------------------------- |
| Web API      | Linux Azure App Service  | Existing production plan (`P1V3` in provisioning script) |
| Frontend     | Linux Azure App Service  | Existing production plan (`P1V3` in provisioning script) |
| Functions    | Linux Azure Functions v4 | Existing production plan                                 |
| Data         | Azure Cosmos DB          | Existing production account/database                     |
| Files/queues | Azure Storage            | Existing production account                              |

### Supporting Services

| Service              | Purpose                     |
| -------------------- | --------------------------- |
| Application Insights | Existing monitoring and APM |

No Azure resources will be created or deleted. The only intended live-resource mutation is changing the Node runtime configuration of the three existing production compute resources after validation and explicit deployment confirmation.

---

## 6. Execution Checklist

### Phase 1: Planning

- [x] Analyze workspace
- [x] Gather requirements from the request and existing production configuration
- [x] Confirm subscription and location with user
- [x] Scan codebase
- [x] Select recipe
- [x] Plan architecture
- [x] **User approved this plan** (2026-08-20)

### Phase 2: Execution

- [x] Research current official Node.js 24 support for Linux App Service and Azure Functions v4
- [x] Add a repository-wide Node.js 24 contract (`.nvmrc`, root/package engines, package-manager metadata, workspace package engines)
- [x] Regenerate dependency lockfiles under Node.js 24 and update Node type/runtime-sensitive dependencies only where compatibility requires it
- [x] Update all GitHub Actions build/deployment runtimes and generated deployment package engines to Node.js 24
- [x] Make the active production target explicit and prevent workflow events from selecting any other Azure target
- [x] Update Azure CLI provisioning and app settings to use the officially supported Node.js 24 runtime identifiers
- [x] Add a safe script that reads authorized production app settings into ignored local config files without echoing values, with restrictive file permissions
- [x] Add explicit root commands for syncing the profile and running local frontend/API against production dependencies
- [x] Introduce an explicit local-production profile signal that does not enable development-only auth shortcuts or general production email side effects; verification email remains available for secure login
- [x] Keep production Functions consumption opt-in rather than part of the default local command
- [x] Remove environment-file copying from API builds and sanitize tracked secret-bearing local configuration files into non-secret examples/templates
- [x] Update `.gitignore`, READMEs, deployment guidance, and operational warnings
- [x] Update this plan status to `Ready for Validation`

### Phase 3: Validation

- [x] Invoke azure-validate skill
- [x] Verify Node.js 24 and package-manager versions
- [x] Install with the frozen workspace lockfile
- [x] Run focused lint, typecheck, tests, and builds for touched behavior/workspaces
- [x] Shell/YAML/JSON syntax-check automation and configuration
- [x] Assert no environment file or secret is included in build/deployment artifacts
- [x] Exercise the local-production sync in a no-secret-output/dry-run mode
- [x] Confirm Azure reports Node.js 24 as an available runtime before any live mutation
- [x] All validation checks pass
- [x] Update plan status to `Validated`
- [x] Record validation proof below

### Phase 4: Deployment

- [x] Obtain explicit confirmation before changing live production runtime settings
- [x] Update production API App Service to Node.js 24
- [x] Update production frontend App Service to Node.js 24
- [x] Update production Function App to Node.js 24
- [x] Restart only where Azure requires it and run health/smoke checks after each component
- [x] Roll back the individual component to Node.js 22 if its smoke check fails (rollback guards armed; no rollback required)
- [x] Update plan status to `Deployed`

---

## 7. Validation Proof

> **Required:** The azure-validate skill will populate this section before status can become `Validated`.

| Check                        | Command Run                                                                                             | Result                                                                                                         | Timestamp  |
| ---------------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ---------- |
| Runtime/toolchain            | `node --version`; `pnpm --version`                                                                      | Pass: Node 24.19.0, pnpm 10.20.0                                                                               | 2026-08-20 |
| Frozen install               | `CI=true pnpm install --frozen-lockfile`                                                                | Pass                                                                                                           | 2026-08-20 |
| Type safety                  | Four workspace `typecheck` commands                                                                     | Pass                                                                                                           | 2026-08-20 |
| Focused behavior tests       | Common, API safety/auth/email, Functions, frontend API resolution                                       | Pass: 17 + 16 + 4 + 4 tests                                                                                    | 2026-08-20 |
| Production builds            | `pnpm run build:webapi`; `build:frontend`; `build:functions`                                            | Pass                                                                                                           | 2026-08-20 |
| Static configuration         | Shell, YAML, JSON, Git tracking/artifact scans, `git diff --check`                                      | Pass                                                                                                           | 2026-08-20 |
| Azure live preflight         | `./scripts/azure/update-node24-runtimes.sh`                                                             | Pass: Linux Functions v4 on non-Consumption P0v3; Node 24 advertised; no mutation                              | 2026-08-21 |
| Fresh toolchain/install      | Node 24.19.0; Corepack pnpm 10.20.0; `CI=true corepack pnpm install --frozen-lockfile`                  | Pass                                                                                                           | 2026-08-21 |
| Fresh lint/typecheck/tests   | All workspace typechecks; API/Functions/frontend lint; focused Common/API/Functions/frontend tests      | Pass: 17 + 16 + 4 + 4 tests; one non-failing pre-existing frontend warning                                     | 2026-08-21 |
| Fresh production builds      | `corepack pnpm run build:webapi`; `build:frontend`; `build:functions`                                   | Pass under Node 24.19.0                                                                                        | 2026-08-21 |
| Credential safety            | Rotated Storage, Cosmos, Vision, Communication, and JWT credentials without printing values             | Pass: both historical key slots invalidated; frontend backend-secret settings removed                          | 2026-08-21 |
| Local-production profiles    | `./scripts/azure/sync-local-production-config.sh prd`; permission/safety-marker and Git-tracking checks | Pass: ignored mode-600 files; API targets `prd`; all Functions triggers disabled                               | 2026-08-21 |
| Final static/live validation | Shell/YAML/JSON checks; secret/artifact scans; corrected runtime preflight; endpoint checks             | Pass: API 200, frontend 200, Function App Running; no Azure mutation during preflight                          | 2026-08-21 |
| Continuous-delivery tests    | Full Common, Web API, Functions, and frontend suites                                                    | Pass: 17 + 92 + 4 + 53 = 166 tests                                                                             | 2026-08-21 |
| Continuous-delivery quality  | All four lint and typecheck commands; all four production builds; `./scripts/ci/validate-repository.sh` | Pass; workflow YAML, shell, JSON, secret tracking, artifact, and Node target checks                            | 2026-08-21 |
| Current Azure runtime        | `az account show`; `./scripts/azure/update-node24-runtimes.sh`                                          | Pass: exact subscription/RG; Functions P0v3; Node 24 advertised and already selected                           | 2026-08-21 |
| Resource-reference cleanup   | Obsolete environment/config and unused resource-wiring scans                                            | Pass: no obsolete Azure environment target or removed resource wiring remains                                  | 2026-08-21 |
| Cleanup regression gate      | Node 24.19.0; `corepack pnpm run ci:check`                                                              | Pass: lint, typecheck, all tests, all builds, and repository static validation                                 | 2026-08-21 |
| Cleanup Azure preflight      | `./scripts/azure/update-node24-runtimes.sh`                                                             | Pass: exact production resources and Node 24 runtime identifiers; no Azure mutation                            | 2026-08-21 |
| Dev deletion preflight       | Exact subscription/group existence, resource counts, locks, and production-reference checks             | Pass: 23 + 1 + 1 Dev resources; zero locks; production has no Dev resource references                          | 2026-08-21 |
| Automatic local Azure login  | Four fake-CLI scenarios; Node 24 `pnpm run ci:check`; real `pnpm run sync:local:production`             | Pass: reused valid session, login/refusal branches covered, exact tenant/subscription verified, files mode 600 | 2026-08-21 |

**Validated by:** azure-validate skill

**Validation timestamp:** 2026-08-21

### Deployment Proof

| Component                  | Applied Runtime                | Verification                                                                                                               | Result                                                                                                                  | Timestamp  |
| -------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------- |
| Frontend App Service       | `NODE\|24-lts`, `~24`          | Runtime query plus `https://tastematcher.art/`                                                                             | Pass: HTTP 200                                                                                                          | 2026-08-21 |
| API App Service            | `NODE\|24-lts`, `~24`          | Runtime query plus `https://api.tastematcher.art/health`                                                                   | Pass: HTTP 200                                                                                                          | 2026-08-21 |
| Function App               | `NODE\|24`, `~24`              | Runtime query, app state, host function enumeration                                                                        | Pass: Running; 3 functions enumerated                                                                                   | 2026-08-21 |
| Final deployment audit     | All runtime/default pairs      | Endpoint health, local profile permissions/tracking, trigger disables                                                      | Pass                                                                                                                    | 2026-08-21 |
| Local-production smoke     | Node 24 local API              | `start:local:production`; `GET http://127.0.0.1:8080/health`                                                               | Pass: explicit production warning; HTTP 200; process stopped after check                                                | 2026-08-21 |
| CI/CD configuration        | Node 24 GitHub runners         | PR no-deploy gates; matching `main` push production deploy gates; component smoke-check configuration                      | Pass; configuration validated only, no application deployment performed this turn                                       | 2026-08-21 |
| Dev environment retirement | Three Dev-only resource groups | Delete the primary Dev group; Azure cascaded deletion to both managed Log Analytics groups; subscription-wide absence scan | Pass: zero active Dev resources; production API/frontend HTTP 200 and Function App Running; soft-deleted vault retained | 2026-08-21 |

### Research Summary

- Microsoft App Service documentation supports Node.js 24 LTS on Linux with `linuxFxVersion=NODE|24-lts` and recommends `WEBSITE_NODE_DEFAULT_VERSION=~24`.
- Microsoft Azure Functions documentation lists Node.js 24 as GA on Functions runtime v4, with expected support through 2028-04-30.
- Node.js 24 is not supported on Linux Consumption; the existing production plan must therefore be verified as a non-Consumption plan before its runtime changes.
- Local Azure access should use authorized CLI identity and ignored files with least privilege. No secret value may be logged or added to an artifact.
- Azure CLI was reauthenticated against the confirmed subscription. Live preflight verified the exact production resources, Functions v4 on non-Consumption P0v3, and advertised Node 24 runtime identifiers.

---

## 8. Files to Generate or Update

| File                                            | Purpose                                     | Status   |
| ----------------------------------------------- | ------------------------------------------- | -------- |
| `.azure/plan.md`                                | Source-of-truth plan                        | Complete |
| `.nvmrc` and package manifests                  | Repository-wide Node.js 24 contract         | Complete |
| `pnpm-lock.yaml` and relevant npm lockfiles     | Node.js 24-compatible dependency resolution | Complete |
| `.github/workflows/*-deploy.yml`                | Node.js 24 CI/CD and deployment artifacts   | Complete |
| `scripts/azure/provision-resources.sh`          | Node.js 24 Azure resource configuration     | Complete |
| `scripts/azure/sync-local-production-config.sh` | Secure local production profile generation  | Complete |
| `.gitignore` and non-secret env examples        | Secret-safe local configuration             | Complete |
| Root and package READMEs / deployment docs      | Setup, warnings, validation, rollback       | Complete |

---

## 9. Risks and Mitigations

| Risk                                                                 | Mitigation                                                                                                                                                                   |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local writes corrupt production data                                 | Explicitly named commands, prominent warnings, least-privilege Azure access where available, and no automatic Functions startup                                              |
| Local worker consumes production queues or sends email               | Functions remain opt-in and are documented as side-effecting                                                                                                                 |
| Credentials are committed or packaged                                | Generate ignored files locally, set restrictive permissions, stop copying env files into builds, and validate artifacts/secrets tracking                                     |
| Previously committed credentials remain recoverable from Git history | Coordinated rotation completed for Storage, Cosmos, Vision, Communication, and JWT credentials; historical values are invalid and local replacements remain ignored/mode 600 |
| Node.js 24 is unsupported by a selected Azure host/runtime           | Check official support and live runtime lists before editing scripts or resources; stop rather than force an unsupported identifier                                          |
| Node.js 24 dependency/runtime regression                             | Frozen clean install plus lint/typecheck/test/build; sequential production rollout with per-component smoke checks and Node.js 22 rollback                                   |
| Runtime change causes production interruption                        | Change one compute component at a time and verify health before continuing                                                                                                   |

---

## 10. Next Steps

> Current: Repository implementation, credential rotation, protected local-production sync, Node 24 rollout, and continuous-delivery validation are complete.

1. Commit/review and push the repository changes through the normal source-control workflow; the affected component workflows will then run their gates and deploy automatically from `main`.
2. Monitor production telemetry after each automatic deployment and use the documented per-component Node 22 rollback only if a delayed runtime regression appears.
