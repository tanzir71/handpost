import { useCallback, useEffect, useState } from 'react';
import { Check, ClipboardCopy, Eye, FolderOpen, ScanSearch, Sparkles, TriangleAlert, X } from 'lucide-react';
import type { RehearsalView } from '../../shared/api';
import { capabilities } from '../../shared/capabilities';
import {
  SELECTOR_PATCH_FORMAT,
  selectorLines,
  type SelectorCheckResult,
  type SelectorPatch,
  type SelectorsView,
} from '../../shared/selectors';
import type { PlatformId } from '../../shared/types';
import { handpostApi } from '../lib/api';
import { ago } from '../lib/format';
import { Button, Modal } from '../ui';
import { RehearsalResult } from './AccountLive';

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * Accounts → Selectors (docs/SELECTORS.md): the latest failure report, a fix proposed by Claude or another writer
 * (checked against the snapshot and rehearsed before the owner applies it), and the owner's own selectors.
 */
export function SelectorsModal({
  platform,
  canRehearse,
  onClose,
  onChanged,
}: {
  platform: PlatformId;
  /** Rehearse with the proposed fix needs a connected account. */
  canRehearse: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const label = capabilities[platform].label;
  const [view, setView] = useState<SelectorsView | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [replace, setReplace] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [check, setCheck] = useState<SelectorCheckResult | null>(null);
  const [rehearsal, setRehearsal] = useState<{ result?: RehearsalView; error?: string } | null>(null);

  const load = useCallback(async () => {
    const next = await handpostApi.selectorsView(platform);
    setView(next);
    setDrafts(
      Object.fromEntries(
        Object.entries(next.active?.slots ?? {}).map(([key, list]) => [key, list.join('\n')]),
      ),
    );
    setReplace(new Set(next.active?.replace ?? []));
  }, [platform]);
  useEffect(() => {
    load().catch((value: unknown) => setError(message(value)));
  }, [load]);

  const run = async (name: string, action: () => Promise<void>) => {
    setBusy(name);
    setError('');
    setNotice('');
    try {
      await action();
    } catch (value) {
      setError(message(value));
    } finally {
      setBusy(null);
    }
  };

  const patchFromDrafts = (): SelectorPatch | null => {
    const slots = Object.fromEntries(
      Object.entries(drafts)
        .map(([key, text]) => [key, selectorLines(text)] as const)
        .filter(([, list]) => list.length > 0),
    );
    if (!Object.keys(slots).length) return null;
    const replaced = [...replace].filter((key) => key in slots);
    return {
      format: SELECTOR_PATCH_FORMAT,
      platform,
      ...(view?.active?.note ? { note: view.active.note } : {}),
      slots,
      ...(replaced.length ? { replace: replaced } : {}),
    };
  };

  const report = view?.report ?? null;
  const proposal = view?.proposal ?? null;
  const checkFor = (slot: string, selector: string) =>
    check?.rows.find((row) => row.slot === slot && row.selector === selector);

  return (
    <Modal
      title={`${label}: selectors`}
      onClose={onClose}
      footer={
        <>
          {view?.active && (
            <Button
              kind="ghost"
              disabled={busy !== null}
              onClick={() =>
                void run('reset', async () => {
                  await handpostApi.selectorsSave({ platform, patch: null });
                  await load();
                  onChanged();
                  setNotice('Your selectors were removed; the built-in ones apply again.');
                })
              }
            >
              Remove my selectors
            </Button>
          )}
          <Button
            kind="primary"
            disabled={busy !== null || !view}
            onClick={() =>
              void run('save', async () => {
                await handpostApi.selectorsSave({ platform, patch: patchFromDrafts() });
                await load();
                onChanged();
                setNotice('Saved. Rehearse to check the composer still fills.');
              })
            }
          >
            {busy === 'save' ? 'Saving…' : 'Save my selectors'}
          </Button>
        </>
      }
    >
      <p className="t-body-s secondary-text">
        When {label} changes its page, a selector stops matching and that step fails. Fix it here yourself, or
        let Claude propose a fix from the saved snapshot — a proposal only takes effect when you apply it.
      </p>
      {error && (
        <p role="alert" className="hp-callout hp-callout--danger">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="hp-callout hp-callout--ok">
          {notice}
        </p>
      )}

      <section className="selectors-section" aria-labelledby="selectors-report">
        <h3 id="selectors-report" className="t-label-s selectors-section__title">
          Last problem
        </h3>
        {report ? (
          <div
            className={`hp-callout selectors-callout ${report.kind === 'failed' ? 'hp-callout--warn' : 'hp-callout--ink'}`}
          >
            <TriangleAlert size={16} aria-hidden="true" />
            <div>
              <p>
                {report.kind === 'failed'
                  ? `“${report.step}” could not find its element`
                  : `“${report.step}” did not find what it expected — possibly drift`}{' '}
                <span className="secondary-text">· {ago(report.at)}</span>
              </p>
              <p className="t-mono-s secondary-text">{report.error || 'No error message'}</p>
              {report.slots.length > 0 && (
                <p className="t-body-s secondary-text">Slots involved: {report.slots.join(', ')}</p>
              )}
            </div>
          </div>
        ) : (
          <p className="t-body-s secondary-text">
            Nothing has failed yet. When a step cannot find its element, Handpost saves a snapshot of the page
            (long text removed) for you or Claude to work from.
          </p>
        )}
        <div className="button-row">
          <Button
            size="s"
            icon={ClipboardCopy}
            disabled={busy !== null || !view}
            onClick={() =>
              void run('prompt', async () => {
                await handpostApi.selectorsCopyPrompt(platform);
                setNotice(
                  `Copied. Paste it into Claude with your Handpost folder attached; it writes the fix to ${view?.proposalPath ?? 'selectors/proposed/'}.`,
                );
              })
            }
          >
            Copy prompt for Claude
          </Button>
          {report && (
            <Button
              size="s"
              kind="ghost"
              icon={FolderOpen}
              disabled={busy !== null}
              onClick={() => void run('open', () => handpostApi.selectorsOpenReport(platform))}
            >
              Open report folder
            </Button>
          )}
        </div>
      </section>

      {proposal && (
        <section className="selectors-section" aria-labelledby="selectors-proposal">
          <h3 id="selectors-proposal" className="t-label-s selectors-section__title">
            <Sparkles size={14} aria-hidden="true" /> Proposed fix{' '}
            <span className="secondary-text t-body-s">· {ago(proposal.modifiedAt)}</span>
          </h3>
          <p className="t-mono-s secondary-text">{proposal.file}</p>
          {proposal.patch?.note && <blockquote className="selectors-note">{proposal.patch.note}</blockquote>}
          {proposal.errors.length > 0 ? (
            <ul role="alert" className="hp-callout hp-callout--danger selectors-errors">
              {proposal.errors.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : (
            <table className="hp-table selectors-table">
              <thead>
                <tr>
                  <th scope="col">Slot</th>
                  <th scope="col">Selector</th>
                  <th scope="col">In snapshot</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(proposal.patch?.slots ?? {}).flatMap(([slot, list]) =>
                  list.map((selector) => {
                    const row = checkFor(slot, selector);
                    return (
                      <tr key={`${slot}\u0000${selector}`}>
                        <td className="t-mono-s">
                          {slot}
                          {proposal.patch?.replace?.includes(slot) ? ' (replaces built-in)' : ''}
                        </td>
                        <td className="t-mono-s selectors-table__selector">{selector}</td>
                        <td className="t-body-s">
                          {!row
                            ? '—'
                            : row.matches === null
                              ? `Invalid: ${row.error ?? ''}`
                              : row.matches === 0
                                ? row.relevant
                                  ? 'No match'
                                  : 'No match (not on this page)'
                                : `${row.matches} match${row.matches === 1 ? '' : 'es'}`}
                        </td>
                      </tr>
                    );
                  }),
                )}
              </tbody>
            </table>
          )}
          <div className="button-row">
            <Button
              size="s"
              icon={ScanSearch}
              disabled={busy !== null || !proposal.patch || !report?.hasHtml}
              title={report?.hasHtml ? undefined : 'There is no page snapshot to check against yet'}
              onClick={() =>
                void run('check', async () => {
                  setCheck(await handpostApi.selectorsCheck(platform));
                })
              }
            >
              {busy === 'check' ? 'Checking…' : 'Check against snapshot'}
            </Button>
            {canRehearse && (
              <Button
                size="s"
                icon={Eye}
                disabled={busy !== null || !proposal.patch}
                onClick={() =>
                  void run('rehearse', async () => {
                    setRehearsal(null);
                    try {
                      const result = await handpostApi.rehearse({ platform, withProposal: true });
                      if (result) setRehearsal({ result });
                    } catch (value) {
                      setRehearsal({ error: message(value) });
                    }
                  })
                }
              >
                {busy === 'rehearse' ? 'Rehearsing…' : 'Rehearse with this fix'}
              </Button>
            )}
            <Button
              size="s"
              kind="primary"
              icon={Check}
              disabled={busy !== null || !proposal.patch}
              onClick={() =>
                void run('apply', async () => {
                  await handpostApi.selectorsProposal({ platform, action: 'apply' });
                  setCheck(null);
                  setRehearsal(null);
                  await load();
                  onChanged();
                  setNotice('Applied. The next publish and Rehearse use the new selectors.');
                })
              }
            >
              Apply
            </Button>
            <Button
              size="s"
              kind="ghost"
              icon={X}
              disabled={busy !== null}
              onClick={() =>
                void run('discard', async () => {
                  await handpostApi.selectorsProposal({ platform, action: 'discard' });
                  setCheck(null);
                  setRehearsal(null);
                  await load();
                  onChanged();
                  setNotice('Discarded. The file was moved to selectors/archive/.');
                })
              }
            >
              Discard
            </Button>
          </div>
          {rehearsal && <RehearsalResult platform={platform} {...rehearsal} />}
        </section>
      )}

      <section className="selectors-section" aria-labelledby="selectors-mine">
        <h3 id="selectors-mine" className="t-label-s selectors-section__title">
          Your selectors
        </h3>
        <p className="t-body-s secondary-text">
          One selector per line (CSS, or Playwright’s <code>text=</code> and <code>:has-text()</code>). They
          are tried together with the built-in ones unless you choose “use only mine”.
        </p>
        {view?.slots.map((slot) => {
          const id = `selector-${slot.key.replace(/[^A-Za-z0-9]+/g, '-')}`;
          const flagged = report?.slots.includes(slot.key);
          return (
            <div key={slot.key} className={`selector-slot${flagged ? ' selector-slot--flagged' : ''}`}>
              <label className="hp-field" htmlFor={id}>
                <span>
                  {slot.label} <span className="t-mono-s secondary-text">{slot.key}</span>
                </span>
                <textarea
                  id={id}
                  rows={2}
                  className="t-mono-s"
                  spellCheck={false}
                  value={drafts[slot.key] ?? ''}
                  placeholder="Add a selector…"
                  aria-describedby={`${id}-hint`}
                  onChange={(event) =>
                    setDrafts((current) => ({ ...current, [slot.key]: event.target.value }))
                  }
                />
              </label>
              <small id={`${id}-hint`} className="muted">
                {slot.hint}
              </small>
              <div className="selector-slot__meta">
                <details>
                  <summary className="t-body-s">Built-in ({slot.builtIn.length})</summary>
                  <ul className="t-mono-s secondary-text">
                    {slot.builtIn.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </details>
                <label className="selector-slot__replace t-body-s">
                  <input
                    type="checkbox"
                    checked={replace.has(slot.key)}
                    onChange={(event) =>
                      setReplace((current) => {
                        const next = new Set(current);
                        if (event.target.checked) next.add(slot.key);
                        else next.delete(slot.key);
                        return next;
                      })
                    }
                  />
                  Use only mine
                </label>
              </div>
            </div>
          );
        })}
      </section>
    </Modal>
  );
}
