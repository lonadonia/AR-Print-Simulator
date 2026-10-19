# 03 — Master prompt for continued development (paste into a fresh Claude Code session)

You are continuing the **UV Print Room Visualizer**: a photo-based room visualizer for a UV
printing company, embedded in the company's existing Wix site through an HTML iframe element.
Your job is to take it from "working editor + integration package" to "installed and verified on
the real Wix site", without reducing scope or making unverified claims.

## Source of truth (read all before changing anything)

1. `README.md` — status table, commands, configuration.
2. `design-handoff/uv-room-visualizer/01_CLIENT_BRIEF_ANALYSIS.md` — REQ-001…REQ-030 and assumptions.
3. `docs/WIX_INTEGRATION.md`, `docs/WIX_CMS_SCHEMA.md`, `docs/STAFF_GUIDE.md`, `docs/MAINTENANCE.md`.
4. `docs/VERIFICATION_REPORT.md` — what is verified and what is pending.
5. `docs/PROPOSAL_COST_TIMELINE.md` — commitments, exclusions, costs.
If the original client brief is available (`CLAUDE_PROJECT_BRIEF_3.md`), it overrides these docs.

## Guardrails

- Keep the existing stack (Vite, React 19, TypeScript, WebGL renderer). Do not add Konva, OpenCV,
  Three.js or paid services without a measured need and the owner's approval.
- It is a **photo visualizer**. Do not add a camera button or describe anything as live AR.
- Never put CMS credentials or tokens in the bundle; all `VITE_*` values are public.
- Do not grant anonymous write access to collections. Do not silently fall back to demo content
  when the production catalog fails.
- Do not claim a browser/device/site was tested unless you ran it there.
- Inspect `git status` first; never discard others' changes; never force-push.

## Immovable requirements (summary)

Sample rooms and own photo upload; multiple independently configurable print areas with
multi-point concave outlines, editable cutouts, a separate 4-corner perspective frame, per-pixel
perspective rendering; library + own artwork with proportional placement, size, position,
rotation, fit/fill, optional repeat; per-area materials from the CMS with visible effects; scene
brightness/warmth; desktop mouse + mobile touch; Wix CMS content managed by staff without code;
handshake messaging with origin checks; honest loading/error/empty states; uploads processed
locally.

## Tasks

1. **Discover**: run `npm ci`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run e2e`.
   Record results.
2. **Inspect the Wix site** (when access exists): editor type, page layout, fonts, colours,
   spacing, mobile view, plan features. Record findings.
3. **CMS**: create the four collections exactly per `docs/WIX_CMS_SCHEMA.md`; set read = Anyone,
   write = Admin; add a few real items.
4. **Host the build** on the host the owner approved (HTTPS, framing allowed). Set
   `VITE_ALLOWED_PARENT_ORIGINS` to every published origin (and preview origin if needed).
5. **Install**: HTML iframe element (website address), ID `roomVisualizer`, page code from
   `wix/velo/room-visualizer-page.js`; set `THEME` from the site's brand.
6. **Verify on the published page as a logged-out visitor**: Chrome, Edge, Firefox, desktop
   Safari, real iPhone Safari, real Android Chrome. Check A01–A15 from the brief, including CMS
   edits reaching the visualizer (A11) and visitors being unable to write (A12). Verify
   `wix:image` conversion, thumbnails and CORS on Wix media; fix the page code if needed.
7. **Brand alignment**: adjust tokens in `src/styles.css` or `THEME`; keep contrast ≥ 4.5:1 for text.
8. **Fix** defects, re-run all checks, update `docs/VERIFICATION_REPORT.md` with real evidence.
9. **Deliver**: commit with clear messages, push to the authorized repository/branch, keep the
   build Vercel/static-host ready, deploy a **preview** only if authorized (never production
   without explicit approval), and report repo URL, branch, commit SHA, preview URL only if it
   exists and was checked.

## Definition of done

All MUST requirements verified on the real site with evidence; no open high-severity defects;
documentation updated; remaining limitations and any cost/timeline changes reported truthfully.

## Final report format

Files changed · commands and results · REQ/acceptance status table · repository URL, branch,
commit · deployment status/URL (only if real) · pending items and blockers.
