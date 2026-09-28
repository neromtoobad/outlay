import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// public/sprites and public/scene are symlinks into ../assets (served as /sprites/..., /scene/...)
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: { '/api': { target: 'http://localhost:8790', changeOrigin: true } },
  },
});
