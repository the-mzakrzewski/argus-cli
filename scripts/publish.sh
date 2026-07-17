#!/usr/bin/env bash
#
# Publishes @argusaudit/cli to npm.
#
# Credentials are deliberately NOT persisted: npm's userconfig is pointed at a
# temp file, so the token never reaches ~/.npmrc, and deleting that file on exit
# is the logout. Run this directly (./scripts/publish.sh) rather than via an
# agent, so the token is typed interactively and stays out of shell history.
#
# Auth: a granular access token scoped to @argusaudit with "Bypass 2FA" enabled.
# The registry refuses any publish that has neither 2FA nor such a token, so this
# is required even with account 2FA turned off. Create one at:
#   npmjs.com/settings/~/tokens/granular-access-tokens/new
# Give it a short expiry and delete it when done — unlike an OTP, it stays valid
# and can publish on your behalf until revoked.
#
# `npm publish` runs prepublishOnly -> pnpm run build, so dist/ is always rebuilt
# from current source. Never publish without that: dist/ is gitignored and goes
# stale silently.

set -euo pipefail

cd "$(dirname "$0")/.."

NPM_CONFIG_USERCONFIG="$(mktemp)"
export NPM_CONFIG_USERCONFIG

cleanup() {
    rm -f "$NPM_CONFIG_USERCONFIG"
    echo "Cleaned up: temporary npm credentials removed."
}
trap cleanup EXIT

read -rsp "npm granular access token: " NPM_TOKEN
echo
printf '//registry.npmjs.org/:_authToken=%s\n' "$NPM_TOKEN" > "$NPM_CONFIG_USERCONFIG"
unset NPM_TOKEN

# Fail fast on a bad token, before spending a build on it.
echo "==> Authenticated as: $(npm whoami)"

echo
echo "==> Tarball contents — verify BEFORE publishing (this is the last reversible point):"
npm pack --dry-run

PKG_NAME="$(node -p "require('./package.json').name")"
PKG_VERSION="$(node -p "require('./package.json').version")"

echo
echo "npm versions are permanent — $PKG_NAME@$PKG_VERSION can never be re-published, even after unpublishing."
read -rp "Publish $PKG_NAME@$PKG_VERSION to npm? [y/N] " confirm
[ "$confirm" = "y" ] || { echo "Aborted."; exit 1; }

npm publish --access public

echo
echo "Published. Verify with: npm view $PKG_NAME"
