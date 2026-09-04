#!/usr/bin/env bash
# Build this fork and install it, in one command.
#
#   ./scripts/dev-install.sh              build release, install, relaunch
#   ./scripts/dev-install.sh --debug      much faster build, slower app
#   ./scripts/dev-install.sh --sync       fast-forward main from upstream first
#   ./scripts/dev-install.sh --no-launch  install without relaunching
#
# Why this exists: a locally built macOS app is ad-hoc signed, so its code
# signing identity changes on every build and macOS drops the microphone and
# system-audio grants that were tied to the old one. Signing each build with
# one stable identity is what keeps those grants across rebuilds.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_NAME="Anarlog Dev"
DEST="/Applications/${APP_NAME}.app"
SIGN_IDENTITY="${ANARLOG_SIGN_IDENTITY:-Anarlog Dev Self-Signed}"
BUNDLE_ID="com.hyprnote.dev"

PROFILE="release"
TAURI_ARGS=()
SYNC=0
LAUNCH=1

for arg in "$@"; do
  case "$arg" in
    --debug)     PROFILE="debug"; TAURI_ARGS+=("--debug") ;;
    --sync)      SYNC=1 ;;
    --no-launch) LAUNCH=0 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

# cmake 4 refuses projects declaring a minimum below 3.5, and the pyannote
# diarization dependency declares 3.3.
export CMAKE_POLICY_VERSION_MINIMUM=3.5
export PATH="/opt/homebrew/bin:$PATH"

cd "$REPO_ROOT"

if [ "$SYNC" -eq 1 ]; then
  echo "==> syncing main from upstream"
  git fetch upstream
  git merge --ff-only upstream/main
fi

echo "==> building (${PROFILE})"
( cd apps/desktop && pnpm tauri build "${TAURI_ARGS[@]}" ) || {
  # The updater signature step fails without TAURI_SIGNING_PRIVATE_KEY and is
  # the last thing tauri does, so a bundle on disk means the build itself was
  # fine. Anything else is a real failure.
  [ -d "${REPO_ROOT}/apps/desktop/src-tauri/target/${PROFILE}/bundle/macos/${APP_NAME}.app" ] \
    || { echo "build failed" >&2; exit 1; }
  echo "==> ignoring updater-signing failure; the bundle was produced"
}

BUILT="${REPO_ROOT}/apps/desktop/src-tauri/target/${PROFILE}/bundle/macos/${APP_NAME}.app"
[ -d "$BUILT" ] || { echo "no bundle at ${BUILT}" >&2; exit 1; }

if security find-identity -v -p codesigning | grep -q "$SIGN_IDENTITY"; then
  echo "==> signing as '${SIGN_IDENTITY}' so permissions survive the rebuild"
  codesign --force --deep --options runtime \
    --identifier "$BUNDLE_ID" --sign "$SIGN_IDENTITY" "$BUILT"
else
  echo "==> WARNING: no '${SIGN_IDENTITY}' certificate found."
  echo "    macOS will treat this build as a new app and ask for microphone and"
  echo "    system audio again. See FORK_SETUP.md, 'Keeping permissions across"
  echo "    rebuilds', to create the certificate once."
fi

echo "==> installing to ${DEST}"
osascript -e "tell application \"${APP_NAME}\" to quit" >/dev/null 2>&1 || true
sleep 2
rm -rf "$DEST"
ditto "$BUILT" "$DEST"
xattr -dr com.apple.quarantine "$DEST" 2>/dev/null || true

if [ "$LAUNCH" -eq 1 ]; then
  echo "==> launching"
  open "$DEST"
fi

echo "==> done: $(defaults read "${DEST}/Contents/Info.plist" CFBundleShortVersionString 2>/dev/null || echo '?') (${PROFILE})"
