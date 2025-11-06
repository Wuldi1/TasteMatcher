#!/usr/bin/env bash
set -euo pipefail

# Usage: ./provision-resources.sh <env> <location>
# Example: ./provision-resources.sh dev israelcentral

ENV=${1:-dev}
LOCATION=${2:-israelcentral}
EMAIL_LOCATION=${3:-"global"} # not supported in israelcentral as of now
EMAIL_DATA_LOCATION=${4:-"UnitedStates"} # not supported in israelcentral as of now
COMPUTER_VISION_LOCATION=${5:-"francecentral"} # not supported in israelcentral as of now

if [ -z "$ENV" ]; then
  echo "Usage: $0 <env> <location>"
  exit 1
fi

# Resource name patterns (user-visible names follow tastematcher-[env]-[resource-type])
RG_NAME="tastematcher-${ENV}-rg"
STORAGE_DISPLAY="tastematcher-${ENV}-storage"     # display/label
QUEUE_NAME="tastematcher-${ENV}-indexing-jobs"     # queue name
SEARCH_NAME="tastematcher-${ENV}-search"           # cognitive search name (must be globally unique under subscription)
COSMOS_NAME="tastematcher-${ENV}-cosmos"           # cosmos db account name (must be globally unique)
KV_NAME="tastematcher-${ENV}-kv"                   # key vault name (lowercase, unique)
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
echo "Cognitive Search service: $SEARCH_NAME"
echo "Cosmos DB account: $COSMOS_NAME"
echo "Key Vault: $KV_NAME"
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
az storage account create \
  --name "$STORAGE_ACCOUNT_NAME" \
  --resource-group "$RG_NAME" \
  --location "$LOCATION" \
  --sku Standard_LRS \
  --kind StorageV2 \
  --access-tier Hot \
  -o none

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

# Create Key Vault
echo "Creating Key Vault $KV_NAME..."
if az keyvault show --name "$KV_NAME" --resource-group "$RG_NAME" >/dev/null 2>&1; then
  echo "Key Vault $KV_NAME already exists. Skipping creation."
else
  az keyvault create --name "$KV_NAME" --resource-group "$RG_NAME" --location "$LOCATION" -o none
fi


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

# TODO - need to create custom domain
AZURE_EMAIL_SENDER_ADDRESS=${AZURE_EMAIL_SENDER_ADDRESS:-"donotreply@2fd3f94e-2fdf-4c93-80bd-b396997b5bdd.azurecomm.net"}

# Create Azure Cosmos DB account
echo "Creating Azure Cosmos DB account: $COSMOS_NAME ..."
COSMOS_DATABASE="tastematcher"

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

    # Users container - partition by /id for user isolation
    az cosmosdb sql container create \
      --account-name "$COSMOS_NAME" \
      --resource-group "$RG_NAME" \
      --database-name "$COSMOS_DATABASE" \
      --name "Users" \
      --partition-key-path "/id" \
      --throughput 400 \
      -o none || echo "Users container already exists or creation failed - continuing..."

    # Domains container - partition by /adminEmail for domain isolation
    az cosmosdb sql container create \
      --account-name "$COSMOS_NAME" \
      --resource-group "$RG_NAME" \
      --database-name "$COSMOS_DATABASE" \
      --name "Domains" \
      --partition-key-path "/adminEmail" \
      --throughput 400 \
      -o none || echo "Domains container already exists or creation failed - continuing..."

    # Artworks container - partition by /domainId for multi-tenant isolation
    az cosmosdb sql container create \
      --account-name "$COSMOS_NAME" \
      --resource-group "$RG_NAME" \
      --database-name "$COSMOS_DATABASE" \
      --name "Artworks" \
      --partition-key-path "/domainId" \
      --throughput 400 \
      -o none || echo "Artworks container already exists or creation failed - continuing..."

    # Sessions container - partition by /userId for session isolation
    az cosmosdb sql container create \
      --account-name "$COSMOS_NAME" \
      --resource-group "$RG_NAME" \
      --database-name "$COSMOS_DATABASE" \
      --name "Sessions" \
      --partition-key-path "/userId" \
      --throughput 400 \
      -o none || echo "Sessions container already exists or creation failed - continuing..."
  fi

