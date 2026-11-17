import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, FileJson, FolderOpen, PenLine, Search, X, XCircle } from 'lucide-react';
import { capabilities } from '../../shared/capabilities';
import type { InboxListItem } from '../../shared/inbox-types';
import type { PlatformId } from '../../shared/types';
import { handpostApi } from '../lib/api';
import { INBOX_FILTERS, matchesFilter, matchesQuery, type InboxFilter } from '../lib/inbox-filters';
import { formatWhen, JITTER_NOTE, shortPath } from '../lib/format';
import {
  AirmailStripe,
  Button,
  Checks,
  ConfirmPopover,
  EmptyState,
  Modal,
  PlatformBadge,
  PlatformBadges,
  SourceChip,
  StatusPill,
  Toggle,
  sourceTask,
} from '../ui';

const ROW_HEIGHT = 76;
const VIRTUALIZE_ABOVE = 200;
const TRUST_SENTENCE =
  'Anything that can write to the inbox folder can publish to your connected accounts. Keep the folder on this computer, or in a sync service you fully control.';

function sessionValue(key: string, fallback: string): string {
  try {
    return sessionStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}
function remember(key: string, value: string) {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // Session storage is a convenience only.
  }
}

interface InboxProps {
  items: InboxListItem[];
  settings: Array<{ key: string; value: string }>;
  onChanged: () => void;
  onEdit: (postId: number) => void;
  onOpenAutomation: () => void;
}

