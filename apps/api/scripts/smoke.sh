#!/usr/bin/env bash
# Smoke test against a running API: the vault-app flow end to end, with random bytes standing in for
# what packages/crypto will produce. Usage: pnpm --filter @rahasya/api smoke  (API defaults to http://localhost:3000)
set -euo pipefail

API="${API:-http://localhost:3000}"
PASS=0

b64() { openssl rand "$1" | base64 | tr -d '\n'; }
# Ciphertext format: version 0x01 · algorithm 0x01 · 24-byte nonce · data · 16-byte tag
blob() { (printf '\001\001'; openssl rand $((24 + $1 + 16))) | base64 | tr -d '\n'; }
field() { python3 -c "import sys,json; print(json.load(sys.stdin)$1)"; }

# call <expected status> <method> <path> [json body] [token]  → prints the body; stops on a wrong status
call() {
  local expect=$1 method=$2 path=$3 body=${4:-} token=${5:-${TOKEN:-}}
  local args=(-s -o "$TMP" -w '%{http_code}' -X "$method" "$API$path" -H 'content-type: application/json')
  [[ -n $token ]] && args+=(-H "authorization: Bearer $token")
  [[ -n $body ]] && args+=(-d "$body")
  local status
  status=$(curl "${args[@]}")
  if [[ $status != "$expect" ]]; then
    echo "FAIL $method $path: expected $expect, got $status: $(cat "$TMP")" >&2
    exit 1
  fi
  PASS=$((PASS + 1))
  cat "$TMP"
}
step() { printf '  %-58s ok\n' "$1"; }

TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT
curl -s -o /dev/null "$API" || { echo "No API at $API. Start it with: pnpm --filter @rahasya/api dev" >&2; exit 1; }

EMAIL="smoke-$(date +%s)-$RANDOM@example.com"
AUTH_KEY=$(b64 32)
KDF='{"memoryKiB":65536,"iterations":3,"parallelism":1}'
DEVICE='{"name":"smoke test","platform":"web"}'
echo "Smoke test against $API as $EMAIL"

echo "Welcome, sign up, sign in"
SESSION=$(call 201 POST /auth/register "{\"email\":\"$EMAIL\",\"authKey\":\"$AUTH_KEY\",\"kdfSalt\":\"$(b64 16)\",\"kdfParams\":$KDF,\"wrappedVaultKey\":\"$(blob 32)\",\"device\":$DEVICE}")
TOKEN=$(echo "$SESSION" | field '["accessToken"]')
REFRESH=$(echo "$SESSION" | field '["refreshToken"]')
step "sign up"
call 409 POST /auth/register "{\"email\":\"$EMAIL\",\"authKey\":\"$AUTH_KEY\",\"kdfSalt\":\"$(b64 16)\",\"kdfParams\":$KDF,\"wrappedVaultKey\":\"$(blob 32)\",\"device\":$DEVICE}" >/dev/null
step "same email again is refused (409)"
call 400 POST /auth/register "{\"email\":\"x$EMAIL\",\"authKey\":\"$AUTH_KEY\",\"kdfSalt\":\"$(b64 16)\",\"kdfParams\":$KDF,\"wrappedVaultKey\":\"$(b64 74)\",\"device\":$DEVICE}" >/dev/null
step "a wrapped key without the ciphertext header is refused (400)"
call 200 POST /auth/prelogin "{\"email\":\"$EMAIL\"}" >/dev/null
step "prelogin returns salt and Argon2id settings"
LEFT=$(call 401 POST /auth/login "{\"email\":\"$EMAIL\",\"authKey\":\"$(b64 32)\",\"device\":$DEVICE}" | field '["triesLeft"]')
[[ $LEFT == 4 ]] || { echo "FAIL expected 4 tries left, got $LEFT" >&2; exit 1; }
step "wrong key: 401 with 4 tries left"
call 200 POST /auth/login "{\"email\":\"$EMAIL\",\"authKey\":\"$AUTH_KEY\",\"device\":$DEVICE}" >/dev/null
step "right key signs in"
call 401 GET /vault/sync "" none >/dev/null
step "vault without a token is refused (401)"

echo "Entries"
ID=$(uuidgen | tr '[:upper:]' '[:lower:]')
call 200 PUT "/vault/items/$ID" "{\"blob\":\"$(blob 64)\"}" >/dev/null
step "add an entry"
call 400 PUT "/vault/items/$(uuidgen | tr '[:upper:]' '[:lower:]')" "{\"blob\":\"$(printf 'password=hunter2' | base64)\"}" >/dev/null
step "plaintext instead of ciphertext is refused (400)"
REV=$(call 200 GET "/vault/sync?since=0" | field '["revision"]')
step "sync returns the entry (revision $REV)"
CONFLICT=$(call 200 PUT "/vault/items/$ID" "{\"blob\":\"$(blob 64)\",\"baseRevision\":$REV}" | field '["conflict"]')
[[ $CONFLICT == False ]] || { echo "FAIL expected no conflict" >&2; exit 1; }
step "edit it"
COUNT=$(call 200 GET "/vault/items/$ID/history" | field '.__len__()')
[[ $COUNT == 1 ]] || { echo "FAIL expected 1 old version, got $COUNT" >&2; exit 1; }
step "history keeps the replaced version"

echo "Groups and labels"
GROUP=$(uuidgen | tr '[:upper:]' '[:lower:]')
LABEL=$(uuidgen | tr '[:upper:]' '[:lower:]')
call 200 PUT /vault/groups "{\"groups\":[{\"id\":\"$GROUP\",\"nameEnc\":\"$(blob 8)\",\"sortOrder\":0}]}" >/dev/null
call 200 PUT /vault/labels "{\"labels\":[{\"id\":\"$LABEL\",\"nameEnc\":\"$(blob 8)\"}]}" >/dev/null
call 200 PUT "/vault/items/$ID" "{\"blob\":\"$(blob 64)\",\"groupId\":\"$GROUP\",\"labelIds\":[\"$LABEL\"]}" >/dev/null
step "create a group and a label, file the entry under them"

echo "Trash"
call 400 DELETE "/vault/items/$ID?forever=true" >/dev/null
step "delete forever needs Trash first (400)"
call 200 DELETE "/vault/items/$ID" >/dev/null
call 200 POST "/vault/items/$ID/restore" >/dev/null
step "delete, then undo"
call 200 DELETE "/vault/items/$ID" >/dev/null
call 200 DELETE "/vault/items/$ID?forever=true" >/dev/null
call 410 PUT "/vault/items/$ID" "{\"blob\":\"$(blob 64)\"}" >/dev/null
step "delete forever; the entry is gone (410)"

echo "Settings and session"
call 200 GET /devices >/dev/null
step "device list"
call 200 POST /auth/2fa/setup >/dev/null
step "two-step setup returns a secret"
NEW=$(call 200 POST /auth/refresh "{\"refreshToken\":\"$REFRESH\"}" "" none)
call 401 POST /auth/refresh "{\"refreshToken\":\"$REFRESH\"}" "" none >/dev/null
step "refresh rotates; the old token is refused (401)"
TOKEN=$(echo "$NEW" | field '["accessToken"]')
call 401 GET /devices >/dev/null
step "reusing the old token signed the device out"

echo "All $PASS checks passed."
