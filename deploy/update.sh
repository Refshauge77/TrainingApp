#!/usr/bin/env bash
# Fetches the newest version from GitHub and restarts the app (data is kept).
set -euo pipefail
cd "$(dirname "$0")/.."
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
git fetch -q origin "$BRANCH"
git reset -q --hard "origin/$BRANCH"
cd deploy
docker compose exec -T app node --disable-warning=ExperimentalWarning server/backup.js /backups 14 || true
docker compose up -d --build
docker image prune -f >/dev/null
echo "Opdateret til $(git log -1 --format='%h %s')"
