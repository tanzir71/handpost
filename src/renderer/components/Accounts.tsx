import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  ExternalLink,
  Eye,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  Trash2,
  Wrench,
} from 'lucide-react';
import type { RehearsalView } from '../../shared/api';
import type { SelectorOverviewRow } from '../../shared/selectors';
import { SelectorsModal } from './SelectorsModal';
import { capabilities } from '../../shared/capabilities';
import type { BreakerRow } from '../../shared/inbox-types';
import type { AccountRow, Fields, SettingRow, SlotRow } from '../../shared/rows';
import type { PlatformId } from '../../shared/types';
import { handpostApi } from '../lib/api';
import { ago, formatDayTime } from '../lib/format';
import { summarizeSlots, WEEKDAYS } from '../lib/slots';
import { BrowserFooter, ProfileUrlForm, RehearsalResult } from './AccountLive';
import { Button, Card, ConfirmPopover, EmptyState, Modal, PlatformBadge, StatusPill, Toggle } from '../ui';

export interface AccountsProps {
  accounts: Array<
    Fields<AccountRow, 'id' | 'platform' | 'status' | 'last_checked_at', 'handle' | 'profile_url'>
  >;
  slots: Array<Fields<SlotRow, 'account_id' | 'weekday' | 'time_local'>>;
  settings: SettingRow[];
  onChanged: () => void;
  /** Queued targets stopped at `needs_login`, per platform (“1 queued post is waiting”). */
  waiting?: Partial<Record<string, number>>;
  /** Replaces the footer line (Chrome detection). */
  footer?: ReactNode;
  /** Opens History (Instagram → View evidence). */
  onViewEvidence?: (platform: PlatformId) => void;
}

const SAFE_HEADLESS = new Set(['bluesky']);
/** Figma 6:346 shows these six; the others wait under “Add platform” until they are connected. */
const CORE: PlatformId[] = ['x', 'linkedin', 'bluesky', 'threads', 'instagram', 'tiktok'];
/** What a platform takes, for cards that are not connected yet (from capabilities + adapter configs). */
const POSTS_NOTE: Record<PlatformId, string> = {
  mock: 'Text, images and video',
  x: 'Text, up to 4 images or a video · threads',
  linkedin: 'Text, up to 9 images or a video',
  bluesky: 'Text and up to 4 images',
  threads: 'Text, up to 10 images or videos',
  facebook: 'Page posts · text, images or video',
  instagram: 'Images only · waits up to 5 min for processing',
  tiktok: 'Video only · waits up to 5 min for processing',
  youtube: 'One vertical video up to 60 s · waits up to 5 min for processing',
  pinterest: 'One image or video with a title, link and board',
};
const gapMinutes = (platform: string) => (platform === 'instagram' ? 10 : 3);
const isConnected = (status: string) => !['unknown', 'not_connected'].includes(status);

type Rehearsal = { result?: RehearsalView; error?: string };

