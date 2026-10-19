# Maintenance

## Local setup

```bash
npm ci                         # exact versions from package-lock.json
npm run dev -- --mode demo     # http://localhost:5173 with demo content
npm run typecheck && npm run lint && npm test
npm run e2e                    # needs a Playwright Chromium: npx playwright install chromium
```

Node.js 20.19+ is required (Vite 7). Tested with Node 22.22 / npm 10.9.

## Deploying an update

1. Make the change, run the checks above.
2. `npm run build` with the production `VITE_*` values (set them in the host's environment
   settings; see `.env.example`).
3. Deploy `dist/` (Vercel/Netlify/Cloudflare do this from the Git repository automatically).
4. The Wix page needs no change unless the editor URL changes. Reload the published page to check.

Keep the protocol in `src/bridge/protocol.ts` and `wix/velo/room-visualizer-page.js` in sync; bump
`PROTOCOL_VERSION` in both if the message shape changes.

## Dependency updates

- `npm outdated`, then update one group at a time (React; Vite + plugin; TypeScript + ESLint;
  Vitest; Playwright). Run all checks after each group.
- `npm audit` after updates. Development-only tools are not shipped to visitors; the bundle only
  contains React and React DOM.
- Note: npm 10.9 hit an internal error ("Cannot read properties of null (reading 'edgesOut')")
  when resolving Vitest 4.1's optional peer dependencies. If it happens, install that package with
  `--legacy-peer-deps` once; `npm ci` from the lockfile works normally afterwards.

## Images and limits

| Limit | Value | Where |
| --- | --- | --- |
| Accepted uploads | JPEG, PNG, WebP (checked by file content, not name) | `src/imaging/imageHeader.ts` |
| Max upload file size | 25 MB | `src/imaging/loadImage.ts` (`IMAGE_LIMITS`) |
| Max decoded size | 60 megapixels; min 200 px per side | same |
| Working size | rooms ≤ 2560 px, artwork ≤ 2048 px long edge (and ≤ GPU limit) | same |
| Uploaded rooms kept per session | 3 (oldest dropped with its areas) | `src/Editor.tsx` |
| Uploaded artworks kept per session | 12 | same |

SVG, HTML, HEIC, GIF, TIFF, BMP and AVIF files are refused with a message. HEIC: iPhones usually
convert to JPEG when a photo is picked in the browser; if not, the message explains how.

## Demo content

`npm run assets:demo` regenerates the illustrated rooms, artworks and preset geometry
(`public/demo/`, `src/catalog/demoGeometry.json`). Demo content is only used when
`VITE_CATALOG_SOURCE=demo` and is labelled "Demo content" in the header.

## Browser support

Needs WebGL (1 or 2) with a stencil buffer — available in current Chrome, Edge, Firefox, Safari
(macOS/iOS) and Android Chrome. Without WebGL the editor shows a message and still allows
outlining. If the GPU resets, the preview shows a notice and recovers automatically.

## Troubleshooting

| Problem | Likely cause / fix |
| --- | --- |
| Blank preview, message about WebGL | Hardware acceleration off or blocked; try another browser. |
| Library images say "does not allow this image" | Image host lacks CORS headers; check Wix media behaviour (see `WIX_INTEGRATION.md`). |
| Editor waits forever then "did not arrive" | Page code missing / wrong element ID / origin not allow-listed. |
| Artwork looks stretched | Adjust *Perspective → Surface proportion*. |
| Area shows no artwork | Outline crosses itself or the perspective frame is folded — the area list shows "Needs attention". |

## Known limitations

- One planar projection per area: a corner or curved surface needs one area per flat face.
- Overlapping areas: the area lower in the list is drawn on top.
- Sizes are visual only; the photo is not calibrated, so no centimetres/print dimensions.
- Lighting and materials are preview approximations (no physical relighting or reflections).
- Editing state lives in the browser tab; reloading the page starts fresh (no saving/sharing, by scope).
