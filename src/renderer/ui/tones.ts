/** Status → tone mapping (docs/DESIGN.md §4) and display helpers shared by the UI components. */
import type { PlatformId } from '../../shared/types';

export type Tone = 'ok' | 'warn' | 'danger' | 'ink' | 'neutral';

const TONES: Record<string, Tone> = {
  published: 'ok',
  ok: 'ok',
  scheduled: 'ink',
  rehearsal: 'ink',
  publishing: 'ink',
  held: 'warn',
  needs_login: 'warn',
  unverified: 'warn',
  manual: 'warn',
  waiting_media: 'warn',
  needs_attention: 'warn',
  partial: 'warn',
  challenged: 'warn',
  failed: 'danger',
  rejected: 'danger',
  frozen: 'danger',
  draft: 'neutral',
  duplicate: 'neutral',
  cancelled: 'neutral',
  unknown: 'neutral',
  not_connected: 'neutral',
};

export function toneFor(status: string): Tone {
  return TONES[status] ?? 'neutral';
}

/** Pill wording follows the Figma frames: lowercase, plain words. */
const LABELS: Record<string, string> = {
  held: 'held for review',
  ok: 'connected',
  unknown: 'not connected',
  not_connected: 'not connected',
  waiting_media: 'waiting for media',
};

export function statusLabel(status: string): string {
  return LABELS[status] ?? status.replace(/_/g, ' ');
}

export const MONOGRAMS: Record<PlatformId, string> = {
  mock: 'mk',
  x: '𝕏',
  linkedin: 'in',
  bluesky: 'bs',
  threads: '@',
  facebook: 'f',
  instagram: 'ig',
  tiktok: 'tt',
  youtube: 'yt',
  pinterest: 'p',
};

export type SourceKind = 'claude' | 'codex' | 'git' | 'manual' | 'other';
export function sourceKind(source: string | null | undefined): SourceKind {
  const tool = source?.split(':')[0];
  return tool === 'claude' || tool === 'codex' || tool === 'git' || tool === 'manual' ? tool : 'other';
}
export function sourceTask(source: string | null | undefined): string {
  if (!source) return 'manual';
  const [, task] = source.split(':');
  return task ?? source;
}
