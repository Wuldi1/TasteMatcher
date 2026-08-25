# TasteMatcher Deployment and Runtime Operations

TasteMatcher has one Azure environment: production (`prd`). Repository and live
Azure runtimes use Node.js 24.

Credential rotation for values previously committed to Git remains a release
blocker. Removing a value from the current tree does not remove it from Git
history.

## Prerequisites

- Node.js 24 LTS (use the committed `.nvmrc`)
- Corepack and the pnpm 10 version pinned in `package.json`
- Azure CLI and `jq` for local production-backed configuration and runtime
  preflight
- Access to subscription `e105e38a-7820-4c7e-b1da-de05227d6355`
- Separate approval before changing a production runtime or deploying code

Install and build from the repository root:

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm run build:webapi
pnpm run build:frontend
pnpm run build:functions
```

## Local execution against production data

The configuration sync reads settings from the production Container App and
Flex Function App and writes ignored, owner-only local files. It does not
change an Azure resource and does not print secret values.

```bash
az login
az account set --subscription e105e38a-7820-4c7e-b1da-de05227d6355
pnpm run sync:local:production
pnpm run start:local:production
```

The local API listens on `http://localhost:8080`; the frontend listens on
`http://localhost:3000` and calls the local API. Start with the read-only API
health check:

```bash
curl --fail http://localhost:8080/health
```

Production data is live customer data. Avoid `POST`, `PUT`, `PATCH`, and
`DELETE` requests unless the production mutation is intentional and reviewed.
The default command does not start Azure Functions because a local trigger can
consume production messages or mutate production data. The guarded one-trigger
procedure is documented in [`functions/README.md`](../functions/README.md).

Never commit or share `webapi/.env.local-production` or
`functions/local.settings.json`. Both are generated secrets. Value-free example
files document the expected key names.

## CI/CD behavior

The three workflows use Node.js 24 and enforce the same validation gates in
three modes:

- A pull request to `main` validates, tests, and builds without deploying.
- A matching push to `main` validates, tests, builds, deploys to production,
  and runs a production health check.
- A `workflow_dispatch` run follows the same gated production path.

Each workflow deploys only its intended production component:

- `.github/workflows/webapi-deploy.yml` targets Container App `tastematcher-prd-api-ca`.
- `.github/workflows/frontend-deploy.yml` targets Static Web App `tastematcher-prd-static`.
- `.github/workflows/functions-deploy.yml` targets Flex Function App `tastematcher-prd-flex`.

The workflows require their existing production Azure credential secrets. The
`prd` GitHub environment remains the deployment boundary and can provide
required-reviewer protection when configured in GitHub.

## Current production hosting

The production API runs in Container Apps Consumption, the frontend is hosted
by Static Web Apps Free, and background processing runs on Flex Consumption
Functions. The public endpoints are `https://tastematcher.art` and
`https://api.tastematcher.art`; Azure-managed certificates terminate TLS.

## Cosmos DB runtime

TasteMatcher uses the serverless Cosmos DB for NoSQL account
`tastematcher-prd-cosmos-sls`, database `tastematcher`. The `Core`, `Artworks`,
and `Proposals` containers are partitioned by `/domainId`. `Artworks` has the
required `/vector` embedding policy and `quantizedFlat` vector index for the
app's `VectorDistance` queries.

After any Cosmos app-setting or data-store maintenance, verify:

```bash
curl --fail https://api.tastematcher.art/health
curl --fail https://tastematcher-prd-api-ca.lemonwave-6134900c.centralus.azurecontainerapps.io/health
```

Then smoke test login, artwork upload, vectorization, recommendations, and the
enabled Functions triggers.

## Production checks

Read current application state without changing it:

```bash
az functionapp show \
  --resource-group tastematcher-prd-rg \
  --name tastematcher-prd-flex \
  --query state -o tsv

az containerapp show \
  --resource-group tastematcher-prd-rg \
  --name tastematcher-prd-api-ca \
  --query properties.runningStatus -o tsv

az staticwebapp show \
  --resource-group tastematcher-prd-rg \
  --name tastematcher-prd-static \
  --query defaultHostname -o tsv
```

## Production logs and product activity

Open **Monitor → Workbooks → TasteMatcher Production Logs** in the Azure portal
to view shared API and Function logs. The workbook is backed by
`tastematcher-prd-logs`, which retains logs for 30 days and has a 0.25 GB/day
ingestion cap.

The product-activity panels report successful logins; galleries and invited
users; manual artwork additions and auction-import batches; likes/dislikes;
artwork and user comments; and proposal creation, status changes (including
approval or decline), and comments. Events are compact structured API stdout
records: they deliberately exclude emails, names, titles, URLs, comment text,
and all record identifiers. They appear only after an API build containing the
activity logger is deployed.

For a focused investigation, run this query against the workspace:

```kusto
ContainerAppConsoleLogs_CL
| where ContainerAppName_s == "tastematcher-prd-api-ca"
| extend activity = parse_json(extract(@"(\\{.*\\})", 1, Log_s))
| where tostring(activity.event) == "product_activity"
| project TimeGenerated, eventName=tostring(activity.eventName),
          proposalStatus=tostring(activity.proposalStatus),
          source=tostring(activity.source), count=tolong(activity.count)
| order by TimeGenerated desc
```

For Functions trigger or timeout failures, inspect Application Insights and
confirm bindings, queue names, and `host.json` settings without printing
connection strings or app-setting values.

## Release blockers and completion criteria

- Rotate or revoke every credential that may have existed in a tracked local
  environment file, then replace the corresponding production app and GitHub
  secrets.
- Run repository/CI validation under Node.js 24.
- Verify the public frontend and API health endpoints after each deployment.
- Merge to `main` only after the preceding checks pass; the production workflows then deploy automatically.
