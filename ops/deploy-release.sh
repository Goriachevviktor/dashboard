#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
source "$SCRIPT_DIR/lib/release_helpers.sh"

ENVIRONMENT=${1:-}
SHA=${2:-}
ARCHIVE=${3:-}

if [[ $ENVIRONMENT != test && $ENVIRONMENT != production ]]; then
  printf 'environment must be test or production\n' >&2
  exit 2
fi
if ! validate_sha "$SHA"; then
  printf 'release SHA must be 40 lowercase hexadecimal characters\n' >&2
  exit 2
fi
if [[ ! -f $ARCHIVE ]]; then
  printf 'release archive does not exist\n' >&2
  exit 2
fi

: "${RELEASE_ROOT:?RELEASE_ROOT is required}"
: "${SHARED_CONFIG_DIR:?SHARED_CONFIG_DIR is required}"
: "${PUBLIC_HEALTH_URL:?PUBLIC_HEALTH_URL is required}"

RELEASE_RETENTION=${RELEASE_RETENTION:-5}
CREATE_DB_BACKUP=${CREATE_DB_BACKUP:-false}
LOCAL_HEALTH_URL=${LOCAL_HEALTH_URL:-http://127.0.0.1:8000/health}
RELEASES_DIR="$RELEASE_ROOT/releases"
RELEASE_DIR="$RELEASES_DIR/$SHA"
CURRENT_LINK="$RELEASE_ROOT/current"
BACKUPS_DIR="$RELEASE_ROOT/backups"
LOCK_FILE="$RELEASE_ROOT/deploy.lock"
PUBLIC_HEALTH_ENDPOINT="${PUBLIC_HEALTH_URL%/}/api/health"
ENV_FILE="$SHARED_CONFIG_DIR/.env"
OVERRIDE_FILE="$SHARED_CONFIG_DIR/docker-compose.override.yml"

mkdir -p "$RELEASES_DIR" "$BACKUPS_DIR"
exec 9>"$LOCK_FILE"
flock -n 9 || { printf 'another deployment is already running\n' >&2; exit 1; }

if [[ ! -f $ENV_FILE ]]; then
  printf 'shared environment file is missing: %s\n' "$ENV_FILE" >&2
  exit 1
fi

previous_release=''
activation_started=false
deployment_succeeded=false
rollback_in_progress=false
if [[ -L $CURRENT_LINK ]]; then
  previous_release=$(readlink -f "$CURRENT_LINK")
fi

compose_files() {
  local release=$1
  COMPOSE_ARGS=(--env-file "$ENV_FILE" -f "$release/server/docker-compose.yml")
  if [[ -f $OVERRIDE_FILE ]]; then
    COMPOSE_ARGS+=(-f "$OVERRIDE_FILE")
  fi
}

start_release() {
  local release=$1 version=$2 environment=$3
  compose_files "$release"
  export DASHBOARD_VERSION="$version"
  export DASHBOARD_ENVIRONMENT="$environment"
  docker compose "${COMPOSE_ARGS[@]}" up -d --build
}

check_health() {
  local url=$1 expected_sha=$2 expected_environment=$3 payload
  payload=$(curl -kfsS --retry 12 --retry-delay 5 --retry-all-errors --max-time 15 "$url")
  health_matches "$payload" "$expected_sha" "$expected_environment"
}

local_health_matches() {
  local release=$1 expected_sha=$2 expected_environment=$3 payload
  compose_files "$release"
  payload=$(docker compose "${COMPOSE_ARGS[@]}" exec -T dashboard-api \
    python -c 'import sys, urllib.request; print(urllib.request.urlopen(sys.argv[1], timeout=10).read().decode())' \
    "$LOCAL_HEALTH_URL")
  health_matches "$payload" "$expected_sha" "$expected_environment"
}

check_local_health() {
  retry_until 12 5 local_health_matches "$@"
}

rollback() {
  local exit_code=$?
  trap - ERR
  if [[ $rollback_in_progress == true ]]; then
    exit "$exit_code"
  fi
  rollback_in_progress=true
  if [[ $deployment_succeeded == false ]] && should_rollback "$previous_release" "$activation_started"; then
    local previous_sha
    previous_sha=$(basename "$previous_release")
    printf 'candidate failed; rolling back to %s\n' "$previous_sha" >&2
    start_release "$previous_release" "$previous_sha" "$ENVIRONMENT"
    check_local_health "$previous_release" "$previous_sha" "$ENVIRONMENT"
    check_health "$PUBLIC_HEALTH_ENDPOINT" "$previous_sha" "$ENVIRONMENT"
    ln -sfn "$previous_release" "$CURRENT_LINK"
    printf 'rollback completed: %s\n' "$previous_sha" >&2
  fi
  exit "$exit_code"
}
trap rollback ERR

if [[ ! -d $RELEASE_DIR ]]; then
  temporary_release=$(mktemp -d "$RELEASES_DIR/.${SHA}.XXXXXX")
  tar -xzf "$ARCHIVE" -C "$temporary_release"
  mv "$temporary_release" "$RELEASE_DIR"
fi

if [[ ! -f $RELEASE_DIR/server/docker-compose.yml || ! -f $RELEASE_DIR/frontend/package-lock.json ]]; then
  printf 'release archive is missing required project files\n' >&2
  false
fi

if [[ -f $SHARED_CONFIG_DIR/vapid_private.pem ]]; then
  ln -sfn "$SHARED_CONFIG_DIR/vapid_private.pem" "$RELEASE_DIR/server/vapid_private.pem"
fi

(
  cd "$RELEASE_DIR/frontend"
  npm ci
  npm run build -- --outDir "$RELEASE_DIR/frontend-dist"
)

backup=''
if [[ $ENVIRONMENT == production && $CREATE_DB_BACKUP == true ]]; then
  timestamp=$(date -u +%Y%m%dT%H%M%SZ)
  backup="$BACKUPS_DIR/dashboard-before-${SHA:0:12}-$timestamp.sql"
  compose_files "$RELEASE_DIR"
  docker compose "${COMPOSE_ARGS[@]}" exec -T dashboard-db \
    pg_dump -U dashboard -d dashboard >"$backup"
  [[ -s $backup ]]
  printf 'database_backup=%s\n' "$backup"
fi

activation_started=true
start_release "$RELEASE_DIR" "$SHA" "$ENVIRONMENT"
check_local_health "$RELEASE_DIR" "$SHA" "$ENVIRONMENT"
check_health "$PUBLIC_HEALTH_ENDPOINT" "$SHA" "$ENVIRONMENT"
ln -sfn "$RELEASE_DIR" "$CURRENT_LINK"
deployment_succeeded=true
trap - ERR

mapfile -t inactive_releases < <(
  find "$RELEASES_DIR" -mindepth 1 -maxdepth 1 -type d ! -name '.*' -print0 \
    | xargs -0 -r stat -c '%Y %n' | sort -rn | cut -d' ' -f2-
)
kept=0
for candidate in "${inactive_releases[@]}"; do
  if [[ $candidate == "$RELEASE_DIR" || $candidate == "$previous_release" ]]; then
    continue
  fi
  kept=$((kept + 1))
  if (( kept > RELEASE_RETENTION )); then
    rm -rf -- "$candidate"
  fi
done

printf 'deployment_environment=%s\n' "$ENVIRONMENT"
printf 'deployment_sha=%s\n' "$SHA"
printf 'release_path=%s\n' "$RELEASE_DIR"
printf 'public_health_url=%s\n' "$PUBLIC_HEALTH_URL"
