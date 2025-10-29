#!/usr/bin/env bash
set -euo pipefail

# Usage: ./provision-resources.sh <env> <location>
# Example: ./provision-resources.sh dev israelcentral

ENV=${1:-dev}
LOCATION=${2:-israelcentral}

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


echo "Environment: $ENV, Location: $LOCATION"
echo "Resource group: $RG_NAME"
echo "Storage account (sanitized): $STORAGE_ACCOUNT_NAME"
echo "Cognitive Search service: $SEARCH_NAME"
echo "Cosmos DB account: $COSMOS_NAME"
echo "Key Vault: $KV_NAME"
echo "Function App: $FUNCAPP_NAME"

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



# Create Azure Cosmos DB account
echo "Creating Azure Cosmos DB account: $COSMOS_NAME ..."
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
fi

# Create Cosmos DB database
COSMOS_DATABASE="tastematcher"
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

# Get Cosmos DB connection string and keys
COSMOS_CONNECTION_STRING=$(az cosmosdb keys list --name "$COSMOS_NAME" --resource-group "$RG_NAME" --type connection-strings --query "connectionStrings[0].connectionString" -o tsv)
COSMOS_PRIMARY_KEY=$(az cosmosdb keys list --name "$COSMOS_NAME" --resource-group "$RG_NAME" --query primaryMasterKey -o tsv)

# Build Cosmos DB endpoint URL
COSMOS_DB_ENDPOINT="https://${COSMOS_NAME}.documents.azure.com:443/"

# Build DATABASE_URL for Prisma Cosmos DB connector
DATABASE_URL="mongodb://${COSMOS_NAME}:${COSMOS_PRIMARY_KEY}@${COSMOS_NAME}.mongo.cosmos.azure.com:10255/${COSMOS_DATABASE}?ssl=true&replicaSet=globaldb&retrywrites=false&maxIdleTimeMS=120000&appName=@${COSMOS_NAME}@"

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
  --runtime-version 20 \
  --os-type Linux \
  -o none

# Enable system-assigned managed identity for Function App
echo "Assigning system identity to function app..."
az functionapp identity assign --name "$FUNCAPP_NAME" --resource-group "$RG_NAME" -o none

# Create a Service Principal for CI / admin usage
SP_NAME="http://tastematcher-${ENV}-sp"
echo "Creating service principal $SP_NAME (note: minimal scope assignment - adjust to least privilege later)..."
SP_JSON=$(az ad sp create-for-rbac --name "$SP_NAME" --role "Contributor" --scopes "/subscriptions/$(az account show --query id -o tsv)/resourceGroups/$RG_NAME" -o json)
SP_APP_ID=$(echo "$SP_JSON" | jq -r '.appId')
SP_PASSWORD=$(echo "$SP_JSON" | jq -r '.password')
SP_TENANT=$(echo "$SP_JSON" | jq -r '.tenant')

# Give Function managed identity access to Key Vault & Storage
# Get principal id of Function managed identity
FUNC_PRINCIPAL_ID=$(az functionapp identity show --name "$FUNCAPP_NAME" --resource-group "$RG_NAME" --query principalId -o tsv)

echo "Assigning Key Vault access roles to function managed identity..."
KEYVAULT_RESOURCE_ID=$(az keyvault show --name "$KV_NAME" --query id -o tsv)

az role assignment create \
  --assignee-object-id "$FUNC_PRINCIPAL_ID" \
  --role "Key Vault Secrets User" \
  --scope "$KEYVAULT_RESOURCE_ID" -o none

# Assign storage blob contributor role to function identity for the storage account
echo "Assigning 'Storage Blob Data Contributor' to function identity for storage account..."
STORAGE_RESOURCE_ID=$(az storage account show --name "$STORAGE_ACCOUNT_NAME" --resource-group "$RG_NAME" --query id -o tsv)
az role assignment create --assignee-object-id "$FUNC_PRINCIPAL_ID" --role "Storage Blob Data Contributor" --scope "$STORAGE_RESOURCE_ID" -o none