# Get Cosmos DB connection string and keys
COSMOS_CONNECTION_STRING=$(az cosmosdb keys list --name "$COSMOS_NAME" --resource-group "$RG_NAME" --type connection-strings --query "connectionStrings[0].connectionString" -o tsv)
COSMOS_PRIMARY_KEY=$(az cosmosdb keys list --name "$COSMOS_NAME" --resource-group "$RG_NAME" --query primaryMasterKey -o tsv)
# Build Cosmos DB endpoint URL
COSMOS_DB_ENDPOINT="https://${COSMOS_NAME}.documents.azure.com:443/"
# Build DATABASE_URL for Prisma Cosmos DB connector
DATABASE_URL="mongodb://${COSMOS_NAME}:${COSMOS_PRIMARY_KEY}@${COSMOS_NAME}.mongo.cosmos.azure.com:10255/${COSMOS_DATABASE}?ssl=true&replicaSet=globaldb&retrywrites=false&maxIdleTimeMS=120000&appName=@${COSMOS_NAME}@"

# TODO : Make it a script that will create it securely
JWT_SECRET="TXR1JkKj8zqz2qP6N2uQ0NraE4GgVfVdCuzkR3VxKQZ1CjSx2zgo8/J7Y4h9v1J7"

# Function to setup Cosmos DB data
setup_cosmos_data() {
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

  # Insert admin user (will fail silently if exists)
  echo "$ADMIN_USER_JSON" | az cosmosdb sql container item create \
    --account-name "$COSMOS_NAME" \
    --resource-group "$RG_NAME" \
    --database-name "$COSMOS_DATABASE" \
    --container-name "Users" \
    --body @- \
    -o none 2>/dev/null || echo "Admin user may already exist - continuing..."
  
  echo "✅ Cosmos DB initial data setup completed!"
}

# Remove old PostgreSQL functions and replace with Cosmos DB setup
setup_cosmos_data

# Create Azure Cognitive Search service
# Note: vector capabilities may require a certain SKUs or regions - check availability
echo "Creating Azure Cognitive Search service: $SEARCH_NAME (SKU: basic)..."
az search service create \
    --name "$SEARCH_NAME" \
    --resource-group "$RG_NAME" \
    --location "$LOCATION" \
    --sku basic \
    --partition-count 1 \
    --replica-count 1 \
    -o none

# Get search admin key
SEARCH_KEY=$(az search admin-key show --service-name "$SEARCH_NAME" --resource-group "$RG_NAME" --query primaryKey -o tsv)

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

# Create an App Service plan (consumption) and Function App
# Function App requires a storage account; we will reuse the storage account above
echo "Creating App Service plan and Function App..."
az functionapp plan create --name "$APP_PLAN" --resource-group "$RG_NAME" --location "$LOCATION" --number-of-workers 1 --sku EP1 -o none

# Create Function App (Linux, Node)
az functionapp create \
  --resource-group "$RG_NAME" \
  --name "$FUNCAPP_NAME" \
  --storage-account "$STORAGE_ACCOUNT_NAME" \
  --plan "$APP_PLAN" \
  --runtime node \
  --runtime-version 22 \
  --os-type Linux \
  -o none

# Enable system-assigned managed identity for Function App
echo "Assigning system identity to function app..."
az functionapp identity assign --name "$FUNCAPP_NAME" --resource-group "$RG_NAME" -o none

# Wait for managed identity to propagate in Azure AD
echo "Waiting for managed identity propagation..."
sleep 30

# Get Function App managed identity principal ID
FUNC_PRINCIPAL_ID=$(az functionapp identity show --name "$FUNCAPP_NAME" --resource-group "$RG_NAME" --query principalId -o tsv)

echo "Function App Principal ID: $FUNC_PRINCIPAL_ID"

# Create a Service Principal for CI / admin usage
SP_NAME="http://tastematcher-${ENV}-sp"
echo "Creating service principal $SP_NAME (note: minimal scope assignment - adjust to least privilege later)..."
SP_JSON=$(az ad sp create-for-rbac --name "$SP_NAME" --role "Contributor" --scopes "/subscriptions/$(az account show --query id -o tsv)/resourceGroups/$RG_NAME" -o json)
SP_APP_ID=$(echo "$SP_JSON" | jq -r '.appId')
SP_PASSWORD=$(echo "$SP_JSON" | jq -r '.password')
SP_TENANT=$(echo "$SP_JSON" | jq -r '.tenant')

