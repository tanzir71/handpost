import { cp, mkdir } from 'node:fs/promises';
await mkdir('dist/main/migrations', { recursive: true });
await cp('src/main/db/migrations', 'dist/main/migrations', { recursive: true });
await mkdir('dist/main/assets', { recursive: true });
await cp('src/main/assets', 'dist/main/assets', { recursive: true });
console.log('Copied main-process runtime assets');
