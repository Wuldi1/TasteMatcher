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
POSTGRES_NAME="tastematcher-${ENV}-postgres"       # flexible server name (must be globally unique)
KV_NAME="tastematcher-${ENV}-kv"                   # key vault name (lowercase, unique)
FUNCAPP_NAME="tastematcher-${ENV}-func"            # function app name (must be unique)
APP_PLAN="tastematcher-${ENV}-plan"

# Storage account naming constraint
# storage account must be 3-24 characters, lowercase, alphanumeric
# we will derive a sanitized storage account name from intended pattern
STORAGE_ACCOUNT_NAME="tastematcher${ENV}sa"  # <= 24 chars ideally, no hyphens

echo "Environment: $ENV, Location: $LOCATION"
echo "Resource group: $RG_NAME"
echo "Storage account (sanitized): $STORAGE_ACCOUNT_NAME"
echo "Cognitive Search service: $SEARCH_NAME"
echo "Postgres server: $POSTGRES_NAME"
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



# Create Azure Database for PostgreSQL Flexible Server
# NOTE: postgres server name must be unique within azure region
echo "Creating Azure Database for PostgreSQL Flexible Server: $POSTGRES_NAME ..."
POSTGRES_ADMIN_USER="tastematcher_admin"
POSTGRES_ADMIN_PASS="gyzmaj-bitpe0-dyvNuw"

if az postgres flexible-server show --name "$POSTGRES_NAME" --resource-group "$RG_NAME" >/dev/null 2>&1; then
  echo "PostgreSQL server $POSTGRES_NAME already exists. Skipping creation."
else
  az postgres flexible-server create \
    --name "$POSTGRES_NAME" \
    --resource-group "$RG_NAME" \
    --location "$LOCATION" \
    --admin-user "$POSTGRES_ADMIN_USER" \
    --admin-password "$POSTGRES_ADMIN_PASS" \
    --sku-name Standard_D2s_v3 \
    --storage-size 32 \
    --version 15 \
    --public-access all \
    -o none
fi

# Build DB connection string
POSTGRES_HOST="${POSTGRES_NAME}.postgres.database.azure.com"
DATABASE_URL="postgresql://${POSTGRES_ADMIN_USER}:${POSTGRES_ADMIN_PASS}@${POSTGRES_HOST}:5432/postgres?schema=public&sslmode=require"

# Creating DBs
# Function to setup database schema
setup_database_schema() {
  echo "Setting up database schema..."
  
  # Check if we have the webapi directory with Prisma schema
  WEBAPI_DIR="../../webapi"
  if [ ! -d "$WEBAPI_DIR" ]; then
    echo "Warning: webapi directory not found at $WEBAPI_DIR. Skipping schema setup."
    echo "Please run 'npx prisma db push' manually from the webapi directory after provisioning."
    return 0
  fi

  # Check if Prisma schema exists
  if [ ! -f "$WEBAPI_DIR/prisma/schema.prisma" ]; then
    echo "Warning: Prisma schema not found. Skipping schema setup."
    echo "Please ensure prisma/schema.prisma exists in webapi directory."
    return 0
  fi

  # Temporarily set DATABASE_URL for schema deployment
  echo "Deploying database schema to Azure PostgreSQL..."
  
  # Create a temporary .env file for Prisma
  TEMP_ENV_FILE="$WEBAPI_DIR/.env.temp"
  echo "DATABASE_URL=\"$DATABASE_URL\"" > "$TEMP_ENV_FILE"
  
  # Navigate to webapi directory and run Prisma commands
  cd "$WEBAPI_DIR"
  
  # Check if npm/node is available
  if ! command -v npm >/dev/null 2>&1; then
    echo "Warning: npm not found. Skipping automatic schema deployment."
    echo "Please run the following commands manually from the webapi directory:"
    echo "  export DATABASE_URL=\"$DATABASE_URL\""
    echo "  npx prisma generate"
    echo "  npx prisma db push"
    cd - >/dev/null
    rm -f "$TEMP_ENV_FILE"
    return 0
  fi

  # Install dependencies if needed
  if [ ! -d "node_modules" ] || [ ! -d "node_modules/@prisma" ]; then
    echo "Installing Prisma dependencies..."
    npm install @prisma/client prisma --save || {
      echo "Warning: Failed to install dependencies. Please install manually."
      cd - >/dev/null
      rm -f "$TEMP_ENV_FILE"
      return 0
    }
  fi

  # Generate Prisma client
  echo "Generating Prisma client..."
  DATABASE_URL="$DATABASE_URL" npx prisma generate || {
    echo "Warning: Prisma generate failed. Please run manually."
    cd - >/dev/null
    rm -f "$TEMP_ENV_FILE"
    return 0
  }

  # Deploy schema to database
  echo "Pushing schema to Azure PostgreSQL database..."
  DATABASE_URL="$DATABASE_URL" npx prisma db push --accept-data-loss || {
    echo "Warning: Schema deployment failed. Please run 'npx prisma db push' manually."
    echo "Database URL: $DATABASE_URL"
    cd - >/dev/null
    rm -f "$TEMP_ENV_FILE"
    return 0
  }

  # Clean up
  cd - >/dev/null
  rm -f "$TEMP_ENV_FILE"
  
  echo "✅ Database schema deployed successfully!"
}

