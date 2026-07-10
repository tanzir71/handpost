import { cp,mkdir } from 'node:fs/promises';
await mkdir('dist/main/migrations',{recursive:true});await cp('src/main/db/migrations/001_initial.sql','dist/main/migrations/001_initial.sql');console.log('Copied main-process runtime assets');
