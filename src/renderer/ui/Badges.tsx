import { CircleDot, GitBranch, PenLine, Sparkles, Terminal } from 'lucide-react';
import { capabilities } from '../../shared/capabilities';
import type { PlatformId } from '../../shared/types';
import { MONOGRAMS, sourceKind, statusLabel, toneFor, type Tone } from './tones';

/** Figma Status pill 5:62 — colour is always paired with text. */
export function StatusPill({ status, tone, children }: { status?: string; tone?: Tone; children?: string }) {
  const resolved = tone ?? toneFor(status ?? '');
  return <span className={`hp-pill hp-pill--${resolved}`}>{children ?? statusLabel(status ?? '')}</span>;
}

/** Figma Platform badge 5:83 — a mono monogram on a fixed platform hue. */
export function PlatformBadge({ platform, size = 's' }: { platform: string; size?: 's' | 'l' }) {
  const id = platform as PlatformId;
  const label = capabilities[id]?.label ?? platform;
  return (
    <span
      className={`hp-badge hp-badge--${platform}${size === 'l' ? ' hp-badge--l' : ''}`}
      title={label}
      aria-label={label}
      role="img"
    >
      {MONOGRAMS[id] ?? platform.slice(0, 2)}
    </span>
  );
}

export function PlatformBadges({ platforms }: { platforms: string[] }) {
  return (
    <span className="hp-badges">
      {platforms.map((platform) => (
        <PlatformBadge key={platform} platform={platform} />
      ))}
    </span>
  );
}

const SOURCE_ICONS = {
  claude: Sparkles,
  codex: Terminal,
  git: GitBranch,
  manual: PenLine,
  other: CircleDot,
} as const;
const SOURCE_LABELS = {
  claude: 'Claude',
  codex: 'Codex',
  git: 'Git',
  manual: 'Manual',
  other: 'Other',
} as const;

/** Figma Source chip 9:91 — where an inbox post came from. */
export function SourceChip({ source }: { source: string | null | undefined }) {
  const kind = source ? sourceKind(source) : 'manual';
  const Icon = SOURCE_ICONS[kind];
  return (
    <span className={`hp-chip hp-chip--${kind}`}>
      <Icon size={12} aria-hidden="true" />
      {SOURCE_LABELS[kind]}
    </span>
  );
}
