import { describe, expect, it } from 'vitest';
import { countText, postWarnings, validatePost } from '../../src/shared/capabilities';
describe('platform validation', () => {
  it('uses X weighted characters and fixed URL length', () => {
    expect(countText('x', 'hello https://example.com/a/very/long/url')).toBe(29);
    expect(countText('x', '界😀')).toBe(4);
  });
  it('counts Bluesky grapheme clusters', () => expect(countText('bluesky', '👨‍👩‍👧‍👦a')).toBe(2));
  it('blocks over-limit X content and thread continuations inline', () => {
    expect(validatePost('x', { text: 'x'.repeat(281), media: [] })).toContain('Text exceeds 280 characters');
    expect(validatePost('x', { text: 'opener', thread: ['x'.repeat(281)], media: [] })).toContain(
      'Thread post 2 exceeds 280 characters',
    );
  });
  it('accepts four X images, rejects five, and rejects mixed video posts', () => {
    const image = { path: 'x.png', kind: 'image' as const };
    expect(validatePost('x', { text: 'ok', media: Array(4).fill(image) })).toEqual([]);
    expect(validatePost('x', { text: 'ok', media: Array(5).fill(image) })).toContain('Maximum 4 media files');
    expect(validatePost('x', { text: 'ok', media: [image, { path: 'x.mp4', kind: 'video' }] })).toContain(
      'X supports either up to 4 images or one video',
    );
  });
  it('rejects an oversized video with an inline reason', () =>
    expect(
      validatePost('tiktok', {
        text: 'caption',
        media: [{ path: 'huge.mp4', kind: 'video', sizeBytes: 4 * 1024 * 1024 * 1024 + 1, durationS: 30 }],
      }),
    ).toContain('Media exceeds 4096 MB'));
  it('requires media for Instagram and video-first platforms', () => {
    expect(validatePost('instagram', { text: 'caption', media: [] })[0]).toMatch(/requires media/);
    expect(
      validatePost('instagram', { text: 'caption', media: [{ path: 'reel.mp4', kind: 'video' }] }),
    ).toContain('Unsupported media type for Instagram');
    expect(validatePost('youtube', { text: 'title', media: [] })[0]).toMatch(/requires media/);
  });
  it('enforces Instagram hashtag and Shorts orientation constraints', () => {
    const hashtags = Array.from({ length: 31 }, (_, index) => `#tag${index}`).join(' ');
    expect(
      validatePost('instagram', { text: hashtags, media: [{ path: 'feed.jpg', kind: 'image' }] }),
    ).toContain('Instagram supports at most 30 hashtags');
    expect(
      validatePost('youtube', {
        text: 'Short',
        media: [{ path: 'wide.mp4', kind: 'video', width: 1920, height: 1080, durationS: 30 }],
      }),
    ).toContain('YouTube Shorts video must be vertical or square');
  });
  it('returns non-blocking fold, limit, and crop warnings', () => {
    expect(postWarnings('linkedin', { text: 'x'.repeat(210), media: [] })).toContain(
      'Text will fold behind “see more”',
    );
    expect(postWarnings('x', { text: 'x'.repeat(250), media: [] })).toContain('Approaching X limit');
    expect(
      postWarnings('instagram', {
        text: 'caption',
        media: [{ path: 'wide.jpg', kind: 'image', width: 2000, height: 500 }],
      }),
    ).toContain('Instagram will crop media outside 4:5–1.91:1');
    expect(
      validatePost('instagram', {
        text: 'caption',
        media: [{ path: 'wide.jpg', kind: 'image', width: 2000, height: 500 }],
      }),
    ).toEqual([]);
  });
});
