import { defineConfig } from 'tsup';
export default defineConfig([
  {
    entry: ['src/main/index.ts', 'src/main/preload.ts'],
    format: ['cjs'],
    outDir: 'dist/main',
    target: 'es2022',
    // electron is a devDependency (electron-builder requires that) but is provided by the runtime: never bundle it.
    external: ['electron'],
    noExternal: ['p-queue'],
    clean: false,
    sourcemap: true,
  },
  {
    // handpost-mcp: a standalone stdio server (plain Node, no Electron, no database). zod is bundled so the single
    // file runs from anywhere: `node dist/mcp/server.cjs --folder ~/Handpost`.
    entry: { server: 'src/mcp/server.ts' },
    format: ['cjs'],
    outDir: 'dist/mcp',
    target: 'node20',
    noExternal: ['zod'],
    clean: false,
    sourcemap: false,
  },
]);
