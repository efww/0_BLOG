#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

INBOX_DIR="${INBOX_DIR:-$ROOT_DIR/docs/inbox}"

mkdir -p "$INBOX_DIR" "$INBOX_DIR/_processed"

# If the user is editing/has local changes (outside inbox), do nothing.
# We allow untracked/changed files under docs/inbox because that's the input.
dirty_other="$(git status --porcelain | rg -v '^..[[:space:]]+docs/inbox/' || true)"
if [ -n "$dirty_other" ]; then
  exit 0
fi

# Keep local branch in sync before creating new commits.
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
git fetch --prune origin >/dev/null 2>&1 || true
if git show-ref --verify --quiet "refs/remotes/origin/$BRANCH"; then
  # If rebase fails, abort to avoid leaving the repo stuck in a rebase state.
  if ! git rebase "origin/$BRANCH" >/dev/null 2>&1; then
    git rebase --abort >/dev/null 2>&1 || true
    exit 0
  fi
fi

# 1) Ingest new md files (if none, exits 0 and does nothing)
python3 "$ROOT_DIR/tools/inbox_ingest.py" --inbox "$INBOX_DIR" --archive

# 2) If nothing changed, stop.
if [ -z "$(git status --porcelain)" ]; then
  exit 0
fi

# 3) Commit and push.
git add docs/posts docs/inbox/_processed 2>/dev/null || true

if git diff --cached --quiet; then
  exit 0
fi

DATE="$(date +%y%m%d)"
git commit -m "(docs)${DATE}-auto-publish"

UPSTREAM="$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null || true)"
if [ -z "$UPSTREAM" ]; then
  git push -u origin "$BRANCH"
else
  git push
fi
