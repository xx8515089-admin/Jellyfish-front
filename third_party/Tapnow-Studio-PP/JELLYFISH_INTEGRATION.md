# Jellyfish Integration

This directory contains the vendored source used by Jellyfish Free Canvas.

- Upstream revision: `a01e89f9f907a84d91290781d06da0772ab78fae`
- Native host route: `src/pages/canvas/CanvasStudioPage.tsx`
- Canvas component: `third_party/Tapnow-Studio-PP/src/App.jsx`
- Workspace adapter: `third_party/Tapnow-Studio-PP/src/jellyfishRuntime.js`

Jellyfish imports the canvas as a lazy React component. There is no iframe or
postMessage bridge in the runtime path. The adapter scopes localStorage and
IndexedDB names with the Jellyfish canvas workspace identifier so every canvas
keeps independent autosave and asset data.

Run the root project build to verify the integration:

```sh
pnpm run typecheck
pnpm run build
```