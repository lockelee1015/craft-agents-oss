#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RELEASE_DIR="$ROOT_DIR/apps/electron/release"

cd "$ROOT_DIR"

load_env_files() {
  local env_file
  for env_file in "$ROOT_DIR/.env" "$ROOT_DIR/.env.local"; do
    if [[ -f "$env_file" ]]; then
      echo "Loading env file: $env_file"
      set -a
      # shellcheck disable=SC1090
      source "$env_file"
      set +a
    fi
  done
}

usage() {
  cat <<'EOF'
Usage:
  scripts/release-macos.sh signed
  scripts/release-macos.sh unsigned
  scripts/release-macos.sh verify

Modes:
  signed    Build signed + notarized macOS package (requires env vars).
  unsigned  Build unsigned local macOS package for personal/fork use.
  verify    Verify signature/notarization status for latest release artifacts.

Required env vars for signed:
  CSC_NAME
  APPLE_API_KEY
  APPLE_API_KEY_ID
  APPLE_API_ISSUER
EOF
}

require_env() {
  local key="$1"
  if [[ -z "${!key:-}" ]]; then
    echo "Missing required env: $key" >&2
    exit 1
  fi
}

normalize_csc_name() {
  if [[ "${CSC_NAME:-}" == Developer\ ID\ Application:* ]]; then
    CSC_NAME="${CSC_NAME#Developer ID Application: }"
    export CSC_NAME
    echo "Normalized CSC_NAME by removing 'Developer ID Application:' prefix."
  fi
}

resolve_app_path() {
  local path
  path="$(find "$RELEASE_DIR" -type d -name '*.app' -path '*/mac-*/*' | head -n 1 || true)"
  if [[ -z "$path" || ! -d "$path" ]]; then
    echo "Missing app bundle under $RELEASE_DIR/mac-*" >&2
    exit 1
  fi
  printf '%s' "$path"
}

resolve_dmg_path() {
  local path
  path="$(ls -t "$RELEASE_DIR"/MoonCake-*.dmg 2>/dev/null | head -n 1 || true)"
  if [[ -z "$path" || ! -f "$path" ]]; then
    echo "Missing dmg file under $RELEASE_DIR" >&2
    exit 1
  fi
  printf '%s' "$path"
}

build_signed() {
  require_env CSC_NAME
  require_env APPLE_API_KEY
  require_env APPLE_API_KEY_ID
  require_env APPLE_API_ISSUER
  normalize_csc_name

  bun run electron:build
  bunx electron-builder --config electron-builder.yml --project apps/electron --mac
  notarize_and_staple_dmg
}

build_unsigned() {
  bun run electron:build
  CSC_IDENTITY_AUTO_DISCOVERY=false bunx electron-builder --config electron-builder.yml --project apps/electron --mac
}

verify_release() {
  local app_path dmg_path
  app_path="$(resolve_app_path)"
  dmg_path="$(resolve_dmg_path)"

  echo "Verifying app: $app_path"
  codesign --verify --deep --strict --verbose=2 "$app_path"
  spctl -a -t exec -vv "$app_path"

  echo "Verifying dmg stapling: $dmg_path"
  xcrun stapler validate "$dmg_path"
}

notarize_and_staple_dmg() {
  local dmg_path
  dmg_path="$(resolve_dmg_path)"

  echo "Submitting dmg to notary service: $dmg_path"
  xcrun notarytool submit "$dmg_path" \
    --key "$APPLE_API_KEY" \
    --key-id "$APPLE_API_KEY_ID" \
    --issuer "$APPLE_API_ISSUER" \
    --wait

  echo "Stapling dmg ticket: $dmg_path"
  xcrun stapler staple "$dmg_path"
  xcrun stapler validate "$dmg_path"
}

main() {
  load_env_files
  local mode="${1:-}"
  case "$mode" in
    signed)
      build_signed
      ;;
    unsigned)
      build_unsigned
      ;;
    verify)
      verify_release
      ;;
    *)
      usage
      exit 1
      ;;
  esac
}

main "$@"