/** Figma Accounts 6:346. */
export function Accounts({
  accounts,
  slots,
  settings,
  onChanged,
  waiting = {},
  footer,
  onViewEvidence,
}: AccountsProps) {
  const [editing, setEditing] = useState<AccountsProps['accounts'][number] | null>(null);
  const [editingUrl, setEditingUrl] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [rehearsals, setRehearsals] = useState<Record<string, Rehearsal>>({});
  const [summary, setSummary] = useState('');
  const [breakers, setBreakers] = useState<BreakerRow[]>([]);
  const [selectorRows, setSelectorRows] = useState<SelectorOverviewRow[]>([]);
  const [fixing, setFixing] = useState<PlatformId | null>(null);
  const loadSelectors = useCallback(async () => {
    try {
      setSelectorRows((await handpostApi.selectorsOverview()) ?? []);
    } catch {
      // No selector details without the main process (tests); the cards still offer the dialog.
    }
  }, []);
  useEffect(() => {
    void loadSelectors();
  }, [accounts, loadSelectors]);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const rows = await handpostApi.breakers();
        if (alive) setBreakers(rows ?? []);
      } catch {
        // No breaker details without the main process (tests); the card still says it is frozen.
      }
    })();
    return () => {
      alive = false;
    };
  }, [accounts]);
  const setting = (key: string, fallback: string) =>
    settings.find((item) => item.key === key)?.value ?? fallback;
  const real = accounts.filter((account) => account.platform !== 'mock');
  const visible = real.filter(
    (account) => showAll || CORE.includes(account.platform as PlatformId) || isConnected(account.status),
  );
  const hidden = real.filter((account) => !visible.includes(account));
  const ready = real.filter((account) => account.status === 'ok');

  const rehearse = async (platform: PlatformId): Promise<RehearsalView | null> => {
    setBusy(platform);
    try {
      const result = await handpostApi.rehearse({ platform });
      if (result) setRehearsals((current) => ({ ...current, [platform]: { result } }));
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setRehearsals((current) => ({ ...current, [platform]: { error: message } }));
      return null;
    } finally {
      setBusy(null);
      // A failed step may have saved a selector repair report.
      void loadSelectors();
    }
  };
  const rehearseAll = async () => {
    setSummary('');
    let passed = 0;
    let ran = 0;
    for (const account of ready) {
      setBusy('all');
      const result = await rehearse(account.platform as PlatformId);
      if (result) ran++;
      if (result?.outcome === 'rehearsal') passed++;
    }
    setBusy(null);
    setSummary(
      ran
        ? `Rehearsed ${ran} platform${ran === 1 ? '' : 's'}: ${passed} passed${ran > passed ? `, ${ran - passed} need a look` : ''}. Nothing was posted.`
        : 'Nothing was rehearsed.',
    );
  };

  return (
    <main className="screen">
      <header className="screen-header">
        <div>
          <p className="eyebrow">Sessions</p>
          <h1 className="t-display-m">Accounts</h1>
          <p className="secondary-text">
            You log in yourself, in a real Chrome window. Handpost keeps only the browser profile — never your
            password.
          </p>
        </div>
        <div className="screen-header__actions">
          <Button icon={Eye} disabled={!ready.length || busy !== null} onClick={() => void rehearseAll()}>
            {busy === 'all' ? 'Rehearsing…' : 'Rehearse all'}
          </Button>
        </div>
      </header>
      <div className="hp-callout hp-callout--ink accounts-banner">
        <Eye size={16} aria-hidden="true" />
        <p>
          Rehearse fills the real composer, attaches media, takes a screenshot — and stops before Post. Run it
          after a platform changes its UI.
        </p>
        <details className="rehearse-help">
          <summary>Fingerprint check</summary>
          <p>
            From a checkout of Handpost, <code>npm run fingerprint -- --chrome</code> opens your installed
            Chrome with a throwaway profile and confirms it does not report automation (
            <code>navigator.webdriver</code>, DevTools leaks). Run it once after installing or updating
            Chrome.
          </p>
        </details>
      </div>
      {summary && (
        <p role="status" className="hp-callout hp-callout--ok">
          {summary}
        </p>
      )}
      {real.length === 0 ? (
        <div className="hp-card">
          <EmptyState>No platforms are set up yet. Restart Handpost to create the account slots.</EmptyState>
        </div>
      ) : (
        <div className="account-grid">
          {visible.map((account) => {
            const platform = account.platform as PlatformId;
            const label = capabilities[platform].label;
            const own = slots.filter((slot) => slot.account_id === account.id);
            const frozen = account.status === 'frozen';
            const connected = account.status === 'ok';
            const linked = isConnected(account.status);
            const cap = Number(setting(`dailyCap:${platform}`, '10'));
            const queued = waiting[platform] ?? 0;
            const breaker = breakers.find((row) => row.platform === platform);
            const lastEvent = breaker?.events[breaker.events.length - 1];
            const rehearsal = rehearsals[platform];
            const selectorRow = selectorRows.find((row) => row.platform === platform);
            const recentFailure =
              selectorRow?.report?.kind === 'failed' &&
              !selectorRow.report.fixedAfter &&
              Date.now() - Date.parse(selectorRow.report.at) < 7 * 24 * 3_600_000
                ? selectorRow.report
                : null;
            const askUrl = (connected && !account.profile_url) || editingUrl === platform;
            const connect = async () => {
              await handpostApi.connect({ platform });
              onChanged();
            };
            return (
              <Card key={account.id} className={`account-card${frozen ? ' account-card--frozen' : ''}`}>
                <div className="account-card__head">
                  <PlatformBadge platform={platform} size="l" />
                  <div>
                    <h2 className="t-heading-s">{label}</h2>
                    {linked && account.profile_url ? (
                      <button
                        type="button"
                        className="link-button t-mono-s"
                        title="Change profile URL"
                        onClick={() => setEditingUrl(editingUrl === platform ? null : platform)}
                      >
                        {account.handle ?? account.profile_url.replace(/^https:\/\//, '')}
                      </button>
                    ) : (
                      <p className="t-mono-s secondary-text">
                        {linked ? (account.handle ?? 'handle not captured yet') : 'not connected'}
                      </p>
                    )}
                  </div>
                  <StatusPill status={account.status} />
                </div>
                {account.status === 'needs_login' && (
                  <p className="hp-callout hp-callout--warn account-card__note">
                    <TriangleAlert size={14} aria-hidden="true" />
                    <span>
                      {queued
                        ? `Session expired. ${queued} queued post${queued === 1 ? ' is' : 's are'} waiting — log in and ${queued === 1 ? 'it resumes' : 'they resume'}.`
                        : 'Session expired. Log in and queued posts resume.'}
                    </span>
                  </p>
                )}
                {account.status === 'challenged' && (
                  <p className="hp-callout hp-callout--warn account-card__note">
                    <TriangleAlert size={14} aria-hidden="true" />
                    <span>The platform asked for a check. Open it and complete it yourself.</span>
                  </p>
                )}
                {frozen && (
                  <p className="hp-callout hp-callout--danger account-card__note">
                    <TriangleAlert size={14} aria-hidden="true" />
                    <span>
                      {breaker?.manual
                        ? 'A second detection event in 7 days. Automation stays off until you re-enable it.'
                        : `Detection event${lastEvent ? ` ${formatDayTime(lastEvent)}` : ''}. Frozen for 24 h; a second event in 7 days needs manual re-enable.`}
                    </span>
                  </p>
                )}
                {linked && selectorRow?.proposal ? (
                  <div className="hp-callout hp-callout--ink account-card__note account-card__note--action">
                    <Sparkles size={14} aria-hidden="true" />
                    <span>A selector fix is waiting for your review.</span>
                    <Button size="s" kind="ghost" onClick={() => setFixing(platform)}>
                      Review
                    </Button>
                  </div>
                ) : (
                  linked &&
                  recentFailure && (
                    <div className="hp-callout hp-callout--warn account-card__note account-card__note--action">
                      <TriangleAlert size={14} aria-hidden="true" />
                      <span>
                        “{recentFailure.step}” could not find its element {ago(recentFailure.at)}.
                      </span>
                      <Button size="s" kind="ghost" onClick={() => setFixing(platform)}>
                        Fix selectors
                      </Button>
                    </div>
                  )
                )}
                {linked ? (
                  <dl className="account-card__meta">
                    <dt>Last verified</dt>
                    <dd>{account.last_checked_at ? ago(account.last_checked_at) : 'never'}</dd>
                    <dt>Queue slots</dt>
                    <dd>{summarizeSlots(own)}</dd>
                    <dt>Daily cap</dt>
                    <dd>
                      {cap} post{cap === 1 ? '' : 's'} · {gapMinutes(platform)} min gap
                    </dd>
                  </dl>
                ) : (
                  <dl className="account-card__meta">
                    <dt>Posts</dt>
                    <dd>{POSTS_NOTE[platform]}</dd>
                  </dl>
                )}
                {askUrl && (
                  <ProfileUrlForm
                    platform={platform}
                    profileUrl={account.profile_url}
                    onSaved={() => {
                      setEditingUrl(null);
                      onChanged();
                    }}
                  />
                )}
                <div className="account-card__actions">
                  {frozen ? (
                    <>
                      <ConfirmPopover
                        message="Re-enable automation early? The platform flagged recent activity; posting again soon raises the risk."
                        confirmLabel="Re-enable"
                        onConfirm={async () => {
                          await handpostApi.reenable(platform);
                          onChanged();
                        }}
                        trigger={(open) => (
                          <Button kind="danger" size="s" icon={ShieldCheck} onClick={open}>
                            Re-enable early
                          </Button>
                        )}
                      />
                      {onViewEvidence && (
                        <Button kind="ghost" size="s" onClick={() => onViewEvidence(platform)}>
                          View evidence
                        </Button>
                      )}
                    </>
                  ) : connected ? (
                    <>
                      <Button
                        size="s"
                        icon={Eye}
                        disabled={busy !== null}
                        onClick={() => void rehearse(platform)}
                      >
                        {busy === platform ? 'Rehearsing…' : 'Rehearse'}
                      </Button>
                      <Button kind="ghost" size="s" icon={RefreshCw} onClick={() => void connect()}>
                        Reconnect
                      </Button>
                    </>
                  ) : (
                    <Button kind="primary" size="s" icon={ExternalLink} onClick={() => void connect()}>
                      {account.status === 'needs_login' ? 'Log in in Chrome' : 'Connect in Chrome'}
                    </Button>
                  )}
                  {linked && !frozen && (
                    <Button kind="ghost" size="s" onClick={() => setEditing(account)}>
                      Slots &amp; caps
                    </Button>
                  )}
                  {linked && (
                    <Button kind="ghost" size="s" icon={Wrench} onClick={() => setFixing(platform)}>
                      {selectorRow?.overrides ? `Selectors (${selectorRow.overrides})` : 'Selectors'}
                    </Button>
                  )}
                </div>
                {rehearsal && <RehearsalResult platform={platform} {...rehearsal} />}
              </Card>
            );
          })}
        </div>
      )}
      {footer ?? (
        <BrowserFooter
          extra={
            hidden.length > 0 && (
              <>
                {' · '}
                {hidden.map((account) => capabilities[account.platform as PlatformId].label).join(', ')}{' '}
                available under{' '}
                <button type="button" className="link-button" onClick={() => setShowAll(true)}>
                  Add platform
                </button>
              </>
            )
          }
        />
      )}
      {fixing && (
        <SelectorsModal
          platform={fixing}
          canRehearse={real.some((account) => account.platform === fixing && account.status === 'ok')}
          onClose={() => {
            setFixing(null);
            void loadSelectors();
          }}
          onChanged={() => void loadSelectors()}
        />
      )}
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
