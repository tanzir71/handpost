/**
 * An in-memory stand-in for the main process, used when the renderer runs in a plain browser (the Vite dev
 * server, `scripts/verify-ui.ts`, landing-page screenshots). It never touches a network or a platform.
 */
import type { AppInfo, HandpostApi, HandpostSnapshot } from '../../shared/api';
import type { InboxListItem, Receipt, ReceiptTarget } from '../../shared/inbox-types';
import type { AttemptListRow, PostRow, TargetListRow } from '../../shared/rows';
import type { PlatformId } from '../../shared/types';

const MIN = 60_000;
const HOUR = 60 * MIN;
const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();
const isoSec = (offsetMs: number) => iso(offsetMs).replace(/\.\d{3}Z$/, 'Z');
/** Today (local) at hh:mm, plus `days`. */
function at(days: number, hh: number, mm: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hh, mm, 0, 0);
  return date.toISOString();
}

const PLATFORMS: Array<[PlatformId, string, string | null, string]> = [
  ['mock', 'MockSocial', null, 'ok'],
  ['x', 'X', '@tanzir', 'ok'],
  ['linkedin', 'LinkedIn', 'in/tanzir', 'ok'],
  ['bluesky', 'Bluesky', '@tanzir.bsky.social', 'ok'],
  ['threads', 'Threads', '@tanzir', 'needs_login'],
  ['facebook', 'Facebook', null, 'unknown'],
  ['instagram', 'Instagram', '@tanzir.makes', 'frozen'],
  ['tiktok', 'TikTok', null, 'unknown'],
  ['youtube', 'YouTube', null, 'unknown'],
  ['pinterest', 'Pinterest', null, 'unknown'],
];

