/** Shapes shared by the main process and the renderer for the inbox, pacing and automation screens. */
import type { InboxIssue, InboxItemState } from './inbox-schema';

export interface ReceiptTarget {
  platform: string;
  status: string;
  scheduled_at: string | null;
  published_at: string | null;
  url: string | null;
  error: { code: string; class: string; message: string } | null;
}

export interface Receipt {
  handpost: 1;
  id: string;
  state: InboxItemState;
  source: string | null;
  file: string | null;
  received_at: string;
  updated_at: string;
  replaced_at?: string;
  mode: string;
  warnings: InboxIssue[];
  errors: InboxIssue[];
  targets: ReceiptTarget[];
}

export interface InboxHealth {
  folder: string;
  exists: boolean;
  watching: boolean;
  lastScanAt: string | null;
  lastError: string | null;
  state: 'ok' | 'warn' | 'danger';
  pendingFiles: number;
  held: number;
  waitingMedia: number;
  rejectedToday: number;
  /** The optional remote Git source (H9), when configured. */
  git?: GitHealthView | null;
}

export interface GitHealthView {
  enabled: boolean;
  url: string;
  name: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
  state: 'off' | 'ok' | 'warn' | 'danger';
}

/** One row of the Inbox screen: an item (with its receipt) or a duplicate file that changed nothing. */
export interface InboxListItem {
  key: string;
  id: string;
  postId: number | null;
  state: InboxItemState;
  source: string | null;
  sourceKind: string;
  fileName: string;
  storedPath: string | null;
  receivedAt: string;
  text: string | null;
  receipt: Receipt;
}

export interface PacingRow {
  platform: string;
  published: number;
  planned: number;
  cap: number;
  /** When the cooldown since the last publish ends (ISO), if it is still running. */
  cooldownUntil: string | null;
}

export interface BreakerRow {
  platform: string;
  until: string;
  events: string[];
  manual: boolean;
}

export interface WriterRow {
  source: string;
  sourceKind: string;
  files: number;
  lastSeen: string;
}

export interface AutomationInfo {
  folder: string;
  defaultFolder: string;
  protocolUrl: string;
  writerPrompt: string;
}
