# 04 — QA acceptance checklist

Statuses: `VERIFIED_PASS` (with evidence), `IMPLEMENTED_NOT_TESTED`, `BLOCKED_EXTERNAL`,
`NOT_APPLICABLE`. Evidence paths are in this repository. Environment: headless Chromium 141 with
software WebGL, 2026-10-19.

## 1. Scope (REQ → acceptance)

| Test | REQ | Scenario | Expected | Evidence | Status |
| --- | --- | --- | --- | --- | --- |
| QA-01 | 002, 003 | Open sample room; upload own photo | Room shows; upload replaces room, areas empty | `tests/e2e/editor.spec.ts` A01, A15 | VERIFIED_PASS |
| QA-02 | 005, 006 | Apply library and uploaded artwork | Both render on selected area | e2e A01/A02, A15 | VERIFIED_PASS |
| QA-03 | 010 | Draw L-shape; add/move/remove points | 6→7→6 points; print clipped to L | e2e A03 (pixel test) | VERIFIED_PASS |
| QA-04 | 011 | Socket cutout inside backsplash | Photo pixel preserved in cutout | e2e A04 (pixel test) | VERIFIED_PASS |
| QA-05 | 013 | Grid artwork on angled wall | Lines converge with the wall, no seams | `docs/screenshots/feature-perspective-grid.png`; unit tests | VERIFIED_PASS |
| QA-06 | 007 | Resize/move artwork | Outline and cutouts unchanged | e2e A06 | VERIFIED_PASS |
| QA-07 | 009, 019 | Two areas, different settings, delete one | Independent; undo restores | e2e A07 | VERIFIED_PASS |
| QA-08 | 016, 017 | Material + lighting | Render changes; values shown | e2e A08 | VERIFIED_PASS |
| QA-09 | 004 | Switch rooms and back | No geometry carried over; restored on return | e2e A09 | VERIFIED_PASS |
| QA-10 | 014 | Resize viewport, zoom, DPR 3 | Handles stay on geometry (±0.4 %) | e2e A10, touch A10 | VERIFIED_PASS (Chromium only) |
| QA-11 | 022 | Staff add/edit in Wix CMS reaches visualizer | Change visible after reload | — | BLOCKED_EXTERNAL (no site access) |
| QA-12 | 022 | Visitor cannot write collections | Writes refused | — | BLOCKED_EXTERNAL |
| QA-13 | 021 | Editor in real Wix page over HTTPS | Catalog arrives, images load, sizing usable | Simulator: `tests/e2e/wix-harness.spec.ts` | VERIFIED_PASS (simulated) / BLOCKED_EXTERNAL (live) |
| QA-14 | 009, 026 | Touch: select, reshape, pan, pinch, draw | All work; background drag doesn't edit | `tests/e2e/touch.spec.ts` | VERIFIED_PASS (emulated touch) |
| QA-15 | 008, 012, 024, 028, 029 | Bad files, invalid geometry, CMS error, empty catalog, missing image, GPU loss | Recoverable messages | e2e A15, harness tests, context-loss test | VERIFIED_PASS |
| QA-16 | 030 | Build from docs | `npm ci && npm run build` succeeds | Verification report | VERIFIED_PASS |

## 2. Visual checks by viewport

| Width | Evidence | Status |
| --- | --- | --- |
| 1440 | `docs/screenshots/viewport-1440.png` | VERIFIED_PASS |
| 1024 | `docs/screenshots/viewport-1024.png` | VERIFIED_PASS |
| 768 | `docs/screenshots/viewport-768.png` | VERIFIED_PASS |
| 390 | `docs/screenshots/viewport-390.png` | VERIFIED_PASS |
| 360 | `docs/screenshots/viewport-360.png` | VERIFIED_PASS |
| Real devices (iOS Safari, Android Chrome) | — | BLOCKED_EXTERNAL (no devices) |
| Firefox, Edge, desktop Safari | — | BLOCKED_EXTERNAL (not available in environment) |

## 3. Accessibility

| Check | Status |
| --- | --- |
| Landmarks (header/main/aside), heading order | VERIFIED_PASS (code review) |
| Keyboard: tabs (arrows), handles (arrows/Shift/Delete), sliders, dialog Escape | VERIFIED_PASS (e2e uses keyboard for handles and sliders) |
| Visible focus ring | VERIFIED_PASS (CSS `:focus-visible`) |
| Alternative to dragging (nudge pad, sliders) | VERIFIED_PASS |
| Contrast of text/accent | VERIFIED_PASS (calculated: accent ≈ 5.8:1) |
| Reduced motion | IMPLEMENTED_NOT_TESTED (media query present) |
| Automated scanner (axe) | NOT RUN |

## 4. Build / runtime

| Check | Status |
| --- | --- |
| Typecheck, lint, 32 unit tests, 18 e2e tests | VERIFIED_PASS |
| Console errors | Not systematically asserted in e2e; manual screenshot runs of the demo printed no console output |
| Bundle | 97 kB gzip JS, 6 kB gzip CSS |

## 5. Release readiness

Ready for installation on the client's Wix site once access is provided. Not yet installed.
