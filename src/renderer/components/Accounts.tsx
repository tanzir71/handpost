import { useState, type ReactNode } from 'react';
import { ExternalLink, LogIn, Plus, ShieldCheck, SlidersHorizontal, Trash2, Unlock } from 'lucide-react';
import { capabilities } from '../../shared/capabilities';
import type { AccountRow, Fields, SettingRow, SlotRow } from '../../shared/rows';
import type { PlatformId } from '../../shared/types';
import { handpostApi } from '../lib/api';
import { formatWhen } from '../lib/format';
import { summarizeSlots, WEEKDAYS } from '../lib/slots';
import { Button, Card, ConfirmPopover, EmptyState, Modal, PlatformBadge, StatusPill, Toggle } from '../ui';

export interface AccountsProps {
  accounts: Array<
    Fields<AccountRow, 'id' | 'platform' | 'status' | 'last_checked_at', 'handle' | 'profile_url'>
  >;
  slots: Array<Fields<SlotRow, 'account_id' | 'weekday' | 'time_local'>>;
  settings: SettingRow[];
  onChanged: () => void;
  /** Extra content per card (H6: Rehearse) and the footer line (Chrome detection). */
  renderExtra?: (account: AccountsProps['accounts'][number]) => ReactNode;
  footer?: ReactNode;
}

const SAFE_HEADLESS = new Set(['bluesky']);

