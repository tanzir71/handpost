import { ExternalLink, Save, ShieldCheck } from 'lucide-react';
import { capabilities } from '../../shared/capabilities';
import type { PlatformId } from '../../shared/types';
import { handpostApi } from '../lib/api';
interface AccountsProps {
  accounts: any[];
  slots: any[];
  settings: any[];
  onChanged: () => void;
}
const safeHeadless = new Set(['bluesky']);
export function Accounts({ accounts, slots, settings, onChanged }: AccountsProps) {
  const setting = (key: string, fallback: string) =>
    settings.find((item) => item.key === key)?.value ?? fallback;
  return (
    <main className="screen">
      <header className="screen-header">
        <div>
          <p className="eyebrow">SESSIONS</p>
          <h1>Connected accounts</h1>
          <p>Login is always manual. Handpost never reads or stores your credentials.</p>
        </div>
      </header>
      <div className="account-grid">
        {accounts
          .filter((account) => account.platform !== 'mock')
          .map((account) => {
            const platform = account.platform as PlatformId;
            const slotText = slots
              .filter((slot) => slot.account_id === account.id)
              .map((slot) => `${slot.weekday}@${slot.time_local}`)
              .join(', ');
            return (
              <article className="panel account-card" key={account.id}>
                <div className="account-top">
                  <span className={`account-logo ${platform}`}>{platform.slice(0, 2)}</span>
                  <div>
                    <h2>{capabilities[platform].label}</h2>
                    <p>
                      <span
                        className={`status-dot ${account.status === 'ok' ? 'ok' : account.status === 'frozen' ? 'danger' : 'warn'}`}
                      />
                      {account.status.replace('_', ' ')}
                    </p>
                  </div>
                </div>
                <dl>
                  <div>
                    <dt>Last verified</dt>
                    <dd>
                      {account.last_checked_at ? new Date(account.last_checked_at).toLocaleString() : 'Never'}
                    </dd>
                  </div>
                  <div>
                    <dt>Profile</dt>
                    <dd>Private local directory</dd>
                  </div>
                </dl>
                {account.status === 'frozen' && (
                  <button
                    className="secondary full"
                    onClick={async () => {
                      await handpostApi.reenable(platform);
                      onChanged();
                    }}
                  >
                    Manually re-enable automation
                  </button>
                )}
                <button
                  className="secondary full"
                  onClick={async () => {
                    await handpostApi.connect({ platform });
                    onChanged();
                  }}
                >
                  <ExternalLink size={16} />
                  {account.status === 'ok' ? 'Reconnect' : 'Connect in browser'}
                </button>
                <form
                  className="account-settings"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    const form = new FormData(event.currentTarget);
                    const parsed = String(form.get('slots') ?? '')
                      .split(',')
                      .map((value) => value.trim())
                      .filter(Boolean)
                      .map((value) => {
                        const [weekday, timeLocal] = value.split('@');
                        return { weekday: Number(weekday), timeLocal: timeLocal ?? '' };
                      });
                    await handpostApi.saveAccountSettings({
                      accountId: account.id,
                      platform,
                      dailyCap: Number(form.get('cap')),
                      headless: form.get('headless') === 'on',
                      slots: parsed,
                    });
                    onChanged();
                  }}
                >
                  <label>
                    Daily cap
                    <input
                      name="cap"
                      type="number"
                      min="1"
                      max="50"
                      defaultValue={setting(`dailyCap:${platform}`, '10')}
                    />
                  </label>
                  <label>
                    Queue slots <small>weekday@HH:MM</small>
                    <input name="slots" defaultValue={slotText} placeholder="1@09:00, 3@15:30" />
                  </label>
                  <label className="headless">
                    <input
                      name="headless"
                      type="checkbox"
                      disabled={!safeHeadless.has(platform)}
                      defaultChecked={setting(`headless:${platform}`, 'false') === 'true'}
                    />{' '}
                    Headless mode {safeHeadless.has(platform) ? '(verified safe)' : '(not verified)'}
                  </label>
                  <button className="subtle" type="submit">
                    <Save size={14} />
                    Save platform settings
                  </button>
                </form>
              </article>
            );
          })}
      </div>
      <div className="safety-note">
        <ShieldCheck />
        <div>
          <strong>Account safety</strong>
          <p>
            Persistent, headed real-Chrome profiles are used at human-scale volume. Detection events freeze a
            platform automatically.
          </p>
        </div>
      </div>
    </main>
  );
}
