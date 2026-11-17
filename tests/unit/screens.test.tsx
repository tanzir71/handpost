// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { InboxListItem, Receipt } from '../../src/shared/inbox-types';

const mockApi = vi.hoisted(() => ({
  inboxApprove: vi.fn(async (id: string) => ({ id }) as unknown),
  inboxReject: vi.fn(async (id: string) => ({ id }) as unknown),
  inboxOpen: vi.fn(async () => {}),
  saveSetting: vi.fn(async (input: { key: string; value: string }) => {
    void input;
  }),
  saveAccountSettings: vi.fn(async (input: unknown) => {
    void input;
  }),
  connect: vi.fn(async () => {}),
  reenable: vi.fn(async () => {}),
  savePost: vi.fn(async (input: unknown) => {
    void input;
    return 1;
  }),
  queuePost: vi.fn(async (input: unknown) => {
    void input;
    return 1;
  }),
  attachMedia: vi.fn(async () => []),
  addMedia: vi.fn(async () => []),
  updateMediaAlt: vi.fn(async () => {}),
  openExternal: vi.fn(async () => {}),
  pacingToday: vi.fn(async () => []),
  breakers: vi.fn(async () => []),
  browserInfo: vi.fn(async () => ({
    channel: 'chrome',
    found: false,
    path: null,
    version: null,
    label: 'Google Chrome',
    profiles: 'C:/data/profiles',
  })),
  setProfileUrl: vi.fn(async (input: unknown) => {
    void input;
    return { handle: '@tanzir', profileUrl: 'https://x.com/tanzir' };
  }),
  rehearse: vi.fn(async (input: unknown) => {
    void input;
    return {
      attemptId: 1,
      outcome: 'rehearsal' as const,
      screenshotPath: 'shot.png',
      screenshot: 'data:image/png;base64,AA==',
      steps: [
        {
          name: 'discard draft',
          startedAt: '2026-01-01T00:00:00Z',
          finishedAt: '2026-01-01T00:00:01Z',
          outcome: 'ok',
        },
      ],
      error: null,
    };
  }),
}));
vi.mock('../../src/renderer/lib/api', () => ({ handpostApi: mockApi, isDemo: false }));
import { Inbox } from '../../src/renderer/components/Inbox';
import { Accounts } from '../../src/renderer/components/Accounts';
import { Composer } from '../../src/renderer/components/Composer';
import { Queue } from '../../src/renderer/components/Queue';
import { Logs } from '../../src/renderer/components/Logs';
import { Calendar } from '../../src/renderer/components/Calendar';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  sessionStorage.clear();
});

function item(id: string, state: InboxListItem['state'], extra: Partial<InboxListItem> = {}): InboxListItem {
  const receipt: Receipt = {
    handpost: 1,
    id,
    state,
    source: 'claude:weekly',
    file: `processed/2026-11/${id}.md`,
    received_at: '2026-11-18T03:00:00Z',
    updated_at: '2026-11-18T03:00:00Z',
    mode: 'schedule',
    warnings: [],
    errors: [],
    targets: [
      {
        platform: 'x',
        status: state === 'held' ? 'draft' : 'scheduled',
        scheduled_at: '2026-11-20T03:30:00Z',
        published_at: null,
        url: null,
        error: null,
      },
    ],
  };
  return {
    key: `item:${id}`,
    id,
    postId: 1,
    state,
    source: 'claude:weekly',
    sourceKind: 'claude',
    fileName: `${id}.md`,
    storedPath: receipt.file,
    receivedAt: '2026-11-18T03:00:00Z',
    text: `Post ${id}`,
    receipt,
    ...extra,
  };
}

const ITEMS = [
  item('held-one', 'held'),
  item('scheduled-one', 'scheduled'),
  item('published-one', 'published'),
  item('rejected-one', 'rejected', { postId: null, text: null }),
  { ...item('scheduled-one', 'duplicate'), key: 'file:9' },
];

const renderInbox = (items = ITEMS, settings = [{ key: 'inbox.autoSchedule', value: 'false' }]) => {
  const onChanged = vi.fn();
  const onEdit = vi.fn();
  render(
    <Inbox
      items={items}
      settings={settings}
      onChanged={onChanged}
      onEdit={onEdit}
      onOpenAutomation={() => {}}
    />,
  );
  return { onChanged, onEdit };
};

