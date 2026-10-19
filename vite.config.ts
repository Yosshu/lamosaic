import { defineConfig } from 'vitest/config';

// GitHub Pages serves the app under /<repo>/, so the base path is injected at build time.
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  build: {
    target: 'es2022',
    rollupOptions: {
      input: {
        main: 'index.html',
        lab: 'lab.html',
      },
    },
  },
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.ts'],
  },
});
