#!/usr/bin/env bash
# filepath: /Users/galrubin/Projects/tastematcher/scripts/azure/create-search-index.sh
# ---------- CODEGEN CHECKLIST (must be satisfied) ----------
# 1. Creates Azure Cognitive Search index with correct schema
# 2. Configures vector search with proper dimensions for Azure AI Vision
# 3. Follows Azure Search best practices
# -----------------------------------------------------------

set -euo pipefail

ENV=${1:-dev}
SEARCH_NAME="tastematcher-${ENV}-search"
INDEX_NAME="artworks-index"
RESOURCE_GROUP="tastematcher-${ENV}-rg"

echo "🔍 Creating Azure Cognitive Search index: $INDEX_NAME"
echo "   Search Service: $SEARCH_NAME"
echo "   Environment: $ENV"
echo ""

# Get search admin key
SEARCH_KEY=$(az search admin-key show \
  --service-name "$SEARCH_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --query primaryKey -o tsv)

SEARCH_ENDPOINT="https://${SEARCH_NAME}.search.windows.net"

# Create index with correct vector dimensions for Azure AI Vision (1024)
INDEX_SCHEMA=$(cat <<'EOF'
{
  "name": "artworks-index",
  "fields": [
    {
      "name": "artworkId",
      "type": "Edm.String",
      "key": true,
      "searchable": false,
      "filterable": true,
      "sortable": false,
      "facetable": false
    },
    {
      "name": "domainId",
      "type": "Edm.String",
      "searchable": false,
      "filterable": true,
      "sortable": false,
      "facetable": true
    },
    {
      "name": "imageVector",
      "type": "Collection(Edm.Single)",
      "searchable": true,
      "filterable": false,
      "sortable": false,
      "facetable": false,
      "dimensions": 1024,
      "vectorSearchProfile": "artwork-vector-profile"
    }
  ],
  "vectorSearch": {
    "algorithms": [
      {
        "name": "artwork-vector-algorithm",
        "kind": "hnsw",
        "hnswParameters": {
          "metric": "cosine",
          "m": 4,
          "efConstruction": 400,
          "efSearch": 500
        }
      }
    ],
    "profiles": [
      {
        "name": "artwork-vector-profile",
        "algorithm": "artwork-vector-algorithm"
      }
    ]
  }
}
EOF
)

echo "📝 Creating index with schema..."
echo "$INDEX_SCHEMA" | jq .

# Create or update the index
curl -X PUT "${SEARCH_ENDPOINT}/indexes/${INDEX_NAME}?api-version=2023-11-01" \
  -H "Content-Type: application/json" \
  -H "api-key: ${SEARCH_KEY}" \
  -d "$INDEX_SCHEMA"

echo ""
echo "✅ Search index created/updated successfully!"
echo ""
echo "Index details:"
echo "  - Name: $INDEX_NAME"
echo "  - Endpoint: $SEARCH_ENDPOINT"
echo "  - Vector dimensions: 1024 (Azure AI Vision)"
echo "  - Algorithm: HNSW with cosine similarity"
echo ""
echo "To verify:"
echo "  curl -X GET \"${SEARCH_ENDPOINT}/indexes/${INDEX_NAME}?api-version=2023-11-01\" \\"
echo "    -H \"api-key: ${SEARCH_KEY}\" | jq"