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
- ✅ Comprehensive error handling
- ✅ Graceful failure with dead-letter queue

## Prerequisites

- Node.js 22+
- Azure Functions Core Tools v4
- Azure Storage Account (or Azurite for local dev)
- Azure Cognitive Search instance
- Azure AI Vision resource

## Local Development Setup

### 1. Install Dependencies

```bash
cd /Users/galrubin/Projects/tastematcher/functions
npm install
```

### 2. Configure Environment

Copy the example configuration and fill in your Azure credentials:

```bash
cp .env.example local.settings.json
```

Edit `local.settings.json` with your values:

```json
{
  "IsEncrypted": false,
  "Values": {
    "FUNCTIONS_WORKER_RUNTIME": "node",
    "AzureWebJobsStorage": "UseDevelopmentStorage=true",
    "AZURE_STORAGE_CONNECTION_STRING": "UseDevelopmentStorage=true",
    "AZURE_SEARCH_ENDPOINT": "https://YOUR-SERVICE.search.windows.net",
    "AZURE_SEARCH_ADMIN_KEY": "YOUR-SEARCH-ADMIN-KEY",
    "AZURE_SEARCH_INDEX_NAME": "artworks",
    "AZURE_AI_VISION_ENDPOINT": "https://YOUR-VISION.cognitiveservices.azure.com/",
    "AZURE_AI_VISION_KEY": "YOUR-VISION-KEY",
    "IMAGE_PROCESSING_QUEUE_NAME": "image-processing",
    "LOG_LEVEL": "debug"
  }
}
```

### 3. Start Azurite (Local Storage Emulator)

```bash
# Install Azurite globally if not already installed
npm install -g azurite

# Start Azurite in a separate terminal
azurite --silent --location ./azurite --debug ./azurite/debug.log
```

### 4. Create Azure Resources (if needed)

#### Create Cognitive Search Index

```bash
# Use Azure Portal or Azure CLI
az search index create \
  --name artworks \
  --service-name YOUR-SEARCH-SERVICE \
  --fields @search-index-schema.json
```

#### Create Storage Queue

```bash
# Queue is auto-created by Functions runtime, or create manually:
az storage queue create \
  --name image-processing \
  --connection-string "YOUR-CONNECTION-STRING"
```

### 5. Start Function App

```bash
npm run dev
```

The function will start and listen for messages on the configured queue.

## Testing

### Unit Tests

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage
```

### Manual Testing

Send a test message to the queue:

```bash
# Using Azure Storage Explorer, or via code:
```

```typescript
import { QueueClient } from '@azure/storage-queue';

const queueClient = new QueueClient(
  'UseDevelopmentStorage=true',
  'image-processing'
);

await queueClient.sendMessage(JSON.stringify({
  messageId: 'test-001',
  artworkId: 'artwork-001',
  domainId: 'domain-001',
  containerName: 'artworks',
  blobName: 'test-image.jpg',
  originalFilename: 'test-image.jpg',
  contentType: 'image/jpeg',
  enqueuedAt: new Date().toISOString(),
  correlationId: 'corr-001'
}));
```

## Environment Variables

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `AzureWebJobsStorage` | Yes | Storage connection for Functions runtime | `UseDevelopmentStorage=true` |
| `AZURE_STORAGE_CONNECTION_STRING` | Yes | Storage for blobs and queues | Same as above for local |
| `AZURE_SEARCH_ENDPOINT` | Yes | Cognitive Search endpoint | `https://mysearch.search.windows.net` |
| `AZURE_SEARCH_ADMIN_KEY` | Yes | Search admin key | From Azure Portal |
| `AZURE_SEARCH_INDEX_NAME` | Yes | Index name for artworks | `artworks` |
| `AZURE_AI_VISION_ENDPOINT` | Yes | AI Vision endpoint | `https://myvision.cognitiveservices.azure.com/` |
| `AZURE_AI_VISION_KEY` | Yes | Vision API key | From Azure Portal |
| `IMAGE_PROCESSING_QUEUE_NAME` | No | Queue name (default: `image-processing`) | `image-processing` |
| `LOG_LEVEL` | No | Logging level (default: `info`) | `debug`, `info`, `warn`, `error` |

## Deployment

### Deploy to Azure

```bash
# Login to Azure
az login

# Create Function App (if not exists)
az functionapp create \
  --name tastematcher-functions \
  --resource-group tastematcher-rg \
  --consumption-plan-location eastus \
  --runtime node \
  --runtime-version 22 \
  --functions-version 4 \
  --storage-account tastematche storage

# Deploy
func azure functionapp publish tastematcher-functions
```

### Configure Production Settings

Set environment variables in Azure:

```bash
az functionapp config appsettings set \
  --name tastematcher-functions \
  --resource-group tastematcher-rg \
  --settings \
    AZURE_SEARCH_ENDPOINT="https://prod-search.search.windows.net" \
    AZURE_SEARCH_ADMIN_KEY="@Microsoft.KeyVault(...)" \
    AZURE_AI_VISION_ENDPOINT="https://prod-vision.cognitiveservices.azure.com/" \
    AZURE_AI_VISION_KEY="@Microsoft.KeyVault(...)" \
    LOG_LEVEL="info"
```

## Monitoring

### View Logs

```bash
# Stream logs from Azure
func azure functionapp logstream tastematcher-functions

# Or use Azure Portal > Function App > Log Stream
```

### Application Insights

The function automatically logs to Application Insights when deployed to Azure. View:
- Request traces
- Dependencies (Blob, Search, Vision API calls)
- Exceptions
- Custom metrics

## Troubleshooting

### Function Not Triggering

1. Check queue exists: `az storage queue show --name image-processing`
2. Verify connection string in `local.settings.json`
3. Check Azurite is running (local dev)
4. View function logs for errors

### Thumbnail Generation Fails

1. Ensure image is valid (JPEG, PNG)
2. Check Sharp library is installed correctly
3. Verify sufficient memory (Sharp needs memory for image processing)

### Vectorization Fails

1. Verify AI Vision endpoint and key are correct
2. Check image size (< 4MB recommended)
3. Ensure AI Vision resource has sufficient quota
4. Check API version compatibility

### Search Indexing Fails

1. Verify index exists and schema matches
2. Check search key has write permissions
3. Ensure document ID is unique
4. Review Search service quota (documents, storage)

## Architecture

