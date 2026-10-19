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
    { id: 'art-stone', name: 'Stone & marble', kind: 'artwork', order: 1 },
    { id: 'art-pattern', name: 'Pattern', kind: 'artwork', order: 2 },
    { id: 'art-abstract', name: 'Abstract', kind: 'artwork', order: 3 },
    { id: 'art-nature', name: 'Nature', kind: 'artwork', order: 4 },
    { id: 'mat-tile', name: 'Ceramic tile', kind: 'material', order: 1 },
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
    { id: 'art-terrazzo', title: 'Terrazzo chips', categoryId: 'art-stone', order: 2, file: 'terrazzo' },
    { id: 'art-grid', title: 'Linear grid', categoryId: 'art-pattern', order: 3, file: 'grid' },
    { id: 'art-hex', title: 'Gilded hexagons', categoryId: 'art-pattern', order: 4, file: 'hex' },
    { id: 'art-deco', title: 'Copper fans', categoryId: 'art-pattern', order: 5, file: 'deco' },
    { id: 'art-ocean', title: 'Ocean bands', categoryId: 'art-abstract', order: 6, file: 'ocean' },
    { id: 'art-sunset', title: 'Sunset haze', categoryId: 'art-abstract', order: 7, file: 'sunset' },
    { id: 'art-botanical', title: 'Botanical leaves', categoryId: 'art-nature', order: 8, file: 'botanical' },
  ].map(({ file, ...a }) => ({ ...a, imageUrl: `demo/artwork/${file}.jpg`, thumbnailUrl: `demo/artwork/thumbs/${file}.jpg` })),
  materials: [
    {
      id: 'mat-gloss-tile',
      name: 'Gloss ceramic tile',
      categoryId: 'mat-tile',
      description: 'Printed glazed tiles; the design runs across the tiles with grout lines.',
      order: 1,
      params: { gloss: 0.45, shading: 0.6, texture: 'tile-grid', textureStrength: 0.55, gridDensity: 5, groutColor: '#e6e3dc' },
    },
    {
      id: 'mat-matte-tile',
      name: 'Matte large-format porcelain',
      categoryId: 'mat-tile',
      description: 'Large tiles with a soft matte finish.',
      order: 2,
      params: { gloss: 0.05, shading: 0.7, texture: 'tile-grid', textureStrength: 0.45, gridDensity: 2.5, groutColor: '#cfcac1' },
    },
    {
      id: 'mat-clear-glass',
      name: 'Printed clear glass',
      categoryId: 'mat-glass',
      description: 'Partially see-through print on clear glass.',
      order: 3,
      params: { opacity: 0.78, gloss: 0.6, shading: 0.35, tint: '#e3f2ee', tintStrength: 0.25 },
    },
    {
      id: 'mat-backpainted-glass',
      name: 'Back-painted glass splashback',
      categoryId: 'mat-glass',
      description: 'Opaque glass panel with a high-gloss face.',
      order: 4,
      params: { opacity: 1, gloss: 0.75, shading: 0.45 },
    },
    {
      id: 'mat-frosted-glass',
      name: 'Frosted glass',
      categoryId: 'mat-glass',
      description: 'Satin-etched glass that softens the print.',
      order: 5,
      params: { opacity: 0.9, gloss: 0.12, shading: 0.4, texture: 'frosted', textureStrength: 0.7 },
    },
    {
      id: 'mat-brushed-aluminium',
      name: 'Brushed aluminium',
      categoryId: 'mat-metal',
      description: 'Print on brushed metal; the grain shows through lighter areas.',
      order: 6,
      params: { gloss: 0.3, shading: 0.55, saturation: 0.85, texture: 'brushed', textureStrength: 0.8, tint: '#dfe5ea', tintStrength: 0.2 },
    },
    {
      id: 'mat-brushed-brass',
      name: 'Brushed brass',
      categoryId: 'mat-metal',
      description: 'Warm metal base under the print.',
      order: 7,
      params: { gloss: 0.35, shading: 0.55, texture: 'brushed', textureStrength: 0.7, tint: '#e6c57d', tintStrength: 0.35 },
    },
    {
      id: 'mat-cabinet-lacquer',
      name: 'Gloss cabinet lacquer',
      categoryId: 'mat-cabinet',
      description: 'Smooth lacquered cabinet doors.',
      order: 8,
      params: { gloss: 0.55, shading: 0.65 },
    },
    {
      id: 'mat-wall-panel',
      name: 'Matte wall panel',
      categoryId: 'mat-cabinet',
      description: 'Rigid printed panel with a matte surface.',
      order: 9,
      params: { gloss: 0.05, shading: 0.7 },
    },
    {
      id: 'mat-glass-block',
      name: 'Glass block',
      categoryId: 'mat-block',
      description: 'Printed glass blocks with mortar joints.',
      order: 10,
      params: { opacity: 0.8, gloss: 0.3, shading: 0.4, texture: 'glass-block', textureStrength: 0.75, gridDensity: 8, groutColor: '#c9d2d3' },
    },
    {
      id: 'mat-acrylic',
      name: 'Acrylic partition',
      categoryId: 'mat-block',
      description: 'Rigid acrylic sheet, slightly translucent.',
      order: 11,
      params: { opacity: 0.9, gloss: 0.5, shading: 0.4 },
    },
  ],
};

export function buildDemoCatalog(baseUrl: string): ParseResult {
  return parseCatalog(raw, { source: 'demo', allowedImageHosts: [], allowRelativeUrls: true, baseUrl });
}
