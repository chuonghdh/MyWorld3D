// Vehicle variant ids and class mapping. Plain data, no Three.js (the simulation imports this).
import type { VehicleClass } from '../../audio';

export const VARIANT_COUNT = 9;
export const VARIANT_NAMES = ['hatchback', 'sedan', 'suv', 'microvan', 'taxi', 'delivery-van', 'bus', 'truck', 'scooter'] as const;
/** Passenger variants (class car). */
export const PASSENGER_VARIANTS = [0, 1, 2, 3, 4, 5] as const;

/** Variant indices usable by each class, with spawn weights (sum 1). */
export const CLASS_VARIANTS: Record<VehicleClass, { variant: number; weight: number }[]> = {
  car: [
    { variant: 0, weight: 0.26 },
    { variant: 1, weight: 0.22 },
    { variant: 2, weight: 0.17 },
    { variant: 3, weight: 0.12 },
    { variant: 4, weight: 0.12 },
    { variant: 5, weight: 0.11 },
  ],
  bus: [{ variant: 6, weight: 1 }],
  truck: [{ variant: 7, weight: 1 }],
  motorbike: [{ variant: 8, weight: 1 }],
};
