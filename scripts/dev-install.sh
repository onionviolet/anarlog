#!/usr/bin/env bash
# Build this fork and install it, in one command.
#
#   ./scripts/dev-install.sh              build release, install, relaunch
#   ./scripts/dev-install.sh --debug      much faster build, slower app
#   ./scripts/dev-install.sh --sync       fast-forward main from upstream first
#   ./scripts/dev-install.sh --no-launch  install without relaunching
#   ./scripts/dev-install.sh --build-only build and verify without replacing the app
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
BUILD_ONLY=0
CARGO_ARGS=()

for arg in "$@"; do
  case "$arg" in
    --debug)     PROFILE="debug"; TAURI_ARGS+=("--debug") ;;
    --sync)      SYNC=1 ;;
    --no-launch) LAUNCH=0 ;;
    --build-only) BUILD_ONLY=1 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

# cmake 4 refuses projects declaring a minimum below 3.5, and the pyannote
# diarization dependency declares 3.3.
export CMAKE_POLICY_VERSION_MINIMUM=3.5

cd "$REPO_ROOT"

if [ "$SYNC" -eq 1 ]; then
  echo "==> syncing main from upstream"
  git fetch upstream
  git merge --ff-only upstream/main
fi

node scripts/release-version.mjs --check
TARGET_DIR="$(cargo metadata --locked --no-deps --format-version 1 | node -e 'let input="";process.stdin.on("data",d=>input+=d);process.stdin.on("end",()=>console.log(JSON.parse(input).target_directory))')"
TARGET_TRIPLE="$(rustc -vV | sed -n 's/^host: //p')"
CONFIG_DIR="$(mktemp -d -t anarlog-local-build)"
CONFIG="$CONFIG_DIR/config.json"
trap 'rm -f "$CONFIG"; rmdir "$CONFIG_DIR"' EXIT
node - "$CONFIG" <<'JS'
const fs = require("node:fs");
const { version } = JSON.parse(fs.readFileSync("release-version.json", "utf8"));
fs.writeFileSync(process.argv[2], JSON.stringify({
  version,
  bundle: {
    createUpdaterArtifacts: false,
    externalBin: ["binaries/char-chrome-native-host", "binaries/check-permissions", "resources/cli/anarlog-cli"],
  },
}));
JS
export APP_VERSION="$(node -p 'require("./release-version.json").version')"
export VITE_APP_VERSION="$APP_VERSION"
export VITE_APP_URL="${VITE_APP_URL:-https://anarlog.so}"
export VITE_API_URL="${VITE_API_URL:-https://api.anarlog.so}"
if [ "$PROFILE" = release ]; then CARGO_ARGS+=("--release"); fi
cargo build --locked ${CARGO_ARGS[@]+"${CARGO_ARGS[@]}"} -p anarlog-cli -p chrome-native-host
mkdir -p apps/desktop/src-tauri/binaries apps/desktop/src-tauri/resources/cli
cp "$TARGET_DIR/$PROFILE/char-chrome-native-host" "apps/desktop/src-tauri/binaries/char-chrome-native-host-$TARGET_TRIPLE"
cp "$TARGET_DIR/$PROFILE/anarlog" "apps/desktop/src-tauri/resources/cli/anarlog-cli-$TARGET_TRIPLE"

echo "==> building (${PROFILE})"
( cd apps/desktop && pnpm tauri build --bundles app --config "$CONFIG" ${TAURI_ARGS[@]+"${TAURI_ARGS[@]}"} )
BUILT="$TARGET_DIR/$PROFILE/bundle/macos/${APP_NAME}.app"
[ -d "$BUILT" ] || { echo "no bundle at ${BUILT}" >&2; exit 1; }
EXPECTED_VERSION="$(node -p 'require("./release-version.json").version')"
ACTUAL_VERSION="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$BUILT/Contents/Info.plist")"
[ "$ACTUAL_VERSION" = "$EXPECTED_VERSION" ] || { echo "bundle version mismatch: $ACTUAL_VERSION != $EXPECTED_VERSION" >&2; exit 1; }

if security find-identity -v -p codesigning | grep -q "$SIGN_IDENTITY"; then
  echo "==> signing as '${SIGN_IDENTITY}' so permissions survive the rebuild"
  # No --options runtime: the hardened runtime adds library validation that a
  # self-signed identity does not need and can trip over.
  codesign --force --deep \
    --identifier "$BUNDLE_ID" --sign "$SIGN_IDENTITY" "$BUILT"
else
  echo "==> WARNING: no '${SIGN_IDENTITY}' certificate found."
  echo "    macOS will treat this build as a new app and ask for microphone and"
  echo "    system audio again. See FORK_SETUP.md, 'Keeping permissions across"
  echo "    rebuilds', to create the certificate once."
fi

codesign --verify --deep --strict "$BUILT"
if [ "$BUILD_ONLY" -eq 1 ]; then
  echo "==> verified ${EXPECTED_VERSION}: $BUILT"
  exit 0
fi

echo "==> installing to ${DEST}"
osascript -e "tell application \"${APP_NAME}\" to quit" >/dev/null 2>&1 || true
sleep 2
STAGED="${DEST}.next.$$"
PREVIOUS="${DEST}.previous.$$"
ditto "$BUILT" "$STAGED"
codesign --verify --deep --strict "$STAGED"
if [ -d "$DEST" ]; then mv "$DEST" "$PREVIOUS"; fi
if ! mv "$STAGED" "$DEST"; then
  [ ! -d "$PREVIOUS" ] || mv "$PREVIOUS" "$DEST"
  exit 1
fi
[ ! -d "$PREVIOUS" ] || echo "==> previous app retained at $PREVIOUS"
xattr -dr com.apple.quarantine "$DEST" 2>/dev/null || true
CLI_DIR="$HOME/.local/bin/.anarlog-cli/anarlog"
mkdir -p "$CLI_DIR"
cp "$DEST/Contents/MacOS/anarlog-cli" "$CLI_DIR/$EXPECTED_VERSION.next.$$"
mv "$CLI_DIR/$EXPECTED_VERSION.next.$$" "$CLI_DIR/$EXPECTED_VERSION"
ln -s "$CLI_DIR/$EXPECTED_VERSION" "$HOME/.local/bin/anarlog.next.$$"
mv -f "$HOME/.local/bin/anarlog.next.$$" "$HOME/.local/bin/anarlog"

if [ "$LAUNCH" -eq 1 ]; then
  echo "==> launching"
  open "$DEST"
fi

echo "==> done: $(defaults read "${DEST}/Contents/Info.plist" CFBundleShortVersionString 2>/dev/null || echo '?') (${PROFILE})"
