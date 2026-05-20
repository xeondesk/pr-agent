#!/usr/bin/env bash
set -euo pipefail

# PR-Agent Web: GitHub App Setup Script
# Run this after creating your GitHub App via the manifest.
#
# Usage:
#   bash scripts/setup-github-app.sh <app_id> <private_key_path> <webhook_secret> <installation_id>

APP_ID="${1:?Usage: $0 <app_id> <private_key_path> <webhook_secret> <installation_id>}"
PRIVATE_KEY_PATH="${2:?}"
WEBHOOK_SECRET="${3:?}"
INSTALLATION_ID="${4:?}"

ENV_FILE="apps/web/.env.local"

# Read private key and collapse to single line
PRIVATE_KEY=$(awk 'NF {sub(/\r/, ""); printf "%s\\n",$0;}' "$PRIVATE_KEY_PATH")

# Update or append env vars
update_env() {
  local key="$1" value="$2"
  if grep -q "^${key}=" "$ENV_FILE" 2>/dev/null; then
    sed -i "s|^${key}=.*|${key}=${value}|" "$ENV_FILE"
  else
    echo "${key}=${value}" >> "$ENV_FILE"
  fi
}

update_env "GITHUB_DEPLOYMENT_TYPE" "app"
update_env "GITHUB_APP_ID" "$APP_ID"
update_env "GITHUB_PRIVATE_KEY" "$PRIVATE_KEY"
update_env "GITHUB_INSTALLATION_ID" "$INSTALLATION_ID"
update_env "GITHUB_WEBHOOK_SECRET" "$WEBHOOK_SECRET"

echo "GitHub App credentials written to $ENV_FILE"
echo ""
echo "Next steps:"
echo "  1. Restart your dev server: pnpm dev"
echo "  2. Or redeploy: git add . && git commit -m \"add GitHub App creds\" && git push"
