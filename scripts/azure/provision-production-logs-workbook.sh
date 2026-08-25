#!/usr/bin/env bash

set -euo pipefail

readonly SUBSCRIPTION_ID="e105e38a-7820-4c7e-b1da-de05227d6355"
readonly RESOURCE_GROUP="tastematcher-prd-rg"
readonly LOCATION="centralus"
readonly WORKSPACE_ID="/subscriptions/e105e38a-7820-4c7e-b1da-de05227d6355/resourceGroups/tastematcher-prd-rg/providers/Microsoft.OperationalInsights/workspaces/tastematcher-prd-logs"
readonly WORKBOOK_ID="d8c96e83-f9f1-4b57-9eaa-a4fd607d7b3d"
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly DEFINITION_FILE="${SCRIPT_DIR}/tastematcher-production-logs.workbook.json"

test "$(az account show --query id -o tsv)" = "${SUBSCRIPTION_ID}"
test -f "${DEFINITION_FILE}"
az monitor log-analytics workspace show --resource-group "${RESOURCE_GROUP}" --workspace-name tastematcher-prd-logs --query id -o tsv >/dev/null

serialized_data="$(jq -c . "${DEFINITION_FILE}")"
properties="$(jq -nc \
  --arg serialized_data "${serialized_data}" \
  --arg source_id "${WORKSPACE_ID}" \
  '{kind:"shared", location:"centralus", properties:{category:"workbook", displayName:"TasteMatcher Production Logs", description:"Shared production API and Flex Functions logs", sourceId:$source_id, version:"Notebook/1.0", serializedData:$serialized_data}}')"

az resource create \
  --resource-group "${RESOURCE_GROUP}" \
  --namespace Microsoft.Insights \
  --resource-type workbooks \
  --name "${WORKBOOK_ID}" \
  --location "${LOCATION}" \
  --api-version 2023-06-01 \
  --is-full-object \
  --properties "${properties}" \
  --output none

echo "Created Azure Monitor Workbook: TasteMatcher Production Logs"
