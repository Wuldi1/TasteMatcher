#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

for script in scripts/azure/*.sh scripts/ci/*.sh; do
  bash -n "$script"
done

./scripts/ci/test-production-azure-login.sh

while IFS= read -r json_file; do
  jq empty "$json_file"
done < <(
  find . -type d \( -name node_modules -o -name build -o -name .git \) -prune \
    -o -name '*.json' -type f -print
)

pnpm exec prettier --check .github/workflows/*.yml
git diff --check

tracked_sensitive_files="$(
  git ls-files -- 'webapi/.env*' 'functions/.env*' functions/local.settings.json \
    | grep -Ev '/\.env\.example$' || true
)"
if [[ -n "$tracked_sensitive_files" ]]; then
  echo "Sensitive local configuration is tracked by Git." >&2
  exit 1
fi

if find webapi/build functions/build -type f \
  \( -name '.env*' -o -name 'local.settings.json' \) \
  -print -quit 2>/dev/null | grep -q .; then
  echo "A sensitive local configuration file was copied into a build artifact." >&2
  exit 1
fi

for workflow in .github/workflows/frontend-deploy.yml \
  .github/workflows/webapi-deploy.yml \
  .github/workflows/functions-deploy.yml; do
  grep -q 'NODE_VERSION: "24.x"' "$workflow"
  grep -q 'pull_request:' "$workflow"
  grep -q "github.event_name != 'pull_request'" "$workflow"
done

grep -q 'AZURE_WEBAPP_NAME: "tastematcher-prd-web"' \
  .github/workflows/frontend-deploy.yml
grep -q 'AZURE_WEBAPP_NAME: tastematcher-prd-api' \
  .github/workflows/webapi-deploy.yml
grep -q 'AZURE_FUNCTIONAPP_NAME: tastematcher-prd-func' \
  .github/workflows/functions-deploy.yml
grep -q 'secrets.AZURE_CREDENTIALS_PRD' \
  .github/workflows/webapi-deploy.yml
grep -q 'secrets.AZURE_CREDENTIALS_PROD' \
  .github/workflows/frontend-deploy.yml
grep -q 'secrets.AZURE_CREDENTIALS_PROD' \
  .github/workflows/functions-deploy.yml

if rg -n 'tastematcher-[a-z0-9]+-(api|web|func|rg)|AZURE_CREDENTIALS_[A-Z]+' \
  .github/workflows \
  | grep -Ev 'tastematcher-prd-|AZURE_CREDENTIALS_(PROD|PRD)'; then
  echo "A non-production Azure deployment target remains." >&2
  exit 1
fi

if rg -n 'node-version:.*22|NODE_VERSION:.*22|NODE:22-lts|~22' \
  .github package.json common/package.json frontend/package.json \
  webapi/package.json functions/package.json scripts/azure; then
  echo "A stale Node 22 runtime reference remains in active configuration." >&2
  exit 1
fi

if rg -n -i \
  'tastematcher-(dev|stg)-|AZURE_CREDENTIALS_(DEV|STG)|API_BASE_URL_DEV|TM_ENV|\.env\.(dev|prd)|start:(dev|prd)|AZURE_KEYVAULT|AZURE_SEARCH|DATABASE_URL|COSMOS_CONNECTION_STRING|AZURE_BLOB_CONTAINER_(ORIGINALS|DERIVATIVES)' \
  .azure .github common docs frontend functions scripts webapi README.md package.json \
  --glob '!scripts/ci/validate-repository.sh' \
  --glob '!scripts/scapper/learning/**' \
  --glob '!**/build/**'; then
  echo "An obsolete environment or unused Azure configuration reference remains." >&2
  exit 1
fi

echo "Repository static validation passed."
