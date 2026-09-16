import { defineConfig } from 'vite'

export default defineConfig({
  server: { port: 5173 },
  // The sound worklet is bundled as a module: a worklet scope has no `self` for an IIFE to hang on.
  worker: { format: 'es' },
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
