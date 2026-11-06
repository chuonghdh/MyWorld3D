// Fast vertex-colour mesh builder for houses.
//
// Same output contract as ColorBatch in ../geometry.ts (at most three meshes named body, glass and
// glassLit, non-indexed position/normal/uv/color attributes, the shared materials from
// ../materials.ts), but it writes triangles straight into flat arrays instead of creating a
// BufferGeometry per piece. A detailed house has well over a thousand pieces, so this keeps a
// whole city build fast.
//
// Every primitive is given in the coordinates of the current Frame: u along a facade (left to
// right when seen from the street), y up, n outward from the facade plane. The default frame is
// the identity (u = x, n = z), so house-space code can use it directly.

export * from './meshBasics';
export * from './meshCore';
export * from './meshShapes';
export * from './meshHouse';
