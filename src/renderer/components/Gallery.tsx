/**
 * Dev-only component gallery (`#/__gallery`): every UI component in both themes, side by side.
 * `scripts/verify-ui.ts` loads it and fails on console errors. Compare with Figma Foundations 0:1.
 */
import { useState } from 'react';
import { Check, FolderOpen, Send, Trash2 } from 'lucide-react';
import { PLATFORM_IDS } from '../../shared/types';
import type { InboxListItem } from '../../shared/inbox-types';
import {
  AirmailStripe,
  Button,
  Card,
  Checks,
  ConfirmPopover,
  EmptyState,
  Field,
  Lockup,
  NavItem,
  PlatformBadge,
  Segmented,
  SourceChip,
  StatusPill,
  Stamp,
  StepLog,
  Tabs,
  Toggle,
} from '../ui';
import { ReceiptPanel } from './Inbox';
import { Inbox as InboxIcon, PenLine } from 'lucide-react';

const SAMPLE: InboxListItem = {
  key: 'item:gallery',
  id: 'weekly-tips-20261120-folder-scheduling',
  postId: 3,
  state: 'held',
  source: 'claude:weekly-tips',
  sourceKind: 'claude',
  fileName: '2026-11-20-weekly-tip.md',
  storedPath: 'processed/2026-11/2026-11-20-weekly-tip.md',
  receivedAt: '2026-11-18T03:14:07Z',
  text: 'Tip #47 — Schedule posts from a folder.',
  receipt: {
    handpost: 1,
    id: 'weekly-tips-20261120-folder-scheduling',
    state: 'held',
    source: 'claude:weekly-tips',
    file: 'processed/2026-11/2026-11-20-weekly-tip.md',
    received_at: '2026-11-18T03:14:07Z',
    updated_at: '2026-11-18T03:14:09Z',
    mode: 'review',
    warnings: [
      {
        code: 'text_folds',
        platform: 'linkedin',
        message: 'Text will fold behind “see more” after 210 characters',
      },
    ],
    errors: [],
    targets: [
      {
        platform: 'x',
        status: 'draft',
        scheduled_at: '2026-11-20T03:30:00Z',
        published_at: null,
        url: null,
        error: null,
      },
      {
        platform: 'linkedin',
        status: 'draft',
        scheduled_at: '2026-11-20T03:30:00Z',
        published_at: null,
        url: null,
        error: null,
      },
    ],
  },
};

function Panel({ theme }: { theme: 'light' | 'dark' }) {
  const [on, setOn] = useState(true);
  const [segment, setSegment] = useState<'slot' | 'exact' | 'now'>('slot');
  const [tab, setTab] = useState<'base' | 'x'>('base');
  return (
    <section data-theme={theme} className="gallery__panel" aria-label={`${theme} theme`}>
      <p className="eyebrow">Foundations · {theme}</p>
      <h1 className="t-display-m">Component gallery</h1>
      <div className="gallery__row">
        <Lockup />
        <Stamp size={48} />
        <Stamp size={18} tilt={-6} />
      </div>
      <AirmailStripe />
      <h2 className="t-heading-s">Buttons</h2>
      <div className="gallery__row">
        <Button kind="primary" icon={Send}>
          Primary
        </Button>
        <Button kind="secondary" icon={FolderOpen}>
          Secondary
        </Button>
        <Button kind="ghost">Ghost</Button>
        <Button kind="danger" icon={Trash2}>
          Danger
        </Button>
        <Button kind="primary" size="s" icon={Check}>
          Small
        </Button>
        <Button kind="secondary" size="s" disabled>
          Disabled
        </Button>
        <Button kind="coffee">Buy me a coffee</Button>
      </div>
      <h2 className="t-heading-s">Status pills</h2>
      <div className="gallery__row">
        {[
          'published',
          'scheduled',
          'held',
          'needs_login',
          'failed',
          'rejected',
          'draft',
          'duplicate',
          'cancelled',
        ].map((status) => (
          <StatusPill key={status} status={status} />
        ))}
      </div>
      <h2 className="t-heading-s">Platform badges &amp; source chips</h2>
      <div className="gallery__row">
        {PLATFORM_IDS.map((platform) => (
          <PlatformBadge key={platform} platform={platform} />
        ))}
      </div>
      <div className="gallery__row">
        {['claude:weekly', 'codex:release', 'git:inbox', 'manual:me', 'script:x'].map((source) => (
          <SourceChip key={source} source={source} />
        ))}
      </div>
      <h2 className="t-heading-s">Inputs</h2>
      <div className="gallery__row">
        <Toggle checked={on} onChange={setOn} label="Example toggle" />
        <Segmented
          label="When"
          value={segment}
          onChange={setSegment}
          options={[
            { value: 'slot', label: 'Next free slot' },
            { value: 'exact', label: 'Exact time' },
            { value: 'now', label: 'Post now' },
          ]}
        />
      </div>
      <Field label="Search" icon={FolderOpen} placeholder="Search id, text, source" />
      <Tabs
        label="Example tabs"
        active={tab}
        onChange={setTab}
        tabs={[
          { id: 'base', label: 'Base text' },
          { id: 'x', label: 'X' },
        ]}
      />
      <h2 className="t-heading-s">Navigation</h2>
      <div className="gallery__nav">
        <NavItem icon={InboxIcon} label="Inbox" active count={3} attention onClick={() => {}} />
        <NavItem icon={PenLine} label="Compose" active={false} onClick={() => {}} />
      </div>
      <h2 className="t-heading-s">Cards</h2>
      <Card title="Today's pacing" stripe>
        <Checks
          items={[
            { tone: 'ok', text: 'Protocol v1 schema' },
            { tone: 'warn', text: 'Text will fold behind “see more”' },
            { tone: 'danger', text: 'media_missing: media/day3.jpg was not found' },
          ]}
        />
        <StepLog
          steps={[
            {
              name: 'open composer',
              startedAt: '2026-01-01T00:00:00Z',
              finishedAt: '2026-01-01T00:00:01Z',
              outcome: 'ok',
            },
            {
              name: 'wait for success',
              startedAt: '2026-01-01T00:00:01Z',
              finishedAt: '2026-01-01T00:00:46Z',
              outcome: 'failed',
              detail: 'Profile did not show the new post',
            },
          ]}
        />
        <ConfirmPopover
          placement="below"
          message="Reject this post?"
          confirmLabel="Reject"
          onConfirm={() => {}}
          trigger={(open) => (
            <Button kind="danger" size="s" onClick={open}>
              Reject…
            </Button>
          )}
        />
      </Card>
      <ReceiptPanel item={SAMPLE} onApprove={() => {}} onReject={() => {}} onEdit={() => {}} />
      <div className="hp-card">
        <EmptyState action={<Button>One action</Button>}>
          An empty state: the stamp, one line, one action.
        </EmptyState>
      </div>
      <pre className="hp-code">{'---\nhandpost: 1\nid: weekly-tips-20261120\n---'}</pre>
    </section>
  );
}

export default function Gallery() {
  return (
    <main className="gallery">
      <Panel theme="light" />
      <Panel theme="dark" />
    </main>
  );
}
