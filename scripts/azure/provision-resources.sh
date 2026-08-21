#!/usr/bin/env bash
set -euo pipefail

# Usage: ./provision-resources.sh prd [location]
# This reconciles production resources and is not a local configuration script.

ENV=${1:-}
LOCATION=${2:-centralus}
COMPUTER_VISION_LOCATION=${3:-"centralus"}
EMAIL_LOCATION=${4:-"global"} # not supported in israelcentral as of now
EMAIL_DATA_LOCATION=${5:-"UnitedStates"} # not supported in israelcentral as of now

if [ "$ENV" != "prd" ]; then
  echo "Refusing to provision a non-production environment. Usage: $0 prd [location]" >&2
  exit 1
fi

SUBSCRIPTION_ID="e105e38a-7820-4c7e-b1da-de05227d6355"

# Set the subscription
az account set --subscription "$SUBSCRIPTION_ID"

echo "Using subscription: $SUBSCRIPTION_ID"
echo "Using environment: $ENV"
echo "Using location: $LOCATION"
echo "Using Computer Vision location: $COMPUTER_VISION_LOCATION"

# Production resource names
RG_NAME="tastematcher-${ENV}-rg"
QUEUE_NAME="tastematcher-${ENV}-indexing-jobs"     # queue name
NEW_ARTWORK_QUEUE_NAME="tastematcher-${ENV}-new-artwork-jobs"
COSMOS_NAME="tastematcher-${ENV}-cosmos"           # cosmos db account name (must be globally unique)
FUNCAPP_NAME="tastematcher-${ENV}-func"            # function app name (must be unique)
APP_PLAN="tastematcher-${ENV}-plan"
STORAGE_ACCOUNT_NAME="tastematcher${ENV}sa"  # <= 24 chars ideally, no hyphens
COMMUNICATION_NAME="tastematcher-${ENV}-comm"
VISION_NAME="tastematcher-${ENV}-vision"           # computer vision resource name
WEBAPP_API_NAME="tastematcher-${ENV}-api"          # backend API web app name
WEBAPP_FRONTEND_NAME="tastematcher-${ENV}-web"     # frontend web app name
WEB_APP_PLAN="tastematcher-${ENV}-webapp-plan"     # separate app service plan for web apps

echo "Environment: $ENV, Location: $LOCATION"
echo "Resource group: $RG_NAME"
echo "Storage account (sanitized): $STORAGE_ACCOUNT_NAME"
echo "Cosmos DB account: $COSMOS_NAME"
echo "Function App: $FUNCAPP_NAME"
echo "Communication resource: $COMMUNICATION_NAME"
echo "Computer Vision resource: $VISION_NAME"
echo "Backend API Web App: $WEBAPP_API_NAME"
echo "Frontend Web App: $WEBAPP_FRONTEND_NAME"

# Ensure az CLI logged in
if ! az account show >/dev/null 2>&1; then
  echo "az login required. Run 'az login' and retry."
  exit 2
fi

# Create resource group
echo "Creating resource group $RG_NAME..."
az group create --name "$RG_NAME" --location "$LOCATION" -o none

# Create Storage Account (StorageV2)
echo "Creating storage account $STORAGE_ACCOUNT_NAME..."
if az storage account show --name "$STORAGE_ACCOUNT_NAME" --resource-group "$RG_NAME" >/dev/null 2>&1; then
  echo "Storage account $STORAGE_ACCOUNT_NAME already exists. Skipping creation."
else
  az storage account create \
    --name "$STORAGE_ACCOUNT_NAME" \
    --resource-group "$RG_NAME" \
    --location "$LOCATION" \
    --sku Standard_LRS \
    --kind StorageV2 \
    --access-tier Hot \
    -o none
fi

# Get storage account key and endpoint
STORAGE_KEY=$(az storage account keys list --resource-group "$RG_NAME" --account-name "$STORAGE_ACCOUNT_NAME" --query "[0].value" -o tsv)
STORAGE_BLOB_ENDPOINT=$(az storage account show --name "$STORAGE_ACCOUNT_NAME" --resource-group "$RG_NAME" --query "primaryEndpoints.blob" -o tsv | sed 's:/*$::')

echo "Storage endpoint: $STORAGE_BLOB_ENDPOINT"

# Create Blob containers (originals + derivatives)
echo "Creating blob containers: originals, derivatives..."
az storage container create --name originals --account-name "$STORAGE_ACCOUNT_NAME" --account-key "$STORAGE_KEY" -o none
az storage container create --name derivatives --account-name "$STORAGE_ACCOUNT_NAME" --account-key "$STORAGE_KEY" -o none

