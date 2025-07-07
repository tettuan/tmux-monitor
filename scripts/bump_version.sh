#!/bin/bash

# ============================================================================
# Automated Version Management Script for @aidevtool/tmux-monitor (Deno/JSR)
#
# Purpose:
#   - Ensures version consistency between deno.json and src/version.ts
#   - Handles version bumping (major/minor/patch) with atomic updates
#   - Performs pre-release checks (git status, local CI, GitHub Actions)
#   - Manages GitHub tags and JSR version synchronization
#   - Automatically commits, tags, and pushes version changes
#   - Prepares for JSR publication as @aidevtool/tmux-monitor
#
# Usage:
#   ./scripts/bump_version.sh [--major|--minor|--patch]
#   (default: --patch)
#
# Prerequisites:
#   - jq (for JSON processing)
#   - curl (for JSR API calls)
#   - gh CLI (optional, for GitHub Actions verification)
#   - Clean git working directory
#   - All tests passing locally
#
# Categories:
#   1. Status Checks
#      - Local Git Status Check
#      - Version Sync Check
#      - GitHub Actions Status Check (optional)
#      - JSR Version Check
#      - GitHub Tags Cleanup and Version Sync
#   2. Local CI
#      - Local CI Check
#      - JSR Pre-publish Check
#   3. New Version Bump
#      - New Version Generation
#      - Version Update (Atomic)
#      - Version Verification
#   4. Git Operations
#      - Git Commit
#      - Git Tag
#      - Push Changes
# ============================================================================

set -euo pipefail

# Constants
DENO_JSON="deno.json"
VERSION_TS="src/version.ts"
JSR_META_URL="https://jsr.io/@aidevtool/tmux-monitor/meta.json"

# Helper Functions
get_deno_version() {
  jq -r '.version' "$DENO_JSON"
}

get_ts_version() {
  grep 'export const VERSION' "$VERSION_TS" | sed -E 's/.*\"([0-9.]+)\".*/\1/'
}

# ============================================================================
# 1. Status Checks
# ============================================================================
echo "Running Status Checks..."

# 1.1 Branch Check
current_branch=$(git rev-parse --abbrev-ref HEAD)
if [[ "$current_branch" != "main" ]]; then
  echo "Error: You must be on the 'main' branch to run this script. Current branch: $current_branch"
  exit 1
fi

# 1.2 Git Push Check (main branch only)
if [[ -n "$(git log main --not --remotes)" ]]; then
  echo "Error: You have local commits on main branch that have not been pushed to the remote repository. Please push them first."
  exit 1
fi

# 1.3 Local Git Status Check
if [[ -n "$(git status --porcelain)" ]]; then
  echo "Error: You have uncommitted changes. Please commit or stash them first."
  exit 1
fi

# 1.4 Version Sync Check
deno_ver=$(get_deno_version)
ts_ver=$(get_ts_version)
if [[ "$deno_ver" != "$ts_ver" ]]; then
  echo "Error: Version mismatch between $DENO_JSON ($deno_ver) and $VERSION_TS ($ts_ver)"
  exit 1
fi

# 1.5 GitHub Actions Status Check
latest_commit=$(git rev-parse HEAD)
echo "Checking GitHub Actions status for commit: ${latest_commit:0:8}..."
if command -v gh >/dev/null 2>&1; then
  for workflow in "ci.yml" "publish.yml"; do
    echo "Checking $workflow..."
    if ! gh run list --workflow=$workflow --limit=1 --json status,conclusion,headSha 2>/dev/null | jq -e '.[0].status == "completed" and .[0].conclusion == "success" and .[0].headSha == "'$latest_commit'"' > /dev/null; then
      echo "Warning: Could not verify $workflow status. Please check manually at https://github.com/$(git config --get remote.origin.url | sed 's/.*github.com[:/]\(.*\)\.git/\1/')/actions"
      echo "Continuing with version bump..."
    else
      echo "✓ $workflow passed for latest commit"
    fi
  done
else
  echo "Warning: GitHub CLI (gh) not found. Skipping GitHub Actions status check."
  echo "Please verify manually that all workflows are passing before release."
fi

# 1.6 JSR Version Check
latest_jsr_version=$(curl -s "$JSR_META_URL" 2>/dev/null | jq -r '.versions | keys | .[]' | sort -V | tail -n 1 2>/dev/null || echo "0.0.0")
echo "Latest JSR published version: $latest_jsr_version"

# 1.7 GitHub Tags Cleanup and Version Sync
git fetch --tags
current_version=$(get_deno_version)
echo "Current version in deno.json: $current_version"

# Get latest local tag if any
latest_tag=$(git tag --list 'v*' | sed 's/^v//' | sort -V | tail -n 1 2>/dev/null || echo "0.0.0")
echo "Latest local tag: $latest_tag"

# 1.8 Version Consistency Check
jsr_ver="$latest_jsr_version"
git_tag_ver="$latest_tag"
deno_ver=$(get_deno_version)
ts_ver=$(get_ts_version)

