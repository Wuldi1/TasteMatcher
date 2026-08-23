#!/usr/bin/env bash
set -euo pipefail

# Copies existing API configuration into Container Apps secrets without printing
# values. Run only after the Container App is created. This does not change DNS.
SUBSCRIPTION_ID="e105e38a-7820-4c7e-b1da-de05227d6355"
RESOURCE_GROUP="tastematcher-prd-rg"
SOURCE_API="tastematcher-prd-api"
TARGET_API="tastematcher-prd-api-ca"

test "$(az account show --query id -o tsv)" = "$SUBSCRIPTION_ID"

settings_file=$(mktemp)
trap 'rm -f "$settings_file"' EXIT
umask 077
az webapp config appsettings list --name "$SOURCE_API" --resource-group "$RESOURCE_GROUP" -o json \
  | jq 'map(select(.name | test("^(WEBSITE_|SCM_|XDT_|DiagnosticServices_|InstrumentationEngine_|SnapshotDebugger_)") | not))' > "$settings_file"

env_args=()
while IFS= read -r setting; do
  name=$(jq -r '.name' <<<"$setting")
  value=$(jq -r '.value' <<<"$setting")
  secret_name="tm$(printf '%s' "$name" | shasum -a 256 | cut -c1-16)"
  az containerapp secret set --name "$TARGET_API" --resource-group "$RESOURCE_GROUP" \
    --secrets "${secret_name}=${value}" --output none
  env_args+=("${name}=secretref:${secret_name}")
done < <(jq -c '.[]' "$settings_file")

# Apply references in one revision rather than creating one revision per setting.
az containerapp update --name "$TARGET_API" --resource-group "$RESOURCE_GROUP" \
  --set-env-vars "${env_args[@]}" PORT=8080 NODE_ENV=prd --output none

echo "Copied API settings into Container Apps secrets without printing values."
