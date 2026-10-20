import { defineConfig } from 'vite';
import fs from 'node:fs';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { icons as lucide } from 'lucide';

/* `virtual:icons` exports only the Lucide icons the source actually names, as inline SVG markup,
   so the bundle carries ~170 icons instead of the full set. Any quoted kebab-case token in src/
   that matches a Lucide icon name is included. */
function lucideSubset() {
  const id = 'virtual:icons',
    resolved = '\0' + id;
  const walk = dir =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
      const p = path.join(dir, e.name);
      return e.isDirectory() ? walk(p) : /\.js$/.test(e.name) ? [p] : [];
    });
  const pascal = n =>
    n
      .split('-')
      .map(p => p[0].toUpperCase() + p.slice(1))
      .join('');
  return {
    name: 'lucide-subset',
    resolveId: s => (s === id ? resolved : null),
    load(s) {
      if (s !== resolved) return null;
      const text = walk(path.resolve('src'))
        .map(f => fs.readFileSync(f, 'utf8'))
        .join('\n');
      const names = [...new Set([...text.matchAll(/['"`]([a-z][a-z0-9]*(?:-[a-z0-9]+)*)['"`]/g)].map(m => m[1]))].filter(n => lucide[pascal(n)]).sort();
      const out = {};
      for (const n of names) {
        let node = lucide[pascal(n)];
        if (node[0] === 'svg') node = node[2];
        out[n] = node
          .map(
            ([t, a]) =>
              `<${t} ${Object.entries(a)
                .filter(([k]) => k !== 'key')
                .map(([k, v]) => `${k}="${v}"`)
                .join(' ')}/>`,
          )
          .join('');
      }
      return `export const ICONS = ${JSON.stringify(out)};`;
    },
  };
}

// Temporary MPA routing while the legacy entry remains the default.
function reactRoutes() {
  const rewrite = (req, _res, next) => {
    if (/^\/(oauth\/consent|auth\/callback|integrations|login|app-local(?:\/[^?]*)?|app(?:\/[^?]*)?)(?:[?]|$)/.test(req.url))
      req.url = '/react.html' + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '');
    next();
  };
  return {
    name: 'react-auth-routes',
    configureServer(server) {
      server.middlewares.use(rewrite);
    },
    configurePreviewServer(server) {
      server.middlewares.use(rewrite);
    },
  };
}
export default defineConfig({
  plugins: [reactRoutes(), react(), tailwindcss(), lucideSubset()],
  resolve: { alias: { '@': path.resolve('src') } },
  build: { rollupOptions: { input: { legacy: path.resolve('index.html'), react: path.resolve('react.html') } } },
  server: { port: 5173 },
});
