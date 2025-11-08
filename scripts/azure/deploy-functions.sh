#!/usr/bin/env bash
# filepath: /Users/galrubin/Projects/tastematcher/scripts/azure/deploy-functions.sh
# ---------- CODEGEN CHECKLIST (must be satisfied) ----------
# 1. Follows Azure Functions deployment best practices
# 2. Includes error handling and validation
# 3. Adds structured logging for deployment steps
# 4. Validates build artifacts before deployment
# 5. No duplicate logic — reuses existing patterns
# 6. Includes deployment verification
# 7. CI-friendly: can run in automated pipelines
# -----------------------------------------------------------

set -euo pipefail

ENV=${1:-dev}
RESOURCE_GROUP="tastematcher-${ENV}-rg"
FUNCTION_APP_NAME="tastematcher-${ENV}-func"

echo "🚀 Deploying Azure Functions to Function App"
echo "   Environment: $ENV"
echo "   Resource Group: $RESOURCE_GROUP"
echo "   Function App: $FUNCTION_APP_NAME"
echo ""

# Ensure we're in the project root
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$PROJECT_ROOT"

echo "📂 Project root: $PROJECT_ROOT"

# Build the common package first
echo "📦 Building common package..."
cd common
pnpm install --frozen-lockfile
pnpm run build
cd ..

# Build the functions
echo "📦 Building Azure Functions..."
cd functions
pnpm install --frozen-lockfile

# Run type check and lint before building
echo "🔍 Running type check..."
pnpm run typecheck

echo "🔍 Running lint..."
pnpm run lint || echo "⚠️  Lint failed or not configured, continuing with deployment..."

# Build
echo "📦 Compiling TypeScript..."
pnpm run build

# Verify build output exists
if [ ! -d "dist" ]; then
  echo "❌ Error: dist directory not found after build"
  exit 1
fi

echo "✅ Build completed successfully"

# Create deployment directory
echo "📦 Creating deployment package..."
rm -rf deploy
mkdir -p deploy

# Copy built files
echo "📦 Copying compiled JavaScript files..."
cp -r dist/* deploy/

# Copy function metadata files
echo "📦 Copying function configuration..."
cp host.json deploy/

# Copy function bindings (function.json files)
if [ -d "ProcessImagesFromBlob" ]; then
  mkdir -p deploy/ProcessImagesFromBlob
  cp ProcessImagesFromBlob/function.json deploy/ProcessImagesFromBlob/
else
  echo "⚠️  Warning: ProcessImagesFromBlob directory not found"
fi

# Bundle ALL node_modules (production dependencies)
echo "📦 Installing production dependencies locally..."

# Create a temporary directory for dependency installation
TEMP_DIR=$(mktemp -d)
echo "📦 Using temporary directory: $TEMP_DIR"

# Create a package.json without workspace references
cat > "$TEMP_DIR/package.json" <<EOF
{
  "name": "@tastematcher/functions",
  "version": "1.0.0",
  "dependencies": $(jq '.dependencies' package.json | jq 'del(.["@tastematcher/common"])')
}
EOF

# Install production dependencies
cd "$TEMP_DIR"
npm install --omit=dev --no-package-lock --production

# Return to functions directory
cd "$PROJECT_ROOT/functions"

# Copy installed node_modules
echo "📦 Bundling production node_modules..."
if [ -d "$TEMP_DIR/node_modules" ]; then
  cp -r "$TEMP_DIR/node_modules" deploy/
else
  echo "❌ Error: node_modules not created in temp directory"
  rm -rf "$TEMP_DIR"
  exit 1
fi

# Clean up temp
echo "🧹 Cleaning up temporary installation directory..."
rm -rf "$TEMP_DIR"

# Copy common package to override any issues
if [ -d "../common/dist" ]; then
  echo "📦 Bundling common package build output..."
  rm -rf deploy/node_modules/@tastematcher/common
  mkdir -p deploy/node_modules/@tastematcher/common
  
  # Copy built files directly to common package root
  cp -r ../common/dist/* deploy/node_modules/@tastematcher/common/
  
  # Copy package.json from common
  cp ../common/package.json deploy/node_modules/@tastematcher/common/
fi

# Create a minimal package.json for Azure (no dependencies, everything bundled)
cat > deploy/package.json <<'EOF'
{
  "name": "@tastematcher/functions",
  "version": "1.0.0",
  "description": "Azure Functions for TasteMatcher",
  "main": "index.js",
  "engines": {
    "node": ">=22.x"
  }
}
EOF

echo "✅ Deployment directory prepared"

# Create .deployment file for Kudu - DISABLE build
cat > deploy/.deployment <<'EOF'
[config]
SCM_DO_BUILD_DURING_DEPLOYMENT=false
EOF

# Create zip package
echo "📦 Creating zip package..."
cd deploy
zip -r ../functions-deploy.zip . -x "*.map" -x "*.spec.js" -x "test/*" -x "__tests__/*"
cd ..

# Verify zip was created
if [ ! -f "functions-deploy.zip" ]; then
  echo "❌ Error: functions-deploy.zip was not created"
  exit 1
fi

ZIP_SIZE=$(du -h functions-deploy.zip | cut -f1)
echo "✅ Deployment package created: functions-deploy.zip ($ZIP_SIZE)"

# Deploy to Azure Functions
echo "☁️  Deploying to Azure Function App..."
az functionapp deployment source config-zip \
  --resource-group "$RESOURCE_GROUP" \
  --name "$FUNCTION_APP_NAME" \
  --src functions-deploy.zip \
  --build-remote false

# Clean up
echo "🧹 Cleaning up temporary files..."
rm -rf deploy
rm functions-deploy.zip

echo ""
echo "✅ Deployment complete!"
echo ""
echo "🔗 Function App URL: https://${FUNCTION_APP_NAME}.azurewebsites.net"
echo "📊 View logs: az functionapp log tail --resource-group $RESOURCE_GROUP --name $FUNCTION_APP_NAME"
echo ""
echo "🔧 Function endpoints:"
echo "   - ProcessImagesFromBlob: Queue-triggered (tastematcher-${ENV}-indexing-jobs)"
echo ""

# Wait and check Function App status
echo "⏳ Waiting 30 seconds for Function App to restart..."
sleep 30

echo "🏥 Checking Function App status..."
APP_STATUS=$(az functionapp show \
  --resource-group "$RESOURCE_GROUP" \
  --name "$FUNCTION_APP_NAME" \
  --query "state" -o tsv)

if [ "$APP_STATUS" = "Running" ]; then
  echo "✅ Function App is running!"
  echo ""
  echo "🎉 Deployment successful!"
else
  echo "⚠️  Function App status: $APP_STATUS"
  echo "   Check logs: az functionapp log tail --resource-group $RESOURCE_GROUP --name $FUNCTION_APP_NAME"
  echo ""
  echo "⚠️  Deployment completed but Function App may not be ready. Manual verification required."
  exit 1
fi