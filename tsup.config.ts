import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/main.ts', 'src/moduleGraph.ts'],
  format: ['esm'],
  dts: true,
})