function buildSnapshot(): HandpostSnapshot {
  const accounts = PLATFORMS.map(([platform, name, handle, status], index) => ({
    id: index + 1,
    platform,
    display_name: name,
    profile_dir: `profiles/${platform}`,
    status: status as HandpostSnapshot['accounts'][number]['status'],
    last_checked_at: status === 'ok' ? iso(-3 * HOUR) : null,
    created_at: iso(-30 * 24 * HOUR),
    handle,
    profile_url: handle ? `https://example.invalid/${platform}` : null,
  }));
  const accountId = (platform: PlatformId) => accounts.find((account) => account.platform === platform)!.id;
  const posts: PostRow[] = [];
  const targets: TargetListRow[] = [];
  const attempts: AttemptListRow[] = [];
  const add = (
    text: string,
    status: PostRow['status'],
    rows: Array<{
      platform: PlatformId;
      when: string | null;
      status: TargetListRow['status'];
      url?: string;
      error?: [string, string];
    }>,
  ) => {
    const id = posts.length + 1;
    posts.push({
      id,
      base_text: text,
      created_at: iso(-2 * HOUR),
      updated_at: iso(-HOUR),
      status,
      labels_json: '[]',
    });
    for (const row of rows)
      targets.push({
        id: targets.length + 1,
        post_id: id,
        account_id: accountId(row.platform),
        override_text: null,
        first_comment: null,
        scheduled_at_utc: row.when,
        jittered_at_utc: row.when,
        status: row.status,
        attempt_count: row.status === 'scheduled' || row.status === 'draft' ? 0 : 1,
        published_url: row.url ?? null,
        error_code: row.error?.[0] ?? null,
        error_detail: row.error?.[1] ?? null,
        options_json: '{}',
        platform: row.platform,
        base_text: text,
      });
    return id;
  };
  add('Tip #46 — keep a folder of evergreen posts and let Claude pick one each week.', 'published', [
    {
      platform: 'x',
      when: at(0, 9, 30),
      status: 'published',
      url: 'https://x.com/tanzir/status/1859000000000000000',
    },
    {
      platform: 'linkedin',
      when: at(0, 9, 30),
      status: 'published',
      url: 'https://www.linkedin.com/feed/update/1',
    },
  ]);
  add(
    'Handpost 0.2 is out: a calmer composer, receipts for every post, and an inbox Claude can write to.',
    'scheduled',
    [
      { platform: 'x', when: at(0, 17, 30), status: 'scheduled' },
      { platform: 'bluesky', when: at(0, 17, 30), status: 'scheduled' },
    ],
  );
  add('Tip #47 — Schedule posts from a folder. Drop a markdown file in your Handpost inbox.', 'scheduled', [
    { platform: 'x', when: at(1, 9, 30), status: 'scheduled' },
    { platform: 'linkedin', when: at(1, 9, 30), status: 'scheduled' },
    { platform: 'bluesky', when: at(1, 9, 30), status: 'scheduled' },
  ]);
  add('Behind the scenes: how the stamp logo came together.', 'failed', [
    {
      platform: 'threads',
      when: at(0, 8, 0),
      status: 'needs_login',
      error: ['logged_out', 'Threads asked to log in again. Reconnect in Accounts; the post will wait.'],
    },
  ]);
  add('Weekend reading list: five essays on calm software.', 'failed', [
    {
      platform: 'linkedin',
      when: at(-1, 12, 0),
      status: 'unverified',
      error: ['verify_not_found', 'Submitted, but the newest post on the profile did not match within 45 s'],
    },
  ]);
  add('Draft: a thread about receipts and why proof matters.', 'draft', [
    { platform: 'x', when: null, status: 'draft' },
  ]);
  add('Launch week, day 3 — the inbox protocol in one picture.', 'draft', [
    { platform: 'linkedin', when: at(2, 9, 30), status: 'draft' },
    { platform: 'bluesky', when: at(2, 9, 30), status: 'draft' },
  ]);
  const steps = (fail?: string) =>
    JSON.stringify(
      ['open composer', 'fill text', 'submit', 'wait for success'].map((name, index) => ({
        name,
        startedAt: iso(-HOUR + index * 2000),
        finishedAt: iso(-HOUR + index * 2000 + 900 + index * 300),
        outcome: fail && name === fail ? 'failed' : 'ok',
        ...(fail && name === fail ? { detail: 'Profile did not show the new post' } : {}),
      })),
    );
  attempts.push(
    {
      id: 1,
      target_id: 1,
      started_at: at(0, 9, 31),
      finished_at: at(0, 9, 32),
      outcome: 'published',
      step_log_json: steps(),
      screenshot_path: null,
      error_class: null,
      post_id: 1,
      published_url: targets[0]!.published_url,
      platform: 'x',
    },
    {
      id: 2,
      target_id: 2,
      started_at: at(0, 9, 35),
      finished_at: at(0, 9, 36),
      outcome: 'published',
      step_log_json: steps(),
      screenshot_path: null,
      error_class: null,
      post_id: 1,
      published_url: targets[1]!.published_url,
      platform: 'linkedin',
    },
    {
      id: 3,
      target_id: 9,
      started_at: at(-1, 12, 1),
      finished_at: at(-1, 12, 3),
      outcome: 'unverified',
      step_log_json: steps('wait for success'),
      screenshot_path: null,
      error_class: 'transient',
      post_id: 5,
      published_url: null,
      platform: 'linkedin',
    },
  );
  return {
    accounts,
    posts,
    targets,
    media: [],
    attempts,
    slots: [
      { id: 1, account_id: accountId('x'), weekday: 1, time_local: '09:30' },
      { id: 2, account_id: accountId('x'), weekday: 3, time_local: '09:30' },
      { id: 3, account_id: accountId('x'), weekday: 5, time_local: '17:30' },
    ],
    templates: [
      { id: 1, name: 'Weekly tip', body: 'Tip #{number} — {title}', variables_json: '["number","title"]' },
    ],
    settings: [
      { key: 'inbox.autoSchedule', value: 'true' },
      { key: 'dailyCap:x', value: '4' },
      { key: 'dailyCap:linkedin', value: '2' },
      { key: 'dataFolder', value: 'C:\\Users\\you\\AppData\\Roaming\\Handpost' },
    ],
  };
}

function receipt(
  id: string,
  state: Receipt['state'],
  source: string,
  targets: ReceiptTarget[],
  extra: Partial<Receipt> = {},
): Receipt {
  return {
    handpost: 1,
    id,
    state,
    source,
    file: `processed/${new Date().toISOString().slice(0, 7)}/${id}.md`,
    received_at: isoSec(-40 * MIN),
    updated_at: isoSec(-5 * MIN),
    mode: 'schedule',
    warnings: [],
    errors: [],
    targets,
    ...extra,
  };
}
const target = (
  platform: string,
  status: string,
  when: string | null,
  url: string | null = null,
): ReceiptTarget => ({
  platform,
  status,
  scheduled_at: when ? when.replace(/\.\d{3}Z$/, 'Z') : null,
  published_at: status === 'published' ? isoSec(-2 * HOUR) : null,
  url,
  error: null,
});

