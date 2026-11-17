import type { InboxListItem } from '../../shared/inbox-types';

export type InboxFilter = 'all' | 'held' | 'scheduled' | 'published' | 'rejected' | 'duplicate';
export const INBOX_FILTERS: Array<[InboxFilter, string]> = [
  ['all', 'All'],
  ['held', 'Held for review'],
  ['scheduled', 'Scheduled'],
  ['published', 'Published'],
  ['rejected', 'Rejected'],
  ['duplicate', 'Duplicates'],
];

export function matchesFilter(item: InboxListItem, filter: InboxFilter): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'held':
      return item.state === 'held' || item.state === 'waiting_media';
    case 'scheduled':
      return item.state === 'scheduled' || item.state === 'publishing' || item.state === 'draft';
    case 'published':
      return item.state === 'published' || item.state === 'partial';
    case 'rejected':
      return item.state === 'rejected' || item.state === 'failed';
    case 'duplicate':
      return item.state === 'duplicate';
  }
}

export function matchesQuery(item: InboxListItem, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [
    item.id,
    item.text ?? '',
    item.source ?? '',
    item.fileName,
    ...item.receipt.targets.map((t) => t.platform),
  ]
    .join(' ')
    .toLowerCase()
    .includes(needle);
}
