# Wix CMS schema and permissions

**Status: proposed schema, matching `wix/velo/room-visualizer-page.js`. Not yet created on the
client's site (pending access).** Field *keys* matter to the page code; display names can be
anything. If you prefer other collection IDs or keys, change `COLLECTIONS` and the mapping in the
page code accordingly.

## Collections

### `VisualizerCategories`
| Field key | Type | Notes |
| --- | --- | --- |
| `title` | Text (primary) | Category name shown to customers |
| `contentType` | Text | `room`, `artwork` or `material` (case-insensitive; plurals accepted) |
| `displayOrder` | Number | Lower first |
| `available` | Boolean | Unticked = hidden in the visualizer |

### `VisualizerRooms`
| Field key | Type | Notes |
| --- | --- | --- |
| `title` | Text (primary) | Room name |
| `category` | Reference → `VisualizerCategories` | A category with content type `room` |
| `image` | Image | The room photo (JPEG/PNG/WebP; ideally 2000–3000 px wide) |
| `thumbnail` | Image (optional) | If empty a smaller copy of `image` is used |
| `description` | Text | Accessible description of the photo, e.g. "Kitchen with white cabinets and a hob under a hood" |
| `displayOrder` | Number | |
| `available` | Boolean | |
| `presetAreas` | Object/JSON (optional, advanced) | Ready-made print areas; **never required** — customers draw their own areas |

### `VisualizerArtwork`
| Field key | Type | Notes |
| --- | --- | --- |
| `title` | Text (primary) | |
| `category` | Reference → `VisualizerCategories` | Content type `artwork` |
| `image` | Image | The design at good resolution (long edge ≥ 2000 px recommended) |
| `thumbnail` | Image (optional) | |
| `displayOrder` | Number | |
| `available` | Boolean | |

### `VisualizerMaterials`
| Field key | Type | Default if empty | Effect in the preview |
| --- | --- | --- | --- |
| `title` | Text (primary) | — | Material name |
| `category` | Reference → `VisualizerCategories` | — | Content type `material` (Tile, Glass, Metal…) |
| `description` | Text | — | Short customer-facing note |
| `thumbnail` | Image (optional) | generated swatch | |
| `displayOrder`, `available` | Number, Boolean | — | |
| `opacity` | Number 0.05–1 | 1 | Below 1 lets the photographed surface show through (clear glass) |
| `gloss` | Number 0–1 | 0.2 | Soft sheen band |
| `roomShading` | Number 0–1 | 0.55 | How much of the photo's light and shadow stays on the print |
| `saturation` | Number 0–2 | 1 | Colour intensity |
| `brightness` | Number -1–1 | 0 | Exposure shift |
| `tintColor` | Text `#rrggbb` | `#ffffff` | Multiply tint (e.g. brass, green glass edge) |
| `tintStrength` | Number 0–1 | 0 | |
| `texture` | Text | `none` | `none`, `brushed`, `frosted`, `tile-grid`, `glass-block` |
| `textureStrength` | Number 0–1 | 0.5 | |
| `gridDensity` | Number 1–40 | 6 | Tiles/blocks across the frame height (visual only) |
| `groutColor` | Text `#rrggbb` | `#d9d6cf` | Joint colour |
| `tileLayout` | Text | `grid` | For `tile-grid`: `grid`, `brick` (½ offset), `third` (⅓ offset), `herringbone`, `hexagon`, `diamond` |
| `tileAspect` | Number 0.2–6 | 1 | Tile width : height for `grid`, `brick` and `third` (e.g. 3 for a 3 : 1 metro tile, 4 for planks) |

Out-of-range values are clamped by the editor; invalid items are skipped (and counted in the
`catalog-received` message), never shown broken. Customers can still change the tile layout and
proportion for their own preview; the CMS values are the starting point.

### Editor features (page code, not CMS)
`FEATURES` at the top of `wix/velo/room-visualizer-page.js` switches optional editor features for
the page: `patternMaker` (recolourable pattern generator in the Artwork tab) and `camera` (the
*Camera* button). Both default to `true`; set one to `false` to hide it. Patterns are generated in
the visitor's browser and need no CMS items.

### Optional `presetAreas` format
An array of objects in normalized image coordinates (0–1 across the photo's width/height):
```json
[{ "name": "Backsplash",
   "boundary": [{"x":0.05,"y":0.5},{"x":0.7,"y":0.47},{"x":0.7,"y":0.6},{"x":0.05,"y":0.65}],
   "exclusions": [[{"x":0.1,"y":0.52},{"x":0.13,"y":0.52},{"x":0.13,"y":0.56},{"x":0.1,"y":0.56}]],
   "perspective": [{"x":0.05,"y":0.5},{"x":0.7,"y":0.47},{"x":0.7,"y":0.6},{"x":0.05,"y":0.65}],
   "surfaceAspect": 4.5, "artworkId": null, "materialId": null }]
```
Staff do not need this. It exists so sample rooms can open with areas already drawn.

## Permissions

For **each** of the four collections (CMS → collection → *More actions / ⋯* → *Permissions & privacy*):

| Action | Who |
| --- | --- |
| View (read) content | **Anyone** (site visitors need to read the catalog) |
| Add / Update / Delete content | **Admin** (site owner and collaborators with CMS access) only |

Do **not** allow visitors or members to add, update or delete. The visualizer never writes to the
CMS.

Important: anything in these collections is effectively public, because anyone can read a
collection with "Anyone" read access. The `available` switch hides an item in the visualizer but
does **not** protect it. Keep unpublished drafts, prices or internal notes out of these
collections (e.g. in a separate admin-only collection) until they may be public.

Test permissions as a logged-out visitor on the **published** site; editor preview runs with the
owner's permissions and can hide problems.

## Paging and volume

The page code uses `limit(1000)` and follows `hasNext()/next()`, so collections larger than one
page are read completely. The editor accepts up to 2000 items per collection. For very large
libraries, consider adding search or lazy loading (not in the current scope).