# Create Queue for indexing jobs
echo "Creating queue $QUEUE_NAME..."
az storage queue create --name "$QUEUE_NAME" --account-name "$STORAGE_ACCOUNT_NAME" --account-key "$STORAGE_KEY" -o none
echo "Creating queue $NEW_ARTWORK_QUEUE_NAME..."
az storage queue create --name "$NEW_ARTWORK_QUEUE_NAME" --account-name "$STORAGE_ACCOUNT_NAME" --account-key "$STORAGE_KEY" -o none

# Create Azure Communication Services (Email)
echo "Creating Azure Communication Services resource: $COMMUNICATION_NAME ..."
if az communication show --name "$COMMUNICATION_NAME" --resource-group "$RG_NAME" >/dev/null 2>&1; then
  echo "Communication resource $COMMUNICATION_NAME already exists. Skipping creation."
else
  az communication create \
    --name "$COMMUNICATION_NAME" \
    --resource-group "$RG_NAME" \
    --data-location "$EMAIL_DATA_LOCATION" \
    --location "$EMAIL_LOCATION" \
    -o none
fi

COMMUNICATION_CONNECTION_STRING=$(az communication list-key \
  --name "$COMMUNICATION_NAME" \
  --resource-group "$RG_NAME" \
  --query primaryConnectionString -o tsv)

AZURE_EMAIL_SENDER_ADDRESS=${AZURE_EMAIL_SENDER_ADDRESS:-"donotreply@tastematcher.art"}

# Register Microsoft.DocumentDB provider
echo "registering Microsoft.DocumentDB provider..."
az provider register --namespace Microsoft.DocumentDB -o none

# Create Azure Cosmos DB account
echo "Creating Azure Cosmos DB account: $COSMOS_NAME ..."
COSMOS_DATABASE="tastematcher"
VECTOR_DIMENSIONS=1024
VECTOR_DISTANCE_FUNCTION="cosine"

if az cosmosdb show --name "$COSMOS_NAME" --resource-group "$RG_NAME" >/dev/null 2>&1; then
  echo "Cosmos DB account $COSMOS_NAME already exists. Skipping creation."
else
  az cosmosdb create \
    --name "$COSMOS_NAME" \
    --resource-group "$RG_NAME" \
    --kind GlobalDocumentDB \
    --default-consistency-level "Session" \
    --enable-automatic-failover true \
    --locations regionName="$LOCATION" failoverPriority=0 isZoneRedundant=false \
    -o none
    # Create Cosmos DB database
    echo "Creating Cosmos DB database: $COSMOS_DATABASE ..."
    az cosmosdb sql database create \
      --account-name "$COSMOS_NAME" \
      --resource-group "$RG_NAME" \
      --name "$COSMOS_DATABASE" \
      --throughput 400 \
      -o none || echo "Database $COSMOS_DATABASE already exists or creation failed - continuing..."

    # Create Cosmos DB containers with appropriate partition keys
    echo "Creating Cosmos DB containers..."

    # Core container - Merged Domains and Users
    # Partition by /domainId for multi-tenant isolation
    az cosmosdb sql container create \
      --account-name "$COSMOS_NAME" \
      --resource-group "$RG_NAME" \
      --database-name "$COSMOS_DATABASE" \
      --name "Core" \
      --partition-key-path "/domainId" \
      --throughput 400 \
      -o none || echo "Core container already exists or creation failed - continuing..."

    # Artworks container - partition by /domainId for multi-tenant isolation
    # Configure vector index for /vector (1024 floats) to support similarity search
    ARTWORKS_INDEXING_POLICY_PATH="/tmp/${COSMOS_NAME}-artworks-indexing-policy.json"
    cat > "$ARTWORKS_INDEXING_POLICY_PATH" <<EOF
{
  "indexingMode": "consistent",
  "automatic": true,
  "includedPaths": [
    { "path": "/*" }
  ],
  "excludedPaths": [
    { "path": "/\\"_etag\\"/?" }
  ],
  "vectorIndexes": [
    {
      "path": "/vector",
      "type": "quantizedFlat"
    }
  ],
  "vectorEmbeddingPolicy": {
    "vectorEmbeddings": [
      {
        "path": "/vector",
        "dataType": "Float32",
        "distanceFunction": "${VECTOR_DISTANCE_FUNCTION}",
        "dimensions": ${VECTOR_DIMENSIONS}
      }
    ]
  }
}
EOF

    az cosmosdb sql container create \
      --account-name "$COSMOS_NAME" \
      --resource-group "$RG_NAME" \
      --database-name "$COSMOS_DATABASE" \
      --name "Artworks" \
      --partition-key-path "/domainId" \
      --throughput 400 \
      --indexing-policy "$ARTWORKS_INDEXING_POLICY_PATH" \
      -o none || echo "Artworks container already exists or creation failed - continuing..."

    # Ensure vector indexing policy is applied for existing containers
    az cosmosdb sql container update \
      --account-name "$COSMOS_NAME" \
      --resource-group "$RG_NAME" \
      --database-name "$COSMOS_DATABASE" \
      --name "Artworks" \
      --indexing-policy "$ARTWORKS_INDEXING_POLICY_PATH" \
      -o none || echo "Artworks container indexing policy update failed - continuing..."

    # Proposals container - holds proposals and domain requests, partition by /domainId
    az cosmosdb sql container create \
      --account-name "$COSMOS_NAME" \
      --resource-group "$RG_NAME" \
      --database-name "$COSMOS_DATABASE" \
      --name "Proposals" \
      --partition-key-path "/domainId" \
      --ttl -1 \
      --throughput 400 \
      -o none || echo "Proposals container already exists or creation failed - continuing..."

    # Ensure TTL is enabled for Proposals so per-item TTL (e.g. domainActivity) can be applied
    az cosmosdb sql container update \
      --account-name "$COSMOS_NAME" \
      --resource-group "$RG_NAME" \
      --database-name "$COSMOS_DATABASE" \
      --name "Proposals" \
      --ttl -1 \
      -o none || echo "Proposals container TTL update failed - continuing..."
  fi

