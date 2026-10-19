# Staff guide — managing the Room Visualizer content

You manage everything in the Wix dashboard **CMS** (Content Management). No code, no rebuild.
Changes saved in the CMS are read by the visualizer the next time a visitor opens or reloads the
page.

> Before the first use, someone with site access must create the four collections described in
> [`WIX_CMS_SCHEMA.md`](WIX_CMS_SCHEMA.md). This guide assumes they exist.

## Add a sample room

1. CMS → **VisualizerRooms** → *Add item*.
2. **Title**: the name customers see, e.g. "Bright kitchen".
3. **Category**: pick a room category (e.g. Kitchens). Missing? See *Add a category* below.
4. **Image**: upload the room photo. Good photos are sharp, evenly lit, taken from roughly in
   front of the surface, 2000–3000 px wide, JPEG.
5. **Description**: one sentence describing the photo for screen-reader users.
6. **Available**: ticked. **Display order**: a number (lower shows first).
7. Save. You do not need to draw areas — customers outline surfaces themselves.

## Add artwork

1. CMS → **VisualizerArtwork** → *Add item*.
2. Title, **Category** (an artwork category), **Image** (the design; long edge ≥ 2000 px is best).
3. Optional **Thumbnail** if the design needs a special preview crop.
4. Available ticked, display order, save.

## Add or change a material

1. CMS → **VisualizerMaterials** → *Add item* (or open an existing one).
2. Title, category (e.g. Glass), short description.
3. Preview settings — leave blank to use defaults:
   - **opacity** 0.05–1 (clear glass ≈ 0.7–0.85; opaque surfaces 1)
   - **gloss** 0–1 (matte 0–0.1, satin 0.2–0.35, gloss 0.5–0.75)
   - **roomShading** 0–1 (how much of the room's light/shadow shows on the print; 0.5–0.7 typical)
   - **texture**: `none`, `brushed` (metal), `frosted` (etched glass), `tile-grid` (tiles with
     joints), `glass-block`
   - **gridDensity**: tiles/blocks across the surface height (visual only); **groutColor** `#rrggbb`
   - **tileLayout** (only for `tile-grid`): `grid`, `brick`, `third`, `herringbone`, `hexagon` or
     `diamond`; **tileAspect**: tile width ÷ height for grid/brick/third (3 = 3 : 1 metro tile)
   - **tintColor** `#rrggbb` + **tintStrength** 0–1 for coloured metals or tinted glass
4. Save, open the visualizer page, apply the material to an area and compare with a real sample.
   These are visual approximations; adjust until they look right to you.

## Add a category

CMS → **VisualizerCategories** → *Add item*: **Title**, **contentType** = `room`, `artwork` or
`material`, display order, available. Then choose it in the item's **Category** field.

## Replace an image

Open the item, click the image field, upload the new file, save. The old file can stay in the
Media Manager or be deleted there afterwards.

## Hide or remove something

- **Hide temporarily**: untick **Available** (the item is no longer shown in the visualizer).
- **Remove**: delete the item.
- Hiding is **not** private: collection content can still be read by anyone. Do not put
  confidential prices or drafts in these collections.

## Make the change visible

Save in the CMS, then reload the visualizer page on the live site (a private/incognito window
shows what visitors see). If an item does not appear: is **Available** ticked, does it have an
**image**, and does its **category** have the right **contentType**?

## Patterns (no CMS work needed)

The **Pattern maker** in the Artwork tab generates recolourable seamless patterns (zellige,
quatrefoil, eight-point star, encaustic, herringbone, chevron, terrazzo, privacy dots…) in the
customer's browser. It needs no CMS items. To offer a specific pattern + colourway as a library
item instead, save a preview from the visualizer or export the design from your artwork software
and add it as normal artwork. The developer can switch the pattern maker or the camera button off
for the page (`FEATURES` in the page code).

## Helping a customer on the phone or in the showroom

- **Magic select** (wand tool): tap the surface; tap with *Across joints* on for tiled walls,
  glass blocks or a run of cabinet doors. Shift-tap adds, Alt-tap removes (on a phone: choose
  *Add* / *Subtract* in the bar above the photo). Then check the points and the perspective frame.
- **Camera**: takes a still photo of the room. If the browser or page blocks the live camera, the
  phone's camera app opens instead — both are fine.
- **Save image** creates a JPEG of the preview (with an "approximate" note) to send to the customer.

## What the visualizer does not do

It does not measure walls or produce print sizes, take orders or quotes, store customer photos,
or show live tracked AR (the camera only takes a still photo). Customer photos and uploads stay on
the customer's device.
