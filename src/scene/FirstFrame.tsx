// Hides the boot spinner once the scene has rendered its first frame. The check runs once, then unsubscribes.
import { useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { bootDone } from '../ui/boot';

function FrameWatch({ onFrame }: { onFrame: () => void }) {
  useFrame(() => onFrame());
  return null;
}

export function FirstFrame() {
  const [done, setDone] = useState(false);
  // Dev-only test hook: ?mwThrow=render makes the scene throw so the error screen can be checked by eye.
  if (import.meta.env.DEV && typeof location !== 'undefined' && location.search.includes('mwThrow=render')) {
    throw new Error('Test error from ?mwThrow=render (dev only)');
  }
  if (done) return null;
  return (
    <FrameWatch
      onFrame={() => {
        // useFrame runs before the render of that frame; hide on the next tick, after it is painted.
        setTimeout(bootDone, 0);
        setDone(true);
      }}
    />
  );
}
