import { useCallback, useEffect, useState } from 'react';

export type Screen =
  'inbox' | 'compose' | 'calendar' | 'queue' | 'accounts' | 'history' | 'settings' | '__gallery';
export const SCREENS: Screen[] = ['inbox', 'compose', 'calendar', 'queue', 'accounts', 'history', 'settings'];

export interface Route {
  screen: Screen;
  /** e.g. `#/compose/12` opens post 12, `#/settings/automation` a tab. */
  param: string | null;
}

export function parseRoute(hash: string): Route {
  const [, screen = 'inbox', param = null] = hash.replace(/^#/, '').split('/');
  const known = [...SCREENS, '__gallery'].includes(screen as Screen) ? (screen as Screen) : 'inbox';
  return { screen: known, param: param || null };
}

/** Hash routing keeps the renderer a static file (works from file:// in the packaged app). */
export function useRoute() {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  const navigate = useCallback((screen: Screen, param?: string | number) => {
    window.location.hash = `#/${screen}${param !== undefined ? `/${param}` : ''}`;
  }, []);
  return { route, navigate };
}
