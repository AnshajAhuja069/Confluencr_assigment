import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiTarget = process.env.VITE_API_PROXY ?? 'http://localhost:4000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Same paths as production (vercel.json), so links like /docs work in both.
    proxy: { '/api': apiTarget, '/docs': apiTarget, '/openapi.json': apiTarget },
  },
});
