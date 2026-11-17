import { useState } from 'react';
import { Search } from 'lucide-react';
import { capabilities } from '../../shared/capabilities';
import type { AttemptListRow, Fields } from '../../shared/rows';
import type { PlatformId } from '../../shared/types';
import { formatWhen } from '../lib/format';
import { EmptyState, PlatformBadge, StatusPill } from '../ui';
import { AttemptEvidence, type EvidenceAttempt } from './AttemptEvidence';

export interface LogsProps {
  attempts: Array<EvidenceAttempt & Fields<AttemptListRow, 'platform'>>;
}

const OUTCOMES: Array<[string, string]> = [
  ['all', 'All outcomes'],
  ['published', 'Published'],
  ['failed', 'Failed'],
  ['unverified', 'Unverified'],
  ['needs_login', 'Needs login'],
  ['manual', 'Manual'],
];

/** History — every publish attempt with its proof (Queue row style + filters). */
export function Logs({ attempts }: LogsProps) {
  const [query, setQuery] = useState('');
  const [outcome, setOutcome] = useState('all');
  const rows = attempts.filter(
    (row) =>
      (outcome === 'all' || row.outcome === outcome) &&
      `${row.platform} ${capabilities[row.platform as PlatformId]?.label ?? ''} ${row.outcome} ${row.error_class ?? ''}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <main className="screen">
      <header className="screen-header">
        <div>
          <p className="eyebrow">Evidence</p>
          <h1 className="t-display-m">History</h1>
          <p className="secondary-text">Every publish attempt, step by step, with its proof.</p>
        </div>
        <div className="screen-header__actions">
          <label className="hp-field hp-field--icon">
            <span className="sr-only">Filter history</span>
            <span className="hp-field__control">
              <Search size={16} aria-hidden="true" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Filter history"
              />
            </span>
          </label>
          <label className="hp-field">
            <span className="sr-only">Outcome</span>
            <select value={outcome} onChange={(event) => setOutcome(event.target.value)}>
              {OUTCOMES.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>
      <section className="hp-card agenda__rows" aria-label="Publish attempts">
        {rows.length === 0 ? (
          <EmptyState>
            {attempts.length ? 'No attempts match these filters.' : 'Nothing has been published yet.'}
          </EmptyState>
        ) : (
          rows.map((row) => (
            <article className="queue-row queue-row--history" key={row.id}>
              <div className="queue-row__main">
                <code className="queue-row__time">{formatWhen(row.started_at, { withDay: true })}</code>
                <PlatformBadge platform={row.platform} />
                <p className="queue-row__text">
                  {capabilities[row.platform as PlatformId]?.label ?? row.platform}
                </p>
                {row.error_class ? (
                  <code className="t-mono-s secondary-text">{row.error_class}</code>
                ) : (
                  <span />
                )}
                <StatusPill status={row.outcome ?? 'unknown'} />
              </div>
              <div className="queue-row__evidence">
                <AttemptEvidence attempt={row} />
              </div>
            </article>
          ))
        )}
      </section>
    </main>
  );
}
