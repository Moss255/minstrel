import { defineConfig } from 'vite'

export default defineConfig({
  server: { port: 5174 },
  // Workspace packages are consumed as TypeScript source; no build step.
  optimizeDeps: {
    exclude: [
      '@minstrel/nitrofs',
      '@minstrel/nitro-gfx',
      '@minstrel/nitro-comp',
      '@minstrel/l5-gpc',
    ],
  },
})
