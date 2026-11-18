import { describe, expect, it } from 'vitest';
import { adapterConfigs } from '../../src/main/adapters/configs';
import { FIRST_COMMENT_PLATFORMS } from '../../src/shared/capabilities';
import { ago, dayTitle } from '../../src/renderer/lib/format';
import { dayList, summarizeSlots } from '../../src/renderer/lib/slots';

const slot = (weekday: number, time_local: string) => ({ weekday, time_local });

describe('slot summaries (Accounts cards, Figma 6:346)', () => {
  it('collapses days that share times', () => {
    expect(summarizeSlots([1, 2, 3, 4, 5].flatMap((day) => [slot(day, '17:00'), slot(day, '10:30')]))).toBe(
      'Mon–Fri · 10:30, 17:00',
    );
    expect(summarizeSlots([slot(2, '08:15'), slot(4, '08:15')])).toBe('Tue, Thu · 08:15');
    expect(summarizeSlots([0, 1, 2, 3, 4, 5, 6].map((day) => slot(day, '09:00')))).toBe('Daily · 09:00');
    expect(summarizeSlots([slot(3, '12:00')])).toBe('Wed · 12:00');
  });
  it('lists days with different times separately, Monday first', () => {
    expect(summarizeSlots([slot(5, '17:00'), slot(1, '09:00'), slot(3, '09:00')])).toBe(
      'Mon, Wed · 09:00; Fri · 17:00',
    );
  });
  it('says when the defaults apply', () => {
    expect(summarizeSlots([])).toBe('Daily · 09:30, 17:30 (default)');
  });
  it('treats Sunday as the end of the week', () => {
    expect(dayList([6, 0])).toBe('Sat, Sun');
    expect(dayList([5, 6, 0])).toBe('Fri–Sun');
    expect(dayList([1, 2, 3, 6])).toBe('Mon–Wed, Sat');
  });
});

describe('relative labels', () => {
  const now = new Date(2026, 10, 18, 12, 0, 0);
  it('reads like the Figma cards', () => {
    expect(ago(new Date(2026, 10, 18, 11, 48).toISOString(), now)).toBe('12 min ago');
    expect(ago(new Date(2026, 10, 18, 9, 0).toISOString(), now)).toBe('3 h ago');
    expect(ago(new Date(2026, 10, 17, 14, 20).toISOString(), now)).toBe('yesterday');
    expect(ago(new Date(2026, 10, 16, 23, 0).toISOString(), now)).toBe('2 days ago');
    expect(ago(new Date(2026, 10, 18, 11, 59, 40).toISOString(), now)).toBe('just now');
  });
  it('titles Queue days with the date (day/month order follows the system locale)', () => {
    expect(dayTitle(new Date(2026, 10, 18, 7, 50).toISOString(), now)).toMatch(
      /^Today · Wed (18 Nov|Nov 18)$/,
    );
    expect(dayTitle(new Date(2026, 10, 19, 9, 0).toISOString(), now)).toMatch(
      /^Tomorrow · Thu (19 Nov|Nov 19)$/,
    );
    expect(dayTitle(new Date(2026, 10, 21, 9, 0).toISOString(), now)).toMatch(/^Sat (21 Nov|Nov 21)$/);
  });
});

describe('first comments', () => {
  it('are offered in Compose exactly for the adapters that can post one', () => {
    const fromAdapters = adapterConfigs
      .filter((config) => config.comment)
      .map((config) => config.id)
      .sort();
    expect([...FIRST_COMMENT_PLATFORMS].sort()).toEqual(fromAdapters);
  });
});
