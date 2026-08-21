# TasteMatcher Functions

Azure Functions v4 workers for image processing, artwork notifications, and the
daily domain-owner summary.

## Requirements

- Node.js 24 LTS (`node --version` must report 24.x)
- Corepack with the repository-pinned pnpm 10 release
- Azure Functions Core Tools v4
- An authorized Azure CLI login when generating production-backed local config

From the repository root, install and validate the package with:

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm --filter @tastematcher/functions lint
pnpm --filter @tastematcher/functions typecheck
pnpm --filter @tastematcher/functions test
pnpm --filter @tastematcher/functions build
```

The build contains `host.json` and compiled code only. Neither `.env` nor
`local.settings.json` is copied into `build/` or the deployment artifact.

## Local execution against production-backed services

Production queues and databases contain live customer data. Starting a queue or
timer trigger can consume a production message, update Cosmos DB or Blob
Storage, or send a notification. Functions therefore are not started by the
repository's default local command, and `pnpm start` intentionally refuses to
run them.

Use the repository's local-production configuration sync after `az login`. It
writes the ignored `functions/local.settings.json` with owner-only permissions
and does not print secret values. `local.settings.example.json` is a value-free
schema for review; do not replace its placeholders manually with credentials or
commit a generated settings file.

```bash
./scripts/azure/sync-local-production-config.sh prd
```

Every trigger is disabled by default through these supported host settings:

- `AzureWebJobs.ProcessImagesFromBlob.Disabled=true`
- `AzureWebJobs.NotifyUsersNewArtwork.Disabled=true`
- `AzureWebJobs.DailyDomainOwnerSummary.Disabled=true`

To intentionally run one function:

1. Confirm the production test tenant/gallery and expected side effects.
2. Confirm the sync left all three `Disabled` values set to `true`. Do not edit
   the generated secret file.
3. Keep `NODE_ENV=development`, `TASTEMATCHER_RUNTIME_MODE=local-production`,
   `TASTEMATCHER_DATA_ENV=prd`, and the explicit acknowledgement created by the
   sync.
4. Start exactly that trigger by name:

```bash
pnpm --filter @tastematcher/functions start:local-production -- ProcessImagesFromBlob
```

The guard refuses to start if the data target or acknowledgement is missing, if
`NODE_ENV` enables production behavior, or if any trigger is enabled in the
file. For the spawned Core Tools process only, it overrides the selected
function to enabled and also passes `--functions` with that exact name. The
generated file remains disabled-by-default. Valid names are
`ProcessImagesFromBlob`, `NotifyUsersNewArtwork`, and
`DailyDomainOwnerSummary`.

## Functions

### ProcessImagesFromBlob

Consumes the configured image-processing Storage Queue, creates thumbnail
variants and an AI Vision embedding, then updates the artwork record. It can
write blobs, Cosmos DB records, and notification queue messages.

### NotifyUsersNewArtwork

Consumes the new-artwork queue and may send outbound email. Local execution is
allowed only as a deliberate, single-trigger production test.

### DailyDomainOwnerSummary

Runs on a timer and may query production activity and send summary email. Never
enable it merely to verify that Core Tools starts.

## Configuration

Core Tools reads `local.settings.json`; it does not use `.env`. The committed
`local.settings.example.json` lists the required storage, Cosmos DB, Vision,
communication, URL, data-target, acknowledgement, and trigger-disable keys.
Real local settings files are ignored and must remain untracked. Credentials
previously committed in local configuration must be rotated; removing them from
the current tree does not remove them from Git history.

## Deployment and Node 24 rollout

The Functions workflow validates pull requests without deploying. Matching
pushes to `main` and manual dispatches run the same Node 24 gates, deploy only
to the `prd` GitHub environment and `tastematcher-prd-func`, and verify the
Function App after deployment.

Do not run `scripts/azure/provision-resources.sh` merely to update a runtime; it
reconciles many production resources. Instead run the narrowly scoped runtime
script in read-only mode first:

```bash
./scripts/azure/update-node24-runtimes.sh
```

It verifies the approved subscription, resource existence, Linux hosting,
Functions v4, a non-Consumption Functions plan, and advertised Node 24 runtime
identifiers. After repository validation and separate production approval,
update one component at a time:

```bash
./scripts/azure/update-node24-runtimes.sh --apply functions
```

Run the Function App health/smoke checks before changing either App Service.
Rollback uses the previous `linuxFxVersion` shown by the preflight and the
matching `WEBSITE_NODE_DEFAULT_VERSION`; change only the failed component.

## Troubleshooting

- Guard refuses to start: compare only key names and mode values with
  `local.settings.example.json`; never paste secret values into logs.
- Function does not trigger: keep all persisted `Disabled` values `true` and
  confirm the exact function name was passed to the guarded start command.
- Core Tools is missing: install Azure Functions Core Tools v4, then rerun the
  command from `functions/` through the pnpm filter shown above.
- Runtime preflight fails: stop. Do not force a runtime identifier Azure does
  not advertise for the live OS and plan.
