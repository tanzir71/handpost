/** Times are stored in UTC and shown in local time with the zone name (UI notes §6). */
export const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

export function formatWhen(iso: string | null | undefined, options: { withDay?: boolean } = {}): string {
  if (!iso) return 'No time';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'No time';
  const sameDay = date.toDateString() === new Date().toDateString();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const day =
    sameDay && !options.withDay
      ? 'Today'
      : date.toDateString() === tomorrow.toDateString() && !options.withDay
        ? 'Tomorrow'
        : date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  return `${day}, ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** “in 3 h”, “12 min ago”, “just now”. */
export function relative(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return 'never';
  const diff = new Date(iso).getTime() - now;
  const abs = Math.abs(diff);
  const units: Array<[number, string]> = [
    [86_400_000, 'd'],
    [3_600_000, 'h'],
    [60_000, 'min'],
    [1000, 's'],
  ];
  if (abs < 5000) return 'just now';
  const [size, unit] = units.find(([ms]) => abs >= ms) ?? [1000, 's'];
  const value = Math.round(abs / size);
  return diff > 0 ? `in ${value} ${unit}` : `${value} ${unit} ago`;
}

/** The scheduler fires within ±90 s of the shown time. */
export const JITTER_NOTE = '±90 s';

export function dayKey(iso: string): string {
  return new Date(iso).toDateString();
}

export function dayHeading(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
  return date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
}

export function shortPath(path: string | null | undefined): string {
  if (!path) return '';
  return path.replace(/^[A-Za-z]:[\\/]Users[\\/][^\\/]+/, '~').replace(/^\/(Users|home)\/[^/]+/, '~');
}

/** A Date as the value a `datetime-local` input expects (local wall-clock time, minutes). */
export function toLocalInput(date: Date): string {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}
