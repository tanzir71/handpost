import { defineConfig } from 'tsup';
export default defineConfig({
  entry: ['src/main/index.ts', 'src/main/preload.ts'],
  format: ['cjs'],
  outDir: 'dist/main',
  target: 'es2022',
  // electron is a devDependency (electron-builder requires that) but is provided by the runtime: never bundle it.
  external: ['electron'],
  noExternal: ['p-queue'],
  clean: false,
  sourcemap: true,
});
