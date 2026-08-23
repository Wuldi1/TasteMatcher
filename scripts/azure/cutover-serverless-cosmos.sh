#!/usr/bin/env bash
set -euo pipefail

# Repoints existing TasteMatcher runtimes to the parallel serverless Cosmos DB
# account. This script does not delete the old provisioned-throughput account.

SUBSCRIPTION_ID="e105e38a-7820-4c7e-b1da-de05227d6355"
RESOURCE_GROUP="tastematcher-prd-rg"
SOURCE_COSMOS_ACCOUNT="tastematcher-prd-cosmos"
TARGET_COSMOS_ACCOUNT="tastematcher-prd-cosmos-sls"
COSMOS_DATABASE="tastematcher"
API_WEBAPP="tastematcher-prd-api"
API_CONTAINER_APP="tastematcher-prd-api-ca"
FLEX_FUNCTION_APP="tastematcher-prd-flex"
OLD_FUNCTION_APP="tastematcher-prd-func"

MODE=${1:-preflight}
if [ "$MODE" != "preflight" ] && [ "$MODE" != "--apply" ]; then
  echo "Usage: $0 [--apply]" >&2
  exit 1
fi

require_azure_context() {
  test "$(az account show --query id -o tsv)" = "$SUBSCRIPTION_ID"
  az group show --name "$RESOURCE_GROUP" --query name -o tsv >/dev/null
  az cosmosdb show --name "$SOURCE_COSMOS_ACCOUNT" --resource-group "$RESOURCE_GROUP" >/dev/null
  az cosmosdb show --name "$TARGET_COSMOS_ACCOUNT" --resource-group "$RESOURCE_GROUP" >/dev/null
}

show_runtime_cosmos_targets() {
  echo "Current runtime Cosmos endpoint targets:"

  if az webapp show --name "$API_WEBAPP" --resource-group "$RESOURCE_GROUP" >/dev/null 2>&1; then
    az webapp config appsettings list \
      --name "$API_WEBAPP" \
      --resource-group "$RESOURCE_GROUP" \
      --query "[?name=='COSMOS_DB_ENDPOINT'].{runtime:'$API_WEBAPP',endpoint:value}" \
      -o table
  fi

  if az containerapp show --name "$API_CONTAINER_APP" --resource-group "$RESOURCE_GROUP" >/dev/null 2>&1; then
    az containerapp show \
      --name "$API_CONTAINER_APP" \
      --resource-group "$RESOURCE_GROUP" \
      --query "properties.template.containers[0].env[?name=='COSMOS_DB_ENDPOINT'].{runtime:'$API_CONTAINER_APP',endpoint:value,secretRef:secretRef}" \
      -o table
  fi

  for function_app in "$FLEX_FUNCTION_APP" "$OLD_FUNCTION_APP"; do
    if az functionapp show --name "$function_app" --resource-group "$RESOURCE_GROUP" >/dev/null 2>&1; then
      az functionapp config appsettings list \
        --name "$function_app" \
        --resource-group "$RESOURCE_GROUP" \
        --query "[?name=='COSMOS_DB_ENDPOINT'].{runtime:'$function_app',endpoint:value}" \
        -o table
    fi
  done
}

get_target_cosmos_settings() {
  COSMOS_ENDPOINT="https://${TARGET_COSMOS_ACCOUNT}.documents.azure.com:443/"
  COSMOS_PRIMARY_KEY=$(az cosmosdb keys list \
    --name "$TARGET_COSMOS_ACCOUNT" \
    --resource-group "$RESOURCE_GROUP" \
    --query primaryMasterKey \
    -o tsv)
}

update_app_service_settings() {
  local app_name=$1
  if ! az webapp show --name "$app_name" --resource-group "$RESOURCE_GROUP" >/dev/null 2>&1; then
    return
  fi

  az webapp config appsettings set \
    --name "$app_name" \
    --resource-group "$RESOURCE_GROUP" \
    --settings \
      COSMOS_DB_ENDPOINT="$COSMOS_ENDPOINT" \
      COSMOS_DB_DATABASE="$COSMOS_DATABASE" \
      COSMOS_DB_KEY="$COSMOS_PRIMARY_KEY" \
    -o none
}

update_function_settings() {
  local app_name=$1
  if ! az functionapp show --name "$app_name" --resource-group "$RESOURCE_GROUP" >/dev/null 2>&1; then
    return
  fi

  az functionapp config appsettings set \
    --name "$app_name" \
    --resource-group "$RESOURCE_GROUP" \
    --settings \
      COSMOS_DB_ENDPOINT="$COSMOS_ENDPOINT" \
      COSMOS_DB_DATABASE="$COSMOS_DATABASE" \
      COSMOS_DB_KEY="$COSMOS_PRIMARY_KEY" \
    -o none
}

update_container_app_settings() {
  if ! az containerapp show --name "$API_CONTAINER_APP" --resource-group "$RESOURCE_GROUP" >/dev/null 2>&1; then
    return
  fi

  az containerapp secret set \
    --name "$API_CONTAINER_APP" \
    --resource-group "$RESOURCE_GROUP" \
    --secrets cosmos-db-key="$COSMOS_PRIMARY_KEY" \
    -o none

  az containerapp update \
    --name "$API_CONTAINER_APP" \
    --resource-group "$RESOURCE_GROUP" \
    --set-env-vars \
      COSMOS_DB_ENDPOINT="$COSMOS_ENDPOINT" \
      COSMOS_DB_DATABASE="$COSMOS_DATABASE" \
      COSMOS_DB_KEY=secretref:cosmos-db-key \
    -o none
}

require_azure_context

echo "Target serverless endpoint: https://${TARGET_COSMOS_ACCOUNT}.documents.azure.com:443/"
show_runtime_cosmos_targets

if [ "$MODE" = "preflight" ]; then
  echo
  echo "Preflight passed. No application settings were changed."
  echo "Run '$0 --apply' to repoint runtimes to the serverless Cosmos account."
  exit 0
fi

get_target_cosmos_settings
update_app_service_settings "$API_WEBAPP"
update_container_app_settings
update_function_settings "$FLEX_FUNCTION_APP"
update_function_settings "$OLD_FUNCTION_APP"

echo
echo "Updated Cosmos settings without printing secret values."
show_runtime_cosmos_targets
echo "Run production smoke checks before deleting or disabling the old Cosmos account."
