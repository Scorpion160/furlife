#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

echo '=== Furlife bootstrap Linux/macOS v0.3.10 ==='
command -v node >/dev/null || { echo 'Node.js 22.16.x est requis.' >&2; exit 1; }
node -e "const [M,m]=process.versions.node.split('.').map(Number); if(M!==22||m<16) process.exit(1)" || { echo 'Node 22.16.x+ (<23) est requis.' >&2; exit 1; }
command -v corepack >/dev/null || { echo 'Corepack est requis.' >&2; exit 1; }
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
corepack prepare pnpm@9.15.4 --activate
PNPM=(corepack pnpm)

if [[ ! -f .env.local ]]; then
  node scripts/generate-dev-env.mjs
fi
node scripts/upgrade-dev-env.mjs
if grep -q 'CHANGE_ME' .env.local; then
  echo '.env.local contient encore des valeurs CHANGE_ME.' >&2
  exit 1
fi

# Export the generated local environment so Prisma CLI receives DATABASE_URL.
set -a
# shellcheck disable=SC1091
source .env.local
set +a
# NODE_ENV is framework-owned; Next.js selects production for next build.
unset NODE_ENV || true

node scripts/verify-baseline.mjs
docker compose --project-name furlife-dev --env-file .env.local -f infra/docker-compose.dev.yml up -d

for _ in $(seq 1 30); do
  if docker compose --project-name furlife-dev --env-file .env.local -f infra/docker-compose.dev.yml exec -T postgres sh -c 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"' >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

docker compose --project-name furlife-dev --env-file .env.local -f infra/docker-compose.dev.yml exec -T postgres sh -c 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
"${PNPM[@]}" install
"${PNPM[@]}" --filter @furlife/backend prisma:generate
"${PNPM[@]}" --filter @furlife/backend prisma:validate
if [[ ! -d apps/backend/prisma/migrations ]]; then
  "${PNPM[@]}" --filter @furlife/backend exec prisma migrate dev --name initial --create-only
fi
"${PNPM[@]}" --filter @furlife/backend prisma:migrate:deploy
"${PNPM[@]}" verify

command -v flutter >/dev/null || { echo "Flutter $(cat .flutter-version) est requis pour les gates mobiles." >&2; exit 1; }
for app in client_flutter partner_flutter; do
  pushd "apps/$app" >/dev/null
  flutter pub get
  flutter gen-l10n
  targets=(lib)
  [[ -d test ]] && targets+=(test)
  dart format --output=none --set-exit-if-changed "${targets[@]}"
  flutter analyze
  flutter test
  popd >/dev/null
done

node scripts/dev-doctor.mjs
node scripts/verify-baseline.mjs
echo '=== Furlife bootstrap Linux/macOS v0.3.10: PASS ==='