# Get Key Vault and Storage resource IDs for role assignments
KEYVAULT_RESOURCE_ID=$(az keyvault show --name "$KV_NAME" --resource-group "$RG_NAME" --query id -o tsv)
STORAGE_RESOURCE_ID=$(az storage account show --name "$STORAGE_ACCOUNT_NAME" --resource-group "$RG_NAME" --query id -o tsv)

# Grant Key Vault access to Function App managed identity
echo "Assigning Key Vault access roles to function managed identity..."

az role assignment create \
  --assignee-object-id "$FUNC_PRINCIPAL_ID" \
  --assignee-principal-type ServicePrincipal \
  --role "Key Vault Secrets User" \
  --scope "$KEYVAULT_RESOURCE_ID" \
  -o none

# Grant Storage Blob Data Contributor to Function App
echo "Assigning 'Storage Blob Data Contributor' to function identity for storage account..."

az role assignment create \
  --assignee-object-id "$FUNC_PRINCIPAL_ID" \
  --assignee-principal-type ServicePrincipal \
  --role "Storage Blob Data Contributor" \
  --scope "$STORAGE_RESOURCE_ID" \
  -o none

# ============================================
# Create App Service Plan for Web Apps
# ============================================
echo "Creating App Service Plan for Web Apps: $WEB_APP_PLAN ..."

# Determine SKU based on environment
if [ "$ENV" = "prod" ]; then
  WEB_APP_SKU="P1V3"  # Production: Premium V3 tier
else
  WEB_APP_SKU="B1"    # Dev/Staging: Basic tier
fi

az appservice plan create \
  --name "$WEB_APP_PLAN" \
  --resource-group "$RG_NAME" \
  --location "$LOCATION" \
  --sku "$WEB_APP_SKU" \
  --is-linux \
  -o none

# ============================================
# Create Backend API Web App (NestJS)
# ============================================
echo "Creating Backend API Web App: $WEBAPP_API_NAME (Node.js 22 LTS)..."

az webapp create \
  --resource-group "$RG_NAME" \
  --plan "$WEB_APP_PLAN" \
  --name "$WEBAPP_API_NAME" \
  --runtime "NODE:22-lts" \
  -o none

# Configure Web App settings for backend API
echo "Configuring Backend API Web App settings..."

az webapp config set \
  --resource-group "$RG_NAME" \
  --name "$WEBAPP_API_NAME" \
  --startup-file "node dist/main.js" \
  --always-on true \
  --ftps-state Disabled \
  --http20-enabled true \
  -o none

# Enable managed identity for backend API
echo "Enabling managed identity for Backend API Web App..."
az webapp identity assign \
  --resource-group "$RG_NAME" \
  --name "$WEBAPP_API_NAME" \
  -o none

# Wait for managed identity to propagate in Azure AD
echo "Waiting for Backend API managed identity propagation..."
sleep 30

# Get backend API managed identity principal ID
WEBAPP_API_PRINCIPAL_ID=$(az webapp identity show \
  --resource-group "$RG_NAME" \
  --name "$WEBAPP_API_NAME" \
  --query principalId -o tsv)

echo "Backend API Principal ID: $WEBAPP_API_PRINCIPAL_ID"

# Grant Key Vault access to backend API managed identity
echo "Granting Key Vault access to Backend API managed identity..."
az role assignment create \
  --assignee-object-id "$WEBAPP_API_PRINCIPAL_ID" \
  --assignee-principal-type ServicePrincipal \
  --role "Key Vault Secrets User" \
  --scope "$KEYVAULT_RESOURCE_ID" \
  -o none

