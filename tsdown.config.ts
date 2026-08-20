import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/bin.ts', 'src/mcp-bin.ts'],
  format: 'esm',
  target: 'node20',
  clean: true,
  dts: true,
  sourcemap: true,
})
