# 02 — Design blueprint

## 1. Experience thesis

For homeowners and business customers deciding on a printed surface, the editor should feel
**precise, calm and trustworthy** — a print-production workbench rather than a toy — by keeping
the room photo dominant, making every editable thing visibly handle-shaped, and speaking in plain
steps, so that customers reach a convincing preview of *their* wall quickly and ask for a quote
with confidence.

## 2. Territories considered

| | A. Print Studio (chosen) | B. Dark Lightbox | C. Guided Showroom |
| --- | --- | --- | --- |
| Proposition | Paper/ink workbench with print-production marks | Photo-editor darkness so images glow | Large step cards, one decision per screen |
| Layout | Stage + docked panel; numbered sections | Full-bleed dark canvas, floating tool palettes | Wizard with Back/Next |
| Type/colour | System sans + mono numerals; neutral paper, one accent | Light text on charcoal | Large friendly type, soft colours |
| Motif | Crop marks, registration-mark perspective handles, job-ticket step numbers | Glows, translucent palettes | Illustrated steps |
| Risk | Must not look like generic SaaS | Clashes with a typical light Wix site; contrast/mobile issues | Slow for multi-area editing; hides independence of areas |
| Score (fit 30 / task 25 / craft 20 / a11y 15 / feasibility 10) | **4.4** | 3.4 | 3.3 |

Chosen: **A**, borrowing C's short instructions inside each tab and B's dark stage surround
(only behind the photo) so the room reads clearly.

## 3. Distinctive system

- **Crop marks** at the photo corners frame the "proof".
- **Handle language by shape**: round dots = outline, red squares = cutouts (never printed),
  registration marks (circle + crosshair) = perspective frame, small "+" = add point. Shape, not
  only colour, distinguishes them.
- **Step numbers** (`01 Room`, `02 Print areas`, `03 Scene lighting`) like a print job ticket.
- **Dashed full-design outline** in Artwork mode shows exactly what is cropped.

## 4. Tokens (`src/styles.css`; all overridable by the Wix `THEME`)

| Token | Value | Use |
| --- | --- | --- |
| `--rv-paper` | `#f5f3ee` | App background |
| `--rv-surface` | `#ffffff` | Panels |
| `--rv-ink` / `--rv-ink-2` | `#1c1d20` / `#55575d` | Text (≥ 7:1 / ≈ 7:1 on white) |
| `--rv-accent` | `#1f6f78` | Actions, selection (≈ 5.8:1 on white) — placeholder until brand is known |
| `--rv-guide` | `#3cc4d2` | Perspective guides on the dark stage |
| `--rv-danger` | `#b4351f` | Cutouts, errors |
| `--rv-stage` | `#232427` | Stage surround |
| `--rv-radius` | `10px` | Corners |
| Fonts | system UI stack; mono for numbers | No external font loading (privacy, speed); site font via `THEME.fontFamily` |

## 5. Screen map

Single screen: top bar (title, demo badge, **Room** button, undo/redo, zoom) · stage (photo,
outlines, handles, badges, draw toolbar, toasts) · panel (Print areas list → selected area editor
with tabs Shape / Cutouts / Perspective / Artwork / Material → Scene lighting). Room picker is a
modal dialog (upload card, your photos, sample rooms by category). Status screens for loading,
errors, not-embedded.

## 6. Responsive behaviour

| Width | Behaviour |
| --- | --- |
| ≥ 1100 | Panel 384 px right; stage fills the rest |
| 900–1099 | Panel 340 px |
| < 900 | Stacked: compact header (room button on its own row), stage height = photo proportion (max 58 %), panel scrolls below |
| < 520 | Title hidden (mark + demo badge remain); zoom % hidden < 480 |
| Coarse pointer | 42 px tap targets, larger handles with 40+ px hit areas |

## 7. Motion

Only functional motion: button press (1 px), toast rise (180 ms), spinners, toggle slide. All
reduced to near-zero under `prefers-reduced-motion`. No scroll-jacking; the stage only blocks page
scrolling on handles, the artwork during artwork mode, and while drawing.

## 8. Accessibility

Real `<button>` handles with labels and arrow-key/Delete support; nudge pad; tabs with arrow keys;
labelled sliders with `aria-valuetext`; dialog via native `<dialog>`; live status messages;
visible focus ring; forced-colours safe handles.

## 9. Assets

Demo rooms/artwork generated from code (`scripts/generate-demo-assets.mjs`), labelled as demo.
Client photos, artwork, logo and colours: **pending from client**.
