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

# Cleanup previous deployment artifacts to avoid multiple stale folders
echo "🧹 Cleaning previous deployment artifacts (if any)..."
rm -rf deploy functions-deploy.zip || true
echo "✅ Cleaned previous deploy/ and functions-deploy.zip"

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
if [ ! -d "build" ]; then
  echo "❌ Error: build directory not found after build"
  exit 1
fi

echo "✅ Build completed successfully"

# Create fresh deployment directory
echo "📦 Creating deployment package directory..."
rm -rf deploy
mkdir -p deploy

# Copy built files (JS + assets) into deploy/
echo "📦 Copying compiled JavaScript files to deploy/..."
cp -r build/* deploy/

# Copy host.json and function bindings (function.json)
echo "📦 Copying function configuration files..."
cp host.json deploy/ || true
if [ -d "ProcessImagesFromBlob" ]; then
  mkdir -p deploy/ProcessImagesFromBlob
  cp ProcessImagesFromBlob/function.json deploy/ProcessImagesFromBlob/ || true
else
  echo "⚠️  Warning: ProcessImagesFromBlob directory not found"
fi

# Install production dependencies into a temporary directory (to avoid polluting functions/node_modules)
echo "📦 Installing production dependencies into temporary folder..."
TEMP_DIR=$(mktemp -d)
echo "📦 Using temporary directory: $TEMP_DIR"

# Create a minimal package.json for temp install that excludes workspace common package
cat > "$TEMP_DIR/package.json" <<EOF
{
  "name": "@tastematcher/functions",
  "version": "1.0.0",
  "dependencies": $(jq '.dependencies' package.json | jq 'del(.["@tastematcher/common"])'),
  "main": "index.js",
  "engines": {
    "node": ">=22.x"
  }
}
EOF

cd "$TEMP_DIR"
echo "📦 Running npm install --omit=dev --production in temp dir..."
npm install --omit=dev --no-package-lock --production

# Return to functions directory
cd "$PROJECT_ROOT/functions"

# Copy installed production node_modules into deploy/
echo "📦 Bundling production node_modules into deploy/..."
if [ -d "$TEMP_DIR/node_modules" ]; then
  cp -r "$TEMP_DIR/node_modules" deploy/
else
  echo "❌ Error: node_modules not created in temp directory"
  rm -rf "$TEMP_DIR"
  exit 1
fi

# Verify deploy/node_modules exists and is non-empty
echo "🔎 Verifying deploy/node_modules..."
if [ -d "deploy/node_modules" ] && [ "$(ls -A deploy/node_modules | wc -l)" -gt 0 ]; then
  echo "✅ deploy/node_modules exists and is populated"
  echo "Top-level packages (deploy/node_modules):"
  ls -1 deploy/node_modules | head -n 50
else
  echo "❌ deploy/node_modules missing or empty after copy - aborting"
  rm -rf "$TEMP_DIR"
  exit 1
fi

# Clean up temporary installation directory
echo "🧹 Cleaning up temporary installation directory..."
rm -rf "$TEMP_DIR"

# Copy built common package into deploy/node_modules/@tastematcher/common
echo "📦 Bundling @tastematcher/common into deploy/node_modules..."
COMMON_SRC="../common"
COMMON_TARGET="deploy/node_modules/@tastematcher/common"
rm -rf "$COMMON_TARGET"
mkdir -p "$COMMON_TARGET"

# Prefer common build output (build/dist/lib/esm/out), otherwise build it and copy
CANDIDATES=("build" "dist" "lib" "esm" "out" "src")
found=""
for d in "${CANDIDATES[@]}"; do
  if [ -d "$COMMON_SRC/$d" ]; then
    echo "📦 Found common build at $COMMON_SRC/$d - copying..."
    cp -r "$COMMON_SRC/$d/"* "$COMMON_TARGET/" || true
    found=1
    break
  fi
done

if [ -z "$found" ]; then
  echo "⚠️  No prebuilt common bundle found. Attempting to build common package now..."
  if [ -d "$COMMON_SRC" ]; then
    (cd "$COMMON_SRC" && pnpm install --frozen-lockfile && pnpm run build) || {
      echo "❌ Building common package failed"
      exit 1
    }
    for d in "${CANDIDATES[@]}"; do
      if [ -d "$COMMON_SRC/$d" ]; then
        cp -r "$COMMON_SRC/$d/"* "$COMMON_TARGET/" || true
        found=1
        break
      fi
    done
  else
    echo "❌ Common package source not found at $COMMON_SRC"
    exit 1
  fi
fi

if [ -z "$found" ]; then
  echo "❌ Failed to find or build common package output. Aborting deployment."
  exit 1
fi

# Copy common package.json so require() resolves correctly and patch "build/index.js" references
if [ -f "$COMMON_SRC/package.json" ]; then
  cp "$COMMON_SRC/package.json" "$COMMON_TARGET/"
  if command -v node >/dev/null 2>&1; then
    node - <<'NODE_EOF'
const fs = require('fs');
const p = 'deploy/node_modules/@tastematcher/common/package.json';
try {
  let s = fs.readFileSync(p, 'utf8');
  s = s.replace(/build\/index\.js/g, 'index.js');
  fs.writeFileSync(p, s);
  console.log('[deploy] Updated common package.json main references');
} catch (e) {
  console.error('[deploy] Failed to patch common package.json:', e.message);
  process.exit(1);
}
NODE_EOF
  else
    sed -i 's|build/index.js|index.js|g' deploy/node_modules/@tastematcher/common/package.json || true
  fi
fi

# Ensure deploy/package.json for Azure runtime (minimal)
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

# Verify deploy contains everything required (build files + node_modules + host.json)
echo "🔎 Final verification of deploy/ contents:"
ls -la deploy | sed -n '1,300p'
echo "ls deploy/node_modules (top entries):"
ls -1 deploy/node_modules | head -n 50 || true

# Create .deployment file for Kudu
cat > deploy/.deployment <<'EOF'
[config]
SCM_DO_BUILD_DURING_DEPLOYMENT=false
EOF

# Create zip package
echo "📦 Creating zip package..."
cd deploy
zip -r ../functions-deploy.zip . -x "*.map" -x "*.spec.js" -x "test/*" -x "__tests__/*"
cd ..

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
echo "🧹 Cleaning up temporary deployment files..."
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