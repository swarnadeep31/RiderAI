import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Send /api requests to the Express server during development.
    proxy: { '/api': 'http://localhost:4000' },
  },
});
