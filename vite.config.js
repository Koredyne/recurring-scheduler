import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { openDb } from './server/db.js';
import { apiMiddleware } from './server/api.js';

// Serves the SQLite-backed API from the Vite dev server at /api — one `npm run dev` runs everything.
function localApi() {
  return {
    name: 'local-api',
    configureServer(server) {
      server.middlewares.use('/api', apiMiddleware(openDb(process.env.DB_FILE || 'data/schedule.db')));
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), localApi()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  server: { watch: { ignored: ['**/data/**'] } },
});
