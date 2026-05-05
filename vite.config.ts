import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createAuthBrokerPlugin } from './server/auth-broker';

export default defineConfig({
  plugins: [react(), createAuthBrokerPlugin()],
  server: { port: 5173, open: true },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          monaco: ['@monaco-editor/react'],
        },
      },
    },
  },
});
