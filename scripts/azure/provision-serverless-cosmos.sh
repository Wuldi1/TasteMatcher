#!/usr/bin/env bash
set -euo pipefail

# Creates a parallel serverless Cosmos DB account for the low-cost POC data
# migration. This script never updates application settings or deletes the
# existing provisioned-throughput account.

SUBSCRIPTION_ID="e105e38a-7820-4c7e-b1da-de05227d6355"
RESOURCE_GROUP="tastematcher-prd-rg"
LOCATION="centralus"
SOURCE_COSMOS_ACCOUNT="tastematcher-prd-cosmos"
TARGET_COSMOS_ACCOUNT="tastematcher-prd-cosmos-sls"
COSMOS_DATABASE="tastematcher"
VECTOR_DIMENSIONS=1024

MODE=${1:-preflight}
if [ "$MODE" != "preflight" ] && [ "$MODE" != "--apply" ]; then
  echo "Usage: $0 [--apply]" >&2
  exit 1
fi

require_azure_context() {
  test "$(az account show --query id -o tsv)" = "$SUBSCRIPTION_ID"
  az group show --name "$RESOURCE_GROUP" --query name -o tsv >/dev/null
}

show_source_baseline() {
  echo "Existing provisioned Cosmos account:"
  az cosmosdb show \
    --name "$SOURCE_COSMOS_ACCOUNT" \
    --resource-group "$RESOURCE_GROUP" \
    --query "{name:name,location:location,enableFreeTier:enableFreeTier,capabilities:capabilities[].name}" \
    -o table

  echo
  echo "Existing database throughput:"
  az cosmosdb sql database throughput show \
    --account-name "$SOURCE_COSMOS_ACCOUNT" \
    --resource-group "$RESOURCE_GROUP" \
    --name "$COSMOS_DATABASE" \
    --query "{throughput:resource.throughput,minimumThroughput:resource.minimumThroughput,autoscale:resource.autoscaleSettings}" \
    -o table || true

  echo
  echo "Existing container throughput:"
  for container in Core Artworks Proposals; do
    az cosmosdb sql container throughput show \
      --account-name "$SOURCE_COSMOS_ACCOUNT" \
      --resource-group "$RESOURCE_GROUP" \
      --database-name "$COSMOS_DATABASE" \
      --name "$container" \
      --query "{container:'$container',throughput:resource.throughput,minimumThroughput:resource.minimumThroughput,autoscale:resource.autoscaleSettings}" \
      -o table || true
  done
}

write_policy_files() {
  policy_dir=$(mktemp -d)
  trap 'rm -rf "$policy_dir"' EXIT

  cat >"$policy_dir/artworks-indexing-policy.json" <<EOF
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
  ]
}
EOF

  cat >"$policy_dir/artworks-vector-embeddings.json" <<EOF
{
  "vectorEmbeddings": [
    {
      "path": "/vector",
      "dataType": "float32",
      "distanceFunction": "cosine",
      "dimensions": $VECTOR_DIMENSIONS
    }
  ]
}
EOF
}

create_target_account() {
  if az cosmosdb show --name "$TARGET_COSMOS_ACCOUNT" --resource-group "$RESOURCE_GROUP" >/dev/null 2>&1; then
    echo "Target Cosmos account $TARGET_COSMOS_ACCOUNT already exists. Skipping account creation."
  else
    az cosmosdb create \
      --name "$TARGET_COSMOS_ACCOUNT" \
      --resource-group "$RESOURCE_GROUP" \
      --kind GlobalDocumentDB \
      --default-consistency-level Session \
      --locations regionName="$LOCATION" failoverPriority=0 isZoneRedundant=false \
      --capabilities EnableServerless EnableNoSQLVectorSearch \
      --backup-policy-type Periodic \
      --backup-redundancy Local \
      -o none
  fi

  # Registration can take several minutes. Reapply the vector capability
  # idempotently so later container creation can rely on it.
  az cosmosdb update \
    --name "$TARGET_COSMOS_ACCOUNT" \
    --resource-group "$RESOURCE_GROUP" \
    --capabilities EnableServerless EnableNoSQLVectorSearch \
    -o none
}

create_database_and_containers() {
  az cosmosdb sql database create \
    --account-name "$TARGET_COSMOS_ACCOUNT" \
    --resource-group "$RESOURCE_GROUP" \
    --name "$COSMOS_DATABASE" \
    -o none

  az cosmosdb sql container create \
    --account-name "$TARGET_COSMOS_ACCOUNT" \
    --resource-group "$RESOURCE_GROUP" \
    --database-name "$COSMOS_DATABASE" \
    --name Core \
    --partition-key-path /domainId \
    --ttl -1 \
    -o none

  az cosmosdb sql container create \
    --account-name "$TARGET_COSMOS_ACCOUNT" \
    --resource-group "$RESOURCE_GROUP" \
    --database-name "$COSMOS_DATABASE" \
    --name Proposals \
    --partition-key-path /domainId \
    --ttl -1 \
    -o none

  az cosmosdb sql container create \
    --account-name "$TARGET_COSMOS_ACCOUNT" \
    --resource-group "$RESOURCE_GROUP" \
    --database-name "$COSMOS_DATABASE" \
    --name Artworks \
    --partition-key-path /domainId \
    --idx "@$policy_dir/artworks-indexing-policy.json" \
    --vector-embeddings "@$policy_dir/artworks-vector-embeddings.json" \
    -o none
}

show_target_summary() {
  echo "Target serverless Cosmos account:"
  az cosmosdb show \
    --name "$TARGET_COSMOS_ACCOUNT" \
    --resource-group "$RESOURCE_GROUP" \
    --query "{name:name,location:location,capabilities:capabilities[].name}" \
    -o table

  echo
  echo "Target containers:"
  az cosmosdb sql container list \
    --account-name "$TARGET_COSMOS_ACCOUNT" \
    --resource-group "$RESOURCE_GROUP" \
    --database-name "$COSMOS_DATABASE" \
    --query "[].{name:name,partitionKey:resource.partitionKey.paths[0],ttl:resource.defaultTtl,vectorPolicy:resource.vectorEmbeddingPolicy != null,vectorIndexes:resource.indexingPolicy.vectorIndexes != null}" \
    -o table
}

require_azure_context

if [ "$MODE" = "preflight" ]; then
  show_source_baseline
  echo
  if az cosmosdb show --name "$TARGET_COSMOS_ACCOUNT" --resource-group "$RESOURCE_GROUP" >/dev/null 2>&1; then
    show_target_summary
  else
    echo "Preflight passed. Target account $TARGET_COSMOS_ACCOUNT does not exist yet."
  fi
  echo "No Azure resources were changed. Run '$0 --apply' to create the parallel serverless account."
  exit 0
fi

write_policy_files
create_target_account
create_database_and_containers
show_target_summary

echo
echo "Parallel serverless Cosmos account is ready."
echo "Next step: seed/reset required data, then run the separate app-settings cutover."
