#!/usr/bin/env bash
# Creates .env.local for running Loamy on your computer against the Loamy Supabase project.
# Usage (from the project folder):  bash scripts/setup-env.sh
# It asks for your database password and (optionally) your Supabase secret key. Nothing is sent anywhere.
set -euo pipefail

cd "$(dirname "$0")/.."

if [ -f .env.local ]; then
  read -r -p ".env.local already exists. Replace it? (y/N) " ok
  [ "${ok:-N}" = "y" ] || { echo "Kept your existing .env.local."; exit 0; }
fi

REF="kimietimcjqdeomihnsw"
HOST="aws-1-eu-central-1.pooler.supabase.com"

echo ""
echo "1) Your Supabase DATABASE password (Supabase > Project Settings > Database)."
echo "   Typing is hidden. Press Enter when done."
read -r -s -p "   Password: " DBPASS; echo ""
[ -n "$DBPASS" ] || { echo "No password entered. Nothing changed."; exit 1; }

echo ""
echo "2) Optional: your Supabase SECRET key (starts with sb_secret_). Needed for photo uploads."
echo "   Supabase > Project Settings > API Keys. Press Enter to skip."
read -r -s -p "   Secret key: " SECRET; echo ""

ENC=$(DBPASS="$DBPASS" node -e 'process.stdout.write(encodeURIComponent(process.env.DBPASS))')

cat > .env.local <<EOF
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=https://${REF}.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_qcSDPYTQ3CuyPYMghVXgzQ_DZgR_41M
DATABASE_URL=postgresql://postgres.${REF}:${ENC}@${HOST}:6543/postgres
DIRECT_URL=postgresql://postgres.${REF}:${ENC}@${HOST}:5432/postgres
EOF
[ -n "$SECRET" ] && echo "SUPABASE_SECRET_KEY=${SECRET}" >> .env.local
chmod 600 .env.local

echo ""
echo "Checking the database connection..."
if node -e '
  process.loadEnvFile(".env.local");
  const sql = require("postgres")(process.env.DATABASE_URL, { prepare: false, max: 1, connect_timeout: 15 });
  sql`select 1`.then(() => { console.log("✅ Connected. .env.local is ready."); return sql.end(); })
    .catch((e) => { console.error("❌ Could not connect: " + e.message); process.exit(1); });
'; then
  [ -n "$SECRET" ] || echo "Note: photo uploads stay off until you add the secret key (run this again)."
else
  echo "Check the password and try again: bash scripts/setup-env.sh"
  exit 1
fi
