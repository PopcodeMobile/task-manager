import { mergeConfig } from 'vite';
import base from './vite.config.js';

export default mergeConfig(base, {
  cacheDir: 'node_modules/.vite-playwright-local',
  optimizeDeps: { entries: ['index.html', 'src/workspace/local.js'] },
  server: {
    watch: { ignored: ['**/tests/**', '**/docs/**', '**/.superpowers/**'] },
  },
});
