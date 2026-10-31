// Camera distance limits shared by the orbit rig and the feature modules that must stay inside the view
// (aircraft fly below the highest camera). Lives in core so feature modules need not import scene/.

/** Highest orbit distance of the camera from its target, in metres. */
export const MAX_DISTANCE = 600;
