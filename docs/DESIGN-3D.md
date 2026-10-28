# MyWorld3D – 3D Design Spec (Phase 1.5: Graphics)

This spec is the single source of truth for every agent working on the graphics upgrade.
Art direction first, then the data contracts each module must honour.

## 1. Art direction

**Target look:** a miniature Western-European city seen from above at golden hour.
Think Haussmann Paris, Amsterdam canal fronts, Lyon, Barcelona Eixample.
Warm light, pastel stone facades, slate-blue zinc and terracotta roofs, white sidewalks,
deep shadows inside window reveals, lots of small rooftop clutter.
Stylised low-poly, but *dense with small details*. Detail is what makes it read as "real".

### Principles
1. **Continuous street walls.** Buildings stand shoulder to shoulder along the block edge
   (perimeter blocks). No gaps between houses on a street. Courtyards inside.
2. **Real depth.** Windows are recessed 0.15–0.25 m into the wall. Cornices, sills, balconies,
   pilasters stick out. Shadows from these details are what sell the scale.
3. **Rhythm and variation.** Every house follows a bay grid, but neighbours differ:
   height ±1–2 floors, wall colour, roof type, ground floor use.
4. **Hierarchy.** Avenues get taller buildings, shops, wider sidewalks and regular tree rows.
   Side streets get lower, quieter houses.
5. **Night is a second look.** Windows glow warm (not all of them), street lamps glow,
   and pools of light lie on the sidewalks.

### Scale reference (metres)
| Element | Size |
|---|---|
| Ground floor height (shop) | 4.2 |
| Ground floor height (residential) | 3.6 |
| Upper floor height | 3.1 |
| Bay width (window + pier) | 2.4–3.0 |
| Classic window | 1.1–1.3 wide × 1.9–2.3 tall, sill at 0.9 above floor |
| French window (to floor) | 1.2 wide × 2.4 tall |
| Window reveal depth | 0.15–0.25 |
| Cornice projection | 0.3–0.6 |
| Balcony depth | 0.6–1.0 |
| Door | 1.2–1.6 wide × 2.4–3.2 tall |
| Lot frontage | 6–14 |
| Lot depth | 10–14 |
| Street width (curb to curb) | 8 |
| Avenue width (curb to curb) | 11 |
| Sidewalk width | 3 (street), 4.5 (avenue) |
| Curb height | 0.15 |
| Street lamp | 4.5 tall |

### Palette
- Walls (pastel stone): cream `#efe3c8`, sand `#e3cfa5`, ochre `#e2b66c`, peach `#efc3a0`,
  rose `#e8b4a8`, terracotta `#c9714f`, sage `#c9cfae`, sky `#b9cfdc`, stone grey `#c8c4bb`, white `#f3efe7`.
- Brick: `#9c4a36`, `#8a4b33`, `#a85a3e`.
- Trim/stone: `#f4efe3`; darker stone base `#cbbfa8`.
- Roofs: zinc `#6f7a86`, slate `#4f5762`, terracotta `#b5593a`, dark tile `#7a3f30`, copper patina `#7fa69a` (rare).
- Glass (day): `#2c3a48` roughness 0.15 metalness 0.3. Glass lit (night): emissive `#ffcf7a`.
- Shutters: sage `#5f7d63`, blue `#3f6e8f`, oxblood `#7a2e2a`, cream `#e9dcc0`, grey `#6c7378`.
- Ironwork: `#22262a`. Awnings: stripes of white + one of green `#2f6b4f`, red `#b03a2e`, navy `#24395c`.
- Asphalt `#4a4a50`, lane paint `#efeee8`, sidewalk `#ddd6c8`, curb `#bfb8aa`, plaza stone `#d9cfbd`/`#c9bda6`.

## 2. Rendering (owned by the orchestrator, src/scene + App)
- ACES Filmic tone mapping, sRGB output, exposure ≈ 1.0, PCF soft shadows (2048 map).
- Hemisphere light (sky/ground bounce) + warm directional sun + ambient fill.
- Distance fog in the sky colour.
- One shared material per surface kind (see 3.4). Vertex colours carry most of the colour,
  so a whole house is 2–3 meshes and whole blocks can be merged.