# Grant Storage Blob Data Contributor to backend API
echo "Granting Storage Blob Data Contributor to Backend API..."
az role assignment create \
  --assignee-object-id "$WEBAPP_API_PRINCIPAL_ID" \
  --assignee-principal-type ServicePrincipal \
  --role "Storage Blob Data Contributor" \
  --scope "$STORAGE_RESOURCE_ID" \
  -o none

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
    AZURE_STORAGE_ACCOUNT="$STORAGE_ACCOUNT_NAME" \
    AZURE_BLOB_CONTAINER_ORIGINALS="originals" \
    AZURE_BLOB_CONTAINER_DERIVATIVES="derivatives" \
    IMAGE_PROCESSING_QUEUE_NAME="$QUEUE_NAME" \
    COSMOS_DB_ENDPOINT="$COSMOS_DB_ENDPOINT" \
    COSMOS_DB_DATABASE="$COSMOS_DATABASE" \
    AZURE_SEARCH_ENDPOINT="https://${SEARCH_NAME}.search.windows.net" \
    AZURE_SEARCH_INDEX_NAME="artworks-index" \
    AZURE_AI_VISION_ENDPOINT="$VISION_ENDPOINT" \
    AZURE_KEYVAULT_NAME="$KV_NAME" \
    CORS_ORIGINS="$FRONTEND_URL" \
    WEBSITE_NODE_DEFAULT_VERSION="~22" \
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
echo "Creating Frontend Web App: $WEBAPP_FRONTEND_NAME (Node.js 22 LTS)..."

az webapp create \
  --resource-group "$RG_NAME" \
  --plan "$WEB_APP_PLAN" \
  --name "$WEBAPP_FRONTEND_NAME" \
  --runtime "NODE:22-lts" \
  -o none

# Configure Web App settings for frontend
echo "Configuring Frontend Web App settings..."

az webapp config set \
  --resource-group "$RG_NAME" \
  --name "$WEBAPP_FRONTEND_NAME" \
  --startup-file "npx serve -s dist -l 8080" \
  --always-on true \
  --ftps-state Disabled \
  --http20-enabled true \
  -o none

# Configure application settings for frontend
echo "Setting application settings for Frontend Web App..."

az webapp config appsettings set \
  --resource-group "$RG_NAME" \
  --name "$WEBAPP_FRONTEND_NAME" \
  --settings \
    NODE_ENV="production" \
    VITE_API_BASE_URL="$BACKEND_API_URL" \
    WEBSITE_NODE_DEFAULT_VERSION="~22" \
    SCM_DO_BUILD_DURING_DEPLOYMENT="true" \
  -o none

# Enable Application Insights for frontend
echo "Creating Application Insights for Frontend Web App..."
FRONTEND_INSIGHTS_NAME="tastematcher-${ENV}-web-insights"

az monitor app-insights component create \
  --app "$FRONTEND_INSIGHTS_NAME" \
  --location "$LOCATION" \
  --resource-group "$RG_NAME" \
  --application-type web \
  -o none || echo "Application Insights may already exist - continuing..."

FRONTEND_INSIGHTS_KEY=$(az monitor app-insights component show \
  --app "$FRONTEND_INSIGHTS_NAME" \
  --resource-group "$RG_NAME" \
  --query instrumentationKey -o tsv)

az webapp config appsettings set \
  --resource-group "$RG_NAME" \
  --name "$WEBAPP_FRONTEND_NAME" \
  --settings \
    APPINSIGHTS_INSTRUMENTATIONKEY="$FRONTEND_INSIGHTS_KEY" \
  -o none

# ============================================
# Configure deployment slots for production
# ============================================
if [ "$ENV" = "prod" ]; then
  echo "Creating staging slot for Backend API (production environment)..."
  az webapp deployment slot create \
    --resource-group "$RG_NAME" \
    --name "$WEBAPP_API_NAME" \
    --slot staging \
    -o none || echo "Staging slot may already exist - continuing..."
  
  echo "Creating staging slot for Frontend (production environment)..."
  az webapp deployment slot create \
    --resource-group "$RG_NAME" \
    --name "$WEBAPP_FRONTEND_NAME" \
    --slot staging \
    -o none || echo "Staging slot may already exist - continuing..."
fi

# ============================================
# Create Service Principal for CI/CD
# ============================================
echo "Creating service principal for CI/CD..."
SP_NAME="tastematcher-${ENV}-sp"

# Check if SP already exists
SP_APP_ID=$(az ad sp list --display-name "$SP_NAME" --query "[0].appId" -o tsv 2>/dev/null || echo "")

if [ -z "$SP_APP_ID" ]; then
  echo "Creating new service principal: $SP_NAME"
  SP_JSON=$(az ad sp create-for-rbac \
    --name "$SP_NAME" \
    --role "Contributor" \
    --scopes "/subscriptions/$(az account show --query id -o tsv)/resourceGroups/$RG_NAME" \
    -o json)
  
  SP_APP_ID=$(echo "$SP_JSON" | jq -r '.appId')
  SP_PASSWORD=$(echo "$SP_JSON" | jq -r '.password')
  SP_TENANT=$(echo "$SP_JSON" | jq -r '.tenant')
