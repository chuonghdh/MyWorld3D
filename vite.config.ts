import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: ['index.html', 'tree-compare.html', 'agent-room.html'],
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Vitest 5 enforces the timeout on synchronous tests too (vitest 2 did not). Several geometry
    // tests are synchronous and take 5-15 s here, so the default 5 s fails them without a real hang.
    testTimeout: 60_000,
  },
});
