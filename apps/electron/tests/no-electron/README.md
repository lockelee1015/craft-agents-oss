# Renderer no-Electron tests

These tests validate onboarding routing logic without launching Electron main/preload.

## Run unit tests

```bash
bun run test:renderer:no-electron
```

## Screenshot harness

You can capture `screenshot-report.html` via any browser automation (Playwright/browser container) while serving repo root with a simple static server.


- `onboarding-ui-harness.html`: visual onboarding UI harness for screenshot validation without Electron runtime.