## 3. Buildings (src/buildings)

### 3.1 API contract
```ts
export interface HouseParams {
  preset: HousePreset;
  floors: number;            // 2–8, clamped
  roof: RoofType;
  style: HouseStyle;         // 'classic' | 'modern'
  wallColor: string;
  shutterColor: string | null;
  // v2 fields. All optional; defaults keep the old panel/store working.
  width?: number;            // lot frontage along local x. Default: preset width.
  depth?: number;            // lot depth along local z. Default: preset depth.
  facades?: Facades;         // which sides face a street. Default: front + back.
  groundFloor?: GroundFloorUse; // 'shop' | 'cafe' | 'residential'. Default: preset's.
  seed?: number;             // detail variation. Default: 1.
}
export interface Facades { front: boolean; back: boolean; left: boolean; right: boolean; }
export type GroundFloorUse = 'shop' | 'cafe' | 'residential';

buildHouse(params): THREE.Group
```
- Base at y = 0, centred on x and z, **front faces +z**. Left = −x, right = +x, back = −z.
- The main volume fills exactly `width × depth`. Only street-side details (balconies, cornices,
  awnings, stoops, café terrace) may protrude, at most 1.5 m, and only on facade sides.
- Returns a Group with at most three meshes, using **shared** materials:
  `body` (vertex colours), `glass`, `glassLit`.
- `userData`: `{ preset, floors, roof, style, height, width, depth }`.
- Keep `defaultHouseParams`, `houseFootprint`, `resolvePreset`, `HOUSE_PRESETS`, `ROOF_TYPES`,
  `MIN_FLOORS`, `MAX_FLOORS`, `buildMonument`, `MONUMENT_KINDS` and the palette exports working.

### 3.2 Facade construction
- Build every **street facade** (sides listed in `facades`) as piers and spandrels around the openings,
  so the glass sits genuinely recessed. Non-facade sides are party walls: plain, slightly darker,
  with chimney flues; they show only where a neighbour is lower.
- Bay count = `max(2, round(width / bayWidth))`. Centre the bay grid; corner piers are wider.
- Per floor, top to bottom: string course (thin band), windows with frames, sills, optional balcony.
- Ground floor by use:
  - `shop`: tall glass bays with dark frames, a coloured fascia band for the sign, door, striped awning.
  - `cafe`: like shop, plus a sidewalk terrace (2–4 small tables with chairs, within 1.5 m) and an awning.
  - `residential`: stone base (rusticated: horizontal grooves), entrance door with transom or arch,
    small windows with bars or stoop depending on preset.
- Top: main cornice (stepped, 2–3 layers) on classic styles; coping on modern.
- Vertex colour detail: darken the bottom 0.8 m by ~12% (fake ground AO), lighten cornices.
- Per-house colour jitter from `seed`: ±4% lightness on walls so neighbours never look copy-pasted.

### 3.3 Preset character (classic / modern)
| Preset | Classic | Modern |
|---|---|---|
| original-feuilles (Haussmann) | cream stone, rusticated base, French windows, continuous iron balconies on 2nd and top floor, zinc mansard with dormers and chimney stacks | same massing, simplified frames, glass balustrades, flat zinc top floor |
| canal-amsterdam | narrow brick, tall sash windows with white frames, step or bell gable facing the street, hoist beam | gable kept, large picture windows |
| glass-tower | curtain wall with spandrel panels and mullions every 1.5 m, recessed glass lobby, rooftop plant room | same, darker glass, vertical fins |
| brutalist-concrete | raw concrete grid, deep recessed windows, heavy horizontal slabs, board texture via grooves | precast panels, regular grid |
| bauhaus | white cube, horizontal ribbon windows, corner windows, cantilevered balconies, flat roof with rail | same with colour accents |
| mediterranean | stucco, small windows with louvered shutters, terracotta low tiled roof, small balconies with pots | larger openings, roof terrace |
| brownstone-ny | brick, stoop with iron rails, tall windows with stone lintels, bracketed cornice | flat cornice, bigger glass |
| nordic-timber | horizontal timber cladding, white window frames, steep gable roof | dark timber, big glass gable |
| shophouse-asia (built as a narrow Western terrace) | narrow, colourful, shopfront, small balcony, gable | flat roof, glass front |

