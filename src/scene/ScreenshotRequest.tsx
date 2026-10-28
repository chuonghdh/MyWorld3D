// Saves the 3D view as a PNG without any UI.
//
// The renderer uses preserveDrawingBuffer = false, so the canvas content is only readable in the same
// task that rendered it. PostFX renders the composer in a useFrame callback with priority 1; R3F runs
// callbacks in ascending priority, so this component's priority 2 callback runs right after that render,
// before the browser presents the frame. A pending request (runtime.screenshotRequests) is consumed
// there: canvas.toBlob() snapshots the buffer synchronously and only the PNG encoding is async.
// DOM panels are not part of the canvas, so they never appear in the file.
import { useFrame } from '@react-three/fiber';
import { runtime } from './runtime';
import { screenshotFilename } from '../ui/uiUtils';
import { useWorldStore } from '../store';

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function ScreenshotRequest() {
  useFrame(({ gl }) => {
    if (runtime.screenshotRequests <= 0) return;
    runtime.screenshotRequests = 0;
    const name = screenshotFilename(useWorldStore.getState().settings.seed);
    gl.domElement.toBlob((blob) => {
      if (blob) download(blob, name);
    }, 'image/png');
  }, 2);
  return null;
}
