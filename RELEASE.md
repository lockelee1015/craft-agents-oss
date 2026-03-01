# Release Guide (MoonCake)

This document describes the current packaging and release flow for the Electron app.

## Current Release Path

Use tag-based GitHub Actions release as the source of truth for production artifacts.

Workflow:
- `.github/workflows/electron-release.yml`
- Trigger: push tag `v*`

Artifacts:
- `MoonCake-<version>-arm64.dmg`
- `MoonCake-<version>-x64.dmg`
- matching `.zip` and `.blockmap` files

## Prerequisites

- GitHub repository access with permission to push tags
- Release signing secrets configured in GitHub Actions:
- `CSC_LINK`
- `CSC_KEY_PASSWORD`
- `CSC_NAME`
- `APPLE_API_KEY_P8`
- `APPLE_API_KEY_ID`
- `APPLE_API_ISSUER`

Optional local tooling (for local packaging only):
- Bun `>= 1.3.x`
- Node `>= 20`
- Xcode command line tools (macOS)

## Production Release Steps (Recommended)

1. Ensure `main` contains all intended release commits.
2. Push `main`.
3. Create and push a release tag:

```bash
git checkout main
git pull --ff-only
git tag -a v0.0.6 -m "Release v0.0.6"
git push origin v0.0.6
```

4. Open GitHub Actions and watch `Electron Release`:

```bash
gh run list --workflow "Electron Release" --limit 5
gh run view <run-id>
```

5. Verify the run is successful and assets are attached to the corresponding GitHub Release.

## What the CI Workflow Does

The release workflow now explicitly prepares runtime dependencies before packaging:

- Copies Claude Agent SDK into `apps/electron/node_modules/@anthropic-ai/claude-agent-sdk`
- Downloads Bun runtime per architecture and places it in `apps/electron/vendor/bun/bun`
- Builds and publishes arm64 and x64 macOS artifacts separately

This avoids the historical runtime failures:
- `Claude Code SDK not found`
- `Bundled Bun runtime not found`

## Local Packaging (Debug / Verification)

Unsigned local package:

```bash
bash scripts/release-macos.sh unsigned
```

Signed and notarized local package:

```bash
export CSC_NAME="Developer ID Application: ..."
export APPLE_API_KEY="/path/to/AuthKey_XXXX.p8"
export APPLE_API_KEY_ID="..."
export APPLE_API_ISSUER="..."
bash scripts/release-macos.sh signed
```

Verify signature/notarization:

```bash
bash scripts/release-macos.sh verify
```

Output directory:
- `apps/electron/release/`

## DMG UX Conventions

Current DMG configuration:
- Versioned filename: `MoonCake-${version}-${arch}.dmg`
- Window size: `540 x 380`
- Background image set includes 1x + 2x representations:
- `apps/electron/resources/dmg-background.png` (540x380)
- `apps/electron/resources/dmg-background@2x.png` (1080x760)
- `apps/electron/resources/dmg-background.tiff` (combined 1x/2x)

If you update the background image, regenerate `dmg-background.tiff`:

```bash
tiffutil -cathidpicheck \
  apps/electron/resources/dmg-background.png \
  apps/electron/resources/dmg-background@2x.png \
  -out apps/electron/resources/dmg-background.tiff
```

## Versioning Notes

- Release version is taken from the tag name (`vX.Y.Z`) inside CI.
- CI injects that version into electron-builder metadata.
- DMG artifact names and app version metadata follow that release version.

## Quick Rollback

If a bad release tag was pushed:

1. Delete GitHub Release assets/release entry.
2. Delete remote tag:

```bash
git push origin :refs/tags/v0.0.6
```

3. Create a new fixed tag (for example `v0.0.7`) from corrected `main`.

## Troubleshooting

### CI fails in packaging with missing SDK

Check workflow step:
- `Prepare Claude Agent SDK For Packaging`

### App starts but reports missing Bun runtime

Check workflow steps:
- `Prepare Bun Runtime (arm64)`
- `Prepare Bun Runtime (x64)`

### DMG window too large or background blurry

Check:
- `dmg.window.width/height` in `apps/electron/electron-builder.yml`
- 1x/2x image dimensions match window size
- `dmg-background.tiff` rebuilt from updated PNG files
