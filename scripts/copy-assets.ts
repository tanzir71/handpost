import { cp, mkdir } from 'node:fs/promises';
await mkdir('dist/main/migrations', { recursive: true });
await cp('src/main/db/migrations', 'dist/main/migrations', { recursive: true });
await mkdir('dist/main/assets', { recursive: true });
await cp('src/main/assets', 'dist/main/assets', { recursive: true });
// Writer guides Handpost drops into the Handpost folder on first run (and Settings → Automation copies).
await mkdir('dist/main/integrations', { recursive: true });
await cp('integrations/claude/handpost-inbox/SKILL.md', 'dist/main/integrations/HANDPOST_WRITER.md');
await cp('integrations/codex/AGENTS.md', 'dist/main/integrations/AGENTS.md');
console.log('Copied main-process runtime assets');