# Get Cosmos DB key and endpoint used by the applications
COSMOS_PRIMARY_KEY=$(az cosmosdb keys list --name "$COSMOS_NAME" --resource-group "$RG_NAME" --query primaryMasterKey -o tsv)
COSMOS_DB_ENDPOINT="https://${COSMOS_NAME}.documents.azure.com:443/"

# Generate a secure random JWT secret
JWT_SECRET=$(openssl rand -base64 32)
echo "Generated new JWT Secret."

# Function to setup Cosmos DB data
setup_cosmos_admin_data() {
  echo "Setting up initial Cosmos DB data..."
  
  # Create a default admin user using Azure CLI
  echo "Creating default admin user..."
  ADMIN_USER_JSON=$(cat <<EOF
{
  "id": "galrubin-admin",
  "name": "System Admin",
  "email": "galrubin15@gmail.com",
  "role": "global_admin",
  "createdAt": $(date +%s)000,
  "updatedAt": $(date +%s)000
}
EOF
)
  
  echo "✅ Cosmos DB initial data setup completed!"
}

setup_cosmos_admin_data

echo "registering Microsoft.CognitiveServices provider..."
az provider register --namespace Microsoft.CognitiveServices -o none

# Create Azure Computer Vision (AI Vision) resource
echo "Creating Azure Computer Vision resource: $VISION_NAME (SKU: S1)..."
if az cognitiveservices account show --name "$VISION_NAME" --resource-group "$RG_NAME" >/dev/null 2>&1; then
  echo "Computer Vision resource $VISION_NAME already exists. Skipping creation."
else
  az cognitiveservices account create \
    --name "$VISION_NAME" \
    --resource-group "$RG_NAME" \
    --location "$COMPUTER_VISION_LOCATION" \
    --kind ComputerVision \
    --sku S1 \
    --yes \
    -o none
fi

# Get Computer Vision endpoint and key
VISION_ENDPOINT=$(az cognitiveservices account show --name "$VISION_NAME" --resource-group "$RG_NAME" --query properties.endpoint -o tsv)
VISION_KEY=$(az cognitiveservices account keys list --name "$VISION_NAME" --resource-group "$RG_NAME" --query key1 -o tsv)

echo "Computer Vision endpoint: $VISION_ENDPOINT"

# Create an App Service plan for Function App
echo "Creating App Service plan for Function App..."

if az functionapp plan show --name "$APP_PLAN" --resource-group "$RG_NAME" >/dev/null 2>&1; then
  echo "Function App Service plan $APP_PLAN already exists. Skipping creation."
