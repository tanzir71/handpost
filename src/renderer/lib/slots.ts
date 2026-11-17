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

export function summarizeSlots(slots: Array<{ weekday: number; time_local: string }>): string {
  if (!slots.length) return 'Default · 09:30 & 17:30 daily';
  const days = new Set(slots.map((slot) => slot.weekday)).size;
  return `${slots.length} slot${slots.length === 1 ? '' : 's'} on ${days} day${days === 1 ? '' : 's'}`;
}
