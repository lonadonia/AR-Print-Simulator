# UV Print Room Visualizer (photo visualizer for Wix)

A browser-based **photo visualizer** that lets a UV-printing company's customers preview custom
artwork on surfaces in a sample room or in a photo of their own space — kitchen backsplashes,
printed glass, cabinet doors, glass blocks, partitions and other solid surfaces — and is embedded
in the company's existing Wix site through an HTML iframe element.

> **Mode disclosure.** This is **photo visualization**, not live camera AR. Customers pick a sample
> room or upload/take a photo, outline the surfaces by hand, and preview artwork on them. There is
> no camera feed, plane tracking or automatic surface detection. See
> [`docs/PROPOSAL_COST_TIMELINE.md`](docs/PROPOSAL_COST_TIMELINE.md) for the live-AR option.

## Status at a glance

| Part | State |
| --- | --- |
| Editor (all customer workflow steps, desktop + touch) | Built and tested locally (unit + end-to-end, see [verification report](docs/VERIFICATION_REPORT.md)) |
| Wix integration code (Velo page code, messaging, CMS schema) | Written; tested against a **local Wix-page simulator** only |
| Installation on the client's real Wix site, live CMS, published-page test | **Pending access** — the site URL, editor type and collaborator access have not been provided |
| Client branding, photos, artwork, materials | **Not supplied** — the bundled content is clearly labelled demo content generated from code |
| Demo deployment | Vercel project `uv-room-visualizer-demo` (demo content) — currently behind Vercel Authentication; see [handoff](design-handoff/uv-room-visualizer/05_GITHUB_VERCEL_HANDOFF.md) |

## What customers can do

1. Choose a sample room (from the Wix CMS) or upload a room photo (JPEG/PNG/WebP up to 25 MB, processed only in the browser).
2. Select a preset print area or draw a new one by tapping/clicking around the surface.
3. Reshape it with draggable points (add points on any edge, remove points) — L-shaped and stepped outlines work.
4. Add **cutouts** so obstacles (hob, hood, sockets, mirror, desk…) stay visible and unprinted.
5. Align a **perspective frame** with lines on the real surface; artwork is projected with true per-pixel perspective.
6. Choose library artwork (by category) or upload their own design; resize, move (drag/pinch), rotate, fit/fill, optionally repeat.
7. Pick a material per area (tile with grout joints, clear/frosted/back-painted glass, brushed metal, glass block, lacquer…) and fine-tune brightness, colour, opacity and how much of the room's light and shadow shows on the print.
8. Add as many areas as needed — each keeps its own outline, cutouts, perspective, artwork, placement, material and settings.
9. Change the room (geometry stays with the photo it was drawn on) and adjust scene brightness/warmth.
10. Undo/redo, zoom, keyboard operation and nudge controls for precise edits.

## Technology and why

| Need | Choice |
| --- | --- |
| Lightweight static app inside a Wix iframe | **Vite + React 19 + TypeScript** (no server, ~97 kB gzipped JS) |
| Real perspective, concave outlines, cutouts, no seams | **WebGL** (1 or 2): even-odd stencil masks + per-pixel inverse homography in a fragment shader |
| Editing controls | HTML buttons for handles (focusable, touch-friendly) + SVG overlay for outlines |
| Wix data | Velo page code reads Wix CMS collections and sends a plain catalog object via the documented `postMessage`/`onMessage` APIs |

No Konva, OpenCV, Three.js or paid services are used. Runtime dependencies: `react`, `react-dom` (MIT).

## Quick start

Requirements: Node.js 20.19+ (tested with 22.22) and npm.

```bash
npm ci
npm run dev -- --mode demo     # editor with bundled demo content at http://localhost:5173
```

| Command | Purpose |
| --- | --- |
| `npm run build` | Production build for Wix (`dist/`), catalog comes from the Wix page |
| `npm run build:demo` | Demo build with bundled sample content (`dist/`) |
| `npm run typecheck` / `npm run lint` | TypeScript and ESLint |
| `npm test` | Unit tests (geometry, imaging, catalog adapter, messaging) |
| `npm run e2e` | Playwright end-to-end tests (builds demo + harness automatically) |
| `npm run build:harness && npm run harness` | Local Wix-page simulator at http://localhost:4174 |
| `npm run assets:demo` | Regenerate the demo rooms/artwork in `public/demo/` |

## Configuration (build time, public)

All `VITE_*` values end up in the public bundle — never put secrets there. See [`.env.example`](.env.example).

| Variable | Meaning |
| --- | --- |
| `VITE_CATALOG_SOURCE` | `wix` (production, default) or `demo` (bundled sample content) |
| `VITE_ALLOWED_PARENT_ORIGINS` | Comma-separated exact origins of the Wix pages allowed to talk to the editor |
| `VITE_ALLOWED_IMAGE_HOSTS` | Hosts allowed for catalog images (default `static.wixstatic.com`) |
| `VITE_APP_TITLE` | Title shown in the editor header |

## Deployment

The build is a static folder (`dist/`) that must be served over **HTTPS** and must allow being
framed by the Wix site. Any static host works (Vercel, Netlify, Cloudflare Pages, …).

**Vercel:** import the repository, framework preset **Vite**, build command `npm run build`,
output `dist`, and set the `VITE_*` variables in *Project Settings → Environment Variables*.
For a demo deployment set `VITE_CATALOG_SOURCE=demo`. No `vercel.json` is required. Note that
Vercel's Hobby plan is limited to non-commercial use; a business deployment needs a paid plan or
another host — see the cost notes in [`docs/PROPOSAL_COST_TIMELINE.md`](docs/PROPOSAL_COST_TIMELINE.md).

## Documentation

- [Wix installation and messaging](docs/WIX_INTEGRATION.md)
- [Wix CMS schema and permissions](docs/WIX_CMS_SCHEMA.md)
- [Staff guide: managing rooms, artwork, materials, categories](docs/STAFF_GUIDE.md)
- [Maintenance and troubleshooting](docs/MAINTENANCE.md)
- [Verification report](docs/VERIFICATION_REPORT.md)
- [Scope, cost and timeline disclosure](docs/PROPOSAL_COST_TIMELINE.md)
- [Design handoff (brief analysis, design system, QA checklist)](design-handoff/uv-room-visualizer/)
- [Third-party licenses](THIRD_PARTY_LICENSES.md)

## Project structure

```
src/
  geometry/      polygons, validation, hit testing, homography, artwork placement (pure, unit-tested)
  render/        WebGL renderer and shaders
  imaging/       upload validation, header sniffing, resizing, image store
  catalog/       catalog types, validation/adapter, demo fixtures (demo only)
  bridge/        Wix messaging protocol, origin allow-list, handshake
  state/         editor reducer (areas, history, per-room memory) and selectors
  ui/            Stage (canvas + handles) and panels
wix/velo/        page code to paste into the Wix page
wix/harness/     local Wix-page simulator (development only)
scripts/         demo asset generator, harness server, screenshot capture
tests/e2e/       Playwright tests mapped to the acceptance checks
docs/            integration, CMS, staff, maintenance, verification, proposal
```

## Ownership and licensing

Project source is marked `UNLICENSED` (all rights reserved) pending the ownership/licensing terms
of the contest award; third-party notices are in [`THIRD_PARTY_LICENSES.md`](THIRD_PARTY_LICENSES.md).
