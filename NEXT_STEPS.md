# 🚀 TasteMatcher Upload Flow - Next Steps Guide

## ✅ What's Been Implemented

The complete upload and process images flow is now ready for deployment with the following structure:

```
tastematcher/
├── common/          # Shared TypeScript types and interfaces
├── webapi/          # NestJS backend with upload endpoints 
├── workers/         # Azure Functions for image processing
├── frontend/        # React frontend application
└── docs/           # Documentation and guides
```

## 🎯 Immediate Next Steps

### 1. **Setup Azure Resources** (Required)

You'll need to create these Azure resources before the system can function:

```bash
# Create Resource Group
az group create --name tastematcher-rg --location eastus

# Create Storage Account
az storage account create \
  --name tastestorage$(date +%s) \
  --resource-group tastematcher-rg \
  --location eastus \
  --sku Standard_LRS

# Create Cognitive Search Service
az search service create \
  --name tastematcher-search \
  --resource-group tastematcher-rg \
  --location eastus \
  --sku basic

# Create Function App
az functionapp create \
  --name tastematcher-workers \
  --storage-account tastestorage$(date +%s) \
  --consumption-plan-location eastus \
  --resource-group tastematcher-rg \
  --runtime node \
  --runtime-version 18
```

### 2. **Configure Environment Variables**

#### WebAPI Environment (`.env.dev`)
```bash
# Copy the example file
cd webapi && cp .env.example .env.dev

# Edit with your Azure credentials
# AZURE_STORAGE_ACCOUNT=your_storage_account
# AZURE_STORAGE_ACCOUNT_KEY=your_key
# AZURE_SEARCH_ENDPOINT=https://tastematcher-search.search.windows.net
# etc.
```

#### Workers Environment
Set these in Azure Function App settings or local.settings.json:
```json
{
  "IsEncrypted": false,
  "Values": {
    "AzureWebJobsStorage": "DefaultEndpointsProtocol=https;AccountName=...",
    "AZURE_STORAGE_ACCOUNT": "your_account",
    "AZURE_STORAGE_ACCOUNT_KEY": "your_key",
    "AZURE_SEARCH_ENDPOINT": "https://your-service.search.windows.net",
    "AZURE_SEARCH_ADMIN_KEY": "your_admin_key",
    "DATABASE_URL": "postgresql://..."
  }
}
```

### 3. **Initialize Database**

```bash
cd webapi

# Install dependencies
pnpm install

# Generate Prisma client
npx prisma generate

# Create/migrate database
npx prisma db push

# (Optional) Seed with test data
npx prisma db seed
```

### 4. **Create Azure Search Index**

```bash
# Make the script executable
chmod +x /Users/galrubin/Projects/tastematcher/scripts/azure/create-search-index.sh

# Run with your environment
./scripts/azure/create-search-index.sh dev
```

### 5. **Deploy Workers**

```bash
cd workers

# Install dependencies
pnpm install

# Build TypeScript
npm run build

# Deploy to Azure (requires Azure CLI)
func azure functionapp publish tastematcher-dev-func
```

### 6. **Start Development Servers**

```bash
# Terminal 1: Start WebAPI
cd webapi && npm run dev

# Terminal 2: Start Frontend
cd frontend && npm run dev

# Terminal 3: Start Workers locally (optional)
cd workers && func start
```

## 🧪 Testing the Upload Flow

### 1. **Create a Test Domain**

Now you can create domains via the API with admin email for validation:

```bash
# Create a new domain via API
curl -X POST "http://localhost:3000/domains" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Gallery",
    "adminEmail": "admin@testgallery.com"
  }'

# Expected response:
# {
#   "id": "550e8400-e29b-41d4-a716-446655440000",
#   "name": "Test Gallery",
#   "adminEmail": "admin@testgallery.com",
#   "createdAt": "2024-01-01T00:00:00.000Z",
#   "updatedAt": "2024-01-01T00:00:00.000Z"
# }

# List all existing domains
curl -X GET "http://localhost:3000/domains"

# Get a specific domain
curl -X GET "http://localhost:3000/domains/550e8400-e29b-41d4-a716-446655440000"
```

### 2. **Test Upload Endpoint**

Now use the domain ID from the API response:

```bash
# Create domain and capture the ID
DOMAIN_RESPONSE=$(curl -s -X POST "http://localhost:3000/domains" \
  -H "Content-Type: application/json" \
  -d '{"name": "My Gallery", "adminEmail": "myemail@example.com"}')

DOMAIN_ID=$(echo $DOMAIN_RESPONSE | grep -o '"id":"[^"]*"' | cut -d'"' -f4)

# Upload file using the new domain ID
curl -X POST "http://localhost:3000/domains/$DOMAIN_ID/uploads" \
  -F "file=@files/photo1.jpeg" \
  -F "title=Test Artwork" \
  -F "artist=Test Artist" \
  -F "metadata={\"category\":\"landscape\"}"
```

**Troubleshooting the UUID error:**

```bash
# 1. List all domains to get valid UUIDs
cd webapi
npx prisma studio
# Or use a direct query:
# SELECT id, name, handle FROM Domain;

# 2. If no domains exist, create one:
cat > create-test-domain.sql << EOF
INSERT INTO Domain (id, name, handle, createdAt, updatedAt) 
VALUES ('550e8400-e29b-41d4-a716-446655440000', 'Test Gallery', 'test-gallery', datetime('now'), datetime('now'));
EOF

# Apply to your database
sqlite3 prisma/dev.db < create-test-domain.sql
```