/** Figma Inbox 6:101. */
export function Inbox({ items, settings, onChanged, onEdit, onOpenAutomation }: InboxProps) {
  const [filter, setFilter] = useState<InboxFilter>(
    () => sessionValue('handpost.inbox.filter', 'all') as InboxFilter,
  );
  const [query, setQuery] = useState(() => sessionValue('handpost.inbox.query', ''));
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState('');
  const setting = (key: string) => settings.find((row) => row.key === key)?.value;
  const autoSchedule = setting('inbox.autoSchedule') === 'true';
  const trustConfirmed = setting('inbox.trustConfirmed') === 'true';
  const counts = useMemo(
    () =>
      Object.fromEntries(
        INBOX_FILTERS.map(([id]) => [id, items.filter((item) => matchesFilter(item, id)).length]),
      ),
    [items],
  ) as Record<InboxFilter, number>;
  const rows = useMemo(
    () => items.filter((item) => matchesFilter(item, filter) && matchesQuery(item, query)),
    [items, filter, query],
  );
  const selected = rows.find((row) => row.key === selectedKey) ?? null;

  const chooseFilter = (next: InboxFilter) => {
    setFilter(next);
    remember('handpost.inbox.filter', next);
  };
  const setAuto = async (next: boolean) => {
    if (next && !trustConfirmed) {
      setConfirming(true);
      return;
    }
    await handpostApi.saveSetting({ key: 'inbox.autoSchedule', value: String(next) });
    onChanged();
  };
  const act = async (action: () => Promise<unknown>, done: string) => {
    try {
      await action();
      setMessage(done);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
    onChanged();
  };

  return (
    <main className="screen">
      <header className="screen-header">
        <div>
          <p className="eyebrow">Automation inbox</p>
          <h1 className="t-display-m">Inbox</h1>
          <p className="secondary-text">
            Posts from Claude, Codex and scripts. Every file ends with a receipt.
          </p>
        </div>
        <div className="screen-header__actions">
          <span className="inline-toggle">
            <Toggle checked={autoSchedule} onChange={(next) => void setAuto(next)} label="Auto-schedule" />
            <span aria-hidden="true">Auto-schedule</span>
          </span>
          <Button icon={FolderOpen} onClick={() => void handpostApi.inboxOpen({ target: 'inbox' })}>
            Open folder
          </Button>
        </div>
      </header>
      {confirming && (
        <Modal
          title="Turn on Auto-schedule?"
          onClose={() => setConfirming(false)}
          footer={
            <>
              <Button kind="ghost" onClick={() => setConfirming(false)}>
                Keep holding posts
              </Button>
              <Button
                kind="primary"
                onClick={async () => {
                  await handpostApi.saveSetting({ key: 'inbox.trustConfirmed', value: 'true' });
                  await handpostApi.saveSetting({ key: 'inbox.autoSchedule', value: 'true' });
                  setConfirming(false);
                  onChanged();
                }}
              >
                Turn on Auto-schedule
              </Button>
            </>
          }
        >
          <p>
            With Auto-schedule on, valid files are scheduled without waiting for you. Files that ask for{' '}
            <code>mode: review</code> are still held.
          </p>
          <p className="hp-callout hp-callout--warn">
            <strong>{TRUST_SENTENCE}</strong>
          </p>
          <p className="secondary-text">
            Every guardrail still applies: one post at a time, cooldowns, daily caps, jitter and the circuit
            breaker.
          </p>
        </Modal>
      )}
      <div className="toolbar" role="toolbar" aria-label="Inbox filters">
        <div className="toolbar__pills">
          {INBOX_FILTERS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              className="hp-filter"
              aria-pressed={filter === id}
              onClick={() => chooseFilter(id)}
            >
              {label}
              <span>{counts[id]}</span>
            </button>
          ))}
        </div>
        <label className="hp-field hp-field--icon toolbar__search">
          <span className="sr-only">Search the inbox</span>
          <span className="hp-field__control">
            <Search size={16} aria-hidden="true" />
            <input
              type="search"
              value={query}
              placeholder="Search id, text, source"
              onChange={(event) => {
                setQuery(event.target.value);
                remember('handpost.inbox.query', event.target.value);
              }}
            />
          </span>
        </label>
      </div>
      {message && (
        <p role="status" className="hp-callout hp-callout--ink">
          {message}
        </p>
      )}
      <div className={selected ? 'split' : 'split split--single'}>
        <section className="hp-card split__main" aria-label="Inbox items">
          {items.length === 0 ? (
            <EmptyState
              action={
                <Button kind="secondary" onClick={onOpenAutomation}>
                  Connect a Claude scheduled task →
                </Button>
              }
            >
              Nothing in the inbox. Drop a file in <code>~/Handpost/inbox</code> or connect a Claude scheduled
              task.
            </EmptyState>
          ) : rows.length === 0 ? (
            <EmptyState action={<Button onClick={() => chooseFilter('all')}>Show everything</Button>}>
              No items match this filter.
            </EmptyState>
          ) : (
            <InboxList rows={rows} selectedKey={selected?.key ?? null} onSelect={setSelectedKey} />
          )}
        </section>
        {selected && (
          <aside className="split__side" aria-label="Receipt">
            <ReceiptPanel
              item={selected}
              onApprove={() =>
                act(() => handpostApi.inboxApprove(selected.id), `${selected.id} approved and scheduled`)
              }
              onReject={() => act(() => handpostApi.inboxReject(selected.id), `${selected.id} rejected`)}
              onEdit={selected.postId ? () => onEdit(selected.postId!) : undefined}
              onClose={() => setSelectedKey(null)}
            />
          </aside>
        )}
      </div>
    </main>
  );
}

