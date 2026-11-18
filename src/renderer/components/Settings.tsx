import { useEffect, useState, type ReactNode } from 'react';
import {
  Coffee,
  Copy,
  Download,
  ExternalLink,
  FileCode2,
  Folder,
  FolderSearch,
  GitBranch,
  Github,
  Sparkles,
  Upload,
} from 'lucide-react';
import type { AppInfo } from '../../shared/api';
import type { AutomationInfo, GitHealthView, WriterRow } from '../../shared/inbox-types';
import type { CsvPlanRow, SettingRow } from '../../shared/rows';
import { handpostApi } from '../lib/api';
import { dayLabel, formatTime, relative, shortPath } from '../lib/format';
import { COFFEE_URL, REPO_URL } from '../lib/links';
import type { ThemeChoice } from '../hooks/useTheme';
import { Button, Card, Modal, Segmented, SourceChip, Tabs, Toggle, ToggleRow, sourceTask } from '../ui';

export type SettingsTab = 'general' | 'automation' | 'data' | 'about';
const TABS: Array<{ id: SettingsTab; label: string }> = [
  { id: 'general', label: 'General' },
  { id: 'automation', label: 'Automation' },
  { id: 'data', label: 'Data & export' },
  { id: 'about', label: 'About' },
];
const TRUST_SENTENCE =
  'Anything that can write to the inbox folder can publish to your connected accounts. Keep the folder on this computer, or in a sync service you fully control.';

interface SettingsProps {
  settings: SettingRow[];
  onChanged: () => void;
  tab?: string | null;
  onTab?: (tab: SettingsTab) => void;
  /** H9 remote-source section, rendered inside the Automation tab. */
  remoteSource?: ReactNode;
}

/** Figma Settings — Automation 6:428 (General, Data & export and About follow the same pattern). */
export function Settings({ settings, onChanged, tab, onTab, remoteSource }: SettingsProps) {
  const active: SettingsTab = TABS.some((item) => item.id === tab) ? (tab as SettingsTab) : 'general';
  const [localTab, setLocalTab] = useState<SettingsTab>(active);
  const current = onTab ? active : localTab;
  const choose = (next: SettingsTab) => (onTab ? onTab(next) : setLocalTab(next));
  const value = (key: string, fallback: string) =>
    settings.find((item) => item.key === key)?.value ?? fallback;
  const save = async (key: string, next: string) => {
    await handpostApi.saveSetting({ key, value: next });
    onChanged();
  };
  return (
    <main className="screen">
      <header className="screen-header">
        <div>
          <p className="eyebrow">Preferences</p>
          <h1 className="t-display-m">Settings</h1>
        </div>
      </header>
      <Tabs tabs={TABS} active={current} onChange={choose} label="Settings sections" />
      <div
        className="settings-body"
        role="tabpanel"
        aria-label={TABS.find((item) => item.id === current)!.label}
      >
        {current === 'general' && <General value={value} save={save} onChanged={onChanged} />}
        {current === 'automation' && (
          <Automation value={value} save={save} onChanged={onChanged} remoteSource={remoteSource} />
        )}
        {current === 'data' && <DataExport value={value} onChanged={onChanged} />}
        {current === 'about' && <About />}
      </div>
    </main>
  );
}

type ValueFn = (key: string, fallback: string) => string;
type SaveFn = (key: string, value: string) => Promise<void>;

