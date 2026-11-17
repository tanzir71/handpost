/**
 * Row shapes returned by the main process (SQLite rows plus the joined columns the IPC layer adds).
 * Column names stay snake_case so they match the database one to one.
 */
import type { AccountStatus, ErrorClass, PlatformId, PostStatus, TargetStatus } from './types';

export interface AccountRow {
  id: number;
  platform: PlatformId;
  display_name: string;
  profile_dir: string;
  status: AccountStatus;
  last_checked_at: string | null;
  created_at: string;
}

export interface PostRow {
  id: number;
  base_text: string;
  created_at: string;
  updated_at: string;
  status: PostStatus | 'draft';
}

export interface TargetRow {
  id: number;
  post_id: number;
  account_id: number;
  override_text: string | null;
  first_comment: string | null;
  scheduled_at_utc: string | null;
  jittered_at_utc: string | null;
  status: TargetStatus;
  attempt_count: number;
  published_url: string | null;
  error_code: string | null;
  error_detail: string | null;
  options_json: string;
}

/** A target as listed in the snapshot: joined with its account platform and the post's base text. */
export interface TargetListRow extends TargetRow {
  platform: PlatformId;
  base_text: string;
}

export interface MediaRow {
  id: number;
  post_id: number;
  path: string;
  kind: 'image' | 'video';
  width: number | null;
  height: number | null;
  duration_s: number | null;
  size_bytes: number | null;
  order_idx: number;
  alt_text: string | null;
}

export interface AttemptRow {
  id: number;
  target_id: number;
  started_at: string;
  finished_at: string | null;
  outcome: string | null;
  step_log_json: string;
  screenshot_path: string | null;
  error_class: ErrorClass | null;
}

/** An attempt as listed in the snapshot: joined with its target's post, permalink and platform. */
export interface AttemptListRow extends AttemptRow {
  post_id: number;
  published_url: string | null;
  platform: PlatformId;
}

export interface SlotRow {
  id: number;
  account_id: number;
  weekday: number;
  time_local: string;
}

export interface TemplateRow {
  id: number;
  name: string;
  body: string;
  variables_json: string;
}

export interface SettingRow {
  key: string;
  value: string;
}

/**
 * The fields a component reads from a row: `K` required, `O` optional. Callers may pass fuller rows,
 * and tests can pass only what matters to them.
 */
export type Fields<T, K extends keyof T, O extends keyof T = never> = Pick<T, K> & Partial<Pick<T, O>>;

/** One row of a CSV import plan (dry run or applied). */
export interface CsvPlanRow {
  row: number;
  text: string;
  platform: string;
  scheduledAt: string;
  accountId: number;
}

/** What `attach-media` / `add-media` return for each stored file. */
export interface SavedMediaRow {
  id: number;
  post_id: number;
  path: string;
  kind: 'image' | 'video';
  width?: number | undefined;
  height?: number | undefined;
  duration_s?: number | undefined;
  size_bytes: number;
  order_idx: number;
}
