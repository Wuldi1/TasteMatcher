# TasteMatcher Workers

This directory contains the Azure Functions workers that handle asynchronous processing tasks for the TasteMatcher application.

## Overview

The workers package provides background processing capabilities for uploaded artwork, including image processing, thumbnail generation, and search indexing. It's designed to run as Azure Functions with queue triggers for scalable, event-driven processing.

## Current Workers

### 1. Indexer Worker (`src/indexer/`)

**Purpose**: Processes uploaded artwork images asynchronously  
**Trigger**: Azure Queue Storage messages  
**Queue**: `tastematcher-[env]-indexing-jobs`

**What it does**:
- Downloads original images from Azure Blob Storage
- Validates image format and computes SHA-256 checksums
- Generates multiple thumbnail sizes (small: 150x150, medium: 400x400, large: 800x800)
- Uploads thumbnails to derivatives blob container
- Generates image embeddings (currently stubbed)
- Indexes artwork in Azure Cognitive Search
- Updates database with processing results and thumbnail URLs

**Technologies Used**:
- **Azure Functions v4** - Serverless compute platform
- **Sharp** - High-performance image processing
- **Azure Storage Blob SDK** - File storage operations
- **Azure Search SDK** - Search indexing
- **Prisma Client** - Database operations

## Architecture

```
Upload API → Azure Queue → Indexer Worker
                              ↓
         [Image Processing Pipeline]
                              ↓
    Thumbnails + Search Index + Database Update
```

## Message Format

The indexer worker expects messages in this format (defined in `common` package):

```typescript
interface IndexingJobMessage {
  messageId: string;       // UUID for idempotency
  artId: string;           // Artwork ID
  domainId: string;        // Domain ID
  blobName: string;        // Original image blob path
  container?: string;      // Blob container (defaults to 'originals')
  notifyMetadata?: Record<string, unknown>;
  attempt?: number;        // Retry attempt number
  enqueuedAt?: string;     // ISO timestamp
}
```

## Configuration

### Environment Variables

```bash
# Azure Storage (required)
AZURE_STORAGE_ACCOUNT=your_storage_account
AZURE_STORAGE_ACCOUNT_KEY=your_storage_key

# Blob Containers
AZURE_BLOB_CONTAINER_ORIGINALS=originals
AZURE_BLOB_CONTAINER_DERIVATIVES=derivatives

# Queue Configuration
AZURE_QUEUE_NAME=tastematcher-dev-indexing-jobs

# Azure Cognitive Search
AZURE_SEARCH_ENDPOINT=https://your-service.search.windows.net
AZURE_SEARCH_ADMIN_KEY=your_admin_key
AZURE_SEARCH_INDEX_NAME=artworks-index

# Database
DATABASE_URL=postgresql://user:pass@host/database

# Optional
CDN_BASE_URL=https://cdn.example.com
```

### Azure Function Configuration

The worker is configured with:
- **Runtime**: Node.js 18+
- **Trigger**: Queue Storage
- **Binding**: Automatic JSON deserialization
- **Retry Policy**: Azure Functions default exponential backoff
- **Timeout**: 5 minutes (configurable)

## Development

### Prerequisites

1. **Node.js 18+**
2. **Azure Functions Core Tools** (`npm install -g azure-functions-core-tools@4`)
3. **Azure Storage Emulator** (Azurite) for local development
4. **Common package** - Shared types and interfaces

### Local Development Setup

```bash
# Install dependencies
pnpm install

# Build TypeScript
npm run build

# Start local Azure Functions runtime
func start

# Watch mode (rebuild on changes)
npm run watch
```

### Testing with Azurite

```bash
# Start Azurite (Azure Storage Emulator)
azurite --silent --location ./data --debug ./debug.log

# Create test queue and containers
# (Use Azure Storage Explorer or REST API)

# Send test message to queue
# (Use Azure Storage Explorer or code)
```

## Error Handling

The indexer worker implements comprehensive error handling:

### Retry Logic
- **Transient errors**: Automatic retry with exponential backoff
- **Permanent errors**: Logged and marked in database
- **Poison messages**: Dead letter queue after max retries

