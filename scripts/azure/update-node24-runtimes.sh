#!/usr/bin/env bash
set -euo pipefail

# Read-only by default. Apply one production runtime change at a time with:
#   ./scripts/azure/update-node24-runtimes.sh --apply functions|api|frontend

SUBSCRIPTION_ID="e105e38a-7820-4c7e-b1da-de05227d6355"
RESOURCE_GROUP="tastematcher-prd-rg"
FUNCTION_APP="tastematcher-prd-func"
API_APP="tastematcher-prd-api"
FRONTEND_APP="tastematcher-prd-web"

MODE=${1:-preflight}
COMPONENT=${2:-}

if [ "$MODE" != "preflight" ] && [ "$MODE" != "--apply" ]; then
  echo "Usage: $0 [--apply functions|api|frontend]" >&2
  exit 1
fi

if [ "$MODE" = "--apply" ]; then
  case "$COMPONENT" in
    functions|api|frontend) ;;
    *)
      echo "Apply exactly one component: functions, api, or frontend." >&2
      exit 1
      ;;
  esac
fi

if ! az account show >/dev/null 2>&1; then
  echo "Azure CLI login required. Run 'az login' and retry." >&2
  exit 2
fi

ACTIVE_SUBSCRIPTION=$(az account show --query id -o tsv)
if [ "$ACTIVE_SUBSCRIPTION" != "$SUBSCRIPTION_ID" ]; then
  echo "Refusing subscription mismatch. Select the approved production subscription first." >&2
  exit 3
fi

az group show --name "$RESOURCE_GROUP" --query name -o tsv >/dev/null
echo "Preflight: confirmed approved subscription and production resource group."

FUNCTION_APP_ID=$(az functionapp show \
  --resource-group "$RESOURCE_GROUP" \
  --name "$FUNCTION_APP" \
  --query id -o tsv)
FUNCTION_PLAN_ID=$(az resource show \
  --ids "$FUNCTION_APP_ID" \
  --api-version 2024-04-01 \
  --query properties.serverFarmId -o tsv)
if [ -z "$FUNCTION_PLAN_ID" ]; then
  echo "Refusing: Azure did not report the production Function App hosting plan." >&2
  exit 4
fi
FUNCTION_PLAN_TIER=$(az appservice plan show --ids "$FUNCTION_PLAN_ID" --query sku.tier -o tsv)
FUNCTION_PLAN_SKU=$(az appservice plan show --ids "$FUNCTION_PLAN_ID" --query sku.name -o tsv)
FUNCTION_OS=$(az functionapp show \
  --resource-group "$RESOURCE_GROUP" \
  --name "$FUNCTION_APP" \
  --query reserved -o tsv)
FUNCTIONS_VERSION=$(az functionapp config appsettings list \
  --resource-group "$RESOURCE_GROUP" \
  --name "$FUNCTION_APP" \
  --query "[?name=='FUNCTIONS_EXTENSION_VERSION'].value | [0]" -o tsv)
echo "Preflight: loaded production Function App hosting metadata."
API_OS=$(az webapp show \
  --resource-group "$RESOURCE_GROUP" \
  --name "$API_APP" \
  --query reserved -o tsv)
FRONTEND_OS=$(az webapp show \
  --resource-group "$RESOURCE_GROUP" \
  --name "$FRONTEND_APP" \
  --query reserved -o tsv)
echo "Preflight: confirmed production App Service metadata."

if [ "$FUNCTION_OS" != "true" ]; then
  echo "Refusing: production Function App is not Linux." >&2
  exit 4
fi
if [ "$API_OS" != "true" ] || [ "$FRONTEND_OS" != "true" ]; then
  echo "Refusing: both production App Services must be Linux." >&2
  exit 9
fi
if [ "$FUNCTION_PLAN_TIER" = "Dynamic" ] || [ "$FUNCTION_PLAN_SKU" = "Y1" ]; then
  echo "Refusing: Node 24 is unsupported on Linux Consumption. Move plans before retrying." >&2
  exit 5
