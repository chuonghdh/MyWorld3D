// Procedural Western-European houses (DESIGN-3D section 3, v2 contract).
//
// A house fills its lot exactly (width x depth, front at +z). Street facades (params.facades) are
// built as piers and spandrels around genuinely recessed windows, with per-style frames, sills,
// shutters, balconies, cornices and ground floors; other sides are plain party walls with chimney
// flues. Everything is merged into at most three meshes (body, glass, glassLit) that use the shared
// materials, with colour carried in vertex colours. Same params and seed give identical geometry.

export * from './houseParams';
export * from './houseBuild';
