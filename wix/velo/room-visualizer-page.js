// Velo page code for the Wix page that hosts the Room Visualizer.
//
// Install: open the page in the Wix editor, enable Dev Mode (Wix Editor) or open the Code panel
// (Wix Studio), select the page's code file and paste this file's contents. The HTML iframe
// element that shows the editor must have the ID set in ELEMENT_ID below.
//
// What it does: waits for the editor inside the iframe to announce `ready`, reads the four
// visualizer collections with wix-data (public read access), converts Wix media references to
// HTTPS image URLs and sends one serialisable catalog object back. Nothing here writes data.
//
// Keep the protocol in sync with src/bridge/protocol.ts in the editor source.
// PENDING VERIFICATION ON THE REAL SITE: wix:image URL conversion and the thumbnail transform.

import wixData from 'wix-data';

const ELEMENT_ID = '#roomVisualizer';
const PROTOCOL = 'uv-room-visualizer';
const VERSION = 1;

// Collection IDs as created in the CMS (see docs/WIX_CMS_SCHEMA.md).
const COLLECTIONS = {
  categories: 'VisualizerCategories',
  rooms: 'VisualizerRooms',
  artwork: 'VisualizerArtwork',
  materials: 'VisualizerMaterials',
};

// Optional: match the editor to the site's design. Leave null to keep the editor's defaults.
// Example: { accent: '#1f6f78', accentText: '#ffffff', fontFamily: 'Helvetica Neue, Arial, sans-serif', radius: 8 }
const THEME = null;

// Editor features that can be switched off for this site.
const FEATURES = { patternMaker: true, camera: true };

// Request smaller thumbnails from Wix media. Set to false if thumbnails do not load; the editor
// then falls back to the full image.
const USE_WIX_THUMBNAILS = true;

let catalogPromise = null;

$w.onReady(function () {
  const frame = $w(ELEMENT_ID);

  frame.onMessage(async (event) => {
    const msg = event.data;
    if (!msg || typeof msg !== 'object' || msg.protocol !== PROTOCOL || msg.version !== VERSION) return;
    if (msg.type !== 'ready' && msg.type !== 'retry-catalog') return; // 'catalog-received' needs no answer
    const requestId = typeof msg.requestId === 'string' ? msg.requestId.slice(0, 64) : null;

    if (msg.type === 'retry-catalog') catalogPromise = null;
    try {
      if (!catalogPromise) catalogPromise = loadCatalog();
      const payload = await catalogPromise;
      frame.postMessage({ protocol: PROTOCOL, version: VERSION, type: 'catalog', requestId, payload });
    } catch (err) {
      console.error('Room visualizer: could not load catalog', err);
      catalogPromise = null; // allow a retry
      frame.postMessage({
        protocol: PROTOCOL,
        version: VERSION,
        type: 'catalog-error',
        requestId,
        message: 'The rooms, artwork and materials could not be loaded. Please try again in a moment.',
      });
    }
  });
});

async function loadCatalog() {
  const [categories, rooms, artwork, materials] = await Promise.all([
    queryAll(COLLECTIONS.categories, (q) => q),
    queryAll(COLLECTIONS.rooms, (q) => q.include('category')),
    queryAll(COLLECTIONS.artwork, (q) => q.include('category')),
    queryAll(COLLECTIONS.materials, (q) => q.include('category')),
  ]);

  return {
    theme: THEME,
    features: FEATURES,
    categories: categories.filter(isAvailable).map((c) => ({
      id: c._id,
      name: c.title,
      kind: normaliseKind(c.contentType),
      order: numberOr(c.displayOrder, 0),
    })),
    scenes: rooms.filter(isAvailable).map((r) => ({
      id: r._id,
      title: r.title,
      categoryId: refId(r.category),
      imageUrl: imageUrl(r.image),
      thumbnailUrl: imageUrl(r.thumbnail) || thumbUrl(r.image, 480, 320),
      description: r.description || '',
      order: numberOr(r.displayOrder, 0),
      presets: Array.isArray(r.presetAreas) ? r.presetAreas : [],
    })),
    artwork: artwork.filter(isAvailable).map((a) => ({
      id: a._id,
      title: a.title,
      categoryId: refId(a.category),
      imageUrl: imageUrl(a.image),
      thumbnailUrl: imageUrl(a.thumbnail) || thumbUrl(a.image, 320, 200),
      order: numberOr(a.displayOrder, 0),
    })),
    materials: materials.filter(isAvailable).map((m) => ({
      id: m._id,
      name: m.title,
      categoryId: refId(m.category),
      thumbnailUrl: imageUrl(m.thumbnail),
      description: m.description || '',
      order: numberOr(m.displayOrder, 0),
      // Blank fields are omitted so the editor uses its defaults.
      params: compact({
        opacity: m.opacity,
        gloss: m.gloss,
        shading: m.roomShading,
        saturation: m.saturation,
        brightness: m.brightness,
        tint: m.tintColor,
        tintStrength: m.tintStrength,
        texture: m.texture,
        textureStrength: m.textureStrength,
        gridDensity: m.gridDensity,
        groutColor: m.groutColor,
        tileLayout: m.tileLayout,
        tileAspect: m.tileAspect,
      }),
    })),
  };
}

/** Reads every item of a collection, following pages past the 1000-item query limit. */
async function queryAll(collectionId, build) {
  let result = await build(wixData.query(collectionId)).limit(1000).find();
  const items = result.items.slice();
  while (result.hasNext()) {
    result = await result.next();
    items.push(...result.items);
  }
  return items;
}

// "Available" is a display switch for the visualizer, not a privacy control: anything in a
// publicly readable collection can be read by visitors. Keep unpublished drafts out of these
// collections (see docs/WIX_CMS_SCHEMA.md).
function isAvailable(item) {
  return item.available !== false;
}

function normaliseKind(value) {
  const v = String(value || '').trim().toLowerCase();
  if (v.startsWith('room') || v === 'scene' || v === 'scenes') return 'room';
  if (v.startsWith('artwork') || v === 'art' || v === 'design' || v === 'designs') return 'artwork';
  if (v.startsWith('material') || v === 'finish' || v === 'finishes') return 'material';
  return v;
}

function refId(ref) {
  if (!ref) return null;
  if (typeof ref === 'string') return ref;
  return ref._id || null;
}

function numberOr(v, fallback) {
  return typeof v === 'number' && isFinite(v) ? v : fallback;
}

function compact(obj) {
  const out = {};
  Object.keys(obj).forEach((k) => {
    if (obj[k] !== undefined && obj[k] !== null && obj[k] !== '') out[k] = obj[k];
  });
  return out;
}

/** Media ID from a Wix image value, e.g. "wix:image://v1/abc123~mv2.jpg/name.jpg#originWidth=…". */
function mediaId(value) {
  if (typeof value !== 'string') return null;
  const m = /^wix:image:\/\/v1\/([^/#]+)/.exec(value);
  return m ? m[1] : null;
}

function imageUrl(value) {
  if (!value) return null;
  if (typeof value === 'string' && value.startsWith('https://')) return value;
  const id = mediaId(value);
  return id ? `https://static.wixstatic.com/media/${id}` : null;
}

function thumbUrl(value, w, h) {
  const id = mediaId(value);
  if (!id || !USE_WIX_THUMBNAILS) return null;
  return `https://static.wixstatic.com/media/${id}/v1/fill/w_${w},h_${h},al_c,q_80/${encodeURIComponent(id)}`;
}
