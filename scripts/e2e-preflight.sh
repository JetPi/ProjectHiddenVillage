#!/usr/bin/env bash
set -euo pipefail

SERVER_LOG="${SERVER_LOG:-/tmp/phv-e2e-preflight-server.log}"
API_BASE_URL="${API_BASE_URL:-http://127.0.0.1:3001}"
SEED_EMAIL="${E2E_SEED_EMAIL:-test-user-1@hiddenvillage.local}"
SEED_PASSWORD="${E2E_SEED_PASSWORD:-TestUser1!}"
SEED_USER_ID="${E2E_SEED_USER_ID:-20000000-0000-0000-0000-000000000001}"
SEED_DECK_ID="${E2E_SEED_DECK_ID:-10000000-0000-0000-0000-000000000001}"
SEED_DECK_TWO_ID="${E2E_SEED_DECK_TWO_ID:-10000000-0000-0000-0000-000000000002}"

npm run e2e:start:server > "$SERVER_LOG" 2>&1 &
server_pid=$!

cleanup() {
  if kill -0 "$server_pid" 2>/dev/null; then
    kill "$server_pid" || true
    wait "$server_pid" || true
  fi
}
trap cleanup EXIT

server_ready="false"
for _ in $(seq 1 60); do
  # Reachability is enough for readiness here; some environments do not expose /health.
  if curl -s "$API_BASE_URL" >/dev/null 2>&1; then
    server_ready="true"
    break
  fi
  sleep 1
done

if [ "$server_ready" != "true" ]; then
  echo "Preflight failed: server did not become reachable at $API_BASE_URL."
  echo "Server log tail:"
  tail -n 120 "$SERVER_LOG" || true
  exit 1
fi

login_payload=$(printf '{"email":"%s","password":"%s"}' "$SEED_EMAIL" "$SEED_PASSWORD")
login_response=$(curl -fsS -X POST \
  -H "Content-Type: application/json" \
  -d "$login_payload" \
  "$API_BASE_URL/api/user/login")

access_token=$(echo "$login_response" | node -e "const fs=require('fs');const data=JSON.parse(fs.readFileSync(0,'utf8'));process.stdout.write(data.accessToken||'');")
if [ -z "$access_token" ]; then
  echo "Preflight failed: could not retrieve access token for seeded test user."
  echo "Server log tail:"
  tail -n 120 "$SERVER_LOG" || true
  exit 1
fi

game_payload=$(printf '{"userId":"%s","deckId":"%s"}' "$SEED_USER_ID" "$SEED_DECK_ID")
game_response=$(curl -fsS -X POST \
  -H "Authorization: Bearer $access_token" \
  -H "Content-Type: application/json" \
  -d "$game_payload" \
  "$API_BASE_URL/api/games")

game_code=$(echo "$game_response" | node -e "const fs=require('fs');const data=JSON.parse(fs.readFileSync(0,'utf8'));process.stdout.write((data.id||'').toString());")
if [ -z "$game_code" ]; then
  echo "Preflight failed: could not create a game to inspect seeded card catalog."
  echo "Server log tail:"
  tail -n 120 "$SERVER_LOG" || true
  exit 1
fi

cards_response=$(curl -fsS "$API_BASE_URL/api/games/$game_code/cards")

has_support=$(echo "$cards_response" | node -e "const fs=require('fs');const cards=JSON.parse(fs.readFileSync(0,'utf8'));const c=cards.find(x=>String(x.id||'').toUpperCase()==='N-008');const ok=!!c&&(String(c.supportName||'').trim().length>0||String(c.supportEffect||'').trim().length>0);process.stdout.write(ok?'true':'false');")

if [ "$has_support" != "true" ]; then
  echo "Preflight failed: N-008 is missing support metadata in seed state."
  echo "Server log tail:"
  tail -n 120 "$SERVER_LOG" || true
  exit 1
fi

for deck_id in "$SEED_DECK_ID" "$SEED_DECK_TWO_ID"; do
  deck_game_payload=$(printf '{"userId":"%s","deckId":"%s"}' "$SEED_USER_ID" "$deck_id")
  deck_game_response=$(curl -fsS -X POST \
    -H "Authorization: Bearer $access_token" \
    -H "Content-Type: application/json" \
    -d "$deck_game_payload" \
    "$API_BASE_URL/api/games")

  deck_game_code=$(echo "$deck_game_response" | node -e "const fs=require('fs');const data=JSON.parse(fs.readFileSync(0,'utf8'));process.stdout.write((data.id||'').toString());")
  if [ -z "$deck_game_code" ]; then
    echo "Preflight failed: could not create a game for deck $deck_id."
    echo "Server log tail:"
    tail -n 120 "$SERVER_LOG" || true
    exit 1
  fi

  deck_cards_response=$(curl -fsS "$API_BASE_URL/api/games/$deck_game_code/cards")

  has_support_capable=$(echo "$deck_cards_response" | node -e "const fs=require('fs');const cards=JSON.parse(fs.readFileSync(0,'utf8'));const ok=cards.some(c=>String(c.supportName||'').trim().length>0||String(c.supportEffect||'').trim().length>0);process.stdout.write(ok?'true':'false');")

  if [ "$has_support_capable" != "true" ]; then
    echo "Preflight failed: deck $deck_id has no support-capable cards in /api/games/{id}/cards."
    echo "Server log tail:"
    tail -n 120 "$SERVER_LOG" || true
    exit 1
  fi
done

echo "Preflight passed: N-008 support metadata is present and both seeded decks expose support-capable cards."