else
  echo "Service principal $SP_NAME already exists with appId: $SP_APP_ID"
  echo "⚠️  Cannot retrieve existing password. If needed, reset credentials with:"
  echo "    az ad sp credential reset --id $SP_APP_ID"
  SP_PASSWORD=""
  SP_TENANT=$(az account show --query tenantId -o tsv)
fi

# Store secrets in Key Vault
echo "Storing secrets in Key Vault..."
az keyvault secret set --name "StorageAccountKey" --vault-name "$KV_NAME" --value "$STORAGE_KEY"
az keyvault secret set --name "CosmosConnectionString" --vault-name "$KV_NAME" --value "$COSMOS_CONNECTION_STRING"
az keyvault secret set --name "CosmosPrimaryKey" --vault-name "$KV_NAME" --value "$COSMOS_PRIMARY_KEY"
az keyvault secret set --name "CosmosEndpoint" --vault-name "$KV_NAME" --value "$COSMOS_DB_ENDPOINT"
az keyvault secret set --name "CosmosDatabase" --vault-name "$KV_NAME" --value "$COSMOS_DATABASE"
az keyvault secret set --name "CommunicationConnectionString" --vault-name "$KV_NAME" --value "$COMMUNICATION_CONNECTION_STRING"
az keyvault secret set --name "CommunicationEmailSender" --vault-name "$KV_NAME" --value "$AZURE_EMAIL_SENDER_ADDRESS"
az keyvault secret set --name "JwtSecret" --vault-name "$KV_NAME" --value "$JWT_SECRET"
az keyvault secret set --name "SearchAdminKey" --vault-name "$KV_NAME" --value "$SEARCH_KEY"
az keyvault secret set --name "ComputerVisionEndpoint" --vault-name "$KV_NAME" --value "$VISION_ENDPOINT"
az keyvault secret set --name "ComputerVisionKey" --vault-name "$KV_NAME" --value "$VISION_KEY"
az keyvault secret set --name "BackendApiUrl" --vault-name "$KV_NAME" --value "$BACKEND_API_URL"
az keyvault secret set --name "FrontendUrl" --vault-name "$KV_NAME" --value "$FRONTEND_URL"
az keyvault secret set --name "AppInsightsConnectionString" --vault-name "$KV_NAME" --value "$APP_INSIGHTS_CONNECTION_STRING"

if [ -n "$SP_APP_ID" ]; then
  az keyvault secret set --name "ServicePrincipalAppId" --vault-name "$KV_NAME" --value "$SP_APP_ID"
fi

if [ -n "$SP_PASSWORD" ]; then
  az keyvault secret set --name "ServicePrincipalPassword" --vault-name "$KV_NAME" --value "$SP_PASSWORD"
  az keyvault secret set --name "ServicePrincipalTenant" --vault-name "$KV_NAME" --value "$SP_TENANT"
fi

# Build .env file for the backend local usage
ENVFILE=".env.${ENV}"
echo "Writing env file to $ENVFILE"
cat > "$ENVFILE" <<EOF
# Generated by provision-resources.sh
NODE_ENV=development
PORT=3000
REACT_APP_API_URL=http://localhost:3000

# Storage
AZURE_STORAGE_ACCOUNT=${STORAGE_ACCOUNT_NAME}
AZURE_STORAGE_ACCOUNT_KEY=${STORAGE_KEY}
AZURE_BLOB_CONTAINER_ORIGINALS=originals
AZURE_BLOB_CONTAINER_DERIVATIVES=derivatives
IMAGE_PROCESSING_QUEUE_NAME=${QUEUE_NAME}

# Search
AZURE_SEARCH_ENDPOINT=https://${SEARCH_NAME}.search.windows.net
AZURE_SEARCH_ADMIN_KEY=${SEARCH_KEY}
AZURE_SEARCH_INDEX_NAME=artworks-index

# Computer Vision (AI Vision)
AZURE_AI_VISION_ENDPOINT=${VISION_ENDPOINT}
AZURE_AI_VISION_KEY=${VISION_KEY}

