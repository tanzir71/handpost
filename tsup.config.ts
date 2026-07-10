import { defineConfig } from 'tsup';
export default defineConfig({entry:['src/main/index.ts','src/main/preload.ts'],format:['cjs'],outDir:'dist/main',target:'es2022',noExternal:['p-queue'],clean:false,sourcemap:true});
