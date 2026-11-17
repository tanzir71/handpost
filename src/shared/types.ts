export const PLATFORM_IDS = [
  'mock',
  'x',
  'linkedin',
  'bluesky',
  'threads',
  'facebook',
  'instagram',
  'tiktok',
  'youtube',
  'pinterest',
] as const;
export type PlatformId = (typeof PLATFORM_IDS)[number];
export type AccountStatus = 'unknown' | 'ok' | 'needs_login' | 'challenged' | 'frozen';
export type PostStatus =
  'draft' | 'scheduled' | 'publishing' | 'published' | 'partial' | 'failed' | 'needs_attention';
export type TargetStatus =
  | 'draft'
  | 'scheduled'
  | 'publishing'
  | 'published'
  | 'unverified'
  | 'failed'
  | 'needs_login'
  | 'needs_attention'
  | 'manual';
export type ErrorClass = 'transient' | 'session' | 'content' | 'ui_drift' | 'suspected_detection';
export type SessionState = 'ok' | 'logged_out' | 'challenged';
export interface CapabilityManifest {
  platform: PlatformId;
  label: string;
  maxChars: number;
  maxMedia: number;
  mediaKinds: Array<'image' | 'video'>;
  maxVideoSeconds?: number;
  maxFileBytes?: number;
  warnings?: Array<{ at: number; message: string }>;
  conservative?: boolean;
  supportsThreads?: boolean;
}
export interface RenderedPost {
  text: string;
  thread?: string[];
  firstComment?: string | null;
  media: MediaInput[];
  options?: Record<string, string | boolean>;
  artifactDir?: string;
}
export interface MediaInput {
  path: string;
  kind: 'image' | 'video';
  altText?: string | null;
  sizeBytes?: number;
  width?: number;
  height?: number;
  durationS?: number;
}
export interface PublishResult {
  submitted: boolean;
  signal?: string;
}
export interface Verification {
  found: boolean;
  url?: string;
  screenshotPath?: string;
}
export interface StepLog {
  name: string;
  startedAt: string;
  finishedAt: string;
  outcome: 'ok' | 'failed';
  detail?: string;
  screenshotPath?: string;
}
export interface PublishError extends Error {
  errorClass: ErrorClass;
  code: string;
}
