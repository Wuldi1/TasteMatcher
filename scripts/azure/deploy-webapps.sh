#!/usr/bin/env bash
set -euo pipefail

ENVIRONMENT="${1:-dev}"
RESOURCE_GROUP="tastematcher-${ENVIRONMENT}-rg"
API_APP="tastematcher-${ENVIRONMENT}-api"
WEB_APP="tastematcher-${ENVIRONMENT}-web"

echo "🚀 Deploying TasteMatcher services"
echo "   Environment:   ${ENVIRONMENT}"
echo "   Resource group: ${RESOURCE_GROUP}"
echo "   API app:        ${API_APP}"
echo "   Frontend app:   ${WEB_APP}"
echo ""

command -v az >/dev/null 2>&1 || { echo "❌ Azure CLI (az) not found"; exit 1; }
command -v pnpm >/dev/null 2>&1 || { echo "❌ pnpm not found"; exit 1; }
command -v zip >/dev/null 2>&1 || { echo "❌ zip command not found"; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$PROJECT_ROOT"

clean_temp() {
  local path="$1"
  if [ -d "$path" ]; then
    rm -rf "$path"
  fi
}

echo "📦 Building common workspace package..."
cd common
pnpm install --frozen-lockfile
pnpm run build
cd "$PROJECT_ROOT"

echo "📦 Preparing Web API deployment package..."
API_DIR="${PROJECT_ROOT}/webapi"
API_BUILD_DIR="${API_DIR}/dist"
API_DEPLOY_DIR="$(mktemp -d)"
(
  cd "$API_DIR"
  pnpm install --frozen-lockfile
  pnpm run lint || echo "⚠️  API lint reported issues; continuing..."
  pnpm run build

  [ -d "$API_BUILD_DIR" ] || { echo "❌ Web API build output missing"; exit 1; }

  pnpm prune --prod

  mkdir -p "$API_DEPLOY_DIR"
  cp -r dist "$API_DEPLOY_DIR/"
  cp package.json "$API_DEPLOY_DIR/"
  if [ -f pnpm-lock.yaml ]; then
    cp pnpm-lock.yaml "$API_DEPLOY_DIR/"
  fi
  cp ecosystem.config.js "$API_DEPLOY_DIR/" 2>/dev/null || true
  cp -r node_modules "$API_DEPLOY_DIR/"
)

API_ZIP="${PROJECT_ROOT}/api-deploy.zip"
clean_temp "$API_ZIP"
(
  cd "$API_DEPLOY_DIR"
  zip -r "$API_ZIP" . -x "*.map" "*.spec.js" "test/*" "__tests__/*"
)
clean_temp "$API_DEPLOY_DIR"

echo "☁️  Deploying Web API..."
az webapp deploy \
  --resource-group "$RESOURCE_GROUP" \
  --name "$API_APP" \
  --src-path "$API_ZIP" \
  --type zip \
  --restart

echo "📦 Preparing Frontend deployment package..."
FRONTEND_DIR="${PROJECT_ROOT}/frontend"
FRONTEND_BUILD_DIR="${FRONTEND_DIR}/build"
FRONTEND_ZIP="${PROJECT_ROOT}/frontend-deploy.zip"

(
  cd "$FRONTEND_DIR"
  pnpm install --frozen-lockfile
  pnpm run lint || echo "⚠️  Frontend lint reported issues; continuing..."
  pnpm run build

  [ -d "$FRONTEND_BUILD_DIR" ] || { echo "❌ Frontend build output missing"; exit 1; }

  SPA_WEB_CONFIG="$FRONTEND_BUILD_DIR/web.config"
  cat > "$SPA_WEB_CONFIG" <<'EOF'
<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <system.webServer>
    <rewrite>
      <rules>
        <rule name="ReactRouter" stopProcessing="true">
          <match url=".*" />
          <conditions logicalGrouping="MatchAll">
            <add input="{REQUEST_FILENAME}" matchType="IsFile" negate="true" />
            <add input="{REQUEST_FILENAME}" matchType="IsDirectory" negate="true" />
          </conditions>
          <action type="Rewrite" url="/" />
        </rule>
      </rules>
    </rewrite>
  </system.webServer>
</configuration>
EOF

  clean_temp "$FRONTEND_ZIP"
  (
    cd "$FRONTEND_BUILD_DIR"
    zip -r "$FRONTEND_ZIP" . -x "node_modules/*"
  )
)

echo "☁️  Deploying Frontend..."
az webapp deploy \
  --resource-group "$RESOURCE_GROUP" \
  --name "$WEB_APP" \
  --src-path "$FRONTEND_ZIP" \
  --type static \
  --restart

echo "🧹 Cleaning temporary artifacts..."
rm -f "$API_ZIP" "$FRONTEND_ZIP"

echo ""
echo "✅ Deployment completed successfully!"
echo "🔗 API URL:        https://${API_APP}.azurewebsites.net"
echo "🔗 Frontend URL:   https://${WEB_APP}.azurewebsites.net"
echo ""
echo "📊 Monitor logs:"
echo "   az webapp log tail --resource-group ${RESOURCE_GROUP} --name ${API_APP}"
echo "   az webapp log tail --resource-group ${RESOURCE_GROUP} --name ${WEB_APP}"
