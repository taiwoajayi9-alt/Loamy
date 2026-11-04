#!/usr/bin/env bash
# One-time setup so GitHub can send new versions of Loamy to your Namecheap hosting.
#   bash scripts/setup-deploy.sh          → creates the key and walks you through it
#   bash scripts/setup-deploy.sh check    → tests the connection after you've authorised the key
# The private key never leaves your Mac except when you paste it into GitHub's encrypted secrets.
set -euo pipefail
cd "$(dirname "$0")/.."
KEY="$HOME/.ssh/loamy_deploy"

if [ ! -f .deploy ]; then
  echo "Find these in cPanel, in the 'General Information' box on the right-hand side."
  read -r -p "cPanel username (Current User): " U
  read -r -p "Server name (Server Name, e.g. server123.web-hosting.com): " H
  printf 'DEPLOY_USER=%s\nDEPLOY_HOST=%s\nDEPLOY_PORT=21098\nAPP_URL=https://app.loamy.farm\n' "$U" "$H" > .deploy
fi
# shellcheck disable=SC1091
source .deploy

if [ "${1:-}" = "check" ]; then
  echo "Testing SSH to ${DEPLOY_USER}@${DEPLOY_HOST} with the Loamy key..."
  if ssh -p "$DEPLOY_PORT" -i "$KEY" -o BatchMode=yes -o StrictHostKeyChecking=accept-new "${DEPLOY_USER}@${DEPLOY_HOST}" 'echo ok; which rsync >/dev/null && echo rsync ok'; then
    echo "✅ GitHub will be able to deploy."
  else
    echo "❌ Not yet. In cPanel → SSH Access → Manage SSH Keys, make sure 'loamy_deploy' is listed under Public Keys and shows 'authorized'."
  fi
  exit 0
fi

mkdir -p "$HOME/.ssh" && chmod 700 "$HOME/.ssh"
[ -f "$KEY" ] || ssh-keygen -t ed25519 -N "" -C "loamy-github-deploy" -f "$KEY" -q

echo ""
echo "━━ Step A: cPanel ━━"
echo "cPanel → SSH Access → Manage SSH Keys → Import Key."
echo "  Name: loamy_deploy"
echo "  Paste this into the PUBLIC key box (leave the private box empty):"
echo ""
cat "$KEY.pub"
echo ""
echo "Then go back, find loamy_deploy under Public Keys → Manage → Authorize."
read -r -p "Press Enter when that's done..."

echo ""
echo "━━ Step B: GitHub secrets ━━"
echo "Open: https://github.com/taiwoajayi9-alt/Loamy/settings/secrets/actions/new"
echo "Create these three secrets (Name, then Secret, then 'Add secret'):"
echo "  1. DEPLOY_HOST  →  ${DEPLOY_HOST}"
echo "  2. DEPLOY_USER  →  ${DEPLOY_USER}"
echo "  3. DEPLOY_SSH_KEY → the private key, as one long line. It's now copied to your clipboard; just paste."
# One line of base64 survives copy and paste; the deploy decodes it.
if base64 -i "$KEY" 2>/dev/null | tr -d '\n' | pbcopy 2>/dev/null; then
  echo "     (copied ✓)"
else
  echo "     Copy this one long line:"; base64 < "$KEY" | tr -d '\n'; echo
fi
echo ""
echo "When all three are added, run:  bash scripts/setup-deploy.sh check"