function InboxList({
  rows,
  selectedKey,
  onSelect,
}: {
  rows: InboxListItem[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const virtual = rows.length > VIRTUALIZE_ABOVE;
  const viewport = 10;
  const start = virtual ? Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 5) : 0;
  const end = virtual ? Math.min(rows.length, start + Math.ceil(800 / ROW_HEIGHT) + viewport) : rows.length;
  const selectedIndex = rows.findIndex((row) => row.key === selectedKey);
  useEffect(() => {
    if (!virtual || selectedIndex < 0 || !scroller.current) return;
    const top = selectedIndex * ROW_HEIGHT;
    const el = scroller.current;
    if (top < el.scrollTop) el.scrollTop = top;
    else if (top + ROW_HEIGHT > el.scrollTop + el.clientHeight)
      el.scrollTop = top + ROW_HEIGHT - el.clientHeight;
  }, [selectedIndex, virtual]);
  const move = (delta: number) => {
    const next =
      rows[Math.min(rows.length - 1, Math.max(0, (selectedIndex < 0 ? -1 : selectedIndex) + delta))];
    if (next) {
      onSelect(next.key);
      requestAnimationFrame(() =>
        scroller.current?.querySelector<HTMLElement>(`[data-key="${CSS.escape(next.key)}"]`)?.focus(),
      );
    }
  };
  return (
    <div
      ref={scroller}
      className={`inbox-list${virtual ? ' inbox-list--virtual' : ''}`}
      role="listbox"
      aria-label="Inbox items"
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
    >
      <div className="inbox-list__head" aria-hidden="true">
        <span>Source</span>
        <span>Post</span>
        <span>Platforms</span>
        <span>When</span>
        <span>Status</span>
      </div>
      <div style={virtual ? { height: rows.length * ROW_HEIGHT, position: 'relative' } : undefined}>
        {rows.slice(start, end).map((row, offset) => {
          const index = start + offset;
          const when = row.receipt.targets.find((target) => target.scheduled_at)?.scheduled_at ?? null;
          return (
            <div
              key={row.key}
              data-key={row.key}
              role="option"
              aria-selected={row.key === selectedKey}
              tabIndex={row.key === selectedKey || (selectedKey === null && index === 0) ? 0 : -1}
              className="inbox-row"
              style={
                virtual
                  ? { position: 'absolute', top: index * ROW_HEIGHT, left: 0, right: 0, height: ROW_HEIGHT }
                  : undefined
              }
              onClick={() => onSelect(row.key)}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  move(1);
                } else if (event.key === 'ArrowUp') {
                  event.preventDefault();
                  move(-1);
                } else if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onSelect(row.key);
                }
              }}
            >
              <span className="inbox-row__source">
                <SourceChip source={row.source} />
                <code>{sourceTask(row.source)}</code>
              </span>
              <span className="inbox-row__post">
                <span className="clamp-2">{row.text ?? row.receipt.errors[0]?.message ?? row.id}</span>
                <code>
                  {row.fileName} · {formatWhen(row.receivedAt)}
                </code>
              </span>
              <PlatformBadges platforms={row.receipt.targets.map((target) => target.platform)} />
              <span className="inbox-row__when">
                {when ? (
                  <>
                    {formatWhen(when)}
                    <small>{JITTER_NOTE}</small>
                  </>
                ) : (
                  <span className="muted">—</span>
                )}
              </span>
              <StatusPill status={row.state} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function why(item: InboxListItem): { tone: 'warn' | 'danger' | 'ink'; text: string } | null {
  const { receipt } = item;
  if (item.state === 'held')
    return receipt.mode === 'review'
      ? { tone: 'warn', text: 'The writer asked for review (mode: review). Approve to schedule it.' }
      : { tone: 'warn', text: 'Held because Auto-schedule is off. Approve to schedule it.' };
  if (item.state === 'waiting_media')
    return { tone: 'warn', text: 'Waiting up to 10 minutes for media files that are not in the inbox yet.' };
  if (item.state === 'rejected')
    return receipt.errors[0]
      ? { tone: 'danger', text: `Rejected: ${receipt.errors[0].code} — ${receipt.errors[0].message}` }
      : { tone: 'danger', text: 'Rejected in Handpost. Nothing will be published.' };
  if (item.state === 'duplicate')
    return {
      tone: 'ink',
      text: 'Same id and content as an earlier file. Nothing changed and nothing posts twice.',
    };
  if (item.state === 'draft')
    return { tone: 'ink', text: 'Draft only (mode: draft). Open it in Compose to schedule.' };
  return null;
}

/** The Receipt panel (392 px, airmail stripe on top). */
export function ReceiptPanel({
  item,
  onApprove,
  onReject,
  onEdit,
  onClose,
}: {
  item: InboxListItem;
  onApprove: () => void;
  onReject: () => void;
  onEdit?: (() => void) | undefined;
  onClose?: () => void;
}) {
  const { receipt } = item;
  const reason = why(item);
  const checks: Array<{ tone: 'ok' | 'warn' | 'danger'; text: string }> = [
    ...receipt.errors.map((issue) => ({
      tone: 'danger' as const,
      text: `${issue.code}${issue.path ? ` at ${issue.path}` : ''}: ${issue.message}`,
    })),
    ...receipt.warnings.map((issue) => ({ tone: 'warn' as const, text: issue.message })),
  ];
  if (!receipt.errors.length && item.state !== 'duplicate') {
    checks.unshift(
      { tone: 'ok', text: 'Protocol v1 schema' },
      { tone: 'ok', text: 'Content fits every platform' },
    );
  }
  const canDecide = item.state === 'held';
  const canReject = item.postId !== null && ['held', 'scheduled', 'draft'].includes(item.state);
  return (
    <section className="hp-card receipt-panel" aria-labelledby="receipt-title">
      <AirmailStripe />
      <div className="hp-card__body hp-receipt">
        <div className="receipt-panel__title">
          <div>
            <p className="eyebrow">Receipt</p>
            <h2 id="receipt-title" className="t-heading-m receipt-panel__id">
              {receipt.id}
            </h2>
          </div>
          <span className="receipt-panel__status">
            <StatusPill status={item.state} />
            {onClose && <Button kind="ghost" size="s" icon={X} label="Close receipt" onClick={onClose} />}
          </span>
        </div>
        {reason && <p className={`hp-callout hp-callout--${reason.tone}`}>{reason.text}</p>}
        <dl>
          <dt>Source</dt>
          <dd>{receipt.source ?? 'not given'}</dd>
          <dt>File</dt>
          <dd>{item.storedPath ?? item.fileName}</dd>
          <dt>Received</dt>
          <dd>{formatWhen(item.receivedAt, { withDay: true })}</dd>
          <dt>Post id</dt>
          <dd>{item.postId ?? '—'}</dd>
        </dl>
        <div>
          <p className="hp-section-label">Checks</p>
          {checks.length ? <Checks items={checks} /> : <p className="muted t-body-s">No checks recorded.</p>}
        </div>
        {receipt.targets.length > 0 && (
          <div>
            <p className="hp-section-label">Will publish</p>
            <ul className="hp-will-publish">
              {receipt.targets.map((target) => (
                <li key={target.platform}>
                  <PlatformBadge platform={target.platform} />
                  <span>{capabilities[target.platform as PlatformId]?.label ?? target.platform}</span>
                  {target.url ? (
                    <a
                      href={target.url}
                      onClick={(event) => {
                        event.preventDefault();
                        void handpostApi.openExternal(target.url!);
                      }}
                    >
                      View post
                    </a>
                  ) : (
                    <StatusPill status={target.status} />
                  )}
                  <time dateTime={target.scheduled_at ?? undefined}>
                    {target.scheduled_at
                      ? `${formatWhen(target.scheduled_at)} ${JITTER_NOTE}`
                      : 'not scheduled'}
                  </time>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="receipt-panel__actions">
          {canDecide && (
            <Button kind="primary" icon={Check} onClick={onApprove}>
              Approve &amp; schedule
            </Button>
          )}
          {onEdit && item.state !== 'duplicate' && (
            <Button icon={PenLine} onClick={onEdit}>
              Edit
            </Button>
          )}
          {canReject && (
            <ConfirmPopover
              message={`Reject ${receipt.id}? Its unpublished platforms are cancelled and the receipt says rejected.`}
              confirmLabel="Reject"
              onConfirm={onReject}
              trigger={(open) => (
                <Button kind="danger" icon={XCircle} onClick={open}>
                  Reject
                </Button>
              )}
            />
          )}
          <Button
            kind="ghost"
            icon={FileJson}
            onClick={() => void handpostApi.inboxOpen({ target: 'receipt', id: receipt.id })}
          >
            Receipt file
          </Button>
        </div>
        <p className="t-mono-s muted">{shortPath(receipt.file)}</p>
      </div>
    </section>
  );
}
