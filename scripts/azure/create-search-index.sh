#!/usr/bin/env bash
set -euo pipefail

ENV=${1:-dev}
if [ -z "$ENV" ]; then
  echo "Usage: $0 <env>"
  exit 1
fi

# loads env file
ENVFILE=".env.${ENV}"
if [ ! -f "$ENVFILE" ]; then
  echo "Env file $ENVFILE not found. Run provision-resources.sh first."
  exit 2
fi
# shellcheck source=/dev/null
source "$ENVFILE"

SEARCH_ENDPOINT=${AZURE_SEARCH_ENDPOINT}
SEARCH_KEY=${AZURE_SEARCH_ADMIN_KEY}
INDEX_NAME=${AZURE_SEARCH_INDEX_NAME:-artworks-index}

echo "Creating/Updating Cognitive Search index $INDEX_NAME at $SEARCH_ENDPOINT"

INDEX_PAYLOAD=$(cat <<'JSON'
{
  "name": "__INDEX_NAME__",
  "fields": [
    { "name": "artworkId", "type": "Edm.String", "key": true, "filterable": true },
    { "name": "domainId", "type": "Edm.String", "filterable": true, "facetable": true },
    { "name": "price", "type": "Edm.Double", "filterable": true, "sortable": true },
    { "name": "isActive", "type": "Edm.Boolean", "filterable": true },
    {
      "name": "embedding_vector",
      "type": "Collection(Edm.Single)",
      "dimensions": 1536,
      "vectorSearchProfile": "default"
    }
  ],
  "vectorSearch": {
    "profiles": [
      {
        "name": "default",
        "algorithm": "hnsw"
      }
    ],
    "algorithms": [
      {
        "name": "hnsw",
        "kind": "hnsw",
        "hnswParameters": {
          "metric": "cosine",
          "m": 4,
          "efConstruction": 400,
          "efSearch": 500
        }
      }
    ]
  },
  "corsOptions": {
    "allowedOrigins": [ "*" ]
  }
}
JSON
)

# Replace placeholder
INDEX_PAYLOAD=${INDEX_PAYLOAD//__INDEX_NAME__/$INDEX_NAME}

# Create or update index via REST
URL="${SEARCH_ENDPOINT}/indexes/${INDEX_NAME}?api-version=2023-11-01"
echo "PUT $URL"
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X PUT "$URL" \
  -H "Content-Type: application/json" \
  -H "api-key: ${SEARCH_KEY}" \
  -d "$INDEX_PAYLOAD")

if [ "$HTTP_STATUS" -eq 201 ] || [ "$HTTP_STATUS" -eq 204 ]; then
  echo "Index created/updated (status $HTTP_STATUS)."
else
  echo "Failed to create index. HTTP status $HTTP_STATUS"
  # print response for debugging
  curl -v -X PUT "$URL" \
    -H "Content-Type: application/json" \
    -H "api-key: ${SEARCH_KEY}" \
    -d "$INDEX_PAYLOAD"
  exit 3
fi

echo "Index '$INDEX_NAME' is ready (or update attempted)."
