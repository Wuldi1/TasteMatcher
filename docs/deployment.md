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

The configuration sync reads settings from the exact production Web App and
Function App and writes ignored, owner-only local files. It does not change an
Azure resource and does not print secret values.

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

- `.github/workflows/webapi-deploy.yml` targets `tastematcher-prd-api`.
- `.github/workflows/frontend-deploy.yml` targets `tastematcher-prd-web`.
- `.github/workflows/functions-deploy.yml` targets `tastematcher-prd-func`.

The workflows require their existing production Azure credential secrets. The
`prd` GitHub environment remains the deployment boundary and can provide
required-reviewer protection when configured in GitHub.

## Node.js 24 production rollout

Do not run `scripts/azure/provision-resources.sh` to update an existing runtime;
that script reconciles broader infrastructure. Use the narrow runtime script,
which is read-only by default:

```bash
./scripts/azure/update-node24-runtimes.sh
```

The preflight verifies the approved subscription and resource group, Linux
hosting, Functions v4, a non-Consumption Functions plan, and Azure-advertised
Node.js 24 runtime identifiers. It also prints the current runtime identifiers
and Node defaults to record for rollback. No Azure resource is changed.

After repository validation and explicit production approval, apply and verify
one component at a time:

```bash
./scripts/azure/update-node24-runtimes.sh --apply functions
./scripts/azure/update-node24-runtimes.sh --apply api
./scripts/azure/update-node24-runtimes.sh --apply frontend
```

Run the relevant health/smoke check after each command and stop before updating
the next component if it fails. Roll back only the failed component to the
runtime values captured by the preflight.

## Production checks

Read current application state without changing it:

```bash
az functionapp show \
  --resource-group tastematcher-prd-rg \
  --name tastematcher-prd-func \
  --query state -o tsv

az webapp show \
  --resource-group tastematcher-prd-rg \
  --name tastematcher-prd-api \
  --query state -o tsv

az webapp show \
  --resource-group tastematcher-prd-rg \
  --name tastematcher-prd-web \
  --query state -o tsv
```

For Functions trigger or timeout failures, inspect Application Insights and
confirm bindings, queue names, and `host.json` settings without printing
connection strings or app-setting values.

## Release blockers and completion criteria

- Rotate or revoke every credential that may have existed in a tracked local
  environment file, then replace the corresponding production app and GitHub
  secrets.
- Complete the read-only Node.js 24 Azure preflight.
- Run repository/CI validation under Node.js 24.
- Apply each live runtime update separately and record its health check.
- Merge to `main` only after the preceding checks pass; the production workflows then deploy automatically.
