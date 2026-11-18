import { useEffect, useMemo, useState } from 'react';
import {
  CalendarClock,
  Check,
  Clock3,
  Copy,
  ExternalLink,
  MoreHorizontal,
  Pause,
  PenLine,
  Play,
  RotateCcw,
  Send,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { capabilities } from '../../shared/capabilities';
import type { BreakerRow, InboxListItem, PacingRow } from '../../shared/inbox-types';
import type { AttemptListRow, Fields, TargetListRow } from '../../shared/rows';
import type { PlatformId } from '../../shared/types';
import { handpostApi } from '../lib/api';
import {
  dayKey,
  dayTitle,
  formatDayTime,
  formatTime,
  JITTER_NOTE,
  relative,
  toLocalInput,
} from '../lib/format';
import {
  Button,
  Card,
  ConfirmPopover,
  EmptyState,
  Modal,
  PlatformBadge,
  SourceChip,
  StatusPill,
} from '../ui';
import { AttemptEvidence, type EvidenceAttempt } from './AttemptEvidence';

export interface QueueProps {
  targets: Array<
    Fields<
      TargetListRow,
      'id' | 'platform' | 'base_text' | 'status' | 'scheduled_at_utc',
      'error_code' | 'error_detail' | 'post_id' | 'published_url'
    >
  >;
  attempts: Array<EvidenceAttempt & Fields<AttemptListRow, 'target_id'>>;
  onChanged: () => void;
  inbox?: InboxListItem[];
  onEdit?: (postId: number) => void;
  settings?: Array<{ key: string; value: string }>;
}

type QueueTarget = QueueProps['targets'][number];
const ATTENTION = ['failed', 'unverified', 'needs_attention', 'needs_login', 'manual'];
const HIDDEN = ['draft', 'cancelled'];
const shortUrl = (url: string) => {
  try {
    const parsed = new URL(url);
    const tail = parsed.pathname.split('/').filter(Boolean).pop() ?? '';
    return `${parsed.hostname.replace(/^www\./, '')}/…/${tail.slice(-6)}`;
  } catch {
    return url;
  }
};

/** Figma Queue 6:264. */
export function Queue({ targets, attempts, onChanged, inbox = [], onEdit, settings = [] }: QueueProps) {
  const [pacing, setPacing] = useState<PacingRow[]>([]);
  const [breakers, setBreakers] = useState<BreakerRow[]>([]);
  const [rescheduling, setRescheduling] = useState<QueueTarget | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [message, setMessage] = useState('');
  const paused = settings.find((row) => row.key === 'publishing.paused')?.value === 'true';
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const [p, b] = await Promise.all([handpostApi.pacingToday(), handpostApi.breakers()]);
        if (alive) {
          setPacing(p ?? []);
          setBreakers(b ?? []);
        }
      } catch {
        // Panels stay empty when the main process is unavailable (tests, demo).
      }
    };
    void load();
    const timer = setInterval(() => {
      setNow(Date.now());
      void load();
    }, 30_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [targets]);
  const sourceOf = useMemo(() => {
    const map = new Map<number, string | null>();
    for (const item of inbox) if (item.postId) map.set(item.postId, item.source);
    return (postId: number | undefined) => (postId ? (map.get(postId) ?? null) : null);
  }, [inbox]);
  const upcoming = targets
    .filter((target) => ['scheduled', 'publishing'].includes(target.status) && target.scheduled_at_utc)
    .sort((a, b) => String(a.scheduled_at_utc).localeCompare(String(b.scheduled_at_utc)));
  // Figma 6:264: one agenda in time order, grouped by day. Today shows everything (published rows included);
  // earlier days only keep rows that still need the owner. History has the rest.
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const agenda = targets
    .filter((target) => !HIDDEN.includes(target.status))
    .filter(
      (target) =>
        ATTENTION.includes(target.status) ||
        (target.scheduled_at_utc !== null && new Date(target.scheduled_at_utc).getTime() >= today.getTime()),
    )
    .sort((a, b) =>
      String(a.scheduled_at_utc ?? new Date(now).toISOString()).localeCompare(
        String(b.scheduled_at_utc ?? new Date(now).toISOString()),
      ),
    );
  const next = upcoming[0];
  const days = new Map<string, QueueTarget[]>();
  for (const target of agenda) {
    const key = dayKey(target.scheduled_at_utc ?? new Date(now).toISOString());
    days.set(key, [...(days.get(key) ?? []), target]);
  }
  const run = async (action: () => Promise<unknown>) => {
    try {
      await action();
      setMessage('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
    onChanged();
  };
  const setPaused = (value: boolean) =>
    run(() => handpostApi.saveSetting({ key: 'publishing.paused', value: String(value) }));
  const row = (target: QueueTarget) => (
    <QueueRow
      key={target.id}
      target={target}
      source={sourceOf(target.post_id)}
      attempts={attempts.filter((attempt) => attempt.target_id === target.id)}
      onRetry={() => run(() => handpostApi.retry({ targetId: target.id }))}
      onReverify={() =>
        run(async () => {
          const result = await handpostApi.reverify({ targetId: target.id });
          if (result === 'unverified') throw new Error('Still not found on your profile. Check it by hand.');
        })
      }
      onCancel={() => run(() => handpostApi.cancelTarget({ targetId: target.id }))}
      onManual={() => run(() => handpostApi.openManual(target.id))}
      onReschedule={() => setRescheduling(target)}
      {...(onEdit && target.post_id ? { onEdit: () => onEdit(target.post_id!) } : {})}
    />
  );
  const cooling = pacing
    .filter((item) => item.cooldownUntil && new Date(item.cooldownUntil).getTime() > now)
    .sort((a, b) => String(a.cooldownUntil).localeCompare(String(b.cooldownUntil)))[0];
  return (
    <main className="screen">
      <header className="screen-header">
        <div>
          <p className="eyebrow">Pipeline</p>
          <h1 className="t-display-m">Queue</h1>
          <p className="secondary-text">
            Everything that will publish, in order — one at a time, at human pace. Every attempt ends with
            proof.
          </p>
        </div>
        <div className="screen-header__actions">
          <Button icon={paused ? Play : Pause} onClick={() => void setPaused(!paused)}>
            {paused ? 'Resume publishing' : 'Pause publishing'}
          </Button>
        </div>
      </header>
      {paused ? (
        <section className="next-up next-up--paused" aria-label="Publishing paused">
          <Pause size={20} aria-hidden="true" />
          <strong>Publishing is paused</strong>
          <code>
            nothing posts until you resume · {upcoming.length} queued · posts more than 2 h late will wait for
            a look
          </code>
        </section>
      ) : (
        next && (
          <section className="next-up" aria-label="Next up">
            <Clock3 size={20} aria-hidden="true" />
            <strong>
              Next: {capabilities[next.platform as PlatformId]?.label ?? next.platform}{' '}
              {relative(next.scheduled_at_utc, now)}
            </strong>
            <code>
              {dayTitle(next.scheduled_at_utc!).split(' · ')[0]} {formatTime(next.scheduled_at_utc)}{' '}
              {JITTER_NOTE.replace(' ', '')} · {upcoming.length} queued
            </code>
            <Button
              kind="ghost"
              icon={Send}
              disabled={next.status === 'publishing'}
              onClick={() => void run(() => handpostApi.publishNow({ targetId: next.id }))}
            >
              Publish now
            </Button>
          </section>
        )
      )}
      {message && (
        <p role="alert" className="hp-callout hp-callout--danger">
          {message}
        </p>
      )}
      <div className="split split--queue">
        <div className="split__main agenda">
          {[...days.entries()].map(([key, rows]) => {
            const title = dayTitle(rows[0]!.scheduled_at_utc ?? new Date(now).toISOString());
            return (
              <section className="agenda__day" key={key} aria-label={title}>
                <h2 className="eyebrow agenda__heading agenda__heading--muted">{title}</h2>
                <div className="hp-card agenda__rows">{rows.map(row)}</div>
              </section>
            );
          })}
          {targets.length === 0 && (
            <div className="hp-card">
              <EmptyState
                action={
                  <a className="hp-button hp-button--secondary" href="#/compose">
                    Compose a post
                  </a>
                }
              >
                The queue is empty. Posts you schedule — or that arrive in the inbox — line up here.
              </EmptyState>
            </div>
          )}
        </div>
        <aside className="split__side side-stack">
          <Card title="Today's pacing">
            {pacing.length === 0 ? (
              <p className="muted t-body-s">Nothing published or planned today.</p>
            ) : (
              <ul className="pacing">
                {pacing.map((item) => {
                  const used = item.published + item.planned;
                  return (
                    <li key={item.platform}>
                      <PlatformBadge platform={item.platform} />
                      <span>{capabilities[item.platform as PlatformId]?.label ?? item.platform}</span>
                      <code>
                        {used} / {item.cap}
                      </code>
                      <span className={`hp-bar${used >= item.cap ? ' hp-bar--full' : ''}`} aria-hidden="true">
                        <span style={{ width: `${Math.min(100, (used / item.cap) * 100)}%` }} />
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="pacing__note">
              {cooling
                ? `Cooldown · next ${capabilities[cooling.platform as PlatformId]?.label ?? cooling.platform} allowed at ${formatTime(cooling.cooldownUntil)}`
                : 'Cooldown · 3 min between posts per platform, 10 for Instagram'}
            </p>
          </Card>
          <Card
            title={
              <span className="card-title-icon">
                <ShieldCheck size={18} aria-hidden="true" />
                Circuit breakers
              </span>
            }
          >
            {breakers.length > 0 && (
              <ul className="breakers">
                {breakers.map((breaker) => {
                  const label = capabilities[breaker.platform as PlatformId]?.label ?? breaker.platform;
                  return (
                    <li key={breaker.platform} className="hp-callout hp-callout--danger">
                      <strong>
                        <PlatformBadge platform={breaker.platform} />
                        {breaker.manual
                          ? `${label} frozen until you re-enable it`
                          : `${label} frozen until ${formatDayTime(breaker.until)}`}
                      </strong>
                      <span>
                        {breaker.events.length
                          ? `Detection event ${formatDayTime(breaker.events[breaker.events.length - 1]!)}.`
                          : 'Detection event.'}{' '}
                        Queued {label} posts moved to manual.
                      </span>
                      <a className="breakers__review" href="#/accounts">
                        Review in Accounts
                      </a>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="breakers__clear">
              <Check size={14} aria-hidden="true" />
              {breakers.length ? 'All other platforms clear' : 'All platforms clear'}
            </p>
          </Card>
        </aside>
      </div>
      {rescheduling && (
        <RescheduleModal
          target={rescheduling}
          onClose={() => setRescheduling(null)}
          onSave={async (iso) => {
            await handpostApi.reschedule({ targetId: rescheduling.id, scheduledAt: iso });
            setRescheduling(null);
            onChanged();
          }}
        />
      )}
    </main>
  );
}

function QueueRow({
  target,
  source,
  attempts,
  onRetry,
  onReverify,
  onCancel,
  onManual,
  onReschedule,
  onEdit,
}: {
  target: QueueTarget;
  source: string | null;
  attempts: QueueProps['attempts'];
  onRetry: () => void;
  onReverify: () => void;
  onCancel: () => void;
  onManual: () => void;
  onReschedule: () => void;
  onEdit?: () => void;
}) {
  const [menu, setMenu] = useState(false);
  const expandable = ['failed', 'unverified', 'needs_attention', 'needs_login', 'manual'].includes(
    target.status,
  );
  const live = !['published', 'publishing', 'cancelled'].includes(target.status);
  return (
    <article className="queue-row">
      <div className="queue-row__main">
        <code className="queue-row__time">{formatTime(target.scheduled_at_utc)}</code>
        <PlatformBadge platform={target.platform} />
        <p className="queue-row__text">{target.base_text || 'Media post'}</p>
        {target.published_url ? (
          <a
            className="queue-row__link"
            href={target.published_url}
            onClick={(event) => {
              event.preventDefault();
              void handpostApi.openExternal(target.published_url!);
            }}
          >
            {shortUrl(target.published_url)}
          </a>
        ) : (
          <span aria-hidden="true" />
        )}
        <SourceChip source={source} />
        <StatusPill status={target.status} />
        <div className="hp-popover-anchor">
          <Button
            size="s"
            kind="ghost"
            icon={MoreHorizontal}
            label="More actions"
            aria-haspopup="menu"
            aria-expanded={menu}
            onClick={() => setMenu((value) => !value)}
          />
          {menu && (
            <div
              className="hp-popover hp-popover--below hp-menu"
              role="menu"
              onKeyDown={(event) => {
                if (event.key === 'Escape') setMenu(false);
              }}
            >
              {live && (
                <Button
                  kind="ghost"
                  size="s"
                  icon={CalendarClock}
                  role="menuitem"
                  onClick={() => (setMenu(false), onReschedule())}
                >
                  Reschedule
                </Button>
              )}
              {onEdit && (
                <Button
                  kind="ghost"
                  size="s"
                  icon={PenLine}
                  role="menuitem"
                  onClick={() => (setMenu(false), onEdit())}
                >
                  Edit
                </Button>
              )}
              {live && (
                <ConfirmPopover
                  placement="below"
                  message="Cancel this platform? Nothing is posted and the receipt says cancelled."
                  confirmLabel="Cancel post"
                  onConfirm={() => (setMenu(false), onCancel())}
                  trigger={(open) => (
                    <Button kind="ghost" size="s" icon={XCircle} role="menuitem" onClick={open}>
                      Cancel
                    </Button>
                  )}
                />
              )}
              {target.status !== 'published' && (
                <Button
                  kind="ghost"
                  size="s"
                  icon={Copy}
                  role="menuitem"
                  onClick={() => (setMenu(false), onManual())}
                >
                  Open manually
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
      {target.error_detail && (expandable ? attempts.length === 0 : true) && (
        <p
          className={`hp-callout hp-callout--${target.status === 'failed' ? 'danger' : 'warn'} queue-row__error`}
        >
          <strong>{target.error_code}</strong>: {target.error_detail}
        </p>
      )}
      {expandable && (
        <div className="queue-row__evidence">
          {attempts.map((attempt, index) => (
            <AttemptEvidence
              key={attempt.id}
              attempt={attempt}
              open={index === 0}
              label={`Attempt ${attempts.length - index} · step log`}
            />
          ))}
          <div className="queue-row__actions">
            {target.status === 'unverified' ? (
              <Button size="s" icon={RotateCcw} onClick={onReverify}>
                Retry verify
              </Button>
            ) : (
              ['failed', 'needs_attention'].includes(target.status) && (
                <Button size="s" icon={RotateCcw} onClick={onRetry}>
                  Retry
                </Button>
              )
            )}
            <Button size="s" kind="ghost" icon={ExternalLink} onClick={onManual}>
              Open manually · copies text
            </Button>
          </div>
        </div>
      )}
    </article>
  );
}

function RescheduleModal({
  target,
  onClose,
  onSave,
}: {
  target: QueueTarget;
  onClose: () => void;
  onSave: (iso: string) => Promise<void>;
}) {
  const initial = target.scheduled_at_utc
    ? new Date(target.scheduled_at_utc)
    : new Date(Date.now() + 3_600_000);
  const local = toLocalInput(initial);
  const [value, setValue] = useState(local);
  return (
    <Modal
      title="Reschedule"
      onClose={onClose}
      footer={
        <>
          <Button kind="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button kind="primary" onClick={() => void onSave(new Date(value).toISOString())}>
            Save time
          </Button>
        </>
      }
    >
      <label className="hp-field">
        <span>New time (local)</span>
        <input type="datetime-local" value={value} onChange={(event) => setValue(event.target.value)} />
        <small>
          {capabilities[target.platform as PlatformId]?.label ?? target.platform} · {JITTER_NOTE} jitter
          applies
        </small>
      </label>
    </Modal>
  );
}