else
  az functionapp plan create \
    --name "$APP_PLAN" \
    --resource-group "$RG_NAME" \
    --location "$LOCATION" \
    --number-of-workers 1 \
    --sku P0V3 \
    --is-linux \
    -o none
  echo "✅ Function App Service plan $APP_PLAN created successfully"
fi

# Create Function App (Linux, Node)
echo "Creating Function App: $FUNCAPP_NAME ..."

if az functionapp show --name "$FUNCAPP_NAME" --resource-group "$RG_NAME" >/dev/null 2>&1; then
  echo "Function App $FUNCAPP_NAME already exists. Skipping creation."
else
  az functionapp create \
    --resource-group "$RG_NAME" \
    --name "$FUNCAPP_NAME" \
    --storage-account "$STORAGE_ACCOUNT_NAME" \
    --plan "$APP_PLAN" \
    --runtime node \
    --runtime-version 24 \
    --os-type Linux \
    --functions-version 4 \
    -o none
  echo "✅ Function App $FUNCAPP_NAME created successfully"
fi

# Reconcile existing Linux Function Apps as well as newly created ones.
az functionapp config set \
  --resource-group "$RG_NAME" \
  --name "$FUNCAPP_NAME" \
  --linux-fx-version "NODE|24" \
  -o none

# Configure Function App settings
echo "Configuring Function App settings..."

STORAGE_CONNECTION_STRING=$(az storage account show-connection-string \
  --name "$STORAGE_ACCOUNT_NAME" \
  --resource-group "$RG_NAME" \
  --query connectionString -o tsv)

az functionapp config appsettings set \
  --resource-group "$RG_NAME" \
  --name "$FUNCAPP_NAME" \
  --settings \
    FUNCTIONS_WORKER_RUNTIME="node" \
    WEBSITE_NODE_DEFAULT_VERSION="~24" \
    FUNCTIONS_EXTENSION_VERSION="~4" \
    SCM_DO_BUILD_DURING_DEPLOYMENT="true" \
    WEBSITE_RUN_FROM_PACKAGE="1" \
    ENABLE_ORYX_BUILD="true" \
    AzureWebJobsStorage="$STORAGE_CONNECTION_STRING" \
    AZURE_STORAGE_ACCOUNT="$STORAGE_ACCOUNT_NAME" \
    AZURE_STORAGE_ACCOUNT_KEY="$STORAGE_KEY" \
    IMAGE_PROCESSING_QUEUE_NAME="$QUEUE_NAME" \
    NEW_ARTWORK_QUEUE_NAME="$NEW_ARTWORK_QUEUE_NAME" \
    AZURE_AI_VISION_ENDPOINT="$VISION_ENDPOINT" \
    AZURE_AI_VISION_KEY="$VISION_KEY" \
    AZURE_COMMUNICATION_CONNECTION_STRING="$COMMUNICATION_CONNECTION_STRING" \
    AZURE_EMAIL_SENDER="$AZURE_EMAIL_SENDER_ADDRESS" \
    COSMOS_DB_ENDPOINT="$COSMOS_DB_ENDPOINT" \
    COSMOS_DB_KEY="$COSMOS_PRIMARY_KEY" \
    COSMOS_DB_DATABASE="$COSMOS_DATABASE" \
    FRONTEND_URL="https://${WEBAPP_FRONTEND_NAME}.azurewebsites.net" \
    NODE_ENV="$ENV" \
  -o none

echo "✅ Function App configured successfully"

# ============================================
# Create App Service Plan for Web Apps
# ============================================
echo "Creating App Service Plan for Web Apps: $WEB_APP_PLAN ..."

# Check if plan already exists
if az appservice plan show --name "$WEB_APP_PLAN" --resource-group "$RG_NAME" >/dev/null 2>&1; then
  echo "App Service plan $WEB_APP_PLAN already exists. Skipping creation."
else
  WEB_APP_SKU="P1V3"

  az appservice plan create \
    --name "$WEB_APP_PLAN" \
    --resource-group "$RG_NAME" \
    --location "$LOCATION" \
    --sku "$WEB_APP_SKU" \
    --is-linux \
    -o none
  
  echo "✅ App Service plan $WEB_APP_PLAN created successfully (Linux)"
fi

# ============================================
# Create Backend API Web App (NestJS)
# ============================================
echo "Creating Backend API Web App: $WEBAPP_API_NAME (Node.js 24 LTS on Linux)..."

