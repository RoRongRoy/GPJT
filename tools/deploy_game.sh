#!/usr/bin/env bash
# Run on a Linux Docker host. Saves live in named volumes, outside the checkout.
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."

release="${GITHUB_SHA:-$(git rev-parse HEAD)}"
if [[ ! "$release" =~ ^[0-9a-f]{40}$ ]]; then
  echo 'A full Git commit SHA is required.' >&2
  exit 1
fi
project="${BLOODFALL_PROJECT:-bloodfall}"
compose=(docker compose -p "$project" -f deploy/compose.yaml)
image="bloodfall-game:$release"

# Build first: a failed build leaves the running release untouched.
docker build --label "org.opencontainers.image.revision=$release" -t "$image" -f deploy/Dockerfile .
old_container="$("${compose[@]}" ps --all --quiet game)"
old_image=''
if [[ -n "$old_container" ]]; then
  old_image="$(docker inspect --format '{{.Config.Image}}' "$old_container")"
  # SQLite's online backup API also works if the previous container is stopped.
  docker run --rm --volumes-from "$old_container" "$old_image" \
    python tools/backup.py --source /app/data/world.sqlite3 --out /app/backups
fi

export BLOODFALL_IMAGE="$image"
if "${compose[@]}" up -d --wait --wait-timeout 120; then
  echo "Healthy release: $release"
else
  echo 'New release did not become healthy.' >&2
  if [[ -n "$old_image" ]]; then
    echo 'Restoring the previous container image; saves and backups are retained.' >&2
    export BLOODFALL_IMAGE="$old_image"
    "${compose[@]}" up -d --wait --wait-timeout 120
  fi
  exit 1
fi
