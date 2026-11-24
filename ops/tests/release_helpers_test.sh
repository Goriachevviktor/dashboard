#!/usr/bin/env bash
set -uo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
source "$ROOT/ops/lib/release_helpers.sh"

failures=0

check() {
  local description=$1
  shift
  if "$@"; then
    printf 'ok - %s\n' "$description"
  else
    printf 'not ok - %s\n' "$description" >&2
    failures=$((failures + 1))
  fi
}

check_not() {
  local description=$1
  shift
  if "$@"; then
    printf 'not ok - %s\n' "$description" >&2
    failures=$((failures + 1))
  else
    printf 'ok - %s\n' "$description"
  fi
}

sha=0123456789012345678901234567890123456789
check 'accepts a full lowercase SHA' validate_sha "$sha"
check_not 'rejects a branch name' validate_sha main
check_not 'rejects an uppercase SHA' validate_sha 012345678901234567890123456789012345678A
check 'accepts exact healthy deployment metadata' health_matches \
  "{\"status\":\"ok\",\"version\":\"$sha\",\"environment\":\"test\"}" "$sha" test
check_not 'rejects a mismatched version' health_matches \
  '{"status":"ok","version":"wrong","environment":"test"}' "$sha" test
check_not 'rejects malformed JSON' health_matches 'not-json' "$sha" test
check 'rolls back after activation when a previous release exists' should_rollback /srv/releases/previous true
check_not 'does not roll back without a previous release' should_rollback '' true
check_not 'does not roll back before activation' should_rollback /srv/releases/previous false

attempts=0
becomes_healthy_on_third_attempt() {
  attempts=$((attempts + 1))
  (( attempts >= 3 ))
}
check 'retries a readiness check until it succeeds' retry_until 3 0 becomes_healthy_on_third_attempt
if (( attempts != 3 )); then
  printf 'not ok - readiness check ran %d times instead of 3\n' "$attempts" >&2
  failures=$((failures + 1))
else
  printf 'ok - readiness check used all required attempts\n'
fi

artifact_root=$(mktemp -d)
trap 'rm -rf "$artifact_root"' EXIT
mkdir -p "$artifact_root/source/assets" "$artifact_root/release"
printf '<html>ready</html>\n' > "$artifact_root/source/index.html"
printf 'console.log("ready")\n' > "$artifact_root/source/assets/index.js"
tar -czf "$artifact_root/frontend.tar.gz" -C "$artifact_root/source" .
check 'installs a valid prebuilt frontend' install_frontend_artifact "$artifact_root/frontend.tar.gz" "$artifact_root/release"
check 'retains the frontend on a repeated deployment' install_frontend_artifact "$artifact_root/frontend.tar.gz" "$artifact_root/release"
if [[ $(cat "$artifact_root/release/frontend-dist/index.html") != '<html>ready</html>' ]]; then
  printf 'not ok - installed frontend content differs\n' >&2
  failures=$((failures + 1))
fi
printf '<html>changed</html>\n' > "$artifact_root/source/index.html"
tar -czf "$artifact_root/changed.tar.gz" -C "$artifact_root/source" .
check_not 'rejects changed content for the same release' install_frontend_artifact "$artifact_root/changed.tar.gz" "$artifact_root/release"
if [[ $(cat "$artifact_root/release/frontend-dist/index.html") != '<html>ready</html>' ]]; then
  printf 'not ok - rejected artifact changed the installed frontend\n' >&2
  failures=$((failures + 1))
fi
mkdir -p "$artifact_root/incomplete"
printf '<html>incomplete</html>\n' > "$artifact_root/incomplete/index.html"
tar -czf "$artifact_root/incomplete.tar.gz" -C "$artifact_root/incomplete" .
check_not 'rejects frontend without JavaScript assets' install_frontend_artifact "$artifact_root/incomplete.tar.gz" "$artifact_root/release"

if (( failures > 0 )); then
  printf '%d release helper assertion(s) failed\n' "$failures" >&2
  exit 1
fi

printf 'all release helper assertions passed\n'
