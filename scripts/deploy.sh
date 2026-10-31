#!/usr/bin/env bash
# Deploy the compose stack to the Hetzner box.
#
#   ./scripts/deploy.sh                # deploy IMAGE_TAG from .env (default: latest)
#   ./scripts/deploy.sh sha-abc1234    # deploy (or roll back to) a specific image tag
#
# The server never builds: images come from GHCR (booster B8). This script only ships the
# compose file, the Caddyfile, pulls, restarts and warms the card-art cache (booster B9).

set -euo pipefail

SSH_TARGET="${SSH_TARGET:-root@167.233.251.253}"
APP_DIR="${APP_DIR:-/opt/phv}"
IMAGE_TAG="${1:-${IMAGE_TAG:-latest}}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

echo "== shipping compose files to ${SSH_TARGET}:${APP_DIR} =="
ssh -o BatchMode=yes "$SSH_TARGET" "mkdir -p '$APP_DIR'"
scp -o BatchMode=yes docker-compose.yml Caddyfile "$SSH_TARGET:$APP_DIR/"

if ! ssh -o BatchMode=yes "$SSH_TARGET" "test -f '$APP_DIR/.env'"; then
    echo
    echo "ERROR: $APP_DIR/.env does not exist on the server yet."
    echo "Create it once from .env.example, fill in the secrets, then re-run:"
    echo "  ssh $SSH_TARGET"
    echo "  cd $APP_DIR && cp /path/to/.env.example .env && chmod 600 .env"
    echo "  # generate secrets: openssl rand -hex 24 (postgres), openssl rand -hex 32 (jwt)"
    exit 1
fi

echo "== pulling images (tag: ${IMAGE_TAG}) =="
ssh -o BatchMode=yes "$SSH_TARGET" "cd '$APP_DIR' && IMAGE_TAG='$IMAGE_TAG' docker compose pull"

echo "== restarting =="
ssh -o BatchMode=yes "$SSH_TARGET" "cd '$APP_DIR' && IMAGE_TAG='$IMAGE_TAG' docker compose up -d --remove-orphans"

echo "== waiting for the API to report healthy =="
for _ in $(seq 1 30); do
    status="$(ssh -o BatchMode=yes "$SSH_TARGET" "docker inspect --format '{{.State.Health.Status}}' phv-api-1 2>/dev/null || echo missing")"
    echo "  api health: $status"
    [ "$status" = "healthy" ] && break
    sleep 4
done

# The first board load after a deploy would otherwise decode dozens of images on the single
# core at once. Warm the cache from the catalog instead.
game_host="$(ssh -o BatchMode=yes "$SSH_TARGET" "grep -E '^GAME_HOST=' '$APP_DIR/.env' | cut -d= -f2-")"
api_host="$(ssh -o BatchMode=yes "$SSH_TARGET" "grep -E '^API_HOST=' '$APP_DIR/.env' | cut -d= -f2-")"

echo "== warming card-art cache on ${api_host} =="
ssh -o BatchMode=yes "$SSH_TARGET" "
    ids=\$(curl -fsS --max-time 30 'https://${api_host}/api/card/catalog?page=1&pageSize=20' | grep -o '\"id\":\"[^\"]*\"' | cut -d'\"' -f4 | head -20)
    if [ -z \"\$ids\" ]; then echo '  catalog empty, nothing to warm'; exit 0; fi
    for id in \$ids; do curl -fsS -o /dev/null --max-time 20 \"https://${api_host}/api/card-art/\$id\" || true; done
    echo \"  warmed \$(echo \"\$ids\" | wc -l) card images\"
"

echo
echo "client: https://${game_host}/"
echo "api:    https://${api_host}/api/card/catalog"