fi
if [ "$FUNCTIONS_VERSION" != "~4" ]; then
  echo "Refusing: production Function App is not on Functions v4." >&2
  exit 6
fi

FUNCTION_RUNTIME=$(az functionapp list-runtimes \
  --os linux \
  --query "[?linux_fx_version=='Node|24'].linux_fx_version | [0]" -o tsv)
if [ "$FUNCTION_RUNTIME" != "Node|24" ]; then
  echo "Refusing: Azure CLI does not report a Linux Functions Node 24 runtime." >&2
  exit 7
fi
echo "Preflight: confirmed Linux Functions advertises Node 24."
WEBAPP_RUNTIME=$(az webapp list-runtimes \
  --os linux \
  --query "[?@=='NODE:24-lts'] | [0]" -o tsv)
if [ "$WEBAPP_RUNTIME" != "NODE:24-lts" ]; then
  echo "Refusing: Azure CLI does not report a Linux App Service Node 24 LTS runtime." >&2
  exit 8
fi
echo "Preflight: confirmed Linux App Service advertises Node 24 LTS."

echo "Preflight passed: production Linux Functions v4 uses non-Consumption plan ${FUNCTION_PLAN_SKU}, and Node 24 runtimes are advertised."
echo "Current runtime identifiers and Node defaults (record these for rollback):"
az functionapp config show --resource-group "$RESOURCE_GROUP" --name "$FUNCTION_APP" --query linuxFxVersion -o tsv
az functionapp config appsettings list --resource-group "$RESOURCE_GROUP" --name "$FUNCTION_APP" --query "[?name=='WEBSITE_NODE_DEFAULT_VERSION'].value | [0]" -o tsv
az webapp config show --resource-group "$RESOURCE_GROUP" --name "$API_APP" --query linuxFxVersion -o tsv
az webapp config appsettings list --resource-group "$RESOURCE_GROUP" --name "$API_APP" --query "[?name=='WEBSITE_NODE_DEFAULT_VERSION'].value | [0]" -o tsv
az webapp config show --resource-group "$RESOURCE_GROUP" --name "$FRONTEND_APP" --query linuxFxVersion -o tsv
az webapp config appsettings list --resource-group "$RESOURCE_GROUP" --name "$FRONTEND_APP" --query "[?name=='WEBSITE_NODE_DEFAULT_VERSION'].value | [0]" -o tsv

if [ "$MODE" = "preflight" ]; then
  echo "No Azure resources were changed. Re-run with --apply and one component after validation and approval."
  exit 0
fi

case "$COMPONENT" in
  functions)
    az functionapp config set --resource-group "$RESOURCE_GROUP" --name "$FUNCTION_APP" --linux-fx-version "NODE|24" -o none
    az functionapp config appsettings set --resource-group "$RESOURCE_GROUP" --name "$FUNCTION_APP" --settings WEBSITE_NODE_DEFAULT_VERSION="~24" -o none
    ;;
  api)
    az webapp config set --resource-group "$RESOURCE_GROUP" --name "$API_APP" --linux-fx-version "NODE|24-lts" -o none
    az webapp config appsettings set --resource-group "$RESOURCE_GROUP" --name "$API_APP" --settings WEBSITE_NODE_DEFAULT_VERSION="~24" -o none
    ;;
  frontend)
    az webapp config set --resource-group "$RESOURCE_GROUP" --name "$FRONTEND_APP" --linux-fx-version "NODE|24-lts" -o none
    az webapp config appsettings set --resource-group "$RESOURCE_GROUP" --name "$FRONTEND_APP" --settings WEBSITE_NODE_DEFAULT_VERSION="~24" -o none
    ;;
esac

echo "Updated $COMPONENT only. Run its health check before applying the next component."