function General({ value, save, onChanged }: { value: ValueFn; save: SaveFn; onChanged: () => void }) {
  const [templateName, setTemplateName] = useState('');
  const [templateBody, setTemplateBody] = useState('');
  return (
    <div className="settings-grid">
      <Card title="Appearance">
        <div className="settings-row">
          <span>
            <strong>Theme</strong>
            <small>System follows your computer's light or dark setting.</small>
          </span>
          <Segmented<ThemeChoice>
            label="Theme"
            value={value('theme', 'system') as ThemeChoice}
            onChange={(next) => void save('theme', next)}
            options={[
              { value: 'system', label: 'System' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
          />
        </div>
      </Card>
      <Card title="Application">
        <div>
          <ToggleRow
            title="Launch at login"
            detail="Keep the scheduler running after a restart."
            checked={value('launchAtLogin', 'false') === 'true'}
            onChange={(next) => void save('launchAtLogin', String(next))}
          />
          <ToggleRow
            title="Desktop notifications"
            detail="Failures, unverified posts, rejected inbox files and posts waiting for review."
            checked={value('notifications', 'true') === 'true'}
            onChange={(next) => void save('notifications', String(next))}
          />
        </div>
      </Card>
      <Card title="Reusable template">
        <p className="t-body-s secondary-text">
          Use variables such as <code>{'{name}'}</code>; unresolved variables stay visible for review.
        </p>
        <div className="form-row">
          <label className="hp-field">
            <span>Name</span>
            <input
              value={templateName}
              onChange={(event) => setTemplateName(event.target.value)}
              placeholder="Launch announcement"
            />
          </label>
          <label className="hp-field">
            <span>Body</span>
            <input
              value={templateBody}
              onChange={(event) => setTemplateBody(event.target.value)}
              placeholder="Hello {name}"
            />
          </label>
        </div>
        <div>
          <Button
            disabled={!templateName}
            onClick={async () => {
              const variables = [
                ...new Set([...templateBody.matchAll(/\{([a-zA-Z][\w-]*)\}/g)].map((match) => match[1]!)),
              ];
              await handpostApi.saveTemplate({ name: templateName, body: templateBody, variables });
              setTemplateName('');
              setTemplateBody('');
              onChanged();
            }}
          >
            Save template
          </Button>
        </div>
      </Card>
    </div>
  );
}

function Automation({
  value,
  save,
  onChanged,
  remoteSource,
}: {
  value: ValueFn;
  save: SaveFn;
  onChanged: () => void;
  remoteSource?: ReactNode;
}) {
  const [info, setInfo] = useState<AutomationInfo | null>(null);
  const [writers, setWriters] = useState<WriterRow[]>([]);
  const [notice, setNotice] = useState('');
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    void handpostApi
      .automationInfo()
      .then(setInfo)
      .catch(() => setInfo(null));
    void handpostApi
      .inboxWriters()
      .then(setWriters)
      .catch(() => setWriters([]));
  }, []);
  const copy = async (text: string, done: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setNotice(done);
    } catch {
      setNotice('Copy failed — select the text and copy it yourself.');
    }
  };
  const folder = info?.folder ?? '~/Handpost';
  return (
    <div className="settings-split">
      <div className="settings-grid">
        <Card title="Inbox folder">
          <p className="t-body-s secondary-text">
            Handpost watches this folder. Anything that can write a file here — a Claude scheduled task,
            Codex, a script — can schedule a post.
          </p>
          <div className="folder-row">
            <span className="hp-input folder-row__path" title={folder}>
              <Folder size={16} aria-hidden="true" />
              <span>{folder}</span>
            </span>
            <Button
              icon={FolderSearch}
              onClick={async () => {
                const next = await handpostApi.inboxChooseFolder();
                setInfo(await handpostApi.automationInfo());
                setNotice(`Watching ${shortPath(next)}`);
                onChanged();
              }}
            >
              Change…
            </Button>
            <Button
              kind="ghost"
              icon={ExternalLink}
              onClick={() => void handpostApi.inboxOpen({ target: 'folder' })}
            >
              Open
            </Button>
          </div>
          <pre className="folder-tree t-mono-s" aria-label="Folder layout">
            {`${folder.split(/[\\/]/).filter(Boolean).pop() ?? 'Handpost'}/
├─ inbox/                drop .md or .json here (write *.tmp, then rename)
├─ processed/YYYY-MM/    accepted files
├─ rejected/             with <name>.error.json beside each
├─ receipts/             <id>.json — updated until published
└─ handpost.status.json  accounts, caps, free slots, upcoming`}
          </pre>
        </Card>
        <Card>
          <div>
            <ToggleRow
              title="Auto-schedule valid files"
              detail="Off holds every arriving file in Inbox until you approve it. A file can always ask for review with mode: review."
              checked={value('inbox.autoSchedule', 'false') === 'true'}
              onChange={(next) => {
                if (next && value('inbox.trustConfirmed', 'false') !== 'true') setConfirming(true);
                else void save('inbox.autoSchedule', String(next));
              }}
            />
            <ToggleRow
              title="Write receipts and status file"
              detail="Lets the next Claude or Codex run read back what was published, failed or rejected."
              checked={value('inbox.writeStatus', 'true') === 'true'}
              onChange={(next) => void save('inbox.writeStatus', String(next))}
            />
            <ToggleRow
              title="Include post text in status file"
              detail="A 120-character preview per upcoming post. Turn off if this folder syncs to a cloud drive you don’t fully trust."
              checked={value('inbox.statusPreviews', 'true') === 'true'}
              onChange={(next) => void save('inbox.statusPreviews', String(next))}
            />
            <ToggleRow
              title="Allow media outside the inbox folder"
              detail="Off means a file can only attach images and video stored inside inbox/ — never files like ~/.ssh."
              checked={value('inbox.allowOutsideMedia', 'false') === 'true'}
              onChange={(next) => void save('inbox.allowOutsideMedia', String(next))}
            />
          </div>
        </Card>
        {remoteSource ?? <RemoteSource value={value} save={save} />}
      </div>
      <aside className="settings-grid">
        <Card
          title={
            <span className="card-title-icon">
              <Sparkles size={18} aria-hidden="true" className="brand-red" />
              Connect a Claude scheduled task
            </span>
          }
          stripe
        >
          <ol className="steps steps--numbered">
            <li>
              <span>
                Add the <code>handpost-inbox</code> skill to Claude (bundled in <code>integrations/</code>; a
                copy is in your folder as <code>HANDPOST_WRITER.md</code>).
              </span>
            </li>
            <li>
              <span>Create a scheduled task that runs on this computer, with this folder attached.</span>
            </li>
            <li>
              <span>
                Paste the prompt below — start with mode: review until you trust it. Codex: point it at{' '}
                <code>AGENTS.md</code> instead.
              </span>
            </li>
          </ol>
          <pre className="hp-code">{info?.writerPrompt ?? '…'}</pre>
          <div className="button-row">
            <Button
              kind="primary"
              icon={Copy}
              disabled={!info}
              onClick={() => void copy(info!.writerPrompt, 'Prompt copied')}
            >
              Copy prompt
            </Button>
            <Button
              kind="ghost"
              icon={ExternalLink}
              onClick={() =>
                void handpostApi.openExternal(
                  info?.protocolUrl ?? `${REPO_URL}/blob/master/docs/INBOX_PROTOCOL.md`,
                )
              }
            >
              Inbox protocol
            </Button>
            <Button
              kind="ghost"
              icon={FileCode2}
              onClick={async () => {
                const path = await handpostApi.copyAgents();
                setNotice(`Wrote ${shortPath(path)} for Codex`);
              }}
            >
              Copy AGENTS.md into Handpost folder
            </Button>
          </div>
          {notice && (
            <p role="status" className="t-body-s secondary-text">
              {notice}
            </p>
          )}
        </Card>
        <Card title="Writers seen">
          {writers.length === 0 ? (
            <p className="t-body-s muted">No files have arrived yet.</p>
          ) : (
            <ul className="writers">
              {writers.map((writer) => {
                const day = dayLabel(writer.lastSeen);
                const when =
                  day === 'Today'
                    ? `last today ${formatTime(writer.lastSeen)}`
                    : day === 'Tomorrow'
                      ? relative(writer.lastSeen)
                      : relative(writer.lastSeen).endsWith('1 d ago')
                        ? 'yesterday'
                        : new Date(writer.lastSeen).toLocaleDateString(undefined, { weekday: 'short' });
                return (
                  <li key={writer.source}>
                    <SourceChip source={writer.source} />
                    <code>{sourceTask(writer.source)}</code>
                    <span>
                      {writer.files} file{writer.files === 1 ? '' : 's'} · {when}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </aside>
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
                  await save('inbox.trustConfirmed', 'true');
                  await save('inbox.autoSchedule', 'true');
                  setConfirming(false);
                }}
              >
                Turn on Auto-schedule
              </Button>
            </>
          }
        >
          <p className="hp-callout hp-callout--warn">
            <strong>{TRUST_SENTENCE}</strong>
          </p>
          <p className="secondary-text">
            Files that ask for mode: review are still held, and every guardrail still applies.
          </p>
        </Modal>
      )}
    </div>
  );
}

function DataExport({ value, onChanged }: { value: ValueFn; onChanged: () => void }) {
  const [csv, setCsv] = useState('text,platform,scheduled_at\n');
  const [preview, setPreview] = useState<CsvPlanRow[]>([]);
  const [error, setError] = useState('');
  return (
    <div className="settings-grid">
      <Card title="Your data">
        <p className="t-body-s secondary-text">
          Data folder: <code>{value('dataFolder', 'Unavailable')}</code>
        </p>
        <p className="t-body-s secondary-text">
          Archives contain drafts, the queue, history evidence and media — never browser profiles or cookies.
        </p>
        <div className="button-row">
          <Button icon={Download} onClick={() => void handpostApi.exportData()}>
            Export archive
          </Button>
          <Button
            icon={Upload}
            onClick={async () => {
              await handpostApi.importData();
              onChanged();
            }}
          >
            Import archive
          </Button>
        </div>
      </Card>
      <Card title="Bulk CSV import">
        <p className="t-body-s secondary-text">
          Columns: <code>text, platform, scheduled_at</code>. Leave scheduled_at empty to use that platform's
          queue slots.
        </p>
        <label className="hp-field">
          <span>CSV posts</span>
          <textarea className="csv" value={csv} onChange={(event) => setCsv(event.target.value)} />
        </label>
        <div className="button-row">
          <Button
            onClick={async () => {
              try {
                setPreview(await handpostApi.csvImport({ csv, dryRun: true }));
                setError('');
              } catch (value) {
                setError(value instanceof Error ? value.message : String(value));
              }
            }}
          >
            Dry-run preview
          </Button>
          <Button
            kind="primary"
            disabled={!preview.length}
            onClick={async () => {
              await handpostApi.csvImport({ csv, dryRun: false });
              setPreview([]);
              onChanged();
            }}
          >
            Import {preview.length || ''} rows
          </Button>
        </div>
        {error && <p className="hp-callout hp-callout--danger">{error}</p>}
        {preview.length > 0 && (
          <table className="hp-table">
            <thead>
              <tr>
                <th scope="col">Row</th>
                <th scope="col">Platform</th>
                <th scope="col">When</th>
                <th scope="col">Text</th>
              </tr>
            </thead>
            <tbody>
              {preview.map((row) => (
                <tr key={row.row}>
                  <td className="t-mono-s">{row.row}</td>
                  <td>{row.platform}</td>
                  <td className="t-mono-s">{new Date(row.scheduledAt).toLocaleString()}</td>
                  <td>{row.text}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

function About() {
  const [info, setInfo] = useState<AppInfo | null>(null);
  useEffect(() => {
    void handpostApi
      .appInfo()
      .then(setInfo)
      .catch(() => setInfo(null));
  }, []);
  const open = (url: string) => void handpostApi.openExternal(url);
  return (
    <div className="settings-grid">
      <Card title="Handpost" stripe>
        <dl className="about-list">
          <dt>Version</dt>
          <dd className="t-mono-s">{info?.version ?? '—'}</dd>
          <dt>Data folder</dt>
          <dd className="t-mono-s">{info?.dataDir ?? '—'}</dd>
        </dl>
        <p className="t-body-s secondary-text">
          Handpost never checks for updates on its own. Releases are on GitHub when you want them.
        </p>
        <div className="button-row">
          <Button icon={Github} onClick={() => open(REPO_URL)}>
            Source on GitHub
          </Button>
          <Button onClick={() => open(`${REPO_URL}/releases`)}>Check releases</Button>
          <Button onClick={() => open(`${REPO_URL}/issues`)}>Report an issue</Button>
        </div>
      </Card>
      <Card title="Honest caveats">
        <ul className="caveats-list t-body-s secondary-text">
          <li>
            Automating platform web pages is against most platforms' terms, even at human volume. Challenges,
            blocks and account loss are possible.
          </li>
          <li>
            Platforms change their pages; expect about one adapter repair a month. Rehearse makes checking
            safe.
          </li>
          <li>Instagram and TikTok are fragile. Handing a post back to you is a feature.</li>
        </ul>
      </Card>
      <Card title="Support" className="coffee-card">
        <div className="coffee">
          <span className="coffee__icon" aria-hidden="true">
            <Coffee size={20} />
          </span>
          <div>
            <p className="eyebrow">Tanzir Rahman is</p>
            <p className="t-heading-s">
              <a
                href={COFFEE_URL}
                onClick={(event) => {
                  event.preventDefault();
                  open(COFFEE_URL);
                }}
              >
                Fueling open-source code, local utilities, and late-night builds.
              </a>
            </p>
            <p className="t-body-s secondary-text">
              Handpost is free. If it saves you a scheduler subscription, a coffee keeps the late-night builds
              going.
            </p>
          </div>
          <Button kind="coffee" icon={Coffee} onClick={() => open(COFFEE_URL)}>
            Buy me a coffee
          </Button>
        </div>
      </Card>
    </div>
  );
}

function RemoteSource({ value, save }: { value: ValueFn; save: SaveFn }) {
  const enabled = value('git.enabled', 'false') === 'true';
  const [url, setUrl] = useState(value('git.url', ''));
  const [health, setHealth] = useState<GitHealthView | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const next = await handpostApi.gitHealth();
        if (alive) setHealth(next);
      } catch {
        // No main process (demo/tests): the card still renders.
      }
    })();
    return () => {
      alive = false;
    };
  }, [enabled]);
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await action();
      setHealth(await handpostApi.gitHealth());
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card
      title={
        <span className="card-title-icon">
          <GitBranch size={18} aria-hidden="true" />
          Git repository · optional
        </span>
      }
      actions={
        <Toggle
          checked={enabled}
          label="Pull this repository"
          {...(value('git.url', '') ? {} : { disabled: true })}
          onChange={(next) => void run(() => save('git.enabled', String(next)))}
        />
      }
    >
      <p className="t-body-s secondary-text">
        For cloud-run tasks that can’t reach this computer. Handpost clones one repository into{' '}
        <code>.sources/</code> with your existing Git credentials, pulls it every 5 minutes and reads its{' '}
        <code>inbox/</code>; it never pushes unless you turn on “Push receipts back”. It is the only network
        access besides the platforms, and it is off unless you turn it on.
      </p>
      <form
        className="folder-row"
        onSubmit={(event) => {
          event.preventDefault();
          void run(() => save('git.url', url.trim()));
        }}
      >
        <label className="hp-field folder-row__field">
          <span className="sr-only">Repository URL</span>
          <input
            value={url}
            placeholder="https://github.com/you/handpost-inbox.git"
            onChange={(event) => setUrl(event.target.value)}
          />
        </label>
        <Button type="submit" disabled={busy || url.trim() === value('git.url', '')}>
          Save URL
        </Button>
      </form>
      <div>
        <ToggleRow
          title="Push receipts back"
          detail="Commits receipts/<id>.json for this repository's posts and pushes them, so cloud writers can read results."
          checked={value('git.pushReceipts', 'false') === 'true'}
          disabled={!enabled}
          onChange={(next) => void run(() => save('git.pushReceipts', String(next)))}
        />
      </div>
      {enabled && (
        <div className="git-status">
          <span
            className={`hp-dot hp-dot--${health?.state === 'off' ? 'warn' : (health?.state ?? 'warn')}`}
            aria-hidden="true"
          />
          <span className="t-body-s">
            {health?.lastError
              ? health.lastError
              : health?.lastSyncAt
                ? `Last pulled ${relative(health.lastSyncAt)} into .sources/${health.name}`
                : 'Not pulled yet'}
          </span>
          <Button size="s" disabled={busy} onClick={() => void run(() => handpostApi.gitSyncNow())}>
            {busy ? 'Pulling…' : 'Pull now'}
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="hp-callout hp-callout--danger">
          {error}
        </p>
      )}
    </Card>
  );
}
