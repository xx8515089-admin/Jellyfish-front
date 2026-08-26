# Third-Party Notices

## Tapnow Studio PP

- Source: https://github.com/chapterv/Tapnow-Studio-PP
- Integrated revision: `a01e89f9f907a84d91290781d06da0772ab78fae`
- License: GNU General Public License v3.0
- Vendored source: `third_party/Tapnow-Studio-PP/`
- Jellyfish runtime entry: `src/pages/canvas/CanvasStudioPage.tsx`

The Free Canvas feature is compiled directly from the vendored Tapnow Studio PP
source as a lazy React component. Its original license is preserved at
`third_party/Tapnow-Studio-PP/LICENSE` and `public/canvas-studio/LICENSE.txt`.
Local integration code adds workspace-scoped browser storage and the Jellyfish
host route without removing upstream copyright or license terms.

## 3D Director Desk

- Updated source: https://github.com/xiaozangao/3d-director-desk
- Original source: https://github.com/jiguang132/storyai-3d-director-desk
- License: MIT
- Integrated runtime: `src/pages/directorDesk/runtime/`
- Preserved license: `src/pages/directorDesk/UPSTREAM_LICENSE.txt`

The 3D Director Desk is compiled as an isolated, lazy-loaded React application.
Its styles and overlays run inside a dedicated Shadow DOM instead of an iframe,
so the original editor remains independent without leaking global styles into
the surrounding Reelmax application.