# Store secrets in Key Vault
echo "Storing secrets in Key Vault..."
az keyvault secret set --vault-name "$KV_NAME" --name "StorageAccountKey" --value "$STORAGE_KEY" -o none
az keyvault secret set --vault-name "$KV_NAME" --name "CosmosConnectionString" --value "$COSMOS_CONNECTION_STRING" -o none
az keyvault secret set --vault-name "$KV_NAME" --name "CosmosPrimaryKey" --value "$COSMOS_PRIMARY_KEY" -o none
az keyvault secret set --vault-name "$KV_NAME" --name "CosmosEndpoint" --value "$COSMOS_DB_ENDPOINT" -o none
az keyvault secret set --vault-name "$KV_NAME" --name "CosmosDatabase" --value "$COSMOS_DATABASE" -o none
az keyvault secret set --vault-name "$KV_NAME" --name "SearchAdminKey" --value "$SEARCH_KEY" -o none
az keyvault secret set --vault-name "$KV_NAME" --name "ServicePrincipalAppId" --value "$SP_APP_ID" -o none
az keyvault secret set --vault-name "$KV_NAME" --name "ServicePrincipalPassword" --value "$SP_PASSWORD" -o none
az keyvault secret set --vault-name "$KV_NAME" --name "ServicePrincipalTenant" --value "$SP_TENANT" -o none

# Build .env file for the backend local usage
ENVFILE=".env.${ENV}"
echo "Writing env file to $ENVFILE"
cat > "$ENVFILE" <<EOF
# Generated by provision-resources.sh
NODE_ENV=development
PORT=3000
VITE_API_BASE_URL=http://localhost:3000

# Storage
AZURE_STORAGE_ACCOUNT=${STORAGE_ACCOUNT_NAME}
AZURE_STORAGE_ACCOUNT_KEY=${STORAGE_KEY}
AZURE_BLOB_CONTAINER_ORIGINALS=originals
AZURE_BLOB_CONTAINER_DERIVATIVES=derivatives
AZURE_QUEUE_NAME=${QUEUE_NAME}

# Search
AZURE_SEARCH_ENDPOINT=https://${SEARCH_NAME}.search.windows.net
AZURE_SEARCH_ADMIN_KEY=${SEARCH_KEY}
AZURE_SEARCH_INDEX_NAME=artworks-index

# Cosmos DB
DATABASE_URL="${DATABASE_URL}"
COSMOS_DB_ENDPOINT=${COSMOS_DB_ENDPOINT}
COSMOS_DB_KEY=${COSMOS_PRIMARY_KEY}
COSMOS_DB_DATABASE=${COSMOS_DATABASE}

# Key Vault
AZURE_KEYVAULT_NAME=${KV_NAME}

# Function App
FUNCTION_APP_NAME=${FUNCAPP_NAME}

EOF

echo "Provisioning complete. Important outputs:"
echo " - Resource group: $RG_NAME"
echo " - Storage account: $STORAGE_ACCOUNT_NAME"
echo " - Blob endpoint: $STORAGE_BLOB_ENDPOINT"
echo " - Queue name: $QUEUE_NAME"
echo " - Cognitive Search name: $SEARCH_NAME"
echo " - Cosmos DB account: $COSMOS_NAME"
echo " - Cosmos DB database: $COSMOS_DATABASE"
echo " - Cosmos DB endpoint: $COSMOS_DB_ENDPOINT"
echo " - Cosmos DB primary key: ${COSMOS_PRIMARY_KEY:0:8}..."
echo " - Key Vault name: $KV_NAME"
echo " - Function App: $FUNCAPP_NAME"
echo " - Environment file: $ENVFILE"

echo "Next steps:"
echo " 1. Update Prisma schema to use MongoDB connector for Cosmos DB"
echo " 2. Create the Cognitive Search index using scripts/azure/create-search-index.sh"
echo " 3. Deploy your Azure Function code to $FUNCAPP_NAME and ensure it has access to Key Vault"
echo " 4. Use .env.${ENV} in your backend for local testing (but prefer Key Vault in prod)"




###
# troubleshooting tips:
# In case of registration issues, you can run "az provider register --namespace Microsoft.KeyVault" and similar for other services.
# In case of registration issues, you can run "az provider register --namespace Microsoft.DocumentDB" and similar for other services.
###