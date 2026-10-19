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
- **Editing-tool grammar (round 2)**: a graphite stage with a vertical tool rail (Select, Magic
  select, Pen, Rectangle, Hand · Snap, Magnifier, Before/after · zoom), a contextual options bar
  above the photo and a status bar below (photo pixel coordinates, zoom, snap state) — the
  layout professionals know from photo/design tools. Active tool = solid accent; on/off toggles =
  outlined guide colour, so they never read as a second active tool. Snap markers are shaped by
  kind (square = photo corner, diamond = edge, circle = existing point / close outline) in a
  warm yellow that stays visible on any photo.

## 4. Tokens (`src/styles.css`; all overridable by the Wix `THEME`)

| Token | Value | Use |
| --- | --- | --- |
| `--rv-paper` | `#f3f2ef` | App background |
| `--rv-surface` | `#ffffff` | Panels |
| `--rv-ink` / `--rv-ink-2` | `#17181c` / `#4f525a` | Text (≥ 7:1 on white) |
| `--rv-chrome` … `--rv-chrome-ink-2` | `#1f2024` … `#a9abb1` | Tool rail, options and status bars |
| `--rv-snap` | `#ffd166` | Snap markers, level indicator |
| `--rv-accent` | `#1f6f78` | Actions, selection (≈ 5.8:1 on white) — placeholder until brand is known |
| `--rv-guide` | `#3cc4d2` | Perspective guides on the dark stage |
| `--rv-danger` | `#b4351f` | Cutouts, errors |
| `--rv-stage` | `#161719` | Stage surround (with a faint dot grid) |
| `--rv-radius` | `10px` | Corners |
| Fonts | system UI stack; mono for numbers | No external font loading (privacy, speed); site font via `THEME.fontFamily` |

## 5. Screen map

Single screen: top bar (brand, demo badge, **Room** button with thumbnail, workflow stepper
Room · Surfaces · Design · Finish · Review, undo/redo, shortcuts, **Camera**, **Save image**) ·
stage (options bar, tool rail, photo with outlines/handles/badges/snap markers, magnifier,
before/after divider, status bar, toasts) · panel (Print areas as layers with visibility → selected
area editor with tabs Shape / Cutouts / Perspective / Artwork (Design library | Pattern maker) /
Material (incl. tile layouts) → Scene lighting). Dialogs: room picker (camera, upload, your
photos, samples), full-screen camera, save image, keyboard shortcuts. Status screens for loading,
errors, not-embedded.

## 6. Responsive behaviour

| Width | Behaviour |
| --- | --- |
| ≥ 1100 | Panel 384 px right; stage fills the rest |
| 900–1099 | Panel 340 px |
| < 1600 | Stepper shows the current step's name only; hidden below 1100 |
| < 900 | Stacked: compact header (room button on its own row), tool rail becomes a horizontal row under the photo, status bar hidden, options bar only while a tool is active (two compact rows; the stage grows to make room), stage height = photo proportion (max 62 %, 68 % with a tool), panel scrolls below |
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