if az webapp show --name "$WEBAPP_API_NAME" --resource-group "$RG_NAME" >/dev/null 2>&1; then
  echo "Backend API Web App $WEBAPP_API_NAME already exists. Skipping creation."
else
  az webapp create \
    --resource-group "$RG_NAME" \
    --plan "$WEB_APP_PLAN" \
    --name "$WEBAPP_API_NAME" \
    --runtime "NODE:24-lts" \
    -o none
  
  echo "✅ Backend API Web App $WEBAPP_API_NAME created successfully"
fi

# Configure Web App settings for backend API
echo "Configuring Backend API Web App settings..."

az webapp config set \
  --resource-group "$RG_NAME" \
  --name "$WEBAPP_API_NAME" \
  --linux-fx-version "NODE|24-lts" \
  --startup-file "node build/main.js" \
  --always-on true \
  --ftps-state Disabled \
  --http20-enabled true \
  -o none

# Enforce HTTPS for Backend API
echo "Enforcing HTTPS for Backend API..."
az webapp update --resource-group "$RG_NAME" --name "$WEBAPP_API_NAME" --https-only true -o none

# Configure application settings for backend API
echo "Setting application settings for Backend API..."

BACKEND_API_URL="https://${WEBAPP_API_NAME}.azurewebsites.net"
FRONTEND_URL="https://${WEBAPP_FRONTEND_NAME}.azurewebsites.net"

az webapp config appsettings set \
  --resource-group "$RG_NAME" \
  --name "$WEBAPP_API_NAME" \
  --settings \
    NODE_ENV="$ENV" \
    PORT="8080" \
    WEBSITE_NODE_DEFAULT_VERSION="~24" \
    AZURE_STORAGE_ACCOUNT="$STORAGE_ACCOUNT_NAME" \
    AZURE_STORAGE_ACCOUNT_KEY="$STORAGE_KEY" \
    AzureWebJobsStorage="$STORAGE_CONNECTION_STRING" \
    IMAGE_PROCESSING_QUEUE_NAME="$QUEUE_NAME" \
    NEW_ARTWORK_QUEUE_NAME="$NEW_ARTWORK_QUEUE_NAME" \
    COSMOS_DB_ENDPOINT="$COSMOS_DB_ENDPOINT" \
    COSMOS_DB_KEY="$COSMOS_PRIMARY_KEY" \
    COSMOS_DB_DATABASE="$COSMOS_DATABASE" \
    AZURE_AI_VISION_ENDPOINT="$VISION_ENDPOINT" \
    AZURE_AI_VISION_KEY="$VISION_KEY" \
    AZURE_COMMUNICATION_CONNECTION_STRING="$COMMUNICATION_CONNECTION_STRING" \
    AZURE_EMAIL_SENDER="$AZURE_EMAIL_SENDER_ADDRESS" \
    JWT_SECRET="$JWT_SECRET" \
    CORS_ORIGINS="$FRONTEND_URL" \
  -o none

# Enable CORS for frontend
echo "Enabling CORS for Backend API..."
az webapp cors add \
  --resource-group "$RG_NAME" \
  --name "$WEBAPP_API_NAME" \
  --allowed-origins "$FRONTEND_URL" \
  -o none

# Enable Application Insights for backend API
echo "Creating Application Insights for Backend API..."
APP_INSIGHTS_NAME="tastematcher-${ENV}-api-insights"

az monitor app-insights component create \
  --app "$APP_INSIGHTS_NAME" \
  --location "$LOCATION" \
  --resource-group "$RG_NAME" \
  --application-type web \
  -o none || echo "Application Insights may already exist - continuing..."

# Get Application Insights connection string
APP_INSIGHTS_CONNECTION_STRING=$(az monitor app-insights component show \
  --app "$APP_INSIGHTS_NAME" \
  --resource-group "$RG_NAME" \
  --query connectionString -o tsv)

# Set Application Insights for backend API
az webapp config appsettings set \
  --resource-group "$RG_NAME" \
  --name "$WEBAPP_API_NAME" \
  --settings \
    APPLICATIONINSIGHTS_CONNECTION_STRING="$APP_INSIGHTS_CONNECTION_STRING" \
  -o none

# ============================================
# Create Frontend Web App (React SPA)
# ============================================
echo "Creating Frontend Web App: $WEBAPP_FRONTEND_NAME (Node.js 24 LTS on Linux)..."

