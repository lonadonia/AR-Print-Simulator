# 01 — Client brief analysis: UV Printing Room Visualizer for Wix

## 1. Project snapshot

| | |
| --- | --- |
| Client | UV printing business (tile, glass, metal, cabinet doors, glass blocks, partitions); name and brand not supplied |
| Project type | Interactive editing tool embedded in an existing Wix site (not a new website) |
| Phase | Contest entry; award USD 500 for development + Wix integration |
| Goal | Customers preview their own or library artwork on surfaces in a sample room or their own photo before ordering |
| Deliverables | Working editor, multiple independent print areas, desktop + mobile, Wix-managed content, source, integration, tests, fixes, maintenance docs |

## 2. Verified sources

| Source | Status |
| --- | --- |
| `CLAUDE_PROJECT_BRIEF_3.md` (uploaded, 271 lines) | Read in full |
| Client Wix site, URL, editor type, CMS, brand assets | **Not supplied — NOT VERIFIED** |
| Official Wix docs (HTML iframe element, Velo messaging, collection permissions) | Hosts blocked from the build environment; consulted through search summaries of the official pages (2026-10-19). Re-verify on the live site. |
| Repository | Empty at start (branch `claude/dreamy-clarke-5fvq5e`, no commits) |

## 3. What the client actually wants

A practical, maintainable visualizer — not a marketing site — where customers: choose/upload a
room; select or create print areas; shape them with draggable points and exclude obstacles;
choose library or own artwork; adjust size, position, perspective, material and appearance;
configure several areas independently; change background and lighting; and review on desktop or
mobile. Staff manage scenes, artwork, materials and categories in Wix without code.

## 4. Scope boundary

- **Build**: the photo visualizer (complete), Wix integration package (complete), docs/tests.
- **Mode**: photo visualization (AR vs photo explicitly left to the developer; live AR disclosed as separate).
- **Excluded**: storefront, checkout, accounts, CRM, quotes, export/sharing, AI segmentation,
  automatic detection, physical measurement, native apps, physically accurate lighting.

## 5. Requirements matrix

Status after implementation; evidence in `docs/VERIFICATION_REPORT.md` (VR) and `tests/e2e`.

