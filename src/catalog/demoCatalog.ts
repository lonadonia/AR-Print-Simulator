import demoGeometry from './demoGeometry.json';
import { parseCatalog, type ParseResult } from './schema';

/**
 * DEMO CONTENT ONLY — illustrated sample rooms and generated artwork bundled with the editor for
 * development and the contest preview (`VITE_CATALOG_SOURCE=demo`). These are not the client's
 * photographs, products or catalogue. Production reads everything from the Wix CMS instead.
 */
const raw = {
  categories: [
    { id: 'room-kitchens', name: 'Kitchens', kind: 'room', order: 1 },
    { id: 'room-bathrooms', name: 'Bathrooms', kind: 'room', order: 2 },
    { id: 'room-commercial', name: 'Commercial', kind: 'room', order: 3 },
    { id: 'art-stone', name: 'Marble & stone', kind: 'artwork', order: 1 },
    { id: 'art-tile', name: 'Tile designs', kind: 'artwork', order: 2 },
    { id: 'art-pattern', name: 'Geometric', kind: 'artwork', order: 3 },
    { id: 'art-wood', name: 'Wood & natural', kind: 'artwork', order: 4 },
    { id: 'art-nature', name: 'Nature & landscapes', kind: 'artwork', order: 5 },
    { id: 'art-abstract', name: 'Abstract & art', kind: 'artwork', order: 6 },
    { id: 'art-glass', name: 'Glass privacy', kind: 'artwork', order: 7 },
    { id: 'art-kids', name: "Kids' rooms", kind: 'artwork', order: 8 },
    { id: 'mat-tile', name: 'Ceramic & porcelain', kind: 'material', order: 1 },
    { id: 'mat-glass', name: 'Glass', kind: 'material', order: 2 },
    { id: 'mat-metal', name: 'Metal', kind: 'material', order: 3 },
    { id: 'mat-cabinet', name: 'Cabinets & panels', kind: 'material', order: 4 },
    { id: 'mat-block', name: 'Glass block & partitions', kind: 'material', order: 5 },
  ],
  scenes: [
    {
      id: 'scene-kitchen',
      title: 'Kitchen with angled backsplash',
      categoryId: 'room-kitchens',
      imageUrl: 'demo/rooms/kitchen.jpg',
      thumbnailUrl: 'demo/rooms/thumbs/kitchen.jpg',
      description: 'Illustrated kitchen with green base cabinets, a range cooker with hood and a backsplash wall seen at an angle.',
      order: 1,
      presets: demoGeometry.kitchen,
    },
    {
      id: 'scene-bathroom',
      title: 'Bathroom with shower and vanity',
      categoryId: 'room-bathrooms',
      imageUrl: 'demo/rooms/bathroom.jpg',
      thumbnailUrl: 'demo/rooms/thumbs/bathroom.jpg',
      description: 'Illustrated bathroom with a walk-in shower behind a glass panel, a wall niche and a vanity with mirror.',
      order: 2,
      presets: demoGeometry.bathroom,
    },
    {
      id: 'scene-office',
      title: 'Reception with feature wall',
      categoryId: 'room-commercial',
      imageUrl: 'demo/rooms/office.jpg',
      thumbnailUrl: 'demo/rooms/thumbs/office.jpg',
      description: 'Illustrated reception area with a desk in front of a large feature wall and a glass-block partition.',
      order: 3,
      presets: demoGeometry.office,
    },
  ],
  artwork: [
    { id: 'art-carrara', title: 'Carrara veins', categoryId: 'art-stone', order: 1, file: 'carrara' },
    { id: 'art-calacatta', title: 'Calacatta gold', categoryId: 'art-stone', order: 2, file: 'calacatta' },
    { id: 'art-nero', title: 'Nero Marquina', categoryId: 'art-stone', order: 3, file: 'nero' },
    { id: 'art-emerald-onyx', title: 'Emerald onyx', categoryId: 'art-stone', order: 4, file: 'emerald-onyx' },
    { id: 'art-amber-onyx', title: 'Amber onyx (backlit look)', categoryId: 'art-stone', order: 5, file: 'amber-onyx' },
    { id: 'art-travertine', title: 'Travertine', categoryId: 'art-stone', order: 6, file: 'travertine' },
    { id: 'art-granite', title: 'Granite speckle', categoryId: 'art-stone', order: 7, file: 'granite' },
    { id: 'art-terrazzo', title: 'Terrazzo chips', categoryId: 'art-stone', order: 8, file: 'terrazzo' },
    { id: 'art-zellige', title: 'Zellige emerald', categoryId: 'art-tile', order: 9, file: 'zellige-emerald' },
    { id: 'art-encaustic', title: 'Encaustic blue', categoryId: 'art-tile', order: 10, file: 'encaustic-blue' },
    { id: 'art-lantern', title: 'Moroccan lantern', categoryId: 'art-tile', order: 11, file: 'moroccan-lantern' },
    { id: 'art-star', title: 'Eight-point star', categoryId: 'art-tile', order: 12, file: 'islamic-star' },
    { id: 'art-fishscale', title: 'Fish scale', categoryId: 'art-tile', order: 13, file: 'fish-scale' },
    { id: 'art-herringbone', title: 'Herringbone marble', categoryId: 'art-tile', order: 14, file: 'herringbone-marble' },
    { id: 'art-hex', title: 'Gilded hexagons', categoryId: 'art-tile', order: 15, file: 'hex' },
    { id: 'art-grid', title: 'Linear grid', categoryId: 'art-pattern', order: 16, file: 'grid' },
    { id: 'art-deco', title: 'Copper fans', categoryId: 'art-pattern', order: 17, file: 'deco' },
    { id: 'art-chevron', title: 'Chevron navy', categoryId: 'art-pattern', order: 18, file: 'chevron-navy' },
    { id: 'art-cubes', title: 'Tumbling cubes', categoryId: 'art-pattern', order: 19, file: 'cubes-terracotta' },
    { id: 'art-memphis', title: 'Memphis confetti', categoryId: 'art-pattern', order: 20, file: 'memphis' },
    { id: 'art-oak', title: 'Oak planks', categoryId: 'art-wood', order: 21, file: 'oak' },
    { id: 'art-walnut', title: 'Walnut planks', categoryId: 'art-wood', order: 22, file: 'walnut' },
    { id: 'art-bamboo', title: 'Bamboo grove', categoryId: 'art-wood', order: 23, file: 'bamboo' },
    { id: 'art-botanical', title: 'Botanical leaves', categoryId: 'art-nature', order: 24, file: 'botanical' },
    { id: 'art-palms', title: 'Palm fronds', categoryId: 'art-nature', order: 25, file: 'palms' },
    { id: 'art-mountains', title: 'Mountains at dusk', categoryId: 'art-nature', order: 26, file: 'mountains' },
    { id: 'art-clouds', title: 'Sky & clouds (ceilings)', categoryId: 'art-nature', order: 27, file: 'clouds' },
    { id: 'art-ocean', title: 'Ocean bands', categoryId: 'art-nature', order: 28, file: 'ocean' },
    { id: 'art-sunset', title: 'Sunset haze', categoryId: 'art-abstract', order: 29, file: 'sunset' },
    { id: 'art-fluid', title: 'Fluid ink', categoryId: 'art-abstract', order: 30, file: 'fluid-ink' },
    { id: 'art-watercolor', title: 'Watercolour wash', categoryId: 'art-abstract', order: 31, file: 'watercolor' },
    { id: 'art-ombre', title: 'Blue ombré', categoryId: 'art-abstract', order: 32, file: 'ombre' },
    { id: 'art-dots', title: 'Gradient dot screen', categoryId: 'art-glass', order: 33, file: 'dot-screen' },
    { id: 'art-frosted-leaves', title: 'Frosted leaves', categoryId: 'art-glass', order: 34, file: 'frosted-leaves' },
    { id: 'art-linear-fade', title: 'Linear fade', categoryId: 'art-glass', order: 35, file: 'linear-fade' },
    { id: 'art-starry', title: 'Starry night', categoryId: 'art-kids', order: 36, file: 'starry-night' },
    { id: 'art-rainbow', title: 'Rainbow arches', categoryId: 'art-kids', order: 37, file: 'rainbow-arches' },
  ].map(({ file, ...a }) => ({ ...a, imageUrl: `demo/artwork/${file}.jpg`, thumbnailUrl: `demo/artwork/thumbs/${file}.jpg` })),
  materials: [
    // Ceramic & porcelain
    m('mat-gloss-tile', 'Gloss ceramic tile', 'mat-tile', 'Printed glazed tiles; the design runs across the tiles with grout lines.', { gloss: 0.45, shading: 0.6, texture: 'tile-grid', textureStrength: 0.55, gridDensity: 5, groutColor: '#e6e3dc' }),
    m('mat-subway', 'Subway tile, brick bond', 'mat-tile', '3:1 tiles laid with a half offset.', { gloss: 0.5, shading: 0.6, texture: 'tile-grid', textureStrength: 0.6, gridDensity: 9, tileLayout: 'brick', tileAspect: 3, groutColor: '#f1efe9' }),
    m('mat-herringbone-tile', 'Herringbone tile', 'mat-tile', '2:1 tiles laid in a 45° herringbone.', { gloss: 0.35, shading: 0.6, texture: 'tile-grid', textureStrength: 0.6, gridDensity: 7, tileLayout: 'herringbone', groutColor: '#ece9e2' }),
    m('mat-hex-tile', 'Hexagon tile', 'mat-tile', 'Matte hexagonal tiles.', { gloss: 0.1, shading: 0.65, texture: 'tile-grid', textureStrength: 0.6, gridDensity: 5, tileLayout: 'hexagon', groutColor: '#d9d5cc' }),
    m('mat-diamond-tile', 'Diamond-laid tile', 'mat-tile', 'Square tiles turned 45°.', { gloss: 0.3, shading: 0.6, texture: 'tile-grid', textureStrength: 0.55, gridDensity: 4, tileLayout: 'diamond', groutColor: '#e6e3dc' }),
    m('mat-third-tile', 'Plank tile, ⅓ offset', 'mat-tile', '4:1 planks laid with a third offset.', { gloss: 0.15, shading: 0.65, texture: 'tile-grid', textureStrength: 0.5, gridDensity: 6, tileLayout: 'third', tileAspect: 4, groutColor: '#cfc9bf' }),
    m('mat-matte-tile', 'Matte large-format porcelain', 'mat-tile', 'Large tiles with a soft matte finish.', { gloss: 0.05, shading: 0.7, texture: 'tile-grid', textureStrength: 0.45, gridDensity: 2.5, groutColor: '#cfcac1' }),
    m('mat-porcelain-slab', 'Porcelain slab (no joints)', 'mat-tile', 'One continuous slab — the print has no grout lines.', { gloss: 0.3, shading: 0.65 }),
    m('mat-glass-mosaic', 'Glass mosaic', 'mat-tile', 'Small glossy glass tiles.', { gloss: 0.6, shading: 0.5, texture: 'tile-grid', textureStrength: 0.65, gridDensity: 14, groutColor: '#e8eaea' }),
    // Glass
    m('mat-clear-glass', 'Printed clear glass', 'mat-glass', 'Partially see-through print on clear glass.', { opacity: 0.78, gloss: 0.6, shading: 0.35, tint: '#e3f2ee', tintStrength: 0.25 }),
    m('mat-backpainted-glass', 'Back-painted glass splashback', 'mat-glass', 'Opaque glass panel with a high-gloss face.', { opacity: 1, gloss: 0.75, shading: 0.45 }),
    m('mat-frosted-glass', 'Frosted glass', 'mat-glass', 'Satin-etched glass that softens the print.', { opacity: 0.9, gloss: 0.12, shading: 0.4, texture: 'frosted', textureStrength: 0.7 }),
    m('mat-satin-glass', 'Satin glass', 'mat-glass', 'Light etch: soft sheen, colours stay rich.', { opacity: 0.95, gloss: 0.25, shading: 0.45, texture: 'frosted', textureStrength: 0.35 }),
    // Metal
    m('mat-brushed-aluminium', 'Brushed aluminium', 'mat-metal', 'Print on brushed metal; the grain shows through lighter areas.', { gloss: 0.3, shading: 0.55, saturation: 0.85, texture: 'brushed', textureStrength: 0.8, tint: '#dfe5ea', tintStrength: 0.2 }),
    m('mat-stainless', 'Brushed stainless steel', 'mat-metal', 'Cool, fine-grained steel finish.', { gloss: 0.4, shading: 0.55, saturation: 0.8, texture: 'brushed', textureStrength: 0.65, tint: '#e6ebef', tintStrength: 0.15 }),
    m('mat-brushed-brass', 'Brushed brass', 'mat-metal', 'Warm metal base under the print.', { gloss: 0.35, shading: 0.55, texture: 'brushed', textureStrength: 0.7, tint: '#e6c57d', tintStrength: 0.35 }),
    m('mat-brushed-copper', 'Brushed copper', 'mat-metal', 'Rosy metallic base under the print.', { gloss: 0.35, shading: 0.55, texture: 'brushed', textureStrength: 0.7, tint: '#e0a07a', tintStrength: 0.35 }),
    // Cabinets & panels
    m('mat-cabinet-lacquer', 'Gloss cabinet lacquer', 'mat-cabinet', 'Smooth lacquered cabinet doors.', { gloss: 0.55, shading: 0.65 }),
    m('mat-matte-door', 'Matte cabinet door', 'mat-cabinet', 'Soft-touch matte doors.', { gloss: 0.05, shading: 0.7 }),
    m('mat-wall-panel', 'Matte wall panel', 'mat-cabinet', 'Rigid printed panel with a matte surface.', { gloss: 0.05, shading: 0.7 }),
    m('mat-acp', 'Aluminium composite panel', 'mat-cabinet', 'Rigid, flat signage-grade panel with a satin face.', { gloss: 0.25, shading: 0.6 }),
    // Glass block & partitions
    m('mat-glass-block', 'Glass block', 'mat-block', 'Printed glass blocks with mortar joints.', { opacity: 0.8, gloss: 0.3, shading: 0.4, texture: 'glass-block', textureStrength: 0.75, gridDensity: 8, groutColor: '#c9d2d3' }),
    m('mat-acrylic', 'Acrylic partition', 'mat-block', 'Rigid acrylic sheet, slightly translucent.', { opacity: 0.9, gloss: 0.5, shading: 0.4 }),
    m('mat-frosted-partition', 'Frosted partition', 'mat-block', 'Etched-look privacy partition.', { opacity: 0.85, gloss: 0.1, shading: 0.35, texture: 'frosted', textureStrength: 0.6 }),
  ].map((mat, i) => ({ ...mat, order: i + 1 })),
};

function m(id: string, name: string, categoryId: string, description: string, params: Record<string, unknown>) {
  return { id, name, categoryId, description, params };
}

export function buildDemoCatalog(baseUrl: string): ParseResult {
  return parseCatalog(raw, { source: 'demo', allowedImageHosts: [], allowRelativeUrls: true, baseUrl });
}
