import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { handpostApi } from '../lib/api';
import { Button, EmptyState, PlatformBadge, Segmented } from '../ui';
import { JITTER_NOTE } from '../lib/format';
import type { Fields, TargetListRow } from '../../shared/rows';
type CalendarTarget = Fields<TargetListRow, 'id' | 'platform' | 'scheduled_at_utc'>;
export interface CalendarProps {
  targets: CalendarTarget[];
  onChanged: () => void;
}
export function Calendar({ targets, onChanged }: CalendarProps) {
  const [cursor, setCursor] = useState(() => new Date());
  const [view, setView] = useState<'month' | 'week'>('month');
  const year = cursor.getFullYear(),
    month = cursor.getMonth();
  const first =
    view === 'month' ? new Date(year, month, 1) : new Date(year, month, cursor.getDate() - cursor.getDay());
  const count = view === 'month' ? 42 : 7;
  const cells = Array.from(
    { length: count },
    (_, index) =>
      new Date(
        first.getFullYear(),
        first.getMonth(),
        first.getDate() + index - (view === 'month' ? first.getDay() : 0),
      ),
  );
  const shift = (delta: number) =>
    setCursor(
      view === 'month'
        ? new Date(year, month + delta, 1)
        : new Date(year, month, cursor.getDate() + delta * 7),
    );
  return (
    <main className="screen">
      <header className="screen-header">
        <div>
          <p className="eyebrow">Calendar</p>
          <h1 className="t-display-m">
            {view === 'month'
              ? cursor.toLocaleString(undefined, { month: 'long', year: 'numeric' })
              : `Week of ${cells[0]!.toLocaleDateString()}`}
          </h1>
          <p className="secondary-text">
            Drag a post to another day to reschedule it (local time). Keyboard: focus a post, then Left/Right
            Arrow.
          </p>
        </div>
        <div className="screen-header__actions">
          <Segmented<'month' | 'week'>
            label="Calendar view"
            value={view}
            onChange={setView}
            options={[
              { value: 'month', label: 'Month' },
              { value: 'week', label: 'Week' },
            ]}
          />
          <Button icon={ChevronLeft} label={`Previous ${view}`} onClick={() => shift(-1)} />
          <Button onClick={() => setCursor(new Date())}>Today</Button>
          <Button icon={ChevronRight} label={`Next ${view}`} onClick={() => shift(1)} />
        </div>
      </header>
      {!targets.some((target) => target.scheduled_at_utc) && (
        <div className="hp-card">
          <EmptyState
            action={
              <a className="hp-button hp-button--secondary" href="#/compose">
                Compose a post
              </a>
            }
          >
            Nothing is scheduled yet. Scheduled posts appear on their day; drag them to move them.
          </EmptyState>
        </div>
      )}
      <section className={`hp-card calendar calendar--${view}`} aria-label="Calendar">
        <div className="weekdays">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
            <strong key={day}>{day}</strong>
          ))}
        </div>
        <div className="calendar-grid">
          {cells.map((date) => {
            const dateKey = date.toDateString();
            const rows = targets.filter(
              (target): target is CalendarTarget & { scheduled_at_utc: string } =>
                Boolean(target.scheduled_at_utc) &&
                new Date(target.scheduled_at_utc ?? '').toDateString() === dateKey,
            );
            return (
              <div
                key={date.toISOString()}
                className={view === 'month' && date.getMonth() !== month ? 'day outside' : 'day'}
                onDragOver={(event) => event.preventDefault()}
                onDrop={async (event) => {
                  const id = Number(event.dataTransfer.getData('target'));
                  const original = targets.find((target) => target.id === id);
                  if (!original?.scheduled_at_utc) return;
                  const time = new Date(original.scheduled_at_utc);
                  date.setHours(time.getHours(), time.getMinutes());
                  await handpostApi.reschedule({ targetId: id, scheduledAt: date.toISOString() });
                  onChanged();
                }}
              >
                <span className="day__number">{date.getDate()}</span>
                {rows.map((row) => (
                  <button
                    draggable
                    aria-label={`${row.platform} post at ${new Date(row.scheduled_at_utc).toLocaleString()} ${JITTER_NOTE}`}
                    onDragStart={(event) => event.dataTransfer.setData('target', String(row.id))}
                    onKeyDown={async (event) => {
                      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
                      event.preventDefault();
                      const moved = new Date(row.scheduled_at_utc);
                      moved.setDate(moved.getDate() + (event.key === 'ArrowRight' ? 1 : -1));
                      await handpostApi.reschedule({ targetId: row.id, scheduledAt: moved.toISOString() });
                      onChanged();
                    }}
                    className="calendar-chip"
                    key={row.id}
                  >
                    <PlatformBadge platform={row.platform} />
                    <span>
                      {new Date(row.scheduled_at_utc).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}
