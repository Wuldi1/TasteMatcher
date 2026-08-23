#!/usr/bin/env bash
set -euo pipefail

# Creates parallel, low-cost hosts only. It never updates DNS, disables old
# triggers, or deletes existing paid resources. Those actions have dedicated
# reviewed scripts because they alter production traffic.

SUBSCRIPTION_ID="e105e38a-7820-4c7e-b1da-de05227d6355"
RESOURCE_GROUP="tastematcher-prd-rg"
LOCATION="centralus"
OLD_FUNCTION_APP="tastematcher-prd-func"
OLD_API_APP="tastematcher-prd-api"
STORAGE_ACCOUNT="tastematcherprdsa"
FUNCTION_INSIGHTS="tastematcher-prd-func"
FLEX_FUNCTION_APP="tastematcher-prd-flex"
CONTAINER_ENV="tastematcher-prd-cae"
CONTAINER_APP="tastematcher-prd-api-ca"
STATIC_WEB_APP="tastematcher-prd-static"
REGISTRY="tastematcherprdacr"

MODE=${1:-preflight}
if [ "$MODE" != "preflight" ] && [ "$MODE" != "--apply" ]; then
  echo "Usage: $0 [--apply]" >&2
  exit 1
fi

require_azure_context() {
  test "$(az account show --query id -o tsv)" = "$SUBSCRIPTION_ID"
  az group show --name "$RESOURCE_GROUP" --query name -o tsv >/dev/null
}

require_azure_context

if [ "$MODE" = "preflight" ]; then
  echo "Preflight passed: subscription, resource group, and source hosts exist."
  az functionapp list-runtimes --os linux \
    --query "[?linux_fx_version=='Node|24'].linux_fx_version | [0]" -o tsv | grep -qx 'Node|24'
  az functionapp list-flexconsumption-locations --query "[?name=='$LOCATION'].name | [0]" -o tsv | grep -qx "$LOCATION"
  echo "Central US supports Flex Consumption and Node 24. No resources were changed."
  exit 0
fi

# The registry is a small fixed cost, but it supports immutable images and
# avoids granting Container Apps credentials to an external image registry.
az acr create --name "$REGISTRY" --resource-group "$RESOURCE_GROUP" \
  --location "$LOCATION" --sku Basic --admin-enabled false --output none 2>/dev/null || true

az containerapp env create --name "$CONTAINER_ENV" --resource-group "$RESOURCE_GROUP" \
  --location "$LOCATION" --logs-destination none --output none 2>/dev/null || true

az staticwebapp create --name "$STATIC_WEB_APP" --resource-group "$RESOURCE_GROUP" \
  --location "$LOCATION" --sku Free --output none 2>/dev/null || true

# Flex requires a new app. Reuse the existing storage and Insights component,
# then clone only portable settings without printing any secret values.
if ! az functionapp show --name "$FLEX_FUNCTION_APP" --resource-group "$RESOURCE_GROUP" >/dev/null 2>&1; then
  az functionapp create --name "$FLEX_FUNCTION_APP" --resource-group "$RESOURCE_GROUP" \
    --storage-account "$STORAGE_ACCOUNT" --flexconsumption-location "$LOCATION" \
    --runtime node --runtime-version 24 --functions-version 4 --instance-memory 2048 \
    --maximum-instance-count 5 --app-insights "$FUNCTION_INSIGHTS" --https-only true --output none
fi

settings_file=$(mktemp)
trap 'rm -f "$settings_file"' EXIT
umask 077
az functionapp config appsettings list --name "$OLD_FUNCTION_APP" --resource-group "$RESOURCE_GROUP" -o json \
  | jq 'map(select(.name | test("^(WEBSITE_|SCM_|ENABLE_ORYX_BUILD|MACHINEKEY_|FUNCTIONS_(WORKER_RUNTIME|EXTENSION_VERSION))") | not)) | map({key: .name, value: .value}) | from_entries' > "$settings_file"

az functionapp config appsettings set --name "$FLEX_FUNCTION_APP" --resource-group "$RESOURCE_GROUP" \
  --settings @"$settings_file" \
  AzureWebJobs.ProcessImagesFromBlob.Disabled=true \
  AzureWebJobs.NotifyUsersNewArtwork.Disabled=true \
  AzureWebJobs.DailyDomainOwnerSummary.Disabled=true \
  --output none

# Build/push happens in the updated CI workflow. Create the Container App with
# a harmless public image so its identity can receive AcrPull first.
if ! az containerapp show --name "$CONTAINER_APP" --resource-group "$RESOURCE_GROUP" >/dev/null 2>&1; then
  az containerapp create --name "$CONTAINER_APP" --resource-group "$RESOURCE_GROUP" \
    --environment "$CONTAINER_ENV" --image mcr.microsoft.com/azuredocs/containerapps-helloworld:latest \
    --ingress external --target-port 80 --transport auto --min-replicas 0 --max-replicas 3 \
    --scale-rule-name http --scale-rule-http-concurrency 20 --cpu 0.25 --memory 0.5Gi \
    --system-assigned --revisions-mode multiple --output none
fi

ACR_ID=$(az acr show --name "$REGISTRY" --resource-group "$RESOURCE_GROUP" --query id -o tsv)
API_PRINCIPAL_ID=$(az containerapp identity show --name "$CONTAINER_APP" --resource-group "$RESOURCE_GROUP" --query principalId -o tsv)
az role assignment create --assignee-object-id "$API_PRINCIPAL_ID" --assignee-principal-type ServicePrincipal \
  --role AcrPull --scope "$ACR_ID" --output none 2>/dev/null || true
az containerapp registry set --name "$CONTAINER_APP" --resource-group "$RESOURCE_GROUP" \
  --server "${REGISTRY}.azurecr.io" --identity system --output none

echo "Parallel resources are ready: $FLEX_FUNCTION_APP, $CONTAINER_APP, $STATIC_WEB_APP, $REGISTRY."
echo "All Flex triggers remain disabled. Deploy code and run the separate cutover scripts next."
