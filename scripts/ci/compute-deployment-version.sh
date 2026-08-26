#!/usr/bin/env bash
set -euo pipefail

if [[ $# -eq 0 ]]; then
  echo "Usage: $0 <path> [path...]" >&2
  exit 2
fi

version_date="$(date -u '+%-m.%-d')"
since="$(date -u '+%Y-%m-%dT00:00:00Z')"
daily_count="$(
  git rev-list --count --since="$since" HEAD -- "$@" \
    | tr -d '[:space:]'
)"

if [[ -z "$daily_count" || "$daily_count" -lt 1 ]]; then
  daily_count=1
fi

suffix=""
if [[ "$daily_count" -gt 1 ]]; then
  suffix=".$daily_count"
fi

echo "v0.${version_date}${suffix}"
