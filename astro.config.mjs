import { defineConfig } from 'astro/config';
import node from '@astrojs/node';

const allowedHosts = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '.ngrok-free.app',
  '.ngrok.app',
  '.localhost'
]);

for (const raw of [process.env.APP_URL, process.env.PUBLIC_URL]) {
  if (!raw) continue;
  try {
    const hostname = new URL(raw).hostname;
    if (hostname) allowedHosts.add(hostname);
  } catch (_) {
    // Ignore invalid URL values; the app will still use the safe fallback list.
  }
}

export default defineConfig({
  output: 'server',
  adapter: node({
    mode: 'standalone'
  }),
  server: {
    port: 4321,
    host: true,
    allowedHosts: Array.from(allowedHosts)
  },
  vite: {
    define: {
      'import.meta.env.SESSION_SECRET': JSON.stringify(process.env.SESSION_SECRET || 'dev-secret-change-me'),
    },
    ssr: {
      noExternal: ['xlsx', 'nanoid']
    }
  }
});
