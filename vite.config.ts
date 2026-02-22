import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
      proxy: {
        '/api/fal/proxy': {
          target: 'https://queue.fal.run',
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/api\/fal\/proxy/, ''),
          configure: (proxy, _options) => {
            proxy.on('proxyReq', (proxyReq, req, _res) => {
              // Extract the target URL from the header Fal client sends
              const targetUrl = req.headers['x-fal-target-url'] as string;
              if (targetUrl) {
                // Point the proxy to the actual target URL
                const url = new URL(targetUrl);
                proxyReq.protocol = url.protocol;
                proxyReq.host = url.host;
                proxyReq.path = url.pathname + url.search;
                proxyReq.setHeader('Host', url.host);
              }
              // Inject the API key securely on the server side
              if (env.FAL_KEY) {
                proxyReq.setHeader('Authorization', `Key ${env.FAL_KEY}`);
              }
            });
          }
        }
      }
    },
    plugins: [react()],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.FAL_KEY': JSON.stringify(env.FAL_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});