describe('Inbox screen', () => {
  it('filters by state with counts and by search text', () => {
    renderInbox();
    expect(screen.getAllByRole('option')).toHaveLength(5);
    const held = screen.getByRole('button', { name: /Held for review/ });
    expect(held.textContent).toContain('1');
    fireEvent.click(held);
    expect(screen.getAllByRole('option').map((row) => row.textContent)).toEqual([
      expect.stringContaining('Post held-one'),
    ]);
    fireEvent.click(screen.getByRole('button', { name: /Duplicates/ }));
    expect(screen.getAllByRole('option')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: /^All/ }));
    fireEvent.change(screen.getByLabelText('Search the inbox'), { target: { value: 'published-one' } });
    expect(screen.getAllByRole('option')).toHaveLength(1);
  });
  it('approves a held item from its receipt panel', async () => {
    const { onChanged } = renderInbox();
    fireEvent.click(screen.getAllByRole('option')[0]!);
    const panel = screen.getByRole('region', { name: 'held-one' });
    fireEvent.click(within(panel).getByRole('button', { name: /Approve & schedule/ }));
    await waitFor(() => expect(mockApi.inboxApprove).toHaveBeenCalledWith('held-one'));
    expect(onChanged).toHaveBeenCalled();
  });
  it('rejects through a confirm popover, never a native confirm()', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm');
    renderInbox();
    fireEvent.click(screen.getAllByRole('option')[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    const dialog = screen.getByRole('alertdialog');
    expect(mockApi.inboxReject).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reject' }));
    await waitFor(() => expect(mockApi.inboxReject).toHaveBeenCalledWith('held-one'));
    expect(confirmSpy).not.toHaveBeenCalled();
  });
  it('opens Compose for Edit and keyboard-navigates rows', () => {
    const { onEdit } = renderInbox();
    const rows = screen.getAllByRole('option');
    rows[0]!.focus();
    fireEvent.keyDown(rows[0]!, { key: 'Enter' });
    fireEvent.keyDown(rows[0]!, { key: 'ArrowDown' });
    expect(screen.getAllByRole('option')[1]!.getAttribute('aria-selected')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(onEdit).toHaveBeenCalledWith(1);
  });
  it('explains the trust boundary the first time Auto-schedule is turned on', async () => {
    renderInbox();
    fireEvent.click(screen.getByRole('switch', { name: 'Auto-schedule' }));
    const dialog = screen.getByRole('dialog', { name: 'Turn on Auto-schedule?' });
    expect(dialog.textContent).toContain('Anything that can write to the inbox folder can publish');
    expect(mockApi.saveSetting).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Turn on Auto-schedule' }));
    await waitFor(() =>
      expect(mockApi.saveSetting.mock.calls.map(([input]) => input)).toEqual([
        { key: 'inbox.trustConfirmed', value: 'true' },
        { key: 'inbox.autoSchedule', value: 'true' },
      ]),
    );
  });
  it('shows an empty state that leads to the automation settings', () => {
    const onOpen = vi.fn();
    render(
      <Inbox items={[]} settings={[]} onChanged={() => {}} onEdit={() => {}} onOpenAutomation={onOpen} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Connect a Claude scheduled task/ }));
    expect(onOpen).toHaveBeenCalled();
  });
});

