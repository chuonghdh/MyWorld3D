

## Harness refactor (2026-11-06)
- Split by responsibility, no behaviour change (same exports via re-exports).
- `environment/forest.ts` -> `treeBuilder.ts`, `treeSpecies.ts`, `treeCrown.ts`, `treeTrunk.ts`; forest.ts keeps the tree field.
- `environment/leaves.ts` -> `leafShapes.ts`, `leafState.ts`, `leafDevil.ts`, `leafSurfaces.ts`, `leafCrowns.ts`, `leafMotion.ts`; leaves.ts is the LeafSystem class.
- `environment/greenery.ts` -> `greeneryPieces.ts`; `parkYard.ts` -> `parkGeometry.ts` (park plan stays in parkYard.ts).
- `environment/cloudSprites.ts` -> `cloudLayout.ts` (layout and helpers, re-exported).
- `aircraft/index.ts` -> `aircraftShaders.ts` (VERT, FRAG).