echo "Current versions:"
echo "  JSR: $jsr_ver"
echo "  Git tag: $git_tag_ver"
echo "  deno.json: $deno_ver"
echo "  version.ts: $ts_ver"

# Check if deno.json and version.ts are in sync
if [[ "$deno_ver" != "$ts_ver" ]]; then
  echo "Error: Version mismatch between deno.json ($deno_ver) and version.ts ($ts_ver)"
  exit 1
fi

# If we have git tags, check consistency
if [[ "$git_tag_ver" != "0.0.0" ]]; then
  if [[ "$git_tag_ver" != "$deno_ver" ]]; then
    echo "Warning: Git tag ($git_tag_ver) != deno.json ($deno_ver)"
    echo "This is normal if you're preparing a new version."
  fi
fi

echo "✓ Version consistency check passed"

echo "✓ Status Checks passed"

# ============================================================================
# 2. Local CI
# ============================================================================
echo -e "\nRunning Local CI..."

# 2.1 Local CI Check
if ! bash scripts/local_ci.sh; then
  echo "Error: Local CI failed. Aborting version bump."
  exit 1
fi

# 2.2 JSR Pre-publish Check
echo "Running JSR pre-publish check..."
if ! deno publish --dry-run --allow-dirty > /dev/null 2>&1; then
  echo "Error: JSR pre-publish check failed. Please fix any issues before bumping version."
  echo "Run 'deno publish --dry-run' manually to see detailed error messages."
  exit 1
fi
echo "✓ JSR pre-publish check passed"

echo "✓ Local CI passed"

# ============================================================================
# 3. New Version Bump
# ============================================================================
echo -e "\nBumping Version..."

# 3.1 New Version Generation
bump_type="patch"
if [[ $# -gt 0 ]]; then
  case "$1" in
    --major) bump_type="major" ;;
    --minor) bump_type="minor" ;;
    --patch) bump_type="patch" ;;
    *) echo "Unknown bump type: $1"; exit 1 ;;
  esac
fi

# Use current version as base
current_version=$(get_deno_version)
IFS='.' read -r major minor patch <<< "$current_version"
case "$bump_type" in
  major) major=$((major + 1)); minor=0; patch=0 ;;
  minor) minor=$((minor + 1)); patch=0 ;;
  patch) patch=$((patch + 1)) ;;
esac
new_version="$major.$minor.$patch"
echo "Bumping version from $current_version -> $new_version"

# 3.2 Version Update (Atomic)
tmp_deno="${DENO_JSON}.tmp"
tmp_ts="${VERSION_TS}.tmp"

# Update deno.json version
jq --arg v "$new_version" '.version = $v' "$DENO_JSON" > "$tmp_deno"

# Update src/version.ts with proper formatting
cat > "$tmp_ts" <<EOF
// This file is auto-generated. Do not edit manually.
// The version is synchronized with deno.json.

/**
 * The current version of tmux-monitor, synchronized with deno.json.
 * @module
 */
export const VERSION = "$new_version";

/**
 * Returns the current version string.
 * @returns The version string
 */
export function getVersion(): string {
  return VERSION;
}

/**
 * Returns version information object.
 * @returns Object containing version details
 */
export function getVersionInfo(): {
  version: string;
  name: string;
  description: string;
} {
  return {
    version: VERSION,
    name: "@aidevtool/tmux-monitor",
    description: "A comprehensive tmux monitoring tool designed for command-line usage",
  };
}
EOF

# Atomically replace files
mv "$tmp_deno" "$DENO_JSON"
mv "$tmp_ts" "$VERSION_TS"

# Format the TypeScript file
deno fmt "$VERSION_TS" > /dev/null 2>&1

# 3.3 Version Verification
if [[ "$(get_deno_version)" != "$new_version" ]] || [[ "$(get_ts_version)" != "$new_version" ]]; then
  echo "Error: Version update failed."
  exit 1
fi

echo "✓ Version bump completed"

# ============================================================================
# 4. Git Operations
# ============================================================================
echo -e "\nPerforming Git Operations..."

# 4.1 Git Commit
git add "$DENO_JSON" "$VERSION_TS"
git commit -m "chore: bump version to $new_version

- Update version in deno.json and src/version.ts
- Maintain version consistency across project files
- Ready for JSR publication as @aidevtool/tmux-monitor@$new_version"

# 4.2 Git Tag
git tag "v$new_version"

# 4.3 Push Changes
git push
git push origin "v$new_version"

echo "✓ Git operations completed"

echo -e "\n🎉 Version bump completed successfully!"
echo "Version bumped to $new_version, committed, tagged, and pushed."
echo "JSR package: @aidevtool/tmux-monitor@$new_version"
echo -e "\nNext steps:"
echo "  1. Wait for GitHub Actions to complete"
echo "  2. Publish to JSR: deno publish"
echo "  3. Verify publication: https://jsr.io/@aidevtool/tmux-monitor"
echo "" 