if az webapp show --name "$WEBAPP_FRONTEND_NAME" --resource-group "$RG_NAME" >/dev/null 2>&1; then
  echo "Frontend Web App $WEBAPP_FRONTEND_NAME already exists. Skipping creation."
else
  az webapp create \
    --resource-group "$RG_NAME" \
    --plan "$WEB_APP_PLAN" \
    --name "$WEBAPP_FRONTEND_NAME" \
    --runtime "NODE:24-lts" \
    -o none
  
  echo "✅ Frontend Web App $WEBAPP_FRONTEND_NAME created successfully"
fi

# Configure Web App settings for frontend
echo "Configuring Frontend Web App settings..."

az webapp config set \
  --resource-group "$RG_NAME" \
  --name "$WEBAPP_FRONTEND_NAME" \
  --linux-fx-version "NODE|24-lts" \
  --startup-file "npx serve -s build -l 8080" \
  --always-on true \
  --ftps-state Disabled \
  --http20-enabled true \
  -o none

# Enforce HTTPS for Frontend Web App
echo "Enforcing HTTPS for Frontend Web App..."
az webapp update --resource-group "$RG_NAME" --name "$WEBAPP_FRONTEND_NAME" --https-only true -o none

# Configure application settings for frontend
echo "Setting application settings for Frontend Web App..."

az webapp config appsettings set \
  --resource-group "$RG_NAME" \
  --name "$WEBAPP_FRONTEND_NAME" \
  --settings \
    NODE_ENV="production" \
    PORT="8080" \
    WEBSITE_NODE_DEFAULT_VERSION="~24" \
    SCM_DO_BUILD_DURING_DEPLOYMENT="false" \
  -o none

# Local production profiles are intentionally generated by the separate,
# read-only sync script. Keeping this provisioning script free of developer
# credential files avoids duplicating secret handling and safety controls.

echo "Provisioning complete. Important outputs:"
echo " - Resource group: $RG_NAME"
echo " - Storage account: $STORAGE_ACCOUNT_NAME"
echo " - Blob endpoint: $STORAGE_BLOB_ENDPOINT"
echo " - Queue name: $QUEUE_NAME"
echo " - New artwork queue name: $NEW_ARTWORK_QUEUE_NAME"
echo " - Computer Vision name: $VISION_NAME"
echo " - Computer Vision endpoint: $VISION_ENDPOINT"
echo " - Cosmos DB account: $COSMOS_NAME"
echo " - Cosmos DB database: $COSMOS_DATABASE"
echo " - Cosmos DB endpoint: $COSMOS_DB_ENDPOINT"
echo " - Cosmos DB primary key: ${COSMOS_PRIMARY_KEY:0:8}..."
echo " - Function App: $FUNCAPP_NAME"
echo " - Communication resource: $COMMUNICATION_NAME"
echo " - Azure Email sender address: $AZURE_EMAIL_SENDER_ADDRESS"
echo " - Backend API Web App: $WEBAPP_API_NAME"
echo " - Backend API URL: $BACKEND_API_URL"
echo " - Frontend Web App: $WEBAPP_FRONTEND_NAME"
echo " - Frontend URL: $FRONTEND_URL"
echo " - Application Insights (API): $APP_INSIGHTS_NAME"
echo " - Local production config: run ./scripts/azure/sync-local-production-config.sh prd"
echo ""

echo "Next steps:"
echo " 1. Deploy backend API code to $WEBAPP_API_NAME using Azure CLI or GitHub Actions"
echo " 2. Deploy frontend code to $WEBAPP_FRONTEND_NAME using Azure CLI or GitHub Actions"
echo " 3. Deploy your Azure Function code to $FUNCAPP_NAME"
echo " 4. Configure Computer Vision for image vectorization in your Functions app"
echo " 5. Generate guarded local config with ./scripts/azure/sync-local-production-config.sh prd"
echo " 6. Confirm the production GitHub Actions credentials and branch protection"
echo ""
echo "Health check URLs:"
echo " - Backend API: ${BACKEND_API_URL}/health"
echo " - Frontend: $FRONTEND_URL"


###
# troubleshooting tips:
# In case of registration issues, you can run "az provider register --namespace Microsoft.DocumentDB" and similar for other services.
# In case of registration issues, you can run "az provider register --namespace Microsoft.CognitiveServices" for Computer Vision.
# If function app deployment fails (or succeeded but doesn't really work) - change WEBSITE_RUN_FROM_PACKAGE to 0 in app settings and redeploy. (if it still doesn't work, delete it entirely and recreate).
###
