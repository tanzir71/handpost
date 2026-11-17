import { z } from 'zod';
import { PLATFORM_IDS } from './types';
export const accountConnectSchema = z.object({ platform: z.enum(PLATFORM_IDS) });
const text = z.string().max(100_000);
const targetOptions = z
  .record(z.union([z.string().max(100_000), z.boolean()]))
  .refine((value) => Object.keys(value).length <= 50, 'Too many platform options');
const target = z.object({
  accountId: z.number().int().positive(),
  scheduledAt: z.string().datetime().optional(),
  overrideText: text.optional(),
  firstComment: text.optional(),
  options: targetOptions.optional(),
});
export const postSaveSchema = z.object({
  id: z.number().int().positive().optional(),
  text,
  status: z.enum(['draft', 'scheduled']),
  targets: z.array(target).max(10).default([]),
});
export const queuePostSchema = z.object({
  id: z.number().int().positive().optional(),
  text,
  targets: z
    .array(target.omit({ scheduledAt: true }))
    .min(1)
    .max(10),
});
export const mediaDataSchema = z.object({
  postId: z.number().int().positive(),
  files: z
    .array(
      z.object({
        name: z.string().min(1).max(255),
        mime: z.string().max(100),
        bytes: z.instanceof(Uint8Array).refine((v) => v.byteLength <= 512 * 1024 * 1024, 'File too large'),
      }),
    )
    .max(10),
});
export const mediaAltSchema = z.object({
  mediaId: z.number().int().positive(),
  altText: z.string().max(2000),
});
export const positiveIdSchema = z.number().int().positive();
export const artifactPathSchema = z.string().min(1).max(32_768);
export const externalUrlSchema = z
  .string()
  .url()
  .refine(
    (value) => value.startsWith('https://') || value.startsWith('http://'),
    'Only HTTP(S) URLs are allowed',
  );
export const rescheduleSchema = z.object({
  targetId: z.number().int().positive(),
  scheduledAt: z.string().datetime(),
});
export const retrySchema = z.object({ targetId: z.number().int().positive() });
export const templateSchema = z.object({
  name: z.string().min(1).max(200),
  body: text,
  variables: z.array(z.string().max(100)).max(100),
});
export const settingSchema = z.object({
  key: z.enum(['launchAtLogin', 'notifications']),
  value: z.enum(['true', 'false']),
});
export const accountSettingsSchema = z.object({
  accountId: z.number().int().positive(),
  platform: z.enum(PLATFORM_IDS),
  dailyCap: z.number().int().min(1).max(50),
  headless: z.boolean(),
  slots: z
    .array(
      z.object({
        weekday: z.number().int().min(0).max(6),
        timeLocal: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
      }),
    )
    .max(28),
});
export const csvImportSchema = z.object({
  csv: z.string().max(10_000_000),
  dryRun: z.boolean().default(true),
});
