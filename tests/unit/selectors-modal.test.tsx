// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SelectorsView } from '../../src/shared/selectors';

const view = (overrides: Partial<SelectorsView> = {}): SelectorsView => ({
  platform: 'x',
  slots: [
    {
      key: 'text',
      label: 'Post text box',
      hint: 'Compose page',
      builtIn: ['[data-testid="tweetTextarea_0"]'],
    },
    { key: 'submit', label: 'Post button', hint: 'Compose page', builtIn: ['[data-testid="tweetButton"]'] },
  ],
  active: null,
  proposal: {
    file: 'C:\\Users\\you\\Handpost\\selectors\\proposed\\x.json',
    patch: {
      format: 'handpost-selectors/1',
      platform: 'x',
      note: 'The editor moved into a new container.',
      slots: { text: ['div.new-editor'] },
    },
    errors: [],
    modifiedAt: new Date().toISOString(),
  },
  report: {
    dir: 'C:\\Users\\you\\Handpost\\selectors\\reports\\x\\1',
    at: new Date().toISOString(),
    step: 'fill text',
    slots: ['text'],
    kind: 'failed',
    error: 'locator.fill: Timeout 30000ms exceeded.',
    hasHtml: true,
  },
  proposalPath: 'C:\\Users\\you\\Handpost\\selectors\\proposed\\x.json',
  prompt: 'prompt',
  ...overrides,
});
const mockApi = vi.hoisted(() => ({
  selectorsView: vi.fn(),
  selectorsSave: vi.fn(async () => undefined),
  selectorsProposal: vi.fn(async () => undefined),
  selectorsCheck: vi.fn(async () => ({
    report: 'r',
    rows: [{ slot: 'text', selector: 'div.new-editor', matches: 1, relevant: true }],
  })),
  selectorsCopyPrompt: vi.fn(async () => undefined),
  selectorsOpenReport: vi.fn(async () => undefined),
  rehearse: vi.fn(async () => null),
}));
vi.mock('../../src/renderer/lib/api', () => ({ handpostApi: mockApi }));
import { SelectorsModal } from '../../src/renderer/components/SelectorsModal';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Accounts → Selectors', () => {
  it('shows the failure, checks the proposed fix against the snapshot and applies it only on request', async () => {
    mockApi.selectorsView.mockResolvedValue(view());
    const onChanged = vi.fn();
    render(<SelectorsModal platform="x" canRehearse onClose={() => {}} onChanged={onChanged} />);
    expect(await screen.findByText(/“fill text” could not find its element/)).toBeTruthy();
    expect(screen.getByText('The editor moved into a new container.')).toBeTruthy();
    expect(mockApi.selectorsProposal).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Check against snapshot/ }));
    expect(await screen.findByText('1 match')).toBeTruthy();
    expect(mockApi.selectorsCheck).toHaveBeenCalledWith('x');

    fireEvent.click(screen.getByRole('button', { name: /Rehearse with this fix/ }));
    await waitFor(() => expect(mockApi.rehearse).toHaveBeenCalledWith({ platform: 'x', withProposal: true }));

    mockApi.selectorsView.mockResolvedValue(
      view({ proposal: null, active: { ...view().proposal!.patch!, note: undefined } }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() =>
      expect(mockApi.selectorsProposal).toHaveBeenCalledWith({ platform: 'x', action: 'apply' }),
    );
    expect(await screen.findByText(/Applied\./)).toBeTruthy();
    expect(onChanged).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Apply' })).toBeNull();
    expect((screen.getByLabelText(/Post text box/) as HTMLTextAreaElement).value).toBe('div.new-editor');
  });

  it('cannot apply a proposal with problems', async () => {
    mockApi.selectorsView.mockResolvedValue(
      view({
        proposal: {
          ...view().proposal!,
          patch: null,
          errors: ['slots.text.0: A selector must be on one line'],
        },
      }),
    );
    render(<SelectorsModal platform="x" canRehearse={false} onClose={() => {}} onChanged={() => {}} />);
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText(/must be on one line/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Apply' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: /Rehearse with this fix/ })).toBeNull();
  });

  it('saves the owner’s own selectors, one per line, and “use only mine”', async () => {
    mockApi.selectorsView.mockResolvedValue(view({ proposal: null, report: null }));
    render(<SelectorsModal platform="x" canRehearse onClose={() => {}} onChanged={() => {}} />);
    expect(await screen.findByText(/Nothing has failed yet/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Post button/), {
      target: { value: 'button.send\n\n  [aria-label="Post"]  ' },
    });
    const replace = screen.getAllByRole('checkbox', { name: 'Use only mine' })[1]!;
    fireEvent.click(replace);
    fireEvent.click(screen.getByRole('button', { name: 'Save my selectors' }));
    await waitFor(() =>
      expect(mockApi.selectorsSave).toHaveBeenCalledWith({
        platform: 'x',
        patch: {
          format: 'handpost-selectors/1',
          platform: 'x',
          slots: { submit: ['button.send', '[aria-label="Post"]'] },
          replace: ['submit'],
        },
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: /Copy prompt for Claude/ }));
    await waitFor(() => expect(mockApi.selectorsCopyPrompt).toHaveBeenCalledWith('x'));
  });
});
