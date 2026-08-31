import { defineConfig } from 'astro/config';
import node from '@astrojs/node';

export default defineConfig({
  output: 'server',
  adapter: node({
    mode: 'standalone'
  }),
  server: {
    port: 4321,
    host: true
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