/** Figma Accounts 6:346. */
export function Accounts({ accounts, slots, settings, onChanged, renderExtra, footer }: AccountsProps) {
  const [editing, setEditing] = useState<AccountsProps['accounts'][number] | null>(null);
  const setting = (key: string, fallback: string) =>
    settings.find((item) => item.key === key)?.value ?? fallback;
  const real = accounts.filter((account) => account.platform !== 'mock');
  return (
    <main className="screen">
      <header className="screen-header">
        <div>
          <p className="eyebrow">Sessions</p>
          <h1 className="t-display-m">Accounts</h1>
          <p className="secondary-text">
            You log in yourself, in Chrome. Handpost never sees or stores a password.
          </p>
        </div>
      </header>
      <p className="hp-callout hp-callout--ink accounts-banner">
        <ShieldCheck size={16} aria-hidden="true" /> <strong>Rehearse</strong> fills a platform's real
        composer and stops before Post — the safe way to check a platform after it changes its page.
      </p>
      {real.length === 0 ? (
        <div className="hp-card">
          <EmptyState>No platforms are set up yet. Restart Handpost to create the account slots.</EmptyState>
        </div>
      ) : (
        <div className="account-grid">
          {real.map((account) => {
            const platform = account.platform as PlatformId;
            const own = slots.filter((slot) => slot.account_id === account.id);
            const frozen = account.status === 'frozen';
            const connected = account.status === 'ok';
            return (
              <Card key={account.id} className="account-card">
                <div className="account-card__head">
                  <PlatformBadge platform={platform} size="l" />
                  <div>
                    <h2 className="t-heading-s">{capabilities[platform].label}</h2>
                    <p className="t-mono-s secondary-text">
                      {account.handle ?? (connected ? 'handle not captured yet' : '—')}
                    </p>
                  </div>
                  <StatusPill status={account.status} />
                </div>
                {account.status === 'needs_login' && (
                  <p className="hp-callout hp-callout--warn">
                    Logged out. Queued posts wait until you log in again.
                  </p>
                )}
                {account.status === 'challenged' && (
                  <p className="hp-callout hp-callout--warn">
                    The platform asked for a check. Open it and complete it yourself.
                  </p>
                )}
                {frozen && (
                  <p className="hp-callout hp-callout--danger">
                    Paused after a detection event. Posts for this platform move to manual handling.
                  </p>
                )}
                <dl className="account-card__meta">
                  <dt>Last verified</dt>
                  <dd>
                    {account.last_checked_at
                      ? formatWhen(account.last_checked_at, { withDay: true })
                      : 'Never'}
                  </dd>
                  <dt>Queue slots</dt>
                  <dd>{summarizeSlots(own)}</dd>
                  <dt>Daily cap</dt>
                  <dd>{setting(`dailyCap:${platform}`, '10')} posts</dd>
                </dl>
                {renderExtra?.(account)}
                <div className="account-card__actions">
                  {frozen ? (
                    <ConfirmPopover
                      message="Re-enable automation early? The platform flagged recent activity; posting again soon raises the risk."
                      confirmLabel="Re-enable"
                      onConfirm={async () => {
                        await handpostApi.reenable(platform);
                        onChanged();
                      }}
                      trigger={(open) => (
                        <Button kind="danger" size="s" icon={Unlock} onClick={open}>
                          Re-enable early
                        </Button>
                      )}
                    />
                  ) : (
                    <Button
                      size="s"
                      kind={connected ? 'secondary' : 'primary'}
                      icon={connected ? ExternalLink : LogIn}
                      onClick={async () => {
                        await handpostApi.connect({ platform });
                        onChanged();
                      }}
                    >
                      {connected
                        ? 'Reconnect'
                        : account.status === 'needs_login'
                          ? 'Log in in Chrome'
                          : 'Connect in Chrome'}
                    </Button>
                  )}
                  <Button size="s" icon={SlidersHorizontal} onClick={() => setEditing(account)}>
                    Slots &amp; caps
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
      {footer && <footer className="accounts-footer t-mono-s secondary-text">{footer}</footer>}
      {editing && (
        <SlotsModal
          platform={editing.platform as PlatformId}
          accountId={editing.id}
          initialSlots={slots
            .filter((slot) => slot.account_id === editing.id)
            .map((slot) => ({ weekday: slot.weekday, timeLocal: slot.time_local }))}
          initialCap={Number(setting(`dailyCap:${editing.platform}`, '10'))}
          initialHeadless={setting(`headless:${editing.platform}`, 'false') === 'true'}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            onChanged();
          }}
        />
      )}
    </main>
  );
}

export interface SlotsModalProps {
  platform: PlatformId;
  accountId: number;
  initialSlots: Array<{ weekday: number; timeLocal: string }>;
  initialCap: number;
  initialHeadless: boolean;
  onClose: () => void;
  onSaved: () => void;
}

/** Weekday × time editor (replaces the old `weekday@HH:MM` text field). */
export function SlotsModal({
  platform,
  accountId,
  initialSlots,
  initialCap,
  initialHeadless,
  onClose,
  onSaved,
}: SlotsModalProps) {
  const [slots, setSlots] = useState(initialSlots);
  const [cap, setCap] = useState(initialCap);
  const [headless, setHeadless] = useState(initialHeadless);
  const [draft, setDraft] = useState<Record<number, string>>({});
  const [error, setError] = useState('');
  const label = capabilities[platform].label;
  const add = (weekday: number) => {
    const time = draft[weekday] ?? '09:30';
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return setError('Use a time like 09:30');
    if (slots.some((slot) => slot.weekday === weekday && slot.timeLocal === time))
      return setError('That slot already exists');
    if (slots.length >= 28) return setError('At most 28 slots per platform');
    setError('');
    setSlots([...slots, { weekday, timeLocal: time }]);
  };
  const copyToWeekdays = (from: number) => {
    const times = slots.filter((slot) => slot.weekday === from).map((slot) => slot.timeLocal);
    const others = [1, 2, 3, 4, 5].filter((day) => day !== from);
    const kept = slots.filter((slot) => !others.includes(slot.weekday));
    setSlots(
      [...kept, ...others.flatMap((weekday) => times.map((timeLocal) => ({ weekday, timeLocal })))].slice(
        0,
        28,
      ),
    );
  };
  return (
    <Modal
      title={`${label}: slots & caps`}
      onClose={onClose}
      footer={
        <>
          <Button kind="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            kind="primary"
            onClick={async () => {
              if (!Number.isInteger(cap) || cap < 1 || cap > 50)
                return setError('Daily cap must be between 1 and 50');
              await handpostApi.saveAccountSettings({ accountId, platform, dailyCap: cap, headless, slots });
              onSaved();
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <p className="secondary-text t-body-s">
        “Add to queue” and inbox posts with <code>when: next-slot</code> take the next free slot. With no
        slots, Handpost uses 09:30 and 17:30 every day.
      </p>
      <table className="hp-table slot-table">
        <thead>
          <tr>
            <th scope="col">Day</th>
            <th scope="col">Times</th>
            <th scope="col">
              <span className="sr-only">Add a time</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {WEEKDAYS.map(([weekday, name]) => {
            const times = slots
              .filter((slot) => slot.weekday === weekday)
              .map((slot) => slot.timeLocal)
              .sort();
            return (
              <tr key={weekday}>
                <th scope="row">{name}</th>
                <td>
                  <span className="slot-chips">
                    {times.length === 0 && <span className="muted t-body-s">No slots</span>}
                    {times.map((time) => (
                      <span className="slot-chip" key={time}>
                        <code>{time}</code>
                        <button
                          type="button"
                          aria-label={`Remove ${name} ${time}`}
                          onClick={() =>
                            setSlots(
                              slots.filter((slot) => !(slot.weekday === weekday && slot.timeLocal === time)),
                            )
                          }
                        >
                          <Trash2 size={12} aria-hidden="true" />
                        </button>
                      </span>
                    ))}
                  </span>
                </td>
                <td>
                  <span className="slot-add">
                    <input
                      type="time"
                      aria-label={`New time for ${name}`}
                      value={draft[weekday] ?? '09:30'}
                      onChange={(event) => setDraft({ ...draft, [weekday]: event.target.value })}
                    />
                    <Button size="s" icon={Plus} label={`Add ${name} slot`} onClick={() => add(weekday)} />
                    {times.length > 0 && weekday >= 1 && weekday <= 5 && (
                      <Button size="s" kind="ghost" onClick={() => copyToWeekdays(weekday)}>
                        Copy to weekdays
                      </Button>
                    )}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="slot-settings">
        <div className="hp-field">
          <label htmlFor="slots-daily-cap">Daily cap</label>
          <input
            id="slots-daily-cap"
            type="number"
            min={1}
            max={50}
            value={cap}
            aria-describedby="slots-daily-cap-hint"
            onChange={(event) => setCap(Number(event.target.value))}
          />
          <small id="slots-daily-cap-hint">Hard stop per day; extra posts wait until tomorrow.</small>
        </div>
        <div className="hp-field">
          <span>Headless mode</span>
          <span className="inline-toggle">
            <Toggle
              checked={headless}
              onChange={setHeadless}
              label="Headless mode"
              {...(SAFE_HEADLESS.has(platform) ? {} : { disabled: true })}
            />
            <small>
              {SAFE_HEADLESS.has(platform)
                ? 'Verified safe for this platform'
                : 'Not verified for this platform'}
            </small>
          </span>
        </div>
      </div>
      {error && (
        <p role="alert" className="hp-callout hp-callout--danger">
          {error}
        </p>
      )}
    </Modal>
  );
}
