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
    rolldownOptions: {
      input: { main: 'src/client/main.ts' },
    },
  },
});
