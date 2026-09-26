/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

const host = process.env.TAURI_DEV_HOST;
const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// One HTML entry per Tauri window: pet overlay, settings, command palette.
export default defineConfig({
  plugins: [svelte()],
  clearScreen: false,
  resolve: {
    alias: {
      $lib: r('./src/lib'),
      $pets: r('./src/pets'),
    },
  },
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: 'ws', host, port: 1421 } : undefined,
    watch: { ignored: ['**/src-tauri/**', '**/previews/**'] },
  },
  build: {
    target: 'es2022',
    rolldownOptions: {
      input: {
        pet: r('./pet.html'),
        settings: r('./settings.html'),
        palette: r('./palette.html'),
      },
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