| ID | Class | Source | Requirement | Pri | Implementation | Acceptance | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| REQ-001 | EXPLICIT | §2 | Disclose photo vs live AR; no fake camera/AR | MUST | README, proposal doc; no camera UI | A17 | Verified |
| REQ-002 | EXPLICIT | §4.1 | CMS-managed sample scenes with categories | MUST | `VisualizerRooms` + categories; room picker | A01, A11 | Implemented; live CMS pending |
| REQ-003 | EXPLICIT | §4.1 | Upload own room photo; orientation, resize, limits, errors | MUST | `imaging/*`, upload in room picker | A01, A15 | Verified |
| REQ-004 | EXPLICIT | §4.1 | Change background = choose another scene; geometry not carried over | MUST | per-scene docs in reducer | A09 | Verified |
| REQ-005 | EXPLICIT | §4.2 | Artwork + categories from Wix, not hardcoded in production | MUST | catalog via Velo; demo only in demo build | A02, A11 | Implemented; live CMS pending |
| REQ-006 | EXPLICIT | §4.2 | Own artwork upload, independent of room | MUST | Artwork tab upload | A02 | Verified |
| REQ-007 | EXPLICIT | §4.2 | Preserve proportions, placement/scale controls, no hidden cropping | MUST | placement model, dashed full-design outline, fit/fill | A06 | Verified |
| REQ-008 | EXPLICIT | §4.2 | Missing images, empty categories, slow/failed loads handled | MUST | thumbnail fallback, error + retry, empty states | A15 | Verified (simulator) |
| REQ-009 | EXPLICIT | §4.3 | Multiple areas; create/select/reshape/remove; mouse + touch | MUST | area list, badges, handles | A07, A14 | Verified |
| REQ-010 | EXPLICIT | §4.3 | Multi-point irregular/concave outlines; add/remove points | MUST | stencil even-odd fill; midpoints; Delete | A03 | Verified |
| REQ-011 | EXPLICIT | §4.3 | Editable obstacle exclusions | MUST | cutout polygons (draw/rect/edit) | A04 | Verified |
| REQ-012 | EXPLICIT | §4.3 | Reject invalid geometry; collapsed perspective | MUST | `validatePolygon`, `validateQuad`, refusal + messages | A15 | Verified |
| REQ-013 | EXPLICIT | §4.4 | Real perspective projection, no seams, clipped to region | MUST | per-pixel inverse homography in WebGL | A05 | Verified |
| REQ-014 | EXPLICIT | §4.4 | Image-relative coordinates; alignment across resize/DPR/zoom | MUST | normalized coords; DPR-aware canvas | A10 | Verified (Chromium) |
| REQ-015 | EXPLICIT | §4.4 | Visual sizing only; no physical-size claims | MUST | "visual scale only" copy | — | Verified |
| REQ-016 | EXPLICIT | §4.5 | Per-area material from staff library with visible effect | MUST | material params → shader | A08 | Verified |
| REQ-017 | EXPLICIT | §4.5 | Working lighting controls (brightness, warmth) as preview adjustments | MUST | Scene lighting panel | A08 | Verified |
| REQ-018 | EXPLICIT | §4.5 | Artwork may continue across tiles; no forced repeat | MUST | grout overlay over continuous image; repeat off by default | A08 | Verified |
| REQ-019 | EXPLICIT | §4.6 | Independent settings per area; deleting one keeps others | MUST | per-area state | A07 | Verified |
| REQ-020 | EXPLICIT | §4.6 | Predictable overlap, small areas selectable | SHOULD | list order = draw order (documented); numbered badges + list | A07 | Verified |
| REQ-021 | EXPLICIT | §5.2 | One supported Wix route; ready/data handshake; origin validation; no secrets | MUST | HTML iframe + Velo; `bridge/*` | A13 | Simulator verified; live pending |
| REQ-022 | EXPLICIT | §5.3 | Staff manage content without code; schema + permissions documented | MUST | schema, staff guide | A11, A12 | Pending access |
| REQ-023 | EXPLICIT | §5.3 | Pagination past first page | MUST | `queryAll` with `hasNext/next` | — | Implemented; live pending |
| REQ-024 | EXPLICIT | §5.3 | Honest load error, never silent demo fallback | MUST | error screens; demo only by build flag | A15 | Verified |
| REQ-025 | EXPLICIT | §5.3 | Customer uploads stay local; disclosed | MUST | local processing; UI copy | — | Verified |
| REQ-026 | EXPLICIT | §6.2 | Clear workflow, instructions, accessible controls, keyboard alternative | MUST | tabs, instructions, nudge pad, focusable handles | A14 | Verified (manual + e2e) |
| REQ-027 | EXPLICIT | §6.2 | Restrained temporary visual system; no invented brand | MUST | token-based neutral system; Wix `THEME` hook | — | Verified |
| REQ-028 | EXPLICIT | §6.3 | Content-validated uploads; no active content | MUST | magic-byte sniffing | A15 | Verified |
| REQ-029 | EXPLICIT | §6.3 | GPU unavailable / context loss handled | MUST | renderer listeners + messages | A15 | Verified |
| REQ-030 | EXPLICIT | §9 | Source, lockfile, licenses, docs, verification report, cost/timeline disclosure | MUST | repository | A16, A17 | Verified |

## 6. Current experience audit

Not possible — the client site was not provided.

## 7. Contradictions, assumptions, missing inputs

| ID | Assumption / gap | Confidence | Risk | Validation |
| --- | --- | --- | --- | --- |
| A-001 | Photo visualization satisfies "AR simulator **or** photo visualizer" | High | Client expected live AR | Disclosed; ask before selection |
| A-002 | HTML iframe (URL mode) + Velo page code is available on the client's plan | Medium | Plan/editor restrictions | Inspect site |
| A-003 | `wix:image` → `static.wixstatic.com/media/<id>` and Wix media sends CORS headers | Medium | Library images unusable in WebGL | Test on site |
| A-004 | Lighting = scene brightness/warmth; backlit-glass products undefined | High | Specialized expectations | Ask client |
| A-005 | Print size = visual scale | High | Client wants dimensions | Ask client |

## 8. Dependencies and risks

Wix access; hosting decision (Vercel Hobby is non-commercial); real-device testing; client content.

## 9. Recommendation

Proceed with the delivered photo visualizer; obtain site access and content; install and verify per
`docs/WIX_INTEGRATION.md`.
