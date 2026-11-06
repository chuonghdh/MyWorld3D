// Small roof-profile icons for the Roof chips (HousePanel). Inline SVG, currentColor, 16 px. Each shape is the
// roof's silhouette or its character: flat slab, curved mansard, pitched gable, four-slope hip, ledge cornice,
// low parapet, railed terrace, low gentle tiled slope, stepped gable.
import type { RoofType } from '../store/model';

const PATHS: Record<RoofType, string[]> = {
  flat: ['M2 9h12', 'M3 9v4h10V9'],
  mansard: ['M2 13 L4 5 Q8 3 12 5 L14 13', 'M2 13h12'],
  gable: ['M2 13 L8 3 L14 13 Z'],
  hip: ['M2 13 L5 6 H11 L14 13 Z'],
  cornice: ['M2 8 L8 3 L14 8', 'M1 8h14', 'M3 8v5h10V8'],
  parapet: ['M2 6h12', 'M2 6v-1h1v1', 'M5 6v-1h1v1', 'M10 6v-1h1v1', 'M3 6v7h10V6'],
  terrace: ['M2 10h12', 'M2 7h12', 'M3 7v3', 'M13 7v3', 'M8 7v3'],
  'low-tiled': ['M2 10 L14 6', 'M3 11 L13 7', 'M2 13h12'],
  'step-gable': ['M2 13 V9 H5 V6 H8 V3 H11 V6 H14 V13 Z'],
};

export function RoofIcon({ roof }: { roof: RoofType }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinejoin="round"
      strokeLinecap="round"
      aria-hidden="true"
      className="mw-roof-icon"
    >
      {PATHS[roof].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
