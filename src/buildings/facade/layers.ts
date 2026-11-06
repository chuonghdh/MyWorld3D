// Layering pass for oriented boxes.
//
// Houses are built from many boxes: wall skin, courses, frames, sills, shutters, trims. Whenever two
// of them end up with a face on (nearly) the same plane looking the same way, the GPU cannot decide
// which one is in front and the pixels flicker (z-fighting). Instead of hand-tuning every offset, the
// mesh builder defers its boxes and runs this pass before emitting triangles:
//
//  * two overlapping faces that look the same way are always at least LAYER_STEP (2 cm) apart along
//    their normal. Boxes are processed in emission order, so a later detail adapts to earlier
//    geometry: a face level with or in front of an earlier face is pushed forward to LAYER_STEP in
//    front of it; a face just behind one is pulled back (a thin box slides back as a whole);
//  * a face that touches earlier faces looking the other way (a box standing on a wall, two boxes
//    meeting face to face) and is covered by them is hidden between two solids and is not emitted;
//    every other face is always emitted, so a box is never open (nothing can be seen through it).
//
// Boxes stay closed solids: only extents change, the list of faces never does. Boxes live in a frame
// (u along a facade, n outward, y up) that may be rotated about the vertical axis, so chamfered
// corners are handled exactly like straight facades.

export * from './layersGeometry';
export * from './layersResolve';
