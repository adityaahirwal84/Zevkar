import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, Plugin } from 'vite';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Custom Vite plugin that cleanly handles the DISABLE_HMR environment toggle.
 * When DISABLE_HMR=true (or 1):
 * - Intercepts Vite's client script (/@vite/client) to prevent initiating an inaccessible HMR WebSocket.
 * - Stubs transport connection so no 'WebSocket closed without opened' errors occur in preview.
 * - Leaves application WebSockets, CSS injection, and React runtime completely functional.
 * When DISABLE_HMR=false (or unset):
 * - Does nothing, allowing standard development HMR over the configured reverse-proxy port.
 */
export function disableHmrPlugin(): Plugin {
  return {
    name: 'vite-plugin-disable-hmr',
    enforce: 'post',
    transform(code: string, id: string) {
      const disableHmr = process.env.DISABLE_HMR === 'true' || process.env.DISABLE_HMR === '1';
      if (!disableHmr) return null;

      // Only transform Vite internal client bundle, leaving user code & app WebSockets untouched
      if (id.includes('vite/dist/client/client.mjs') || id.endsWith('/client.mjs')) {
        let transformed = code;
        transformed = transformed.replace(
          'console.debug("[vite] connecting...");',
          'console.info("[vite] HMR connection disabled by DISABLE_HMR environment variable.");'
        );
        transformed = transformed.replace(
          'transport.connect(createHMRHandler(handleMessage));',
          '/* [vite] HMR connection disabled via DISABLE_HMR */'
        );
        transformed = transformed.replaceAll(
          'new WebSocket(',
          'new (class DummyHMRSocket { constructor() { this.readyState = 3; } addEventListener(){} removeEventListener(){} close(){} send(){} })('
        );

        return {
          code: transformed,
          map: null,
        };
      }
      return null;
    },
  };
}

export default defineConfig(() => {
  const disableHmr = process.env.DISABLE_HMR === 'true' || process.env.DISABLE_HMR === '1';

  return {
    plugins: [react(), tailwindcss(), disableHmrPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname || '.', '.'),
      },
    },
    server: {
      hmr: disableHmr
        ? false
        : {
            clientPort: process.env.APP_URL?.startsWith('https') ? 443 : undefined,
          },
      watch: disableHmr ? null : {},
    },
  };
});
