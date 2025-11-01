# TasteMatcher Functions Service

Azure Functions service for asynchronous image processing workflows.

## Functions

### ProcessImagesFromBlob

**Trigger**: Azure Storage Queue (`image-processing`)

**Purpose**: Process uploaded artwork images by:
1. Downloading original image from Blob Storage
2. Generating multiple thumbnail sizes (150px, 400px, 800px)
3. Creating vector embeddings using Azure AI Vision
4. Indexing in Azure Cognitive Search for semantic similarity

**Features**:
- ✅ Idempotency checks (prevents duplicate processing)
- ✅ Exponential backoff retry (3 attempts with 1s → 30s delays)
- ✅ Structured logging with correlation IDs
- ✅ Metrics tracking for observability
- ✅ Graceful error handling with dead-letter queue

## Local Development

### Prerequisites

- Node.js 20+
- Azure Functions Core Tools v4
- Azure Storage Emulator (Azurite) or connection string

### Setup

```bash
# Install dependencies
pnpm install

# Copy local settings
cp local.settings.json.example local.settings.json

# Edit local.settings.json with your Azure credentials

# Start Azurite (if using emulator)
azurite --silent --location ./azurite --debug ./azurite/debug.log

# Start function runtime
pnpm start
```

### Testing

```bash
# Run unit tests
pnpm test

# Run with coverage
pnpm test:coverage

# Watch mode
pnpm test:watch
```

### Queue Message Format

```json
{
  "messageId": "unique-id",
  "artworkId": "artwork-id",
  "domainId": "domain-id",
  "containerName": "artworks",
  "blobName": "path/to/image.jpg",
  "originalFilename": "image.jpg",
  "contentType": "image/jpeg",
  "enqueuedAt": "2024-01-15T10:30:00Z",
  "correlationId": "correlation-id"
}
```

## Configuration

See `local.settings.json` for required environment variables:

- `AZURE_STORAGE_CONNECTION_STRING` - Storage account connection
- `AZURE_SEARCH_ENDPOINT` - Cognitive Search endpoint
- `AZURE_SEARCH_KEY` - Search admin key
- `AZURE_AI_VISION_ENDPOINT` - AI Vision endpoint
- `AZURE_AI_VISION_KEY` - Vision API key

## Deployment

```bash
# Build for production
pnpm build

# Deploy to Azure (requires Azure CLI + func tools)
func azure functionapp publish <your-function-app-name>
```

## Monitoring

- Logs: Azure Application Insights
- Metrics: Custom metrics via `metrics.increment()`
- Dead-letter queue: `image-processing-poison` for failed messages

## Architecture

