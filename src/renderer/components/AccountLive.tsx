import { useEffect, useState, type ReactNode } from 'react';
import { Globe, Monitor } from 'lucide-react';
import type { BrowserInfoView, RehearsalView } from '../../shared/api';
import type { PlatformId } from '../../shared/types';
import { handpostApi } from '../lib/api';
import { shortPath } from '../lib/format';
import { Button, EmptyState, StatusPill, StepLog } from '../ui';

/** “Your profile URL” for one account card (H6): verification opens it to find each new post. */
export function ProfileUrlForm({
  platform,
  profileUrl,
  onSaved,
}: {
  platform: PlatformId;
  profileUrl: string | null | undefined;
  onSaved: () => void;
}) {
  const [url, setUrl] = useState(profileUrl ?? '');
  const [error, setError] = useState('');
  return (
    <form
      className="profile-url"
      onSubmit={async (event) => {
        event.preventDefault();
        try {
          await handpostApi.setProfileUrl({ platform, url });
          setError('');
          onSaved();
        } catch (value) {
          setError(value instanceof Error ? value.message : String(value));
        }
      }}
    >
      <label className="hp-field">
        <span>Your profile URL</span>
        <input
          type="url"
          value={url}
          placeholder="https://…"
          onChange={(event) => setUrl(event.target.value)}
          aria-describedby={`profile-hint-${platform}`}
        />
      </label>
      <small id={`profile-hint-${platform}`} className="muted">
        Handpost opens it to find each new post and save its link.
        {platform === 'facebook' ? ' For a Page, use the Page’s address.' : ''}
      </small>
      <Button size="s" kind="primary" type="submit" disabled={!url}>
        Save profile URL
      </Button>
      {error && (
        <p role="alert" className="hp-callout hp-callout--danger">
          {error}
        </p>
      )}
    </form>
  );
}

/** What a rehearsal did: filled, screenshotted and discarded — or where it stopped. */
export function RehearsalResult({
  platform,
  result,
  error,
}: {
  platform: PlatformId;
  result?: RehearsalView | undefined;
  error?: string | undefined;
}) {
  if (error)
    return (
      <p role="alert" className="hp-callout hp-callout--danger">
        {error}
      </p>
    );
  if (!result) return null;
  return (
    <div className="rehearsal-result" role="status">
      <p>
        <StatusPill status={result.outcome === 'rehearsal' ? 'published' : 'failed'}>
          {result.outcome === 'rehearsal' ? 'Rehearsal passed' : result.outcome.replace('_', ' ')}
        </StatusPill>{' '}
        <span className="t-body-s secondary-text">
          {result.outcome === 'rehearsal'
            ? 'Filled, screenshotted and discarded — nothing was posted.'
            : result.error}
        </span>
      </p>
      {result.steps.length > 0 && <StepLog steps={result.steps} />}
      {result.screenshot && (
        <img src={result.screenshot} alt={`${platform} composer filled during the rehearsal`} />
      )}
    </div>
  );
}

/** Accounts footer: which browser Handpost found, or how to get one. */
export function BrowserFooter({ extra }: { extra?: ReactNode }) {
  const [info, setInfo] = useState<BrowserInfoView | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const value = await handpostApi.browserInfo();
        if (alive) setInfo(value);
      } catch {
        // Without the main process (tests, demo without the call) there is simply no browser line.
      }
    })();
    return () => {
      alive = false;
    };
  }, []);
  if (info && !info.found)
    return (
      <div className="hp-card">
        <EmptyState
          action={
            <Button
              icon={Globe}
              onClick={() => void handpostApi.openExternal('https://www.google.com/chrome/')}
            >
              Install Google Chrome
            </Button>
          }
        >
          Handpost posts through Google Chrome (or Microsoft Edge), and neither was found. Install one, then
          come back — scheduled posts wait until then.
        </EmptyState>
      </div>
    );
  if (!info && !extra) return null;
  const major = info?.version?.split('.')[0];
  return (
    <p className="accounts-footer t-body-s secondary-text">
      <Monitor size={14} aria-hidden="true" />
      <span>
        {info && (
          <>
            {info.label.replace('Google ', '')}
            {major ? ` ${major}` : ''} found · profiles stored in {shortPath(info.profiles)}
          </>
        )}
        {extra}
      </span>
    </p>
  );
}
