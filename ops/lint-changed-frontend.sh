#!/usr/bin/env bash
set -Eeuo pipefail

BASE=${1:?base revision is required}
HEAD=${2:?head revision is required}
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)

git -C "$ROOT" rev-parse --verify "$BASE^{commit}" >/dev/null
git -C "$ROOT" rev-parse --verify "$HEAD^{commit}" >/dev/null

files=()
while IFS= read -r file; do
  files+=("${file#frontend/}")
done < <(git -C "$ROOT" diff --name-only --diff-filter=AM "$BASE" "$HEAD" -- 'frontend/**/*.js' 'frontend/**/*.jsx')

if (( ${#files[@]} == 0 )); then
  printf 'No changed frontend JavaScript files to lint.\n'
  exit 0
fi

cd "$ROOT/frontend"
./node_modules/.bin/eslint "${files[@]}"
