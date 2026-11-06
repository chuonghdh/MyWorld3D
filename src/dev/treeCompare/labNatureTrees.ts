// LAB COPY of src/streets/natureTrees.ts (cloned from the city file). Lab edits stay here until the user approves a merge.
// Imports are the city's shared modules (environment, shaders, core, city types), not cloned.
// City trees from the Quaternius pack (public/models/quaternius). Replaces the procedural street, courtyard and
// plaza trees. Each tree type is one InstancedMesh for bark and one for leaves, in the main and shadow passes.
// Leaves are thinned per season by whole islands (seeded order, density from seasonLeafDensity), as the
// procedural trees were. Instance origins sit at the tree base, so applyWindSway measures height from the base.
// Pure: no GLB loading here (see src/scene/useNatureTrees.ts). Deterministic: one seeded stream per layout.

// Barrel: the implementation is split across labNature*.ts files. Import from here (labLoader.ts, main.ts).
export * from './labNatureTypes';
export * from './labNatureGeometry';
export * from './labNatureVariety';
export * from './labNatureAsset';
export * from './labNatureField';
