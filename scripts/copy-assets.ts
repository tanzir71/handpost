import { cp,mkdir } from 'node:fs/promises';
await mkdir('dist/main/migrations',{recursive:true});await cp('src/main/db/migrations','dist/main/migrations',{recursive:true});console.log('Copied main-process runtime assets');
