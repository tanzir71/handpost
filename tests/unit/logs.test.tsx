// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
const mockApi = vi.hoisted(() => ({
  readArtifact: vi.fn(async () => 'data:image/png;base64,AA=='),
  openExternal: vi.fn(),
}));
vi.mock('../../src/renderer/lib/api', () => ({ handpostApi: mockApi }));
import { Logs } from '../../src/renderer/components/Logs';
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
describe('History evidence', () => {
  it('filters attempts and exposes permalink and proof', async () => {
    const result = render(
      <Logs
        attempts={[
          {
            id: 1,
            platform: 'x',
            started_at: '2026-01-01T00:00:00Z',
            outcome: 'published',
            step_log_json: '[]',
            screenshot_path: 'proof.png',
            published_url: 'https://x.com/owner/status/1',
          },
          {
            id: 2,
            platform: 'linkedin',
            started_at: '2026-01-01T00:00:00Z',
            outcome: 'failed',
            error_class: 'ui_drift',
            step_log_json: '[]',
          },
        ]}
      />,
    );
    fireEvent.change(screen.getByLabelText('Filter history'), { target: { value: 'x' } });
    expect(screen.queryByText('linkedin')).toBeNull();
    fireEvent.click(result.container.querySelector('summary')!);
    const permalink = screen.getByRole('button', { name: 'Open permalink' });
    fireEvent.click(permalink);
    expect(mockApi.openExternal).toHaveBeenCalledWith('https://x.com/owner/status/1');
    expect(await screen.findByAltText('Publish attempt 1 screenshot')).toBeTruthy();
  });
});
