// Builds the browser TypeScript and the one CSS bundle into dist/client with a manifest.
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src/client',
  publicDir: false,
  build: {
    outDir: '../../dist/client',
    emptyOutDir: true,
    manifest: true,
    minify: true,
    // The banner SVG stays a file: the CSP allows images from 'self' only, not data: URIs.
    assetsInlineLimit: 0,
    rolldownOptions: {
      input: { main: 'src/client/main.ts' },
    },
  },
});
