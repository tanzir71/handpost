import { CalendarDays, History, Inbox, ListOrdered, PenLine, PlugZap, Settings2 } from 'lucide-react';
import type { InboxHealth } from '../../shared/inbox-types';
import { relative, shortPath } from '../lib/format';
import type { Screen } from '../hooks/useRoute';
import { Lockup, NavItem } from '../ui';

const ITEMS = [
  ['inbox', 'Inbox', Inbox],
  ['compose', 'Compose', PenLine],
  ['calendar', 'Calendar', CalendarDays],
  ['queue', 'Queue', ListOrdered],
  ['accounts', 'Accounts', PlugZap],
  ['history', 'History', History],
  ['settings', 'Settings', Settings2],
] as const;

interface SidebarProps {
  screen: Screen;
  onNavigate: (screen: Screen) => void;
  health: InboxHealth | null;
  /** Inbox badge: held + rejected today. */
  inboxCount: number;
  queueAttention: number;
}

/** Figma App/Sidebar 6:8 — lockup, nav, spacer, watcher card, privacy line. */
export function Sidebar({ screen, onNavigate, health, inboxCount, queueAttention }: SidebarProps) {
  const dot = health?.state ?? 'warn';
  const watcherText = !health
    ? 'Starting the inbox watcher…'
    : !health.exists
      ? 'Handpost folder is missing'
      : health.lastError
        ? health.lastError
        : `Last scan ${relative(health.lastScanAt)}`;
  return (
    <aside className="sidebar">
      <a className="sidebar__brand" href="#/inbox" aria-label="Handpost — Inbox">
        <Lockup size={30} />
      </a>
      <nav aria-label="Primary" className="sidebar__nav">
        {ITEMS.map(([id, label, icon]) => (
          <NavItem
            key={id}
            icon={icon}
            label={label}
            active={screen === id}
            onClick={() => onNavigate(id)}
            {...(id === 'inbox' && inboxCount ? { count: inboxCount, attention: true } : {})}
            {...(id === 'queue' && queueAttention ? { count: queueAttention, attention: true } : {})}
          />
        ))}
      </nav>
      <div className="sidebar__spacer" />
      <section className="watcher" aria-label="Inbox watcher">
        <div className="watcher__head">
          <span className={`hp-dot hp-dot--${dot}`} aria-hidden="true" />
          <strong>{health?.exists === false ? 'Not watching' : 'Watching inbox'}</strong>
        </div>
        <code className="watcher__path" title={health?.folder}>
          {health
            ? `${shortPath(health.folder)}${health.folder.includes('\\') ? '\\' : '/'}inbox`
            : '~/Handpost/inbox'}
        </code>
        <small className={dot === 'ok' ? undefined : `watcher__note watcher__note--${dot}`}>
          {watcherText}
        </small>
        {health?.git?.enabled && (
          <small className={health.git.lastError ? 'watcher__note watcher__note--warn' : undefined}>
            Git {health.git.name}:{' '}
            {health.git.lastError
              ? 'pull failed'
              : health.git.lastSyncAt
                ? `pulled ${relative(health.git.lastSyncAt)}`
                : 'not pulled yet'}
          </small>
        )}
        {health && (health.held > 0 || health.waitingMedia > 0) && (
          <small>
            {health.held} held · {health.waitingMedia} waiting for media
          </small>
        )}
      </section>
      <p className="sidebar__privacy">Local-only · no telemetry</p>
    </aside>
  );
}
