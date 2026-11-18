/** Monday-first for display; `weekday` values stay JavaScript's 0 = Sunday. */
export const WEEKDAYS: Array<[number, string]> = [
  [1, 'Mon'],
  [2, 'Tue'],
  [3, 'Wed'],
  [4, 'Thu'],
  [5, 'Fri'],
  [6, 'Sat'],
  [0, 'Sun'],
];

const ORDER = WEEKDAYS.map(([day]) => day);
const NAMES = new Map(WEEKDAYS);

/** “Daily”, “Mon–Fri”, “Tue, Thu”, “Mon–Wed, Sat”: runs of three or more days collapse to a range. */
export function dayList(days: number[]): string {
  const sorted = ORDER.filter((day) => days.includes(day));
  if (sorted.length === 7) return 'Daily';
  const runs: number[][] = [];
  for (const day of sorted) {
    const last = runs[runs.length - 1];
    if (last && ORDER.indexOf(day) === ORDER.indexOf(last[last.length - 1]!) + 1) last.push(day);
    else runs.push([day]);
  }
  return runs
    .flatMap((run) =>
      run.length >= 3
        ? [`${NAMES.get(run[0]!)}–${NAMES.get(run[run.length - 1]!)}`]
        : run.map((day) => NAMES.get(day)!),
    )
    .join(', ');
}

/** Figma 6:346 wording: “Mon–Fri · 10:30, 17:00”; days with different times are listed separately. */
export function summarizeSlots(slots: Array<{ weekday: number; time_local: string }>): string {
  if (!slots.length) return 'Daily · 09:30, 17:30 (default)';
  const byDay = new Map<number, string[]>();
  for (const slot of slots) byDay.set(slot.weekday, [...(byDay.get(slot.weekday) ?? []), slot.time_local]);
  const groups = new Map<string, number[]>();
  for (const [day, times] of byDay) {
    const key = [...new Set(times)].sort().join(', ');
    groups.set(key, [...(groups.get(key) ?? []), day]);
  }
  return [...groups]
    .sort(
      ([, a], [, b]) =>
        Math.min(...a.map((d) => ORDER.indexOf(d))) - Math.min(...b.map((d) => ORDER.indexOf(d))),
    )
    .map(([times, days]) => `${dayList(days)} · ${times}`)
    .join('; ');
}
