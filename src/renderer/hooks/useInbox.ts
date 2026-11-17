import { useCallback, useEffect, useState } from 'react';
import type { InboxHealth, InboxListItem } from '../../shared/inbox-types';
import { handpostApi } from '../lib/api';

/** Inbox rows and watcher health, polled every 5 s (cheap: local SQLite + one directory listing). */
export function useInbox() {
  const [items, setItems] = useState<InboxListItem[]>([]);
  const [health, setHealth] = useState<InboxHealth | null>(null);
  const refresh = useCallback(async () => {
    try {
      const [list, status] = await Promise.all([handpostApi.inboxList(), handpostApi.inboxHealth()]);
      setItems(list);
      setHealth(status);
    } catch {
      // The sidebar shows the watcher state; a failed poll simply keeps the last values.
    }
  }, []);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 5000);
    return () => clearInterval(timer);
  }, [refresh]);
  return { items, health, refresh };
}