### 3. **Verify Processing**

```bash
# Check database for artwork record
npx prisma studio

# Check Azure Storage containers
# - originals/ should contain uploaded image
# - derivatives/ should contain thumbnails (after processing)

# Check Azure Search index
# - Should contain indexed artwork document
```

## 🔍 Monitoring & Troubleshooting

### 1. **Check Logs**

```bash
# WebAPI logs
cd webapi && npm run dev # Check console output

# Workers logs (Azure)
func azure functionapp logstream tastematcher-workers

# Workers logs (local)
cd workers && func start # Check console output
```

### 2. **Common Issues**

| Issue | Solution |
|-------|----------|
| "Azure Storage connection failed" | Check AZURE_STORAGE_ACCOUNT and AZURE_STORAGE_ACCOUNT_KEY |
| "Queue messages not processing" | Verify workers are deployed and Azure Function is running |
| "File upload rejected" | Check file type (must be JPEG/PNG/WebP) and size limits |
| "Domain not found" | Ensure domain exists in database with correct UUID |

### 3. **Debug Mode**

```bash
# Enable detailed logging
export NODE_ENV=development
export LOG_LEVEL=debug

# Start services with debug output
cd webapi && npm run dev
```

## 📈 Recommended Production Setup

### 1. **Infrastructure**

- **Azure App Service** - For WebAPI hosting
- **Azure Function App** - For workers (consumption plan)
- **Azure Database for PostgreSQL** - Production database
- **Azure Key Vault** - Secure secret management
- **Azure CDN** - Fast thumbnail delivery
- **Application Insights** - Monitoring and telemetry

### 2. **Security**

```bash
# Enable Managed Identity
az webapp identity assign --name tastematcher-webapi

# Store secrets in Key Vault
az keyvault secret set --vault-name tastematcher-kv \
  --name "StorageAccountKey" --value "your-key"

# Configure CORS for frontend
az webapp cors add --resource-group tastematcher-rg \
  --name tastematcher-webapi --allowed-origins "https://yourdomain.com"
```

### 3. **CI/CD Pipeline**

```yaml
# .github/workflows/deploy.yml
name: Deploy TasteMatcher
on:
  push:
    branches: [main]

jobs:
  deploy-webapi:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: cd webapi && npm install && npm run build
      - uses: azure/webapps-deploy@v2
        with:
          app-name: tastematcher-webapi

  deploy-workers:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: cd workers && npm install && npm run build
      - uses: Azure/functions-action@v1
        with:
          app-name: tastematcher-workers
```

## 🎨 Frontend Integration

### 1. **Upload Component**

```typescript
// Example React component for file upload
const ArtworkUpload: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [metadata, setMetadata] = useState({ title: '', artist: '' });
  
  const handleUpload = async () => {
    const formData = new FormData();
    formData.append('file', file!);
    formData.append('title', metadata.title);
    formData.append('artist', metadata.artist);
    
    const response = await fetch(`/domains/${domainId}/uploads`, {
      method: 'POST',
      body: formData
    });
    
    const result = await response.json();
    console.log('Upload result:', result);
  };
  
  // ... render form
};
```

### 2. **Progress Tracking**

Consider implementing:
- Upload progress indicators
- Processing status polling
- Real-time updates via WebSockets
- Thumbnail preview after processing

## 🚧 Future Enhancements

### Phase 2 Features

1. **Authentication & Authorization**
   - JWT-based user authentication
   - Role-based access control (RBAC)
   - API key management for external integrations

2. **Advanced Image Processing**
   - Real image embedding generation (OpenAI CLIP, etc.)
   - Color palette extraction
   - Object detection and tagging
   - Duplicate image detection

3. **Enhanced Search**
   - Vector similarity search
   - Advanced filtering and faceting
   - Recommendation engine
   - Saved searches and alerts

4. **Scalability Improvements**
   - Resumable uploads for large files
   - Batch upload operations
   - CDN integration for thumbnails
   - Horizontal scaling optimizations

5. **Analytics & Insights**
   - Usage analytics dashboard
   - Performance metrics
   - User behavior tracking
   - Cost optimization reports

## 📋 Checklist

Before going live, ensure:

- [ ] All Azure resources created and configured
- [ ] Environment variables set in all environments
- [ ] Database schema deployed and seeded
- [ ] Azure Search index created with correct schema
- [ ] WebAPI deployed and accessible
- [ ] Workers deployed and processing messages
- [ ] File upload tested end-to-end
- [ ] Image processing verified (thumbnails generated)
- [ ] Search indexing confirmed working
- [ ] Error handling tested (invalid files, etc.)
- [ ] Security configurations applied
- [ ] Monitoring and logging enabled
- [ ] Backup and disaster recovery plan in place

## 🎉 You're Ready!

With these steps completed, you'll have a fully functional, production-ready image upload and processing system that can:

- ✅ Accept secure file uploads with validation
- ✅ Process images asynchronously at scale
- ✅ Generate multiple thumbnail sizes
- ✅ Index content for fast search and discovery
- ✅ Handle errors gracefully with retry logic
- ✅ Monitor performance and usage

The architecture is designed to scale with your needs and can be extended with additional features as your application grows.

**Need Help?** Check the detailed documentation in `docs/UPLOAD_IMPLEMENTATION.md` and the Workers README at `workers/README.md`.