import { useEffect, useMemo, useState } from 'react';
import {
  CalendarClock,
  Copy,
  MoreHorizontal,
  PenLine,
  RotateCcw,
  Send,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import { capabilities } from '../../shared/capabilities';
import type { BreakerRow, InboxListItem, PacingRow } from '../../shared/inbox-types';
import type { AttemptListRow, Fields, TargetListRow } from '../../shared/rows';
import type { PlatformId } from '../../shared/types';
import { handpostApi } from '../lib/api';
import {
  dayHeading,
  dayKey,
  formatTime,
  formatWhen,
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
      'error_code' | 'error_detail' | 'post_id'
    >
  >;
  attempts: Array<EvidenceAttempt & Fields<AttemptListRow, 'target_id'>>;
  onChanged: () => void;
  inbox?: InboxListItem[];
  onEdit?: (postId: number) => void;
}

type QueueTarget = QueueProps['targets'][number];
const ATTENTION = ['failed', 'unverified', 'needs_attention', 'needs_login', 'manual'];

/** Figma Queue 6:264. */
export function Queue({ targets, attempts, onChanged, inbox = [], onEdit }: QueueProps) {
  const [pacing, setPacing] = useState<PacingRow[]>([]);
  const [breakers, setBreakers] = useState<BreakerRow[]>([]);
  const [rescheduling, setRescheduling] = useState<QueueTarget | null>(null);
  const [now, setNow] = useState(() => Date.now());
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
  const attention = targets.filter((target) => ATTENTION.includes(target.status));
  const published = targets
    .filter((target) => target.status === 'published')
    .sort((a, b) => String(b.scheduled_at_utc).localeCompare(String(a.scheduled_at_utc)))
    .slice(0, 20);
  const next = upcoming[0];
  const days = new Map<string, QueueTarget[]>();
  for (const target of upcoming) {
    const key = dayKey(target.scheduled_at_utc!);
    days.set(key, [...(days.get(key) ?? []), target]);
  }
  const run = async (action: () => Promise<void>) => {
    await action();
    onChanged();
  };
  const row = (target: QueueTarget) => (
    <QueueRow
      key={target.id}
      target={target}
      source={sourceOf(target.post_id)}
      attempts={attempts.filter((attempt) => attempt.target_id === target.id)}
      onRetry={() => run(() => handpostApi.retry({ targetId: target.id }))}
      onCancel={() => run(() => handpostApi.cancelTarget({ targetId: target.id }))}
      onManual={() => run(() => handpostApi.openManual(target.id))}
      onReschedule={() => setRescheduling(target)}
      {...(onEdit && target.post_id ? { onEdit: () => onEdit(target.post_id!) } : {})}
    />
  );
  return (
    <main className="screen">
      <header className="screen-header">
        <div>
          <p className="eyebrow">Pipeline</p>
          <h1 className="t-display-m">Queue</h1>
          <p className="secondary-text">One post at a time, paced like a person. Every result is verified.</p>
        </div>
      </header>
      {next && (
        <section className="next-up" aria-label="Next up">
          <div>
            <p className="eyebrow">Next up · {relative(next.scheduled_at_utc, now)}</p>
            <p className="next-up__text">
              <PlatformBadge platform={next.platform} />{' '}
              <span className="clamp-2">{next.base_text || 'Media post'}</span>
            </p>
            <code>
              {formatWhen(next.scheduled_at_utc)} {JITTER_NOTE}
            </code>
          </div>
          <Button
            kind="primary"
            icon={Send}
            disabled={next.status === 'publishing'}
            onClick={() => void run(() => handpostApi.publishNow({ targetId: next.id }))}
          >
            Publish now
          </Button>
        </section>
      )}
      <div className="split split--queue">
        <div className="split__main agenda">
          {attention.length > 0 && (
            <section className="agenda__day" aria-label="Needs attention">
              <h2 className="eyebrow agenda__heading">Needs attention · {attention.length}</h2>
              <div className="hp-card agenda__rows">{attention.map(row)}</div>
            </section>
          )}
          {[...days.entries()].map(([key, rows]) => (
            <section className="agenda__day" key={key} aria-label={dayHeading(rows[0]!.scheduled_at_utc!)}>
              <h2 className="eyebrow agenda__heading agenda__heading--muted">
                {dayHeading(rows[0]!.scheduled_at_utc!)}
              </h2>
              <div className="hp-card agenda__rows">{rows.map(row)}</div>
            </section>
          ))}
          {published.length > 0 && (
            <section className="agenda__day" aria-label="Recently published">
              <h2 className="eyebrow agenda__heading agenda__heading--muted">Recently published</h2>
              <div className="hp-card agenda__rows">{published.map(row)}</div>
            </section>
          )}
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
                      {item.cooldownUntil && (
                        <small>Cooling down until {formatTime(item.cooldownUntil)}</small>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="t-body-s muted">
              At least 3 minutes between posts per platform (10 for Instagram).
            </p>
          </Card>
          <Card title="Circuit breakers">
            {breakers.length === 0 ? (
              <p className="t-body-s secondary-text">
                No platform is paused. A detection event freezes a platform for 24 h.
              </p>
            ) : (
              <ul className="breakers">
                {breakers.map((breaker) => (
                  <li key={breaker.platform}>
                    <ShieldAlert size={16} aria-hidden="true" />
                    <div>
                      <strong>
                        {capabilities[breaker.platform as PlatformId]?.label ?? breaker.platform}
                      </strong>
                      <small>
                        {breaker.manual
                          ? 'Paused until you re-enable it (two detection events in 7 days).'
                          : `Paused until ${formatWhen(breaker.until)} after a detection event.`}
                      </small>
                    </div>
                    <a className="hp-button hp-button--secondary hp-button--s" href="#/accounts">
                      Review
                    </a>
                  </li>
                ))}
              </ul>
            )}
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
  onCancel,
  onManual,
  onReschedule,
  onEdit,
}: {
  target: QueueTarget;
  source: string | null;
  attempts: QueueProps['attempts'];
  onRetry: () => void;
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
      {target.error_detail && (
        <p
          className={`hp-callout hp-callout--${target.status === 'failed' ? 'danger' : 'warn'} queue-row__error`}
        >
          <strong>{target.error_code}</strong>: {target.error_detail}
        </p>
      )}
      {expandable && (
        <div className="queue-row__evidence">
          {attempts.map((attempt, index) => (
            <AttemptEvidence key={attempt.id} attempt={attempt} open={index === 0} />
          ))}
          <div className="queue-row__actions">
            {['failed', 'unverified', 'needs_attention'].includes(target.status) && (
              <Button size="s" kind="primary" icon={RotateCcw} onClick={onRetry}>
                Retry
              </Button>
            )}
            <Button size="s" icon={Copy} onClick={onManual}>
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
