#!/usr/bin/env bash
# Netlify build-ignore gate.
# Exit 0 = SKIP build, Exit 1 = PROCEED with build (Netlify's inverted contract).
#
# Rules:
# - Production proceeds only if HEAD is tagged with a semver version tag.
# - Branch-deploys always proceed.
# - Deploy previews proceed only if the PR has the `preview` label.

set -uo pipefail

if [ "${CONTEXT:-}" == "production" ]; then
  git fetch --tags --quiet 2>/dev/null || true

  if git describe --tags --exact-match HEAD 2>/dev/null | grep -Eq '^v?[0-9]+\.[0-9]+\.[0-9]+$'; then
    echo "[should-deploy] HEAD is tagged with a version tag — proceeding"
    exit 1
  else
    echo "[should-deploy] HEAD has no version tag — skipping production build"
    exit 0
  fi
fi

if [ "${CONTEXT:-}" != "deploy-preview" ]; then
  exit 1
fi

if [ -z "${REVIEW_ID:-}" ]; then
  echo "[should-deploy] no REVIEW_ID; skipping preview build"
  exit 0
fi

if [ -z "${GITHUB_TOKEN:-}" ]; then
  echo "[should-deploy] GITHUB_TOKEN missing; cannot check labels — skipping"
  exit 0
fi

# REPOSITORY_URL looks like "https://github.com/owner/repo" or "git@github.com:owner/repo.git"
repo_path=$(echo "${REPOSITORY_URL:-}" \
  | sed -E 's#^https?://github\.com/##; s#^git@github\.com:##; s#\.git$##')

if [ -z "$repo_path" ]; then
  echo "[should-deploy] could not derive owner/repo from REPOSITORY_URL='$REPOSITORY_URL' — skipping"
  exit 0
fi

labels_json=$(curl -fsSL \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "https://api.github.com/repos/$repo_path/issues/$REVIEW_ID/labels" || true)

if [ -z "$labels_json" ]; then
  echo "[should-deploy] failed to fetch labels for PR #$REVIEW_ID — skipping"
  exit 0
fi

if echo "$labels_json" | grep -oE '"name"[[:space:]]*:[[:space:]]*"[^"]+"' \
  | sed -E 's/.*"([^"]+)"$/\1/' \
  | grep -qx "preview"; then
  echo "[should-deploy] PR #$REVIEW_ID has 'preview' label — proceeding"
  exit 1
fi

echo "[should-deploy] PR #$REVIEW_ID lacks 'preview' label — skipping"
exit 0