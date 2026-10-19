# UV Print Room Visualizer (photo visualizer for Wix)

A browser-based **photo visualizer** that lets a UV-printing company's customers preview custom
artwork on surfaces in a sample room or in a photo of their own space — kitchen backsplashes,
printed glass, cabinet doors, glass blocks, partitions and other solid surfaces — and is embedded
in the company's existing Wix site through an HTML iframe element.

> **Mode disclosure.** This is **photo visualization**, not tracked live AR. Customers pick a sample
> room, upload a photo or take one with the device camera, select the surfaces (magic select and
> edge/corner snapping assist; the customer confirms and refines), and preview artwork on the
> **still photo**. The camera only captures a photo: there is no live overlay, plane tracking or
> measurement, and sizes are visual estimates. See
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

1. Choose a sample room (from the Wix CMS), upload a room photo (JPEG/PNG/WebP up to 25 MB, processed only in the browser) or **take one with the camera** — an in-page viewfinder with framing grid, level, torch and camera switch; tapping the view captures the photo *and* selects the tapped surface. Where the browser or the embedding page blocks live camera access, the phone's own camera app is offered instead.
2. Select surfaces precisely with a professional tool set:
   - **Magic select** (W): tap a wall, door, glass panel or tiled surface and its outline is found from the photo's colours and edges; obstacles inside it become cutouts and rectangular surfaces get a perspective frame. *Across joints* selects a whole tiled, glass-block or panelled surface in one tap; **Shift-tap adds**, **Alt-tap removes**, tolerance is adjustable.
   - **Pen** (P) point by point, **Rectangle** (R) corner to corner — points **snap** to corners and edges found in the photo and to existing points (Alt = no snap, Shift = 15° steps), with a **magnifier loupe** and live length/angle readout.
   - Edit: drag points, add points on any edge, drag inside the outline to move it, arrow-key nudging; L-shaped and stepped outlines work.
3. Add **cutouts** so obstacles (hob, hood, sockets, mirror, desk…) stay visible and unprinted.
4. Align a **perspective frame** with lines on the real surface; artwork is projected with true per-pixel perspective.
5. Choose a design: the library (marble & stone, tile designs, geometric, wood, nature, abstract, glass privacy, kids' rooms), the **Pattern Maker** (20 seamless recolourable patterns — zellige, Moroccan quatrefoil, eight-point star, encaustic, herringbone, chevron, terrazzo, fish scale, privacy dots and more — with 12 colourways or custom colours) or their own upload; resize, move (drag/pinch), rotate, fit/fill, repeat.
6. Pick a material per area (gloss/matte ceramic with **tile layouts**: grid, brick, ⅓ offset, herringbone, hexagon, diamond and adjustable tile proportion; clear/frosted/back-painted glass, brushed metals, lacquer, glass block, acrylic…) and fine-tune brightness, colour, opacity and room light on the print.
7. Add as many areas as needed — each keeps its own outline, cutouts, perspective, artwork, placement, material and settings; hide/show areas like layers.
8. Compare **before/after** with a slider, adjust scene brightness/warmth, and **save the preview** as a full-resolution JPEG (or share it on phones).
9. Change the room (geometry stays with the photo it was drawn on); undo/redo, zoom at the cursor, keyboard shortcuts (press ?) and a workflow stepper (Room · Surfaces · Design · Finish · Review).

## Technology and why

| Need | Choice |
| --- | --- |
| Lightweight static app inside a Wix iframe | **Vite + React 19 + TypeScript** (no server, ~127 kB gzipped JS) |
| Real perspective, concave outlines, cutouts, no seams | **WebGL** (1 or 2): even-odd stencil masks + per-pixel inverse homography in a fragment shader; tile layouts drawn procedurally in the shader |
| Precise selection | Own image analysis in TypeScript on a downscaled copy of the photo: CIELAB colour, Sobel + thin-line edge map, Shi–Tomasi corners, edge-aware region growing, contour tracing and simplification (no OpenCV, runs locally) |
| Patterns | Canvas 2D generators that tile seamlessly; nothing is downloaded |
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
| `npm test` | Unit tests (geometry, imaging, selection analysis, patterns, editor state, catalog adapter, messaging) |
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
  render/        WebGL renderer and shaders (materials, tile layouts, full-resolution snapshot)
  imaging/       upload validation, header sniffing, resizing, image store, photo analysis
                 (snapping, magic select)
  patterns/      Pattern Maker generators and colourways
  catalog/       catalog types, validation/adapter, demo fixtures (demo only)
  bridge/        Wix messaging protocol, origin allow-list, handshake
  state/         editor reducer (areas, tools, history, per-room memory), selectors, magic-select glue
  ui/            Stage (tool rail, canvas, handles, loupe, compare), panels, camera, dialogs
wix/velo/        page code to paste into the Wix page
wix/harness/     local Wix-page simulator (development only)
scripts/         demo asset generator, harness server, screenshot capture
tests/e2e/       Playwright tests mapped to the acceptance checks
docs/            integration, CMS, staff, maintenance, verification, proposal
```

## Ownership and licensing

Project source is marked `UNLICENSED` (all rights reserved) pending the ownership/licensing terms
of the contest award; third-party notices are in [`THIRD_PARTY_LICENSES.md`](THIRD_PARTY_LICENSES.md).
