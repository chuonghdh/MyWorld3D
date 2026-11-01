# MyWorld3D – 3D Design Spec (Phase 1.5: Graphics)

Reviewed 2026-11-01 at 02b0cdc

This spec is the single source of truth for the graphics of MyWorld3D.
Sections 1–5 and 8 are the art direction and the building contracts. Sections 6 and 9–11 describe the
trees, vehicles, sky, weather and quality tiers **as built** (checked against the code at commit 02b0cdc).
Section 7 lists the render budget that `tests/budget.test.ts` enforces.

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
- ACES Filmic tone mapping, sRGB output, exposure 1.0 (`App.tsx`). Soft shadows (`shadows="soft"`, PCF soft).
  Shadow map edge depends on the quality tier: 4096 (High), 2048 (Medium), 1024 (Low). See section 11.
- Hemisphere light (sky/ground bounce) + warm directional sun + ambient fill.
- Distance fog in the sky colour.
- Post: bloom and MSAA through `PostFX`, scaled by the quality tier. Device pixel ratio is capped per tier.
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
- `setNightLights(on: boolean)` switches the lit-glass emissive intensity (0 by day, 1.15 at night, `NIGHT_EMISSIVE`).
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
- Raised sidewalks (0.15 m) with curbs, tree pits, paving tone. Pavement boxes (`pavementSurfaces.ts`)
  feed the falling-leaf landing (section 6.3).
- Classic lamps (dark iron pole, lantern head with emissive glass at night) + fake light pools on the
  ground at night (additive radial-gradient decals). No real point lights.
- Benches, bollards, bins, traffic signal poles with 3-light heads (emissive by phase).
- Courtyards: grass with paths and hedges. Monument blocks: paved plaza with two-tone stone.
- Everything instanced or merged; a handful of draw calls total.

## 6. Trees, greenery and monuments

### 6.1 Street, avenue and courtyard trees
- Source: Quaternius GLBs in `public/models/quaternius`, one entry per type in `NATURE_TYPES`
  (`src/streets/natureTrees.ts`). They replace the procedural street, courtyard and plaza trees;
  the procedural field remains only as the fallback when the assets are not loaded.
- Six types, two InstancedMeshes each (bark, leaves) plus shadow copies:
  - Deciduous, four types: `Tree_5`, `Tree_6` (oak-coded), `Birch_6`, `Birch_10` (birch-coded).
  - Conifers, two types: `Pine_5`, `Pine_2` (evergreen, `evergreen: true`).
- Placement (`natureSlots`): every street tree gets a seeded type and yaw. Conifers (`PINE_SHARE` 0.6 of
  eligible slots) only on plazas, on the outer sidewalk ring (within `BORDER_DEPTH` 6 m of the town edge)
  and in merged-block courtyards. Everywhere else: deciduous.
- Scale `TREE_SCALE` 1.35. Instance origins sit at the tree base.
- Crown clusters that float free of the trunk (`FOLIAGE_MIN_Y` 2.5 m) move from bark to the leaf geometry.
- Shadows: shadow-only leaf copies on `SHADOW_LAYER` 1 at `SHADOW_LEAF_FRACTION` 0.5 of the leaves.
- Wind sway through `applyWindSway` on the shared wind uniforms (sway height 10 m), works with instancing.

### 6.2 Seasonal look
- **Leaf colour (broadleaf):** the leaf material is patched by `leafVariety.ts`: per-island variety
  between green and teal/yellow, and in autumn a red / orange / yellow ramp. Per-tree tint from
  `treeTint` with a spread per season: autumn 1.7, spring 1.1, summer 0.9, winter 0.
- **Leaf density (broadleaf):** leaves are thinned by whole islands (seeded order). Density per season:
  spring 0.7, summer 1, autumn 0.6, winter 0 (`seasonLeafDensity`).
- **Winter (broadleaf):** no leaves are drawn. Bare bark with snow caps on upward faces (`snowCap`,
  normal y above 0.5, lifted 0.05 m). Snow meshes are visible in winter only.
- **Conifers:** keep needles all year. Green in autumn. In winter, snow comes from the weather shader on the
  leaf material (upward faces only, `uSnow` capped at `PINE_SNOW_COVER` 0.35, smoothstep 0.85–0.97 on normal y).
