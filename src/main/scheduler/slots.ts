export interface QueueSlot {
  weekday: number;
  timeLocal: string;
}
interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}
function partsInZone(date: Date, timeZone: string): ZonedParts {
  const values = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  );
  return {
    year: values.year!,
    month: values.month!,
    day: values.day!,
    hour: values.hour!,
    minute: values.minute!,
  };
}
function offsetMs(date: Date, timeZone: string): number {
  const parts = partsInZone(date, timeZone);
  return (
    Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute) -
    Math.floor(date.getTime() / 60_000) * 60_000
  );
}
export function zonedDateTimeToUtc(parts: ZonedParts, timeZone: string): Date {
  const wall = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  let result = new Date(wall - offsetMs(new Date(wall), timeZone));
  result = new Date(wall - offsetMs(result, timeZone));
  return result;
}
export function nextFreeSlot(
  slots: QueueSlot[],
  occupiedUtc: string[],
  from: Date,
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone,
): Date | null {
  if (!slots.length) return null;
  const occupied = new Set(occupiedUtc.map((value) => new Date(value).toISOString().slice(0, 16)));
  const base = partsInZone(from, timeZone);
  const baseDay = new Date(Date.UTC(base.year, base.month - 1, base.day));
  for (let days = 0; days < 120; days++) {
    const calendar = new Date(baseDay);
    calendar.setUTCDate(calendar.getUTCDate() + days);
    const weekday = calendar.getUTCDay();
    for (const slot of slots
      .filter((value) => value.weekday === weekday)
      .sort((a, b) => a.timeLocal.localeCompare(b.timeLocal))) {
      const [hour = 0, minute = 0] = slot.timeLocal.split(':').map(Number);
      const candidate = zonedDateTimeToUtc(
        {
          year: calendar.getUTCFullYear(),
          month: calendar.getUTCMonth() + 1,
          day: calendar.getUTCDate(),
          hour,
          minute,
        },
        timeZone,
      );
      if (candidate <= from) continue;
      if (!occupied.has(candidate.toISOString().slice(0, 16))) return candidate;
    }
  }
  return null;
}
