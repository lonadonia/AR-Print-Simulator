# Verification report

Date: 2026-10-19. Environment: Linux container, Node 22.22, Chromium 141 (Playwright 1.56,
headless, WebGL through SwiftShader software rendering). Commands and results below are the
actual runs; nothing listed as *not tested* should be read as passed.

## Automated checks

| Check | Command | Result |
| --- | --- | --- |
| TypeScript (app, tests, configs) | `npm run typecheck` | PASS |
| ESLint | `npm run lint` | PASS (0 problems) |
| Unit tests | `npm test` | PASS — 32 tests in 4 files |
| Production build (Wix mode) | `npm run build` | PASS — JS 303 kB (97 kB gzip), CSS 24 kB |
| Demo build | `npm run build:demo` | PASS |
| End-to-end | `npx playwright test` | PASS — 18 tests (16 desktop, 2 phone-touch) |

Unit tests cover: polygon validation (concave L-shape accepted; crossed, duplicate, flat, too few
points rejected), point-in-region with cutouts, vertex insert/remove, homography corner mapping,
inversion and collinearity (straight lines stay straight), foreshortening, folded/collapsed frame
rejection, corner ordering, artwork placement matrices, fit/fill, panning on the surface plane,
file sniffing by magic bytes (SVG/HTML/HEIC/GIF refused), PNG/JPEG/WebP header dimensions,
size/megapixel limits, working-size maths, catalog adapter (valid data, unsafe URLs, duplicates,
bad types, demo catalog), origin allow-list, protocol parsing, ready/catalog handshake with retries,
wrong-origin and wrong-source rejection, timeout.

## Acceptance checks (brief §8)

| ID | Evidence | Status |
| --- | --- | --- |
| A01 | e2e: sample room opens; e2e A15: a real photo upload becomes the room | PASS (local) |
| A02 | e2e: library artwork applied to an area; e2e A15: uploaded artwork applied and listed under "Your uploads" | PASS (local, demo/harness catalog) |
| A03 | e2e: L-shaped area drawn with 6 points; point dragged, added (+), removed (Delete), keyboard-nudged; pixel test: printed inside the L, photo unchanged in its notch | PASS |
| A04 | e2e pixel test: socket cutout keeps the original photo colour while the wall next to it is printed; harness/demo presets with faucet, mirror and desk cutouts | PASS |
| A05 | Screenshot `docs/screenshots/feature-perspective-grid.png`: grid artwork follows the angled backsplash; unit test for collinearity; per-pixel mapping has no mesh seams | PASS (visual + unit) |
| A06 | e2e: size/position sliders and dragging change the preview; outline and cutout handles unchanged | PASS |
| A07 | e2e: two areas with different artwork/material/brightness; selecting each shows its own settings; deleting one keeps the other; undo restores it | PASS |
| A08 | e2e: material change and "Warm evening" both change the rendered image; displayed values match (Warmth "Warm 70") | PASS |
| A09 | e2e: switching kitchen → bathroom shows only bathroom areas; returning restores kitchen areas including a newly drawn one | PASS |
| A10 | e2e: handle positions match preset geometry (±0.4 %) and stay aligned at 1440, 1024, 768, 1280 px and 150 % zoom; phone test at DPR 3 | PASS (emulated) |
| A11 | Staff guide + schema written; staff editing in the real Wix CMS **not tested** | PENDING ACCESS |
| A12 | Permissions documented (read: anyone; write: admin); **not tested** on a live collection | PENDING ACCESS |
| A13 | Simulated: editor in an iframe on another origin receives the catalog via handshake, theme applies, images load, late iframe load handled. **Not tested on the real Wix page.** | PASS (simulator) / PENDING ACCESS |
| A14 | e2e phone (touch events via Chrome DevTools Protocol): tap-select by badge and by area, drag point, background drag leaves geometry unchanged, one-finger artwork move, two-finger pinch resize, tap-draw new area. Desktop mouse flows in A03–A09. | PASS (emulated touch) |
| A15 | e2e: non-image, SVG disguised as PNG, 200 MP header, corrupt JPEG → messages, editor stays usable; crossed outline rejected with explanation; folded perspective refused; CMS error → retry works; empty catalog usable; missing library image shows "Image unavailable" and an error with retry; GPU context loss shows a notice and recovers | PASS |
| A16 | `npm ci && npm run build` from the documented steps; source, Wix code, config templates, lockfile, licenses and docs in the repository | PASS |
| A17 | `docs/PROPOSAL_COST_TIMELINE.md`, README status table | DONE |

## Visual review (screenshots in `docs/screenshots/`)

Captured with `node scripts/capture-screenshots.mjs` at 1440×900, 1024×768, 768×1024 (touch),
390×844 (DPR 2, touch) and 360×740 (DPR 2, touch), plus feature states (perspective grid,
cutouts, two areas with materials, warm lighting, room picker, office and bathroom scenes).
Inspected for overflow, clipped controls, legibility and alignment of outlines with the render.

## Bugs found and fixed during verification

1. Demo room generator drew floors/ceilings through the camera (missing near-plane clipping) → fixed.
2. Phone layout: header took three rows and the stage left large empty bands → compact header;
   stage height now follows the photo's proportions.
3. Pinch-to-resize failed when the second finger landed on an area's number badge → additional
   fingers now join the active artwork gesture.
4. The drawing toolbar covered the top of the photo, so taps near the top edge were lost on phones →
   toolbar moved into the layout above the photo.
5. Room thumbnails had very long accessible names (full description) → description now labels
   the preview canvas; thumbnails use the title.
6. SVG detection missed files starting with a UTF-8 byte-order mark → fixed and tested.
7. Library thumbnails with a failing (transformed) URL showed nothing → fall back to the full image,
   then to an "Image unavailable" placeholder.

## Not tested / limitations of this verification

- **Real Wix site**: editor/preview/published behaviour, Velo event wrapping, element sizing, CMS
  permissions as a visitor, `wix:image` conversion and thumbnail transforms, CORS headers on Wix
  media. All pending access.
- **Browsers/devices**: only Chromium (desktop and phone emulation) was run. Firefox, Edge, desktop
  Safari, iOS Safari and Android Chrome on real devices were **not available** and are not claimed.
- WebGL ran in software (SwiftShader); colours and performance on real GPUs may differ slightly.
  No performance benchmark numbers are claimed.
- No automated accessibility scanner (e.g. axe) was run. Manual measures: semantic landmarks and
  headings, labelled controls, visible focus, keyboard operation of tabs/handles/sliders, nudge
  pad alternative to dragging, reduced-motion styles, text contrast of primary colours checked by
  calculation (accent #1f6f78 on white ≈ 5.8:1).
