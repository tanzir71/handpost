import { useState, type SyntheticEvent } from 'react';
import { ExternalLink } from 'lucide-react';
import type { AttemptListRow, Fields } from '../../shared/rows';
import { handpostApi } from '../lib/api';
import { formatWhen } from '../lib/format';
import { parseSteps } from '../lib/steps';
import { Button, StatusPill, StepLog } from '../ui';

export type EvidenceAttempt = Fields<
  AttemptListRow,
  'id' | 'started_at' | 'outcome' | 'step_log_json',
  'error_class' | 'published_url' | 'screenshot_path'
>;
interface AttemptEvidenceProps {
  attempt: EvidenceAttempt;
  open?: boolean;
}

/** One publish attempt: step log, permalink and proof screenshot (loaded on demand). Used by Queue and History. */
export function AttemptEvidence({ attempt, open }: AttemptEvidenceProps) {
  const [image, setImage] = useState('');
  const [error, setError] = useState('');
  const steps = parseSteps(attempt.step_log_json);
  const loadScreenshot = async (event: SyntheticEvent<HTMLDetailsElement>) => {
    if (!event.currentTarget.open || !attempt.screenshot_path || image) return;
    try {
      setImage(await handpostApi.readArtifact(attempt.screenshot_path));
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value));
    }
  };
  return (
    <details className="attempt-details" open={open} onToggle={(event) => void loadScreenshot(event)}>
      <summary>
        <span>{formatWhen(attempt.started_at, { withDay: true })}</span>
        <StatusPill status={attempt.outcome ?? 'unknown'} />
        {attempt.error_class && <code>{attempt.error_class}</code>}
      </summary>
      <div className="attempt-details__body">
        <StepLog steps={steps} />
        <div className="attempt-details__proof">
          {attempt.published_url && (
            <Button
              size="s"
              icon={ExternalLink}
              onClick={() => void handpostApi.openExternal(attempt.published_url ?? '')}
            >
              Open permalink
            </Button>
          )}
          {image && <img src={image} alt={`Publish attempt ${attempt.id} screenshot`} />}
          {error && <p className="hp-callout hp-callout--danger">{error}</p>}
        </div>
      </div>
    </details>
  );
}
