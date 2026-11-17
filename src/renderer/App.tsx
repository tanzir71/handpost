import { lazy, Suspense } from 'react';
import { Sidebar } from './components/Sidebar';
import { Composer } from './components/Composer';
import { Calendar } from './components/Calendar';
import { Queue } from './components/Queue';
import { Accounts } from './components/Accounts';
import { Settings, type SettingsTab } from './components/Settings';
import { Logs } from './components/Logs';
import { Inbox } from './components/Inbox';
import { useSnapshot } from './hooks/useSnapshot';
import { useInbox } from './hooks/useInbox';
import { useRoute } from './hooks/useRoute';
import { useTheme, type ThemeChoice } from './hooks/useTheme';

const Gallery = import.meta.env.DEV ? lazy(() => import('./components/Gallery')) : null;
const ATTENTION = ['failed', 'unverified', 'needs_attention', 'needs_login', 'manual'];

export function App() {
  const { data, loading, error, refresh } = useSnapshot();
  const inbox = useInbox();
  const { route, navigate } = useRoute();
  const theme = (data.settings.find((row) => row.key === 'theme')?.value ?? 'system') as ThemeChoice;
  useTheme(
    loading ? ((document.documentElement.dataset.theme as ThemeChoice | undefined) ?? 'system') : theme,
  );
  const refreshAll = () => {
    void refresh();
    void inbox.refresh();
  };
  if (route.screen === '__gallery' && Gallery)
    return (
      <Suspense fallback={null}>
        <Gallery />
      </Suspense>
    );
  const inboxCount = (inbox.health?.held ?? 0) + (inbox.health?.rejectedToday ?? 0);
  const queueAttention = data.targets.filter((target) => ATTENTION.includes(target.status)).length;
  const edit = (postId: number) => navigate('compose', postId);
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <Sidebar
        screen={route.screen}
        onNavigate={(screen) => navigate(screen)}
        health={inbox.health}
        inboxCount={inboxCount}
        queueAttention={queueAttention}
      />
      <div className="content" id="main-content" tabIndex={-1}>
        {error && (
          <p role="alert" className="hp-callout hp-callout--danger">
            {error}
          </p>
        )}
        {loading ? (
          <p className="loading">Loading Handpost…</p>
        ) : route.screen === 'inbox' ? (
          <Inbox
            items={inbox.items}
            settings={data.settings}
            onChanged={refreshAll}
            onEdit={edit}
            onOpenAutomation={() => navigate('settings', 'automation')}
          />
        ) : route.screen === 'compose' ? (
          <Composer
            accounts={data.accounts}
            templates={data.templates}
            posts={data.posts}
            targets={data.targets}
            storedMedia={data.media}
            onSaved={refreshAll}
            initialPostId={route.param ? Number(route.param) : null}
          />
        ) : route.screen === 'calendar' ? (
          <Calendar targets={data.targets} onChanged={refreshAll} />
        ) : route.screen === 'queue' ? (
          <Queue
            targets={data.targets}
            attempts={data.attempts}
            inbox={inbox.items}
            onChanged={refreshAll}
            onEdit={edit}
          />
        ) : route.screen === 'accounts' ? (
          <Accounts
            accounts={data.accounts}
            slots={data.slots}
            settings={data.settings}
            onChanged={refreshAll}
          />
        ) : route.screen === 'history' ? (
          <Logs attempts={data.attempts} />
        ) : (
          <Settings
            settings={data.settings}
            onChanged={refreshAll}
            tab={route.param}
            onTab={(tab: SettingsTab) => navigate('settings', tab)}
          />
        )}
      </div>
    </div>
  );
}
