import type {
  AccountRow,
  CsvPlanRow,
  AttemptListRow,
  MediaRow,
  PostRow,
  SavedMediaRow,
  SettingRow,
  SlotRow,
  TargetListRow,
  TemplateRow,
} from './rows';
import type { PlatformId } from './types';
import type {
  AutomationInfo,
  BreakerRow,
  InboxHealth,
  InboxListItem,
  PacingRow,
  Receipt,
  WriterRow,
} from './inbox-types';

export interface AppInfo {
  version: string;
  dataDir: string;
  electron: string;
  chrome: string;
  platform: string;
}
export interface BrowserInfoView {
  channel: string;
  found: boolean;
  path: string | null;
  version: string | null;
  label: string;
  profiles: string;
}
export interface RehearsalView {
  attemptId: number;
  outcome: 'rehearsal' | 'failed' | 'needs_login' | 'chrome_missing';
  screenshotPath: string | null;
  screenshot: string | null;
  steps: Array<{ name: string; startedAt: string; finishedAt: string; outcome: string; detail?: string }>;
  error: string | null;
}
export type InboxOpenTarget =
  { target: 'folder' | 'inbox' | 'rejected' | 'receipts' } | { target: 'receipt'; id: string };
export interface HandpostSnapshot {
  accounts: AccountRow[];
  posts: PostRow[];
  targets: TargetListRow[];
  media: MediaRow[];
  attempts: AttemptListRow[];
  slots: SlotRow[];
  templates: TemplateRow[];
  settings: SettingRow[];
}
export interface HandpostApi {
  snapshot(): Promise<HandpostSnapshot>;
  savePost(input: {
    id?: number;
    text: string;
    status: 'draft' | 'scheduled';
    targets: Array<{
      accountId: number;
      scheduledAt?: string;
      overrideText?: string;
      firstComment?: string;
      options?: Record<string, string | boolean>;
    }>;
  }): Promise<number>;
  queuePost(input: {
    id?: number;
    text: string;
    targets: Array<{
      accountId: number;
      overrideText?: string;
      firstComment?: string;
      options?: Record<string, string | boolean>;
    }>;
  }): Promise<number>;
  reschedule(input: { targetId: number; scheduledAt: string }): Promise<void>;
  retry(input: { targetId: number }): Promise<void>;
  connect(input: { platform: PlatformId }): Promise<void>;
  attachMedia(postId: number): Promise<SavedMediaRow[]>;
  addMedia(input: {
    postId: number;
    files: Array<{ name: string; mime: string; bytes: Uint8Array }>;
  }): Promise<SavedMediaRow[]>;
  updateMediaAlt(input: { mediaId: number; altText: string }): Promise<void>;
  reenable(platform: PlatformId): Promise<void>;
  saveTemplate(input: { name: string; body: string; variables: string[] }): Promise<number>;
  saveSetting(input: { key: string; value: string }): Promise<void>;
  csvImport(input: { csv: string; dryRun: boolean }): Promise<CsvPlanRow[]>;
  saveAccountSettings(input: {
    accountId: number;
    platform: PlatformId;
    dailyCap: number;
    headless: boolean;
    slots: Array<{ weekday: number; timeLocal: string }>;
  }): Promise<void>;
  exportData(): Promise<string>;
  importData(): Promise<void>;
  openManual(targetId: number): Promise<void>;
  openExternal(url: string): Promise<void>;
  readArtifact(path: string): Promise<string>;
  inboxList(): Promise<InboxListItem[]>;
  inboxHealth(): Promise<InboxHealth | null>;
  inboxApprove(id: string): Promise<Receipt | null>;
  inboxReject(id: string): Promise<Receipt | null>;
  inboxWriters(): Promise<WriterRow[]>;
  inboxOpen(request: InboxOpenTarget): Promise<void>;
  inboxChooseFolder(): Promise<string>;
  automationInfo(): Promise<AutomationInfo>;
  copyAgents(): Promise<string>;
  pacingToday(): Promise<PacingRow[]>;
  breakers(): Promise<BreakerRow[]>;
  cancelTarget(input: { targetId: number }): Promise<void>;
  publishNow(input: { targetId: number }): Promise<void>;
  appInfo(): Promise<AppInfo>;
  browserInfo(): Promise<BrowserInfoView>;
  setProfileUrl(input: {
    platform: PlatformId;
    url: string;
  }): Promise<{ handle: string; profileUrl: string } | null>;
  /** Fills the platform's composer, screenshots and discards it. `null` when the owner cancelled a video pick. */
  rehearse(input: { platform: PlatformId }): Promise<RehearsalView | null>;
}
