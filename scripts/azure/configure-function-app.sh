#!/usr/bin/env bash
# filepath: /Users/galrubin/Projects/tastematcher/scripts/azure/configure-function-app.sh
set -euo pipefail

ENV=${1:-dev}
ENVFILE=".env.${ENV}"

if [ ! -f "$ENVFILE" ]; then
  echo "❌ Environment file $ENVFILE not found"
  exit 1
fi

# Load environment variables
source "$ENVFILE"

FUNCTION_APP_NAME="${FUNCTION_APP_NAME}"
RESOURCE_GROUP="tastematcher-${ENV}-rg"

echo "🔧 Configuring Function App: $FUNCTION_APP_NAME"

# Configure application settings
az functionapp config appsettings set \
  --name "$FUNCTION_APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --settings \
    "AZURE_SEARCH_ENDPOINT=${AZURE_SEARCH_ENDPOINT}" \
    "AZURE_SEARCH_ADMIN_KEY=@Microsoft.KeyVault(SecretUri=https://${AZURE_KEYVAULT_NAME}.vault.azure.net/secrets/SearchAdminKey/)" \
    "AZURE_SEARCH_INDEX_NAME=${AZURE_SEARCH_INDEX_NAME}" \
    "AZURE_AI_VISION_ENDPOINT=${AZURE_AI_VISION_ENDPOINT}" \
    "AZURE_AI_VISION_KEY=@Microsoft.KeyVault(SecretUri=https://${AZURE_KEYVAULT_NAME}.vault.azure.net/secrets/ComputerVisionKey/)" \
    "IMAGE_PROCESSING_QUEUE_NAME=${IMAGE_PROCESSING_QUEUE_NAME}" \
    "AZURE_BLOB_CONTAINER_ORIGINALS=${AZURE_BLOB_CONTAINER_ORIGINALS}" \
    "AZURE_BLOB_CONTAINER_DERIVATIVES=${AZURE_BLOB_CONTAINER_DERIVATIVES}" \
    "LOG_LEVEL=info" \
    "NODE_ENV=production" \
  --output none

echo "✅ Application settings configured"
echo "🔐 Secrets are referenced from Key Vault: ${AZURE_KEYVAULT_NAME}"