- Spring blossom (`blossomShare`) is not applied to the Quaternius street trees. Hedge and flower colour
  shifts for courtyards come from `seasonalPaint.ts`.

### 6.3 Falling leaves (src/environment/leaves.ts)
- Particle kind by season: spring petals, summer pollen, autumn leaves, winter none. Only autumn leaves
  fall from crowns and rest on the ground.
- One InstancedMesh for leaves plus one for the brown midrib strips: 2 draw calls. Hard cap `MAX_LEAVES` 160.
  Live count = share of the cap set by the leaf-amount slider.
- Crown discs: `crownDiscsFromGroup` reads each broadleaf InstancedMesh (`nature-leaves-*`, shadow copies
  skipped) and returns one sphere per tree instance. Autumn leaves spawn at a random point inside an
  eligible disc, at crown height.
- **Camera gate:** `setCameraView` runs every frame. A crown spawns leaves only when its sphere is in the
  camera frustum and its centre is within 100 m (`FOCUS_RADIUS_DEFAULT`) + crown radius of the focus point.
  The focus is 12 m ahead of the camera on the ground plane (`useTownFrame.ts`). Nothing in view means no spawn.
- Fall: leaves adopt the wind slowly (`WIND_DRAG` 0.5), flutter, and fall at 0.8 m/s.
- **Landing:** `setSurfaces` takes the pavement and kerb-top boxes. A leaf lands on the highest box under it,
  otherwise on the road at 0.05 m. Vehicle roofs and bonnets are not landing surfaces yet.
- **Rest:** an autumn leaf lies flat for 10 s (±10%), lifted 0.01 m above the surface, and shrinks away over its
  last second. Gusts over 4 m/s slide resting leaves and can lift them again.
- **Fade and removal:** leaves shrink to nothing within 10 m of the camera (`LEAF_NEAR_FADE`). Leaves that
  leave the town bounds are removed.
- **Leaf devil:** a swirl of radius 5 m and height 9 m, roaming at 2.2 m/s, at most 2 at a time, living 12 s by
  default. It captures leaves within its radius for 4–8 s, then releases them. Spawned on request.
- Leaf shape: about 0.29 × 0.35 m with a notched tip, a stem and a brown midrib strip.

### 6.4 Monuments
- Monuments: same detail level as houses (cornices, columns, signage, colour), fitted to the block.

## 7. Performance budget
The static scene (street trees, merged house blocks, monuments, streetscape, courtyard greenery) is counted
by `tests/budget.test.ts` for the seeded default city (seed 1, default settings). Triangles times instances;
draw calls = one per mesh, main pass plus shadow pass. Moving actors (vehicles, walkers, birds, leaves, smoke,
clouds) are instanced with runtime counts and are not in the static estimate.

| Check | Assertion | Measured (test comments) |
|---|---|---|
| Main-pass triangles | ≤ 1,900,000 | 1,539,195 |
| House-block main-pass triangles | 1,100,000–1,140,000 | ~1.1 M |
| Shadow-pass triangles | ≤ 605,000 | 549,627 |
| Main + shadow triangles | ≤ 2,300,000 (design budget 3 M) | 2,088,822 |
| Draw calls (main + shadow meshes) | ≤ 140 | 132 (100 + 32) |
| House detail meshes | ≤ number of blocks | one per block (caster split) |

- Body triangles are split into a caster mesh (`building-body`) and a detail mesh (`building-body-detail`, no shadow).
  Total triangles are unchanged by the split; only the shadow pass drops.
- Leaf shadow copies count in the shadow total only (layer 1), never in the main pass.
- Design targets (not asserted by tests): 150–400 houses at ≥ 30 fps on a mid laptop; draw calls < 400; triangles < 3 M.

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

## 9. Vehicles (src/traffic/vehicleMeshes.ts)
- Snow: one shared `uSnow` uniform, set each frame from the eased weather snow value (`setSnow`).
- Roofs, bonnets and boots turn white where the surface faces up (smoothstep on the normal y, 0.6–0.9),
  only on painted parts, most of it at full snow.
- Front glass frosts outside the wiper sweep. Vehicles also share the night uniform and the time uniform.

## 10. Sky, clouds, shadows and weather

