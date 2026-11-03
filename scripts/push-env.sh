#!/usr/bin/env bash
# Sends your settings (.env.local) to the Namecheap server as the live app's .env,
# with the web address switched to the live site. Run from the Loamy folder:
#   bash scripts/push-env.sh
# Uses the SSH details in .deploy (created on first run). Nothing is stored in Git.
set -euo pipefail
cd "$(dirname "$0")/.."

[ -f .env.local ] || { echo "No .env.local here. Run: bash scripts/setup-env.sh"; exit 1; }
if [ ! -f .deploy ]; then
  read -r -p "cPanel username: " U
  read -r -p "Server name (e.g. server123.web-hosting.com): " H
  printf 'DEPLOY_USER=%s\nDEPLOY_HOST=%s\nDEPLOY_PORT=21098\nAPP_URL=https://app.loamy.farm\n' "$U" "$H" > .deploy
fi
# shellcheck disable=SC1091
source .deploy

TMP=$(mktemp)
grep -v -E '^(NEXT_PUBLIC_SITE_URL|AI_PROVIDER_LOCAL_ONLY)=' .env.local > "$TMP"
echo "NEXT_PUBLIC_SITE_URL=${APP_URL}" >> "$TMP"
if grep -q "sk_live_" "$TMP"; then echo "Note: these are LIVE Paystack keys."; fi

# (macOS ships bash 3.2, where empty arrays break under `set -u`, so use a plain string.)
KEYOPT=""
[ -f "$HOME/.ssh/loamy_deploy" ] && KEYOPT="-i $HOME/.ssh/loamy_deploy"
echo "Sending settings to ${DEPLOY_USER}@${DEPLOY_HOST}..."
ssh -p "$DEPLOY_PORT" $KEYOPT -o StrictHostKeyChecking=accept-new "${DEPLOY_USER}@${DEPLOY_HOST}" "mkdir -p ~/loamy-app && cat > ~/loamy-app/.env && chmod 600 ~/loamy-app/.env && mkdir -p ~/loamy-app/tmp && touch ~/loamy-app/tmp/restart.txt" < "$TMP"
rm -f "$TMP"
echo "✅ Settings sent and the app is restarting."
