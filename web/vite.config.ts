import { readFileSync } from 'node:fs';
import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The API runs in the Worker (`wrangler dev`, :8787 by default); API_ORIGIN can
// point at something else, e.g. scripts/mock-api.mjs.
const api = process.env.API_ORIGIN ?? 'http://127.0.0.1:8787';
const proxy = { '/api': api, '/auth': api };

// Serve `vite preview` with the same security headers production gets from
// public/_headers, so CSP violations show up locally.
const securityHeaders = Object.fromEntries(
  readFileSync(path.resolve(import.meta.dirname, 'public/_headers'), 'utf8')
    .split('\n/assets/*')[0]
    .split('\n')
    .filter((l) => /^\s+[A-Za-z-]+:/.test(l))
    .map((l) =>
      l
        .trim()
        .split(/:\s(.*)/s)
        .slice(0, 2),
    ),
);

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } },
  build: { outDir: 'dist', modulePreload: { polyfill: false } },
  server: { proxy },
  preview: { proxy, headers: securityHeaders },
});
