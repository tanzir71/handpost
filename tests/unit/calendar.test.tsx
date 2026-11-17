// @vitest-environment jsdom
import { fireEvent, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Calendar } from '../../src/renderer/components/Calendar';
import { handpostApi } from '../../src/renderer/lib/api';

vi.mock('../../src/renderer/lib/api', () => ({ handpostApi: { reschedule: vi.fn() } }));

describe('calendar rescheduling', () => {
  beforeEach(() => vi.mocked(handpostApi.reschedule).mockReset());
  it('drags a scheduled target to another local calendar day while retaining its time', async () => {
    const source = new Date();
    source.setHours(9, 30, 0, 0);
    const target = { id: 12, platform: 'x', scheduled_at_utc: source.toISOString() };
    const changed = vi.fn();
    const { container } = render(<Calendar targets={[target]} onChanged={changed} />);
    const chip = container.querySelector<HTMLElement>('.calendar-chip')!;
    const cells = [...container.querySelectorAll<HTMLElement>('.day')];
    const destination = cells.find((cell) =>
      cell.textContent?.startsWith(String(source.getDate() === 1 ? 2 : 1)),
    )!;
    const data = new Map<string, string>();
    const dataTransfer = {
      setData: (key: string, value: string) => data.set(key, value),
      getData: (key: string) => data.get(key) ?? '',
    };
    fireEvent.dragStart(chip, { dataTransfer });
    fireEvent.drop(destination, { dataTransfer });
    await vi.waitFor(() => expect(handpostApi.reschedule).toHaveBeenCalledOnce());
    const call = vi.mocked(handpostApi.reschedule).mock.calls[0]![0];
    const moved = new Date(call.scheduledAt);
    expect([moved.getHours(), moved.getMinutes()]).toEqual([9, 30]);
    expect(changed).toHaveBeenCalledOnce();
  });
  it('moves a focused post one local day with the arrow keys', async () => {
    const source = new Date();
    source.setHours(14, 45, 0, 0);
    const target = { id: 13, platform: 'x', scheduled_at_utc: source.toISOString() };
    const changed = vi.fn();
    const { container } = render(<Calendar targets={[target]} onChanged={changed} />);
    fireEvent.keyDown(container.querySelector('.calendar-chip')!, { key: 'ArrowRight' });
    await vi.waitFor(() => expect(handpostApi.reschedule).toHaveBeenCalledOnce());
    const moved = new Date(vi.mocked(handpostApi.reschedule).mock.calls[0]![0].scheduledAt);
    const expected = new Date(source);
    expected.setDate(expected.getDate() + 1);
    expect(moved.toISOString()).toBe(expected.toISOString());
    expect(changed).toHaveBeenCalledOnce();
  });
});