### 10.1 Sky (src/sky/dome.ts, SkyDome.tsx, state.ts)
- Procedural dome, one draw call, no textures, no shadows. It stays at the far plane and follows the camera.
- Gradient by time of day; sun disc with corona and glow; moon with phase; stars; soft cloud layer; lightning flash.
- Sun and moon positions come from `environment/sun.ts` (suncalc). Disc radii scale by `DISC_SCALE` 0.4.
- `SkyDome.tsx` adds the ground disc beyond the town and a fog-matched horizon. Ground colour per season (`GROUND_COLORS`).

### 10.2 Clouds (src/environment/cloudSprites.ts, clouds.ts)
- Low cumulus over the town: cloud bases 70–100 m, tops up to 140 m, cells of 90 m on a wrapping domain.
- One instanced draw call of camera-facing puffs. Tops bright, bellies grey, rims shaded.
- Cover from the town's cloud count (default 10 maps to coverage 0.5, clamped 0.1–0.9).
- Drift: a fraction (`CLOUD_WIND_FACTOR` 0.32) of the wind, clamped between `CLOUD_MIN_DRIFT` 1.2 and `CLOUD_MAX_DRIFT` 4.
- Sprites fade by cloud amount, domain edge, camera distance and fog so nothing pops. Sprite darkness up to 0.35.

### 10.3 Cloud shadows (src/environment/cloudShade.ts, src/shaders/cloudShade.ts)
- The cloud layout is rasterised into one 256 × 256 R8 mask, sampled by the shared surface materials.
- Shadows darken only direct sun light, up to `CLOUD_DIRECT_DARKNESS` 0.95. No extra draw call.
- Parallax: a fragment looks up the cloud between it and the sun, with casters at `CLOUD_CASTER_HEIGHT` (95 m).
  A roof at 25 m gets the shadow of the cloud above it, not a ground-projected copy.
- The mask is rebuilt only when cloud amount changes by `CLOUD_MASK_REBUILD_STEP` (0.025) or more. Drift is a uniform.

### 10.4 Weather (src/weather/)
- Kinds (`WEATHER_KINDS`): clear, cloudy, rain, storm, snow, fog. Values ease in and out over seconds
  (`weatherState.ts`): rain, wetness, snowfall, snow cover, fog, extra cloud, storm, dim.
- Rain amount at intensity 1: rain 0.75, storm 1; other kinds 0.
- Rain: streaks up to `MAX_STREAKS` 14,000 and ripples up to `MAX_RIPPLES` 280, GPU-animated in the camera volume.
- Snow: up to `MAX_FLAKES` 12,000 points, animated in the vertex shader, drifting with the wind.
- Fog: density for `scene.fog` plus up to `MAX_BANKS` 48 low sprites.
- Storm: lightning only in storm. Flash 0.15–0.4 s. Bolt visible within 700 m. Thunder delay = distance / 340 m/s.
- Surfaces: shared `uWet` and `uSnow` uniforms (`src/shaders/wetSurface.ts`). Snow forms only on upward faces,
  with a ragged edge from noise. Street, ground and furniture materials read them (`wetSurface.ts`); the pine
  leaf material and the vehicles use their own snow rules (sections 6.2 and 9).
- Draw calls: rain streaks 1, ripples 1, snow 1, fog banks 1, bolt 1. Each is hidden (and free) when inactive.

## 11. Quality tiers (src/store/quality.ts)
- Tiers: High (default, the reference look), Medium and Low. Medium and Low are opt-in and only lower cost.
- Per tier (`QUALITY_PRESETS`):

| Tier | DPR max | Shadow map | Bloom | MSAA | Traffic and people |
|---|---|---|---|---|---|
| High | 2 | 4096 | 1 | 4 | 1 |
| Medium | 1.5 | 2048 | 0.6 | 4 | 0.75 |
| Low | 1 | 1024 | 0 (off) | 2 | 0.5 |

- The DPR range is always 1 up to the tier's max. The bloom value multiplies bloom strength; 0 turns the pass off.
- The traffic value multiplies the Traffic and people slider.
- Life systems (birds, pets, flocks) take the tier as well and scale their counts.
- Auto-detect only suggests a tier, never applies it (`suggestQuality`): software renderer or touch device or
  ≤ 2 GB memory → Low; integrated GPU, ≤ 4 GB memory or ≤ 4 CPU cores → Medium; otherwise High.
- The tier is saved in the settings (`settings.quality`, default `high`). Old save files fall back to High.
