import { useEffect, useState } from 'react';
import { runtime } from '../core/runtime';
import { skyEnvironment } from '../config/tuning';
import { ActionButton, Slider } from './controls';

/**
 * Dev-only live tuning of skyEnvironment.golden.warmth. Writes the in-memory runtime override only:
 * nothing is saved and nothing ships (the whole control is gated by import.meta.env.DEV).
 */
export function GoldenWarmthDev() {
  if (!import.meta.env.DEV) return null;
  return <WarmthControl />;
}

function WarmthControl() {
  const [value, setValue] = useState<number>(() => runtime.goldenWarmthOverride ?? skyEnvironment.golden.warmth);

  useEffect(() => () => { runtime.goldenWarmthOverride = null; }, []);

  const set = (v: number) => {
    runtime.goldenWarmthOverride = v;
    setValue(v);
  };
  const reset = () => {
    runtime.goldenWarmthOverride = null;
    setValue(skyEnvironment.golden.warmth);
  };

  return (
    <>
      <Slider
        id="golden-warmth-dev"
        label="Golden warmth (dev)"
        value={value}
        min={0}
        max={1}
        step={0.01}
        format={(v) => v.toFixed(2)}
        onChange={set}
      />
      <ActionButton onClick={reset}>Reset warmth</ActionButton>
    </>
  );
}
