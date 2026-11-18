/** Writer guides shipped with the app and the prompt Settings → Automation offers to copy. */
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { AutomationInfo } from '../../shared/inbox-types';
import { defaultHandpostFolder } from './paths';

export const PROTOCOL_URL = 'https://github.com/tanzir71/handpost/blob/master/docs/INBOX_PROTOCOL.md';
export const AUTOMATION_URL = 'https://github.com/tanzir71/handpost/blob/master/docs/AUTOMATION.md';

/** The packaged copy sits next to the bundle (scripts/copy-assets.ts); in development read the repo files. */
export function readIntegration(name: 'HANDPOST_WRITER.md' | 'AGENTS.md' | 'HANDPOST_SELECTORS.md'): string {
  const repo =
    name === 'AGENTS.md'
      ? ['codex', 'AGENTS.md']
      : name === 'HANDPOST_SELECTORS.md'
        ? ['claude', 'handpost-selectors', 'SKILL.md']
        : ['claude', 'handpost-inbox', 'SKILL.md'];
  const runtime = typeof __dirname === 'string' ? __dirname : process.cwd();
  for (const path of [join(runtime, 'integrations', name), join(process.cwd(), 'integrations', ...repo)])
    if (existsSync(path)) return readFileSync(path, 'utf8');
  return '';
}

/** docs/AUTOMATION.md §A prompt, with the owner's actual Handpost folder. */
export function writerPrompt(folder: string): string {
  return [
    `Every weekday at 08:30, draft tomorrow's post for X, LinkedIn and Bluesky about <topic> and drop it in my Handpost inbox (${folder}) using the handpost-inbox skill.`,
    `Read handpost.status.json first, only use connected platforms, don't repeat anything from the last 14 days, and use mode: review for anything that mentions a person or a company.`,
    `Then read the receipts of yesterday's ids and tell me what was published.`,
  ].join(' ');
}

export function automationInfo(folder: string): AutomationInfo {
  return {
    folder,
    defaultFolder: defaultHandpostFolder(homedir()),
    protocolUrl: PROTOCOL_URL,
    writerPrompt: writerPrompt(folder),
  };
}
