import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': 'http://localhost:4000',
      '/auth': 'http://localhost:4000',
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('recharts'))                                          return 'charts';
          if (id.includes('framer-motion'))                                     return 'motion';
          if (id.includes('lucide-react'))                                      return 'ui-icons';
          if (id.includes('@tanstack/react-query'))                             return 'query';
          if (id.includes('react-dom') || id.includes('react-router'))         return 'react-vendor';
          if (id.includes('cmdk') || id.includes('react-hot-toast') || id.includes('qrcode')) return 'misc-vendor';
        },
      },
    },
  },
});
