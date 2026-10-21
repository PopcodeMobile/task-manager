import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

// The single SPA entry serves auth callbacks, consent and workspace deep links in dev and preview.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve('src') } },
  build: {
    outDir: process.env.GR8R_BUILD_DIR || 'dist',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules/')) return;
          if (/node_modules\/(?:react(?:-dom)?|scheduler|@radix-ui)\//.test(id)) return 'react-ui';
          if (id.includes('node_modules/@supabase/')) return 'supabase';
        },
      },
    },
  },
  server: { port: 5180, strictPort: true },
});