function buildInbox(): InboxListItem[] {
  const item = (
    id: string,
    state: Receipt['state'],
    source: string,
    text: string | null,
    targets: ReceiptTarget[],
    minutesAgo: number,
    extra: Partial<Receipt> = {},
    postId: number | null = null,
  ): InboxListItem => ({
    key: `item:${id}`,
    id,
    postId,
    state,
    source,
    sourceKind:
      source.split(':')[0] === 'claude' || source.split(':')[0] === 'codex' || source.split(':')[0] === 'git'
        ? source.split(':')[0]!
        : 'other',
    fileName: `${id}.md`,
    storedPath: extra.file ?? null,
    receivedAt: iso(-minutesAgo * MIN),
    text,
    receipt: receipt(id, state, source, targets, { received_at: isoSec(-minutesAgo * MIN), ...extra }),
  });
  return [
    item(
      'launch-week-day-3',
      'held',
      'claude:launch-week',
      'Launch week, day 3 — the inbox protocol in one picture. Claude writes a file, Handpost checks it, your Chrome posts it.',
      [target('linkedin', 'draft', at(2, 9, 30)), target('bluesky', 'draft', at(2, 9, 30))],
      12,
      {
        mode: 'review',
        warnings: [
          {
            code: 'text_folds',
            platform: 'linkedin',
            message: 'Text will fold behind “see more” after 210 characters',
          },
        ],
      },
      7,
    ),
    item(
      'weekly-tips-20261120-folder-scheduling',
      'scheduled',
      'claude:weekly-tips',
      'Tip #47 — Schedule posts from a folder. Drop a markdown file in your Handpost inbox.',
      [
        target('x', 'scheduled', at(1, 9, 30)),
        target('linkedin', 'scheduled', at(1, 9, 30)),
        target('bluesky', 'scheduled', at(1, 9, 30)),
      ],
      38,
      {},
      3,
    ),
    item(
      'release-notes-0-2-x',
      'scheduled',
      'codex:release-notes',
      'Handpost 0.2 is out: a calmer composer, receipts for every post, and an inbox Claude can write to.',
      [target('x', 'scheduled', at(0, 17, 30)), target('bluesky', 'scheduled', at(0, 17, 30))],
      95,
      {
        warnings: [
          {
            code: 'default_slots_used',
            platform: 'bluesky',
            message: 'bluesky has no queue slots; used the default 09:30 / 17:30 template',
          },
        ],
      },
      2,
    ),
    item(
      'weekly-tips-20261113-evergreen',
      'published',
      'claude:weekly-tips',
      'Tip #46 — keep a folder of evergreen posts and let Claude pick one each week.',
      [
        target('x', 'published', at(0, 9, 30), 'https://x.com/tanzir/status/1859000000000000000'),
        target('linkedin', 'published', at(0, 9, 30), 'https://www.linkedin.com/feed/update/1'),
      ],
      60 * 26,
      {},
      1,
    ),
    item('launch-day-3-photo', 'rejected', 'claude:launch-week', null, [], 180, {
      file: 'rejected/launch-day-3-photo.md',
      errors: [
        {
          code: 'media_missing',
          message: 'media/day3.jpg was not found after 10 minutes',
          path: '/media/0/path',
        },
      ],
    }),
    {
      ...item(
        'weekly-tips-20261120-folder-scheduling',
        'duplicate',
        'claude:weekly-tips',
        'Tip #47 — Schedule posts from a folder. Drop a markdown file in your Handpost inbox.',
        [],
        20,
      ),
      key: 'file:dup-1',
    },
  ];
}

