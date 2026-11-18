// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
const mockApi = vi.hoisted(() => ({
  retry: vi.fn(async () => undefined),
  reverify: vi.fn(async () => 'published'),
  openManual: vi.fn(),
  saveSetting: vi.fn(async () => undefined),
  publishNow: vi.fn(async () => undefined),
  pacingToday: vi.fn(async () => []),
  breakers: vi.fn(async () => []),
  readArtifact: vi.fn(async () => 'data:image/png;base64,AA=='),
}));
vi.mock('../../src/renderer/lib/api', () => ({ handpostApi: mockApi }));
import { Queue, type QueueProps } from '../../src/renderer/components/Queue';
import { MenuButton } from '../../src/renderer/ui';
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const soon = new Date(Date.now() + 3_600_000).toISOString();
const target = (
  id: number,
  status: QueueProps['targets'][number]['status'],
): QueueProps['targets'][number] => ({
  id,
  platform: 'x',
  base_text: `post ${id}`,
  status,
  scheduled_at_utc: soon,
});

describe('Queue → Pause publishing', () => {
  it('pauses and resumes with one button, and says what pausing means', async () => {
    const { rerender } = render(
      <Queue targets={[target(1, 'scheduled')]} attempts={[]} onChanged={() => {}} settings={[]} />,
    );
    expect(screen.getByRole('region', { name: 'Next up' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Pause publishing' }));
    await waitFor(() =>
      expect(mockApi.saveSetting).toHaveBeenCalledWith({ key: 'publishing.paused', value: 'true' }),
    );
    rerender(
      <Queue
        targets={[target(1, 'scheduled')]}
        attempts={[]}
        onChanged={() => {}}
        settings={[{ key: 'publishing.paused', value: 'true' }]}
      />,
    );
    expect(screen.getByRole('region', { name: 'Publishing paused' }).textContent).toContain(
      'nothing posts until you resume',
    );
    expect(screen.queryByRole('button', { name: 'Publish now' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Resume publishing' }));
    await waitFor(() =>
      expect(mockApi.saveSetting).toHaveBeenCalledWith({ key: 'publishing.paused', value: 'false' }),
    );
  });
});

describe('Queue → unverified rows', () => {
  it('offer Retry verify, which checks again instead of publishing a second time', async () => {
    render(<Queue targets={[target(4, 'unverified')]} attempts={[]} onChanged={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry verify' }));
    await waitFor(() => expect(mockApi.reverify).toHaveBeenCalledWith({ targetId: 4 }));
    expect(mockApi.retry).not.toHaveBeenCalled();
  });
  it('failed rows still offer Retry', async () => {
    render(<Queue targets={[target(5, 'failed')]} attempts={[]} onChanged={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(mockApi.retry).toHaveBeenCalledWith({ targetId: 5 }));
  });
});

describe('MenuButton', () => {
  it('opens a menu, moves with the arrow keys, closes on Escape and returns focus', () => {
    const onSelect = vi.fn();
    render(
      <MenuButton
        label="Use template"
        items={[
          { id: '1', label: 'Launch' },
          { id: '2', label: 'Weekly tip' },
        ]}
        onSelect={onSelect}
      />,
    );
    const trigger = screen.getByRole('button', { name: 'Use template' });
    fireEvent.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const items = screen.getAllByRole('menuitem');
    expect(document.activeElement).toBe(items[0]);
    fireEvent.keyDown(items[0]!, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(items[1]);
    fireEvent.keyDown(items[1]!, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Weekly tip' }));
    expect(onSelect).toHaveBeenCalledWith('2');
  });
  it('says so when there is nothing to choose', () => {
    render(<MenuButton label="Use template" items={[]} onSelect={() => {}} empty="No templates yet." />);
    fireEvent.click(screen.getByRole('button', { name: 'Use template' }));
    expect(screen.getByText('No templates yet.')).toBeTruthy();
  });
});
