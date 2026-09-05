import { defineConfig } from 'vite'

export default defineConfig({
  server: { port: 5173 },
  // Workspace packages are consumed as TypeScript source; no build step.
  optimizeDeps: {
    exclude: ['@vesper/nitrofs', '@vesper/nitro-gfx', '@vesper/nitro-comp', '@vesper/l5-gpc'],
  },
})