### 3.4 Shared materials
Export from `src/buildings/materials.ts`:
- `getBodyMaterial()`, `getGlassMaterial()`, `getGlassLitMaterial()` (single shared instances).
- `setNightLights(on: boolean)` switches the lit-glass emissive intensity (0 by day, ~1.6 at night).
  About 35% of windows use `glassLit`, chosen from `seed`.
- Roof, trim, ironwork, awning colours are vertex colours on `body`.

### 3.5 Rooftops
- Mansard: steep lower slope ~70° and a shallow top; dormers every bay with small pediment;
  chimney stacks on party walls with terracotta pots.
- Gable / step-gable / hip / low-tiled: overhang 0.3–0.5 m, ridge line, chimneys.
- Flat / parapet / terrace / cornice: parapet with coping, plus 2–5 rooftop items
  (AC units, water tank, skylight, stair hut, vents), placed by `seed`.

## 4. City generator (src/city)
See `src/city/layout.ts` for the contract (v2 fields are documented there).
- Jittered grid: block sizes vary (cell 40–60 m). One avenue in each direction through the middle.
- Perimeter blocks: corners first (square-ish corner lots with two facades), then fill each edge
  with frontages of 6–13 m. No overlaps, no gaps, all lots inside block bounds.
- Lot data: `facades`, `corner`, `groundFloor` (shops on avenues and corners), `floors` by hierarchy,
  `seed`.
- Courtyard = open interior of the block; a few courtyard trees.
- Street furniture: lamps every ~18 m (staggered), benches on avenues, crosswalks at each intersection
  approach, intersections listed for markings.
- Keep traffic paths and lights consistent with the new road widths.

## 5. Streetscape (src/streets)
- Asphalt roads, dashed centre line, edge lines, zebra crosswalks, plain intersection squares.
- Raised sidewalks (0.15 m) with curbs, tree pits, paving tone.
- Classic lamps (dark iron pole, lantern head with emissive glass at night) + fake light pools on the
  ground at night (additive radial-gradient decals). No real point lights.
- Benches, bollards, bins, traffic signal poles with 3-light heads (emissive by phase).
- Courtyards: grass with paths and hedges. Monument blocks: paved plaza with two-tone stone.
- Everything instanced or merged; a handful of draw calls total.

## 6. Trees, greenery and monuments
- Trees: instanced per species. Crowns = 5–9 merged jittered low-poly blobs with vertex colour
  (lighter on top). Maple rounded, oak wide and irregular, birch narrow with white trunk, ginkgo conical.
  Winter: bare branches. Wind sway through the existing wind uniforms (must work with instancing).
- Hedges and flower beds for courtyards.
- Monuments: same detail level as houses (cornices, columns, signage, colour), fitted to the block.

## 7. Performance budget
- 150–400 houses at ≥ 30 fps on a mid laptop.
- Draw calls: houses merged per block; trees, lamps, furniture instanced. Target < 400 draw calls.
- Triangles: < 3 M.

## 8. House detail pass (surfaces, backs, glass, signs, smoke)

Goal: houses read as built from real materials and look finished from every side.

### 8.1 Procedural surfaces (no image textures)
- Geometry carries a per-vertex float attribute `aSurface` (ids in `src/buildings/surface.ts`).
- The shared body material patches its fragment shader (`onBeforeCompile`) to draw the pattern.
  The vertex colour stays the base colour; the pattern multiplies or mixes it.
- The pattern coordinates come from the object-space position and normal in the shader
  (tangent = normalize(cross(up, n)), bitangent = cross(n, tangent); on a roof slope, v then runs up the slope),
  so the builder never writes UVs. Merged blocks keep working.