# Function to create database tables manually (fallback)
create_database_tables_sql() {
  echo "Creating database tables using direct SQL..."

  # SQL script to create tables based on Common types
  SQL_SCRIPT=$(cat <<'EOF'
  -- Create User table
  CREATE TABLE IF NOT EXISTS "User" (
      id TEXT PRIMARY KEY,
      name TEXT,
      email TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'customer',
      "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  -- Create Domain table
  CREATE TABLE IF NOT EXISTS "Domain" (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      "adminEmail" TEXT UNIQUE NOT NULL,
      "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  -- Create Artwork table
  CREATE TABLE IF NOT EXISTS "Artwork" (
      id TEXT PRIMARY KEY,
      "domainId" TEXT NOT NULL,
      title TEXT,
      artist TEXT,
      "originalBlob" TEXT,
      filename TEXT,
      "contentType" TEXT,
      size INTEGER,
      checksum TEXT,
      "metadataJson" TEXT,
      "thumbnailJson" TEXT,
      "isIndexed" BOOLEAN NOT NULL DEFAULT false,
      "indexingError" TEXT,
      "lastIndexedAt" TIMESTAMP,
      "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY ("domainId") REFERENCES "Domain"(id) ON DELETE CASCADE
  );

  -- Create indexes for better performance
  CREATE INDEX IF NOT EXISTS "idx_artwork_domain_id" ON "Artwork"("domainId");
  CREATE INDEX IF NOT EXISTS "idx_artwork_is_indexed" ON "Artwork"("isIndexed");
  CREATE INDEX IF NOT EXISTS "idx_domain_admin_email" ON "Domain"("adminEmail");
  CREATE INDEX IF NOT EXISTS "idx_user_email" ON "User"(email);

  -- Insert a default admin user if not exists
  INSERT INTO "User" (id, name, email, role, "createdAt", "updatedAt")
  SELECT 'galrubin-admin', 'System Admin', 'galrubin15@gmail.com', 'global_admin', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  WHERE NOT EXISTS (SELECT 1 FROM "User" WHERE email = 'galrubin15@gmail.com');
EOF
)

# Try to execute SQL using psql if available
if command -v psql >/dev/null 2>&1; then
  echo "Executing SQL schema creation..."
  echo "$SQL_SCRIPT" | psql -h "$POSTGRES_HOST" -p 5432 -U "${POSTGRES_ADMIN_USER}@${POSTGRES_NAME}" -d postgres || {
    echo "Warning: Direct SQL execution failed. Please run the schema creation manually."
    echo "SQL script saved to schema-setup.sql for manual execution."
    echo "$SQL_SCRIPT" > schema-setup.sql
    return 1
  }
  echo "✅ Database tables created successfully via SQL!"
else
  echo "Warning: psql not found. Saving SQL script for manual execution."
  echo "$SQL_SCRIPT" > schema-setup.sql
  echo "Please run: psql -h $POSTGRES_HOST -p 5432 -U ${POSTGRES_ADMIN_USER}@${POSTGRES_NAME} -d postgres -f schema-setup.sql"
  return 1
fi
}

setup_database_schema
create_database_tables_sql

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
az keyvault secret set --vault-name "$KV_NAME" --name "PostgresAdminUser" --value "$POSTGRES_ADMIN_USER" -o none
az keyvault secret set --vault-name "$KV_NAME" --name "PostgresAdminPassword" --value "$POSTGRES_ADMIN_PASS" -o none
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

# DB
DATABASE_URL="${DATABASE_URL}"

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
echo " - Postgres host: $POSTGRES_HOST"
echo " - Key Vault name: $KV_NAME"
echo " - Function App: $FUNCAPP_NAME"
echo " - Environment file: $ENVFILE"

echo "Next steps:"
echo " 1. Create the Cognitive Search index using scripts/azure/create-search-index.sh"
echo " 2. Deploy your Azure Function code to $FUNCAPP_NAME and ensure it has access to Key Vault"
echo " 3. Use .env.${ENV} in your backend for local testing (but prefer Key Vault in prod)"




###
# troubleshooting tips:
# In case of registration issues, you can run "az provider register --namespace Microsoft.KeyVault" and similar for other services.
###