### Error Types
1. **Network errors**: Azure service connectivity issues
2. **Image processing errors**: Corrupt or invalid image files
3. **Database errors**: Connection or constraint violations
4. **Storage errors**: Blob not found or permission issues

### Error Recording
Failed processing attempts are recorded in the `artwork` table:
```sql
UPDATE artwork 
SET indexingError = 'Error message',
    updatedAt = NOW()
WHERE id = :artId;
```

## Monitoring

### Metrics to Monitor
- **Queue length**: Number of pending jobs
- **Processing time**: Average time per job
- **Success rate**: Percentage of successful processing
- **Error rate**: Failed jobs by error type

### Application Insights
The worker automatically logs to Azure Application Insights:
- **Execution traces**: Function start/completion
- **Custom events**: Processing milestones
- **Exceptions**: Detailed error information
- **Performance counters**: CPU, memory usage

### Custom Logging
```typescript
context.log('Processing artwork', { artId, domainId });
context.warn('Retrying operation', { attempt, error });
context.error('Processing failed', error);
```

## Deployment

### Azure Function App Deployment

1. **Create Function App**:
```bash
az functionapp create \
  --name tastematcher-workers-prod \
  --storage-account tastestorageprod \
  --consumption-plan-location eastus \
  --runtime node \
  --runtime-version 18
```

2. **Deploy Code**:
```bash
# Build production bundle
npm run build

# Deploy to Azure
func azure functionapp publish tastematcher-workers-prod
```

3. **Configure Settings**:
```bash
az functionapp config appsettings set \
  --name tastematcher-workers-prod \
  --settings @settings.json
```

### CI/CD Pipeline

Example GitHub Actions workflow:
```yaml
name: Deploy Workers
on:
  push:
    branches: [main]
    paths: ['workers/**']

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: cd workers && npm install && npm run build
      - uses: Azure/functions-action@v1
        with:
          app-name: tastematcher-workers-prod
```

## Future Workers

### Planned Additions

1. **Embedding Worker** - Generate real image embeddings using ML models
2. **Notification Worker** - Send processing completion notifications
3. **Cleanup Worker** - Remove orphaned blobs and expired data
4. **Analytics Worker** - Generate usage and performance reports
5. **Backup Worker** - Create periodic backups of critical data

## Dependencies

### Runtime Dependencies
- `@azure/functions` - Azure Functions runtime
- `@azure/storage-blob` - Blob storage operations
- `@azure/storage-queue` - Queue storage operations
- `@azure/search-documents` - Search indexing
- `@prisma/client` - Database ORM
- `sharp` - Image processing
- `uuid` - UUID generation
- `common` - Shared types and interfaces

### Development Dependencies
- `typescript` - TypeScript compiler
- `@types/*` - Type definitions
- `jest` - Testing framework

## Best Practices

### Performance
- Use streaming for large file operations
- Implement connection pooling for database
- Cache frequently accessed configuration
- Use parallel processing where possible

### Security
- Validate all input messages
- Use managed identity for Azure authentication
- Encrypt sensitive configuration data
- Implement proper error handling without data leaks

### Reliability
- Implement idempotency for all operations
- Use database transactions for multi-step operations
- Log sufficient information for debugging
- Test error scenarios thoroughly

## Troubleshooting

### Common Issues

1. **Queue messages not processing**
   - Check queue connection string
   - Verify function app is running
   - Check Application Insights for errors

2. **Image processing failures**
   - Verify Sharp can handle the image format
   - Check available memory limits
   - Validate blob storage permissions

3. **Database connection errors**
   - Verify Prisma connection string
   - Check network connectivity
   - Validate database permissions

### Debug Commands

```bash
# Check function status
func azure functionapp show tastematcher-workers-prod

# View logs
func azure functionapp logstream tastematcher-workers-prod

# Test locally
func start --debug
```

## Contributing

1. **Add new workers** in `src/[worker-name]/`
2. **Follow naming conventions**: kebab-case for directories, camelCase for files
3. **Write comprehensive tests** for all worker functions
4. **Update this README** when adding new workers
5. **Use the common package** for shared types and utilities

## License

Copyright 2025 TasteMatcher. All rights reserved.