export function createDemoApi(): HandpostApi {
  const snapshot = buildSnapshot();
  let inbox = buildInbox();
  const setSetting = (key: string, value: string) => {
    snapshot.settings = [...snapshot.settings.filter((row) => row.key !== key), { key, value }];
  };
  const info: AppInfo = {
    version: '0.2.0',
    dataDir: 'C:\\Users\\you\\AppData\\Roaming\\Handpost',
    electron: '',
    chrome: '',
    platform: 'win32',
  };
  const folder = 'C:\\Users\\you\\Handpost';
  const decide = (id: string, state: Receipt['state']) => {
    inbox = inbox.map((row) =>
      row.id === id && row.state === 'held'
        ? {
            ...row,
            state,
            receipt: {
              ...row.receipt,
              state,
              targets: row.receipt.targets.map((t) => ({
                ...t,
                status: state === 'scheduled' ? 'scheduled' : 'cancelled',
              })),
            },
          }
        : row,
    );
    return Promise.resolve(inbox.find((row) => row.id === id)?.receipt ?? null);
  };
  return {
    snapshot: async () => structuredClone(snapshot),
    savePost: async () => 1,
    queuePost: async () => 1,
    reschedule: async () => {},
    retry: async () => {},
    connect: async () => {},
    reenable: async () => {},
    attachMedia: async () => [],
    addMedia: async () => [],
    updateMediaAlt: async () => {},
    saveTemplate: async () => 1,
    saveSetting: async ({ key, value }) => setSetting(key, value),
    saveAccountSettings: async ({ accountId, platform, dailyCap, slots }) => {
      snapshot.slots = [
        ...snapshot.slots.filter((slot) => slot.account_id !== accountId),
        ...slots.map((slot, index) => ({
          id: 100 + index,
          account_id: accountId,
          weekday: slot.weekday,
          time_local: slot.timeLocal,
        })),
      ];
      setSetting(`dailyCap:${platform}`, String(dailyCap));
    },
    csvImport: async () => [],
    exportData: async () => '',
    importData: async () => {},
    openManual: async () => {},
    openExternal: async () => {},
    readArtifact: async () => '',
    inboxList: async () => structuredClone(inbox),
    inboxHealth: async () => ({
      folder,
      exists: true,
      watching: true,
      lastScanAt: iso(-20_000),
      lastError: null,
      state: 'ok',
      pendingFiles: 0,
      held: inbox.filter((row) => row.state === 'held').length,
      waitingMedia: 0,
      rejectedToday: 1,
    }),
    inboxApprove: (id) => decide(id, 'scheduled'),
    inboxReject: (id) => decide(id, 'rejected'),
    inboxWriters: async () => [
      { source: 'claude:weekly-tips', sourceKind: 'claude', files: 14, lastSeen: iso(-38 * MIN) },
      { source: 'claude:launch-week', sourceKind: 'claude', files: 3, lastSeen: iso(-12 * MIN) },
      { source: 'codex:release-notes', sourceKind: 'codex', files: 2, lastSeen: iso(-95 * MIN) },
    ],
    inboxOpen: async () => {},
    inboxChooseFolder: async () => folder,
    automationInfo: async () => ({
      folder,
      defaultFolder: folder,
      protocolUrl: 'https://github.com/tanzir71/handpost/blob/master/docs/INBOX_PROTOCOL.md',
      writerPrompt:
        "Every weekday at 08:30, draft tomorrow's post for X, LinkedIn and Bluesky about <topic> and drop it in my Handpost inbox using the handpost-inbox skill. Read handpost.status.json first, only use connected platforms, and use mode: review for anything that mentions a person or a company.",
    }),
    copyAgents: async () => `${folder}\\AGENTS.md`,
    pacingToday: async () => [
      { platform: 'x', published: 1, planned: 1, cap: 4, cooldownUntil: null },
      { platform: 'linkedin', published: 1, planned: 0, cap: 2, cooldownUntil: null },
      { platform: 'bluesky', published: 0, planned: 1, cap: 10, cooldownUntil: null },
    ],
    breakers: async () => [
      { platform: 'instagram', until: iso(20 * HOUR), events: [iso(-4 * HOUR)], manual: false },
    ],
    cancelTarget: async () => {},
    publishNow: async () => {},
    reverify: async () => 'unverified' as const,
    appInfo: async () => info,
    browserInfo: async () => ({
      channel: 'chrome',
      found: true,
      path: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      version: '131.0.6778.86',
      label: 'Google Chrome',
      profiles: 'C:\\Users\\you\\AppData\\Roaming\\Handpost\\profiles',
    }),
    setProfileUrl: async ({ platform, url }) => {
      const handle = url.split('/').filter(Boolean).pop() ?? platform;
      snapshot.accounts = snapshot.accounts.map((row) =>
        row.platform === platform ? { ...row, handle, profile_url: url } : row,
      );
      return { handle, profileUrl: url };
    },
    rehearse: async () => ({
      attemptId: 99,
      outcome: 'rehearsal',
      screenshotPath: null,
      screenshot: null,
      steps: [
        { name: 'open composer', startedAt: iso(-9000), finishedAt: iso(-7800), outcome: 'ok' },
        { name: 'fill text', startedAt: iso(-7800), finishedAt: iso(-4100), outcome: 'ok' },
        { name: 'screenshot filled composer', startedAt: iso(-4100), finishedAt: iso(-3600), outcome: 'ok' },
        { name: 'discard draft', startedAt: iso(-3600), finishedAt: iso(-3000), outcome: 'ok' },
      ],
      error: null,
    }),
    gitHealth: async () => ({
      enabled: false,
      url: '',
      name: null,
      lastSyncAt: null,
      lastError: null,
      state: 'off',
    }),
    gitSyncNow: async () => ({
      enabled: false,
      url: '',
      name: null,
      lastSyncAt: null,
      lastError: null,
      state: 'off',
    }),
  };
}
