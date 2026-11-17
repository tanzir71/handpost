import { useCallback, useEffect, useState } from 'react';
import type { HandpostSnapshot } from '../../shared/api';
import { handpostApi } from '../lib/api';
const initial: HandpostSnapshot = {
  accounts: [],
  posts: [],
  targets: [],
  media: [],
  attempts: [],
  slots: [],
  templates: [],
  settings: [],
};
export function useSnapshot() {
  const [data, setData] = useState(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    try {
      setData(await handpostApi.snapshot());
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 30_000);
    return () => clearInterval(timer);
  }, [refresh]);
  return { data, loading, error, refresh };
}
