import { useEffect, useState } from 'react';
import { Clapperboard, Globe, Link2 } from 'lucide-react';
import type { BrowserInfoView, RehearsalView } from '../../shared/api';
import type { PlatformId } from '../../shared/types';
import { handpostApi } from '../lib/api';
import { shortPath } from '../lib/format';
import { Button, EmptyState, StatusPill, StepLog } from '../ui';

/** Rehearse + "Your profile URL" for one account card (H6). */
export function AccountLive({
  platform,
  connected,
  profileUrl,
  onChanged,
}: {
  platform: PlatformId;
  connected: boolean;
  profileUrl: string | null | undefined;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<RehearsalView | null>(null);
  const [error, setError] = useState('');
  const [url, setUrl] = useState(profileUrl ?? '');
  const [editing, setEditing] = useState(false);
  const needsUrl = connected && !profileUrl;
  const rehearse = async () => {
    setBusy(true);
    setError('');
    try {
      setResult(await handpostApi.rehearse({ platform }));
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="account-live">
      {(needsUrl || editing) && (
        <form
          className="profile-url"
          onSubmit={async (event) => {
            event.preventDefault();
            try {
              await handpostApi.setProfileUrl({ platform, url });
              setError('');
              setEditing(false);
              onChanged();
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
        </form>
      )}
      {!needsUrl && !editing && profileUrl && (
        <button
          type="button"
          className="link-button t-mono-s"
          onClick={() => setEditing(true)}
          title="Change profile URL"
        >
          <Link2 size={12} aria-hidden="true" /> {profileUrl.replace(/^https:\/\//, '')}
        </button>
      )}
      <div className="account-live__actions">
        <Button size="s" icon={Clapperboard} disabled={!connected || busy} onClick={() => void rehearse()}>
          {busy ? 'Rehearsing…' : 'Rehearse'}
        </Button>
      </div>
      {error && (
        <p role="alert" className="hp-callout hp-callout--danger">
          {error}
        </p>
      )}
      {result && (
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
      )}
    </div>
  );
}

/** Accounts footer: which browser Handpost found, or how to get one. */
export function BrowserFooter() {
  const [info, setInfo] = useState<BrowserInfoView | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const value = await handpostApi.browserInfo();
        if (alive) setInfo(value);
      } catch {
        // Without the main process (tests, demo without the call) there is simply no footer.
      }
    })();
    return () => {
      alive = false;
    };
  }, []);
  if (!info) return null;
  if (!info.found)
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
  return (
    <p className="accounts-footer t-mono-s secondary-text">
      {info.label}
      {info.version ? ` ${info.version}` : ''}
      {info.path ? ` · ${shortPath(info.path)}` : ''} · profiles in {shortPath(info.profiles)}
    </p>
  );
}
