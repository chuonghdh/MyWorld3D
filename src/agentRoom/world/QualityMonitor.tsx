// Automatic quality drop (step 9): drei PerformanceMonitor switches to Performance when frame rate stays low.
// It never switches back up by itself; the user can return to High in Settings.
import { PerformanceMonitor } from '@react-three/drei';
import { useUi } from '../ui/uiStore';

/** Pure rule used by the monitor: drop only from high, only when the monitor says the frame rate fell. */
export function nextQuality(current: 'high' | 'performance', declined: boolean): 'high' | 'performance' {
  return declined && current === 'high' ? 'performance' : current;
}

export function QualityMonitor() {
  return (
    <PerformanceMonitor
      flipflops={1}
      onDecline={() => {
        const ui = useUi.getState();
        const q = nextQuality(ui.quality, true);
        if (q !== ui.quality) ui.set({ quality: q });
      }}
    />
  );
}
