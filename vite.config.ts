import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// The editor is a static single-page app served inside a Wix HTML iframe element.
// `base: './'` keeps asset URLs relative so the build works from any HTTPS host or sub-path.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    target: 'es2020',
    sourcemap: true,
    assetsInlineLimit: 0,
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