describe('Slots & caps editor', () => {
  it('replaces the weekday@HH:MM text field with a weekday × time editor', async () => {
    const onChanged = vi.fn();
    render(
      <Accounts
        accounts={[{ id: 2, platform: 'x', status: 'ok', last_checked_at: null, handle: '@me' }]}
        slots={[{ account_id: 2, weekday: 1, time_local: '09:30' }]}
        settings={[{ key: 'dailyCap:x', value: '4' }]}
        onChanged={onChanged}
      />,
    );
    expect(screen.queryByPlaceholderText('1@09:00, 3@15:30')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Slots & caps' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('New time for Tue'), { target: { value: '10:15' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add Tue slot' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove Mon 09:30' }));
    fireEvent.change(within(dialog).getByLabelText('Daily cap'), { target: { value: '3' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(mockApi.saveAccountSettings).toHaveBeenCalledWith({
        accountId: 2,
        platform: 'x',
        dailyCap: 3,
        headless: false,
        slots: [{ weekday: 2, timeLocal: '10:15' }],
      }),
    );
    expect(onChanged).toHaveBeenCalled();
  });
  it('copies a weekday’s slots to every weekday and refuses duplicates', () => {
    render(
      <Accounts
        accounts={[{ id: 2, platform: 'x', status: 'ok', last_checked_at: null }]}
        slots={[]}
        settings={[]}
        onChanged={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Slots & caps' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add Mon slot' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add Mon slot' }));
    expect(within(dialog).getByRole('alert').textContent).toContain('already exists');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Copy to weekdays' }));
    expect(within(dialog).getAllByRole('button', { name: /^Remove .* 09:30$/ })).toHaveLength(5);
  });
});

describe('Compose schedule modes', () => {
  const accounts = [{ id: 1, platform: 'x' as const }];
  it('Next free slot adds to the queue', async () => {
    render(<Composer accounts={accounts} templates={[]} onSaved={() => {}} />);
    fireEvent.change(screen.getByLabelText('Post text'), { target: { value: 'Queued post' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Next free slot' }));
    expect(screen.queryByLabelText('Publish at')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Add to queue' }));
    await waitFor(() => expect(mockApi.queuePost).toHaveBeenCalledOnce());
    expect(mockApi.savePost).not.toHaveBeenCalled();
  });
  it('Exact time schedules at the chosen local time', async () => {
    render(<Composer accounts={accounts} templates={[]} onSaved={() => {}} />);
    fireEvent.change(screen.getByLabelText('Post text'), { target: { value: 'Timed post' } });
    expect(screen.getByRole('radio', { name: 'Exact time' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.change(screen.getByLabelText('Publish at'), { target: { value: '2030-01-02T09:30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Schedule' }));
    await waitFor(() => expect(mockApi.savePost).toHaveBeenCalledOnce());
    const input = mockApi.savePost.mock.calls[0]![0] as { targets: Array<{ scheduledAt: string }> };
    expect(input.targets[0]!.scheduledAt).toBe(new Date(2030, 0, 2, 9, 30).toISOString());
  });
  it('defaults the exact time to an hour from now in local time', () => {
    render(<Composer accounts={accounts} templates={[]} onSaved={() => {}} />);
    const value = (screen.getByLabelText('Publish at') as HTMLInputElement).value;
    const delta = new Date(value).getTime() - Date.now();
    expect(delta).toBeGreaterThan(58 * 60_000);
    expect(delta).toBeLessThan(61 * 60_000);
  });
});

describe('Empty states', () => {
  it('appear on Queue, History and Calendar with one action or explanation', () => {
    render(<Queue targets={[]} attempts={[]} onChanged={() => {}} />);
    expect(screen.getByText(/The queue is empty/)).toBeTruthy();
    cleanup();
    render(<Logs attempts={[]} />);
    expect(screen.getByText('Nothing has been published yet.')).toBeTruthy();
    cleanup();
    render(<Calendar targets={[]} onChanged={() => {}} />);
    expect(screen.getByRole('link', { name: 'Compose a post' })).toBeTruthy();
  });
});

describe('Accounts live readiness', () => {
  it('asks for the profile URL when a connected account has none, then saves it', async () => {
    const onChanged = vi.fn();
    render(
      <Accounts
        accounts={[
          { id: 2, platform: 'x', status: 'ok', last_checked_at: null, handle: null, profile_url: null },
        ]}
        slots={[]}
        settings={[]}
        onChanged={onChanged}
      />,
    );
    fireEvent.change(screen.getByLabelText('Your profile URL'), {
      target: { value: 'https://x.com/tanzir' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save profile URL' }));
    await waitFor(() =>
      expect(mockApi.setProfileUrl).toHaveBeenCalledWith({ platform: 'x', url: 'https://x.com/tanzir' }),
    );
    expect(onChanged).toHaveBeenCalled();
  });
  it('rehearses a connected platform and shows that nothing was posted', async () => {
    render(
      <Accounts
        accounts={[
          {
            id: 2,
            platform: 'x',
            status: 'ok',
            last_checked_at: null,
            handle: '@me',
            profile_url: 'https://x.com/me1',
          },
          {
            id: 3,
            platform: 'threads',
            status: 'needs_login',
            last_checked_at: null,
            handle: null,
            profile_url: null,
          },
        ]}
        slots={[]}
        settings={[]}
        onChanged={() => {}}
      />,
    );
    const buttons = screen.getAllByRole('button', { name: 'Rehearse' });
    expect((buttons[1] as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(buttons[0]!);
    expect(await screen.findByText('Rehearsal passed')).toBeTruthy();
    expect(mockApi.rehearse).toHaveBeenCalledWith({ platform: 'x' });
    expect(screen.getByText(/nothing was posted/)).toBeTruthy();
    expect(screen.getByAltText('x composer filled during the rehearsal')).toBeTruthy();
  });
  it('shows an Install Google Chrome empty state when no browser was found', async () => {
    render(<Accounts accounts={[]} slots={[]} settings={[]} onChanged={() => {}} />);
    expect(await screen.findByRole('button', { name: 'Install Google Chrome' })).toBeTruthy();
  });
});