# Cosmos DB
DATABASE_URL="${DATABASE_URL}"
COSMOS_DB_ENDPOINT=${COSMOS_DB_ENDPOINT}
COSMOS_DB_KEY=${COSMOS_PRIMARY_KEY}
COSMOS_DB_DATABASE=${COSMOS_DATABASE}

# Azure Communication Services (Email)
AZURE_COMMUNICATION_CONNECTION_STRING="${COMMUNICATION_CONNECTION_STRING}"
AZURE_EMAIL_SENDER=${AZURE_EMAIL_SENDER_ADDRESS}

# Auth
JWT_SECRET=${JWT_SECRET}

# Key Vault
AZURE_KEYVAULT_NAME=${KV_NAME}

# Function App
FUNCTION_APP_NAME=${FUNCAPP_NAME}
FUNCTIONS_WORKER_RUNTIME=node

# Web Apps
BACKEND_API_URL=${BACKEND_API_URL}
FRONTEND_URL=${FRONTEND_URL}

# Application Insights
APPLICATIONINSIGHTS_CONNECTION_STRING=${APP_INSIGHTS_CONNECTION_STRING}

EOF

echo "Provisioning complete. Important outputs:"
echo " - Resource group: $RG_NAME"
echo " - Storage account: $STORAGE_ACCOUNT_NAME"
echo " - Blob endpoint: $STORAGE_BLOB_ENDPOINT"
echo " - Queue name: $QUEUE_NAME"
echo " - Cognitive Search name: $SEARCH_NAME"
echo " - Computer Vision name: $VISION_NAME"
echo " - Computer Vision endpoint: $VISION_ENDPOINT"
echo " - Cosmos DB account: $COSMOS_NAME"
echo " - Cosmos DB database: $COSMOS_DATABASE"
echo " - Cosmos DB endpoint: $COSMOS_DB_ENDPOINT"
echo " - Cosmos DB primary key: ${COSMOS_PRIMARY_KEY:0:8}..."
echo " - Key Vault name: $KV_NAME"
echo " - Function App: $FUNCAPP_NAME"
echo " - Communication resource: $COMMUNICATION_NAME"
echo " - Azure Email sender address: $AZURE_EMAIL_SENDER_ADDRESS"
echo " - Backend API Web App: $WEBAPP_API_NAME"
echo " - Backend API URL: $BACKEND_API_URL"
echo " - Frontend Web App: $WEBAPP_FRONTEND_NAME"
echo " - Frontend URL: $FRONTEND_URL"
echo " - Application Insights (API): $APP_INSIGHTS_NAME"
echo " - Application Insights (Frontend): $FRONTEND_INSIGHTS_NAME"
echo " - Environment file: $ENVFILE"

echo ""
echo "Next steps:"
echo " 1. Deploy backend API code to $WEBAPP_API_NAME using Azure CLI or GitHub Actions"
echo " 2. Deploy frontend code to $WEBAPP_FRONTEND_NAME using Azure CLI or GitHub Actions"
echo " 3. Create the Cognitive Search index using scripts/azure/create-search-index.sh"
echo " 4. Deploy your Azure Function code to $FUNCAPP_NAME"
echo " 5. Configure Computer Vision for image vectorization in your Functions app"
echo " 6. Use .env.${ENV} in your backend for local testing (but prefer Key Vault in prod)"
echo " 7. Set up GitHub Actions workflows for CI/CD deployment"
echo ""
echo "Deployment commands:"
echo " - Backend API: cd webapi && pnpm build && az webapp deploy --resource-group $RG_NAME --name $WEBAPP_API_NAME --src-path dist.zip --type zip"
echo " - Frontend: cd frontend && pnpm build && az webapp deploy --resource-group $RG_NAME --name $WEBAPP_FRONTEND_NAME --src-path dist.zip --type zip"
echo ""
echo "Health check URLs:"
echo " - Backend API: ${BACKEND_API_URL}/health"
echo " - Frontend: $FRONTEND_URL"




###
# troubleshooting tips:
# In case of registration issues, you can run "az provider register --namespace Microsoft.KeyVault" and similar for other services.
# In case of registration issues, you can run "az provider register --namespace Microsoft.DocumentDB" and similar for other services.
# In case of registration issues, you can run "az provider register --namespace Microsoft.CognitiveServices" for Computer Vision.
###