- Patterns (metres):
  - BRICK: 0.215 x 0.065, 10 mm joints, running bond. Per-brick tone jitter about +-6% lightness and
    +-2% hue; about 7% of bricks clearly lighter or darker; about 3% sit 1-3 mm out of line (shifted
    shading edge). Joint colour light grey-beige (about 10% lighter than the brick on average).
  - TILE_TERRACOTTA: curved tiles about 0.30 x 0.40, overlapping rows, each row offset half a tile,
    bright upper edge and dark shadow line at the lower edge of every tile, per-tile tone jitter.
  - TILE_SLATE: rectangular tiles about 0.30 x 0.30, staggered, thin dark gaps, per-tile jitter.
  - ZINC: standing seams every 0.6 m with a soft gradient; faint horizontal panel joints every 2 m.
  - TIMBER: boards about 0.14 m with grain streaks and board-to-board shade changes.
  - STUCCO: very fine noise, faint stains and a darker bottom 0.5 m.
  - STONE: ashlar courses 0.6 m high, blocks 0.5-1.2 m long with fine joints (Haussmann facades).
  - CONCRETE: shuttering boards 0.3 m high with tie holes and vertical weathering streaks.
- Anti-aliasing is mandatory: fade each pattern to its average colour using screen-space derivatives
  (`fwidth`) as soon as a pattern cell is smaller than about 1.5 px, so the city never shimmers
  from the default top-down camera. Patterns must also hold up at street level.
- Which preset uses what: original-feuilles stone walls + zinc mansard; canal-amsterdam and brownstone
  brick walls + slate roof; brutalist concrete; nordic timber walls + slate or tile roof; mediterranean
  stucco + terracotta tiles; bauhaus stucco; shophouse stucco + terracotta tiles; glass tower plain/concrete
  plant room. Gable, hip and low-tiled roofs use TILE_TERRACOTTA or TILE_SLATE; mansard uses ZINC.
  Chimney stacks use BRICK. Rear and party walls use the preset's wall surface (plaster or brick).

### 8.2 Backs and party walls
- Every building gets a finished rear elevation (the side with `facades.back === false` that faces the
  courtyard), because perimeter blocks are seen from above and from the courtyard:
  plain plaster or brick, fewer and smaller irregular windows (no mouldings, simple sill), a courtyard door,
  drainpipes, a rear stair tower or lean-to extension with its own roof, small balconies or loggias with
  railings, AC units, now and then a washing line, rear chimney flues, and a back roof slope with details.
- Party walls (`left` or `right` not a facade): textured blank wall, flues, occasionally a faded painted advert
  or a single high window where it rises above a lower neighbour. Corner facades continue around.

### 8.3 Glass
- Shared glass materials get a cheap fake reflection in the shader (no env map): Fresnel blend toward the sky
  colour, a soft diagonal gradient, and a sun glint, plus faint curtain tint variation from vertex colour.
  `setGlassEnvironment(skyColor, sunDirection, sunColor)` (exported from `src/buildings/materials.ts`) updates
  the uniforms each time the lighting changes. Lit glass keeps its night emissive.
- Door and shopfront glass use the same materials.

### 8.4 Signs with text
- Shopfronts on avenues and corners carry a fascia sign (a flat panel above the shop windows) and
  sometimes a projecting blade sign. Text comes from a canvas-drawn atlas (`src/buildings/signs`,
  layout in `signs/layout.ts`: COFFEE, CAFE, RESTAURANT, BAKERY, PHARMACY, BOOKS, FLOWERS, HOTEL ...).
- A cafe or restaurant ground floor picks a matching sign; shop and service fronts pick from their groups.
  Cafes with `cafe` use a COFFEE or CAFE sign most of the time.
- Signs use a fourth mesh named `sign` with `getSignMaterial()`; at night the sign glows (emissive map).
- Signs must be readable from the top-down camera at a reasonable zoom and from the street.

### 8.5 Chimney smoke
- Houses list their chimney tops in `userData.chimneys` (house-local x, y, z).
- `src/environment/smoke.ts` renders soft smoke puffs from a random subset of chimneys, intermittently,
  more often in autumn and winter and in the evening; drifting with the wind; one draw call.
