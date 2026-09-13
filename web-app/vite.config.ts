import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
  define: {
    'process.env.REACT_APP_API_URL': JSON.stringify(process.env.VITE_API_URL || '/api'),
    // Build stamp: lets anyone verify which bundle a deployment serves
    // (Settings → About). Render rebuilds on every push; a stale page means
    // the deploy hasn't landed or the browser cached the old bundle.
    __BUILD_ID__: JSON.stringify(new Date().toISOString()),
  },
});
