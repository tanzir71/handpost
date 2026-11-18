import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type DragEvent } from 'react';
import { Clock3, FileText, Film, ImageIcon, ImagePlus, Plus, Send, X } from 'lucide-react';
import {
  capabilities,
  countText,
  FIRST_COMMENT_PLATFORMS,
  postWarnings,
  validatePost,
} from '../../shared/capabilities';
import { renderTemplate, templateVariables } from '../../shared/templates';
import type { MediaInput, PlatformId } from '../../shared/types';
import { handpostApi } from '../lib/api';
import { JITTER_NOTE, timeZone, toLocalInput } from '../lib/format';
import { Button, EmptyState, MenuButton, PlatformBadge, Segmented, Tabs } from '../ui';

type ScheduleMode = 'slot' | 'exact' | 'now';
import type {
  AccountRow,
  Fields,
  MediaRow as StoredMediaRow,
  PostRow,
  TargetListRow,
  TemplateRow,
} from '../../shared/rows';

export interface ComposerProps {
  accounts: Array<Fields<AccountRow, 'id' | 'platform', 'display_name' | 'handle'>>;
  templates: TemplateRow[];
  posts?: Array<Fields<PostRow, 'id' | 'status' | 'base_text'>>;
  targets?: Array<
    Fields<
      TargetListRow,
      'post_id' | 'status' | 'platform',
      'override_text' | 'first_comment' | 'options_json'
    >
  >;
  storedMedia?: Array<
    Fields<
      StoredMediaRow,
      'id' | 'post_id' | 'path' | 'kind',
      'width' | 'height' | 'duration_s' | 'size_bytes' | 'alt_text'
    >
  >;
  onSaved: () => void;
  /** Open this draft post right away (Inbox → Edit, Queue → Edit). */
  initialPostId?: number | null;
}
interface MediaRow {
  id: number;
  path: MediaInput['path'];
  kind: MediaInput['kind'];
  width?: number | null | undefined;
  height?: number | null | undefined;
  duration_s?: number | null | undefined;
  size_bytes?: number | null | undefined;
  alt_text?: string | null | undefined;
}
function decodeThreadParts(value: unknown): string[] {
  if (typeof value !== 'string' || !value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((part) => typeof part === 'string') : [];
  } catch {
    return [];
  }
}

function firstLine(text: string): string {
  return (
    text
      .split('\n')
      .find((line) => line.trim())
      ?.trim()
      .slice(0, 60) ?? ''
  );
}
/** “1200 × 675 · 284 KB”, “0:30 · 4.2 MB”: what the media row knows about a file. */
function mediaFacts(row: MediaRow): string {
  const parts: string[] = [];
  if (row.width && row.height) parts.push(`${row.width} × ${row.height}`);
  if (row.duration_s)
    parts.push(
      `${Math.floor(row.duration_s / 60)}:${String(Math.round(row.duration_s % 60)).padStart(2, '0')}`,
    );
  if (row.size_bytes)
    parts.push(
      row.size_bytes >= 1_048_576
        ? `${(row.size_bytes / 1_048_576).toFixed(1)} MB`
        : `${Math.max(1, Math.round(row.size_bytes / 1024))} KB`,
    );
  return parts.join(' · ');
}

export function Composer({
  accounts,
  templates,
  posts = [],
  targets = [],
  storedMedia = [],
  onSaved,
  initialPostId = null,
}: ComposerProps) {
  const [postId, setPostId] = useState<number>();
  const [text, setText] = useState('');
  const [selected, setSelected] = useState<PlatformId[]>(['x']);
  const [scheduledAt, setScheduledAt] = useState(() => toLocalInput(new Date(Date.now() + 3_600_000)));
  const [message, setMessage] = useState('');
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>('exact');
  const [busy, setBusy] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [platformOptions, setPlatformOptions] = useState<
    Partial<Record<PlatformId, Record<string, string | boolean>>>
  >({});
  const [media, setMedia] = useState<MediaRow[]>([]);
  const [activeTab, setActiveTab] = useState<PlatformId | 'base'>('base');
  const [templateBody, setTemplateBody] = useState('');
  const [templateKeys, setTemplateKeys] = useState<string[]>([]);
  const [templateValues, setTemplateValues] = useState<Record<string, string>>({});
  const normalizedMedia = useMemo(
    () =>
      media.map((row) => ({
        path: row.path,
        kind: row.kind,
        ...(row.alt_text ? { altText: row.alt_text } : {}),
        ...(row.size_bytes ? { sizeBytes: row.size_bytes } : {}),
        ...(row.width ? { width: row.width } : {}),
        ...(row.height ? { height: row.height } : {}),
        ...(row.duration_s ? { durationS: row.duration_s } : {}),
      })),
    [media],
  );
  const errors = useMemo(
    () =>
      Object.fromEntries(
        selected.map((platform) => [
          platform,
          validatePost(platform, {
            text: overrides[platform] ?? text,
            thread: decodeThreadParts(platformOptions[platform]?.threadParts),
            media: normalizedMedia,
          }),
        ]),
      ) as Partial<Record<PlatformId, string[]>>,
    [selected, text, overrides, normalizedMedia, platformOptions],
  );
  const warnings = useMemo(
    () =>
      Object.fromEntries(
        selected.map((platform) => [
          platform,
          postWarnings(platform, { text: overrides[platform] ?? text, media: normalizedMedia }),
        ]),
      ) as Partial<Record<PlatformId, string[]>>,
    [selected, text, overrides, normalizedMedia],
  );
  const missingAccounts = selected.filter(
    (platform) => !accounts.some((account) => account.platform === platform),
  );
  const optionErrors = selected.flatMap((platform) => {
    const options = platformOptions[platform] ?? {};
    if (platform === 'facebook' && !options.pageName) return ['Facebook Page: Page identity is required'];
    if (platform === 'youtube') {
      const required: Array<[string, string]> = [
        ['title', 'Short title'],
        ['madeForKids', 'Audience'],
        ['visibility', 'Visibility'],
      ];
      return required
        .filter(([key]) => !(key in options) || options[key] === '')
        .map(([, label]) => `YouTube Shorts: ${label} is required`);
    }
    if (platform === 'pinterest') {
      const required: Array<[string, string]> = [
        ['title', 'Pin title'],
        ['destinationUrl', 'Destination URL'],
        ['board', 'Board'],
      ];
      return required.filter(([key]) => !options[key]).map(([, label]) => `Pinterest: ${label} is required`);
    }
    return [];
  });
  const hasErrors =
    selected.length === 0 ||
    missingAccounts.length > 0 ||
    Object.values(errors).some((value) => value.length) ||
    optionErrors.length > 0;
  const perform = async (action: () => Promise<void>) => {
    setBusy(true);
    setMessage('');
    try {
      await action();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };
  const ensureDraft = async () => {
    if (postId) return postId;
    const id = await handpostApi.savePost({ text, status: 'draft', targets: [] });
    setPostId(id);
    return id;
  };
  const addFiles = async (files: File[]) => {
    if (!files.length) return;
    const id = await ensureDraft();
    const payload = await Promise.all(
      files.map(async (file) => ({
        name: file.name || `pasted-${Date.now()}.${file.type.split('/')[1] ?? 'bin'}`,
        mime: file.type,
        bytes: new Uint8Array(await file.arrayBuffer()),
      })),
    );
    const added = await handpostApi.addMedia({ postId: id, files: payload });
    setMedia((current) => [...current, ...added]);
    setMessage(`${added.length} media file${added.length === 1 ? '' : 's'} attached`);
  };
  const attach = async () => {
    const id = await ensureDraft();
    const added = await handpostApi.attachMedia(id);
    setMedia((current) => [...current, ...added]);
    if (added.length) setMessage(`${added.length} media file${added.length === 1 ? '' : 's'} attached`);
  };
  const drop = (event: DragEvent) => {
    event.preventDefault();
    void perform(() => addFiles([...event.dataTransfer.files]));
  };
  const paste = (event: ClipboardEvent) => {
    const files = [...event.clipboardData.files];
    if (files.length) void perform(() => addFiles(files));
  };
  const toggle = (platform: PlatformId) =>
    setSelected((current) =>
      current.includes(platform) ? current.filter((value) => value !== platform) : [...current, platform],
    );
  const resetAfterSchedule = () => {
    setText('');
    setPostId(undefined);
    setMedia([]);
    setOverrides({});
    setComments({});
    setPlatformOptions({});
    setTemplateBody('');
    setTemplateKeys([]);
    setTemplateValues({});
  };
  const setOption = (platform: PlatformId, key: string, value: string | boolean | undefined) =>
    setPlatformOptions((current) => {
      const next = { ...(current[platform] ?? {}) };
      if (value === undefined || value === '') delete next[key];
      else next[key] = value;
      return { ...current, [platform]: next };
    });
  const targetFor = (platform: PlatformId, at?: string) => {
    const account = accounts.find((account) => account.platform === platform);
    const options = platformOptions[platform] ?? {};
    return account
      ? {
          accountId: account.id,
          ...(at ? { scheduledAt: at } : {}),
          ...(overrides[platform] ? { overrideText: overrides[platform] } : {}),
          ...(comments[platform] ? { firstComment: comments[platform] } : {}),
          ...(Object.keys(options).length ? { options } : {}),
        }
      : null;
  };
  const save = async (status: 'draft' | 'scheduled', atOverride?: string) => {
    if (status === 'scheduled' && hasErrors) return;
    const at = status === 'scheduled' ? new Date(atOverride ?? scheduledAt).toISOString() : undefined;
    const targetRows = selected.map((platform) => targetFor(platform, at)).filter(Boolean) as Array<{
      accountId: number;
      scheduledAt?: string;
      overrideText?: string;
      firstComment?: string;
      options?: Record<string, string | boolean>;
    }>;
    const id = await handpostApi.savePost({
      ...(postId ? { id: postId } : {}),
      text,
      status,
      targets: targetRows,
    });
    setPostId(id);
    setMessage(status === 'draft' ? 'Draft saved' : 'Post scheduled');
    if (status === 'scheduled') resetAfterSchedule();
    onSaved();
  };
  const addToQueue = async () => {
    if (hasErrors) return;
    const targets = selected.map((platform) => targetFor(platform)).filter(Boolean) as Array<{
      accountId: number;
      overrideText?: string;
      firstComment?: string;
      options?: Record<string, string | boolean>;
    }>;
    await handpostApi.queuePost({ ...(postId ? { id: postId } : {}), text, targets });
    setMessage('Added to next free queue slots');
    resetAfterSchedule();
    onSaved();
  };
  const chooseTemplate = (id: string) => {
    const template = templates.find((item) => String(item.id) === id);
    if (!template) {
      setTemplateBody('');
      setTemplateKeys([]);
      setTemplateValues({});
      return;
    }
    const body = String(template.body);
    let keys = templateVariables(body);
    try {
      const stored = JSON.parse(String(template.variables_json));
      if (Array.isArray(stored)) keys = stored.filter((value) => typeof value === 'string');
    } catch {
      keys = templateVariables(body);
    }
    setTemplateBody(body);
    setTemplateKeys(keys);
    setTemplateValues({});
    setText(renderTemplate(body, {}));
  };
  const chooseDraft = (id: string, editAny = false) => {
    const draft = posts.find((item) => String(item.id) === id && (editAny || item.status === 'draft'));
    if (!draft) {
      setPostId(undefined);
      return;
    }
    const draftTargets = targets.filter(
      (item) =>
        item.post_id === draft.id && (item.status === 'draft' || (editAny && item.status === 'scheduled')),
    );
    setPostId(Number(draft.id));
    setText(String(draft.base_text));
    setMedia(storedMedia.filter((item) => item.post_id === draft.id));
    setSelected(draftTargets.map((item) => item.platform));
    setOverrides(
      Object.fromEntries(
        draftTargets
          .filter((item) => item.override_text)
          .map((item) => [item.platform, item.override_text ?? '']),
      ),
    );
    setComments(
      Object.fromEntries(
        draftTargets
          .filter((item) => item.first_comment)
          .map((item) => [item.platform, item.first_comment ?? '']),
      ),
    );
    setPlatformOptions(
      Object.fromEntries(
        draftTargets.map((item) => {
          try {
            return [item.platform, JSON.parse(item.options_json ?? '{}')];
          } catch {
            return [item.platform, {}];
          }
        }),
      ),
    );
    setMessage(
      draft.status === 'draft'
        ? 'Draft loaded'
        : 'Post loaded for editing (saving replaces its unsent platforms)',
    );
  };
  const loadedInitial = useRef<number | null>(null);
  useEffect(() => {
    if (!initialPostId || loadedInitial.current === initialPostId) return;
    if (!posts.some((post) => post.id === initialPostId)) return;
    loadedInitial.current = initialPostId;
    chooseDraft(String(initialPostId), true);
    // chooseDraft reads the latest props; re-running only when the requested post or data changes is intended.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPostId, posts, targets]);
  const setTemplateValue = (key: string, value: string) => {
    const values = { ...templateValues, [key]: value };
    setTemplateValues(values);
    setText(renderTemplate(templateBody, values));
  };
  const activeText = activeTab === 'base' ? text : (overrides[activeTab] ?? text);
  const activeOptions = activeTab === 'base' ? {} : (platformOptions[activeTab] ?? {});
  const platformOptionEditor =
    activeTab === 'x' ? (
      <fieldset className="platform-options">
        <legend>X thread</legend>
        <label>
          Continuation posts <small>Separate posts with a line containing ---</small>
          <textarea
            value={decodeThreadParts(activeOptions.threadParts).join('\n---\n')}
            onChange={(event) =>
              setOption(
                activeTab,
                'threadParts',
                JSON.stringify(
                  event.target.value
                    .split(/\n---\n/)
                    .map((part) => part.trim())
                    .filter(Boolean),
                ),
              )
            }
            placeholder={'Second post\n---\nThird post'}
          />
        </label>
      </fieldset>
    ) : activeTab === 'facebook' ? (
      <fieldset className="platform-options">
        <legend>Facebook Page options</legend>
        <label>
          Page identity
          <input
            value={String(activeOptions.pageName ?? '')}
            onChange={(event) => setOption(activeTab, 'pageName', event.target.value)}
            placeholder="Page display name"
          />
        </label>
      </fieldset>
    ) : activeTab === 'youtube' ? (
      <fieldset className="platform-options">
        <legend>YouTube Shorts options</legend>
        <label>
          Short title
          <input
            value={String(activeOptions.title ?? '')}
            onChange={(event) => setOption(activeTab, 'title', event.target.value)}
          />
        </label>
        <label>
          Audience
          <select
            value={activeOptions.madeForKids === undefined ? '' : String(activeOptions.madeForKids)}
            onChange={(event) =>
              setOption(
                activeTab,
                'madeForKids',
                event.target.value === '' ? undefined : event.target.value === 'true',
              )
            }
          >
            <option value="">Choose…</option>
            <option value="false">Not made for kids</option>
            <option value="true">Made for kids</option>
          </select>
        </label>
        <label>
          Visibility
          <select
            value={String(activeOptions.visibility ?? '')}
            onChange={(event) => setOption(activeTab, 'visibility', event.target.value)}
          >
            <option value="">Choose…</option>
            <option value="public">Public</option>
            <option value="unlisted">Unlisted</option>
            <option value="private">Private</option>
          </select>
        </label>
      </fieldset>
    ) : activeTab === 'pinterest' ? (
      <fieldset className="platform-options">
        <legend>Pinterest options</legend>
        <label>
          Pin title
          <input
            value={String(activeOptions.title ?? '')}
            onChange={(event) => setOption(activeTab, 'title', event.target.value)}
          />
        </label>
        <label>
          Destination URL
          <input
            type="url"
            value={String(activeOptions.destinationUrl ?? '')}
            onChange={(event) => setOption(activeTab, 'destinationUrl', event.target.value)}
          />
        </label>
        <label>
          Board
          <input
            value={String(activeOptions.board ?? '')}
            onChange={(event) => setOption(activeTab, 'board', event.target.value)}
          />
        </label>
      </fieldset>
    ) : activeTab === 'tiktok' ? (
      <fieldset className="platform-options">
        <legend>TikTok options</legend>
        <label>
          Cover timestamp (seconds)
          <input
            type="number"
            min="0"
            value={String(activeOptions.coverTime ?? '')}
            onChange={(event) => setOption(activeTab, 'coverTime', event.target.value)}
          />
        </label>
      </fieldset>
    ) : null;
  const scheduleLabel =
    scheduleMode === 'now' ? 'Post now' : scheduleMode === 'slot' ? 'Add to queue' : 'Schedule';
  const runSchedule = () =>
    perform(() =>
      scheduleMode === 'slot'
        ? addToQueue()
        : scheduleMode === 'now'
          ? save('scheduled', new Date().toISOString())
          : save('scheduled'),
    );
  const isSuccess = (value: string) =>
    ['saved', 'scheduled', 'attached', 'Added', 'loaded'].some((word) => value.includes(word));
  const fileName = (path: string) => path.split(/[\\/]/).pop() ?? path;
  const drafts = posts.filter((post) => post.status === 'draft');
  const mediaMax = selected.length
    ? Math.min(...selected.map((platform) => capabilities[platform].maxMedia))
    : 4;
  const commentPlatforms = (activeTab === 'base' ? selected : [activeTab]).filter((platform) =>
    FIRST_COMMENT_PLATFORMS.includes(platform),
  );
  const previewWhen =
    scheduleMode === 'now'
      ? 'now'
      : scheduleMode === 'slot'
        ? 'next slot'
        : new Date(scheduledAt).toLocaleDateString(undefined, { weekday: 'short' });
  const clear = () => {
    resetAfterSchedule();
    setMessage('');
    setActiveTab('base');
  };
  return (
    <main className="screen" onDrop={drop} onDragOver={(event) => event.preventDefault()} onPaste={paste}>
      <header className="screen-header">
        <div>
          <p className="eyebrow">Compose</p>
          <h1 className="t-display-m">New post</h1>
          <p className="secondary-text">
            Write once, adjust per platform. Drafts, media and previews stay on this computer.
          </p>
        </div>
        <div className="screen-header__actions">
          {drafts.length > 0 && (
            <MenuButton
              kind="ghost"
              label="Open draft"
              items={drafts.map((post) => ({
                id: String(post.id),
                label: firstLine(post.base_text) || `Draft ${post.id}`,
              }))}
              onSelect={(id) => chooseDraft(id)}
            />
          )}
          <MenuButton
            label="Use template"
            icon={FileText}
            items={templates.map((template) => ({ id: String(template.id), label: template.name }))}
            onSelect={chooseTemplate}
            empty="No templates yet. Save one in Settings → Templates."
          />
          <Button kind="ghost" icon={X} onClick={clear}>
            Clear
          </Button>
        </div>
      </header>
      <div className="split split--compose">
        <section className="hp-card split__main compose" aria-busy={busy} aria-label="Editor">
          <div className="hp-card__body">
            <div className="platform-chips" role="group" aria-label="Target platforms">
              {accounts
                .filter((account) => account.platform !== 'mock')
                .map((account) => {
                  const platform = account.platform as PlatformId;
                  const on = selected.includes(platform);
                  const cap = capabilities[platform]!;
                  const used = countText(platform, overrides[platform] ?? text);
                  return (
                    <button
                      key={platform}
                      type="button"
                      className="platform-chip"
                      aria-pressed={on}
                      aria-label={cap.label}
                      onClick={() => toggle(platform)}
                    >
                      <PlatformBadge platform={platform} />
                      <span aria-hidden="true">{cap.label}</span>
                      {on && (
                        <code aria-hidden="true" className={used > cap.maxChars ? 'over' : undefined}>
                          {used}/{cap.maxChars}
                        </code>
                      )}
                    </button>
                  );
                })}
            </div>
            <Tabs<PlatformId | 'base'>
              label="Text per platform"
              active={activeTab}
              onChange={setActiveTab}
              tabs={[
                { id: 'base', label: 'Base text' },
                ...selected.map((platform) => ({
                  id: platform,
                  label: `${capabilities[platform].label} override`,
                })),
              ]}
            />
            <label className="sr-only" htmlFor="post-text">
              Post text
            </label>
            <textarea
              id="post-text"
              className="compose__text t-body-l"
              value={activeText}
              onChange={(event) =>
                activeTab === 'base'
                  ? setText(event.target.value)
                  : setOverrides((value) => ({ ...value, [activeTab]: event.target.value }))
              }
              placeholder={
                activeTab === 'base'
                  ? 'What do you want to share?'
                  : `Text just for ${capabilities[activeTab].label}`
              }
            />
            <div className="validation-pills" aria-live="polite">
              {(activeTab === 'base' ? selected : [activeTab]).map((platform) => {
                const used = countText(platform, overrides[platform] ?? text);
                const max = capabilities[platform].maxChars;
                return (
                  <span
                    key={`count-${platform}`}
                    className={`hp-pill hp-pill--${used > max ? 'danger' : 'ok'}`}
                  >
                    {capabilities[platform].label} · {used} / {max}
                  </span>
                );
              })}
              {selected.flatMap((platform) =>
                (errors[platform] ?? []).map((error) => (
                  <span className="hp-pill hp-pill--danger" key={`${platform}-${error}`}>
                    {capabilities[platform].label}: {error}
                  </span>
                )),
              )}
              {optionErrors.map((error) => (
                <span className="hp-pill hp-pill--danger" key={error}>
                  {error}
                </span>
              ))}
              {selected.flatMap((platform) =>
                (warnings[platform] ?? []).map((warning) => (
                  <span className="hp-pill hp-pill--warn" key={`${platform}-${warning}`}>
                    {capabilities[platform].label}: {warning}
                  </span>
                )),
              )}
              {selected.length === 0 && (
                <span className="hp-pill hp-pill--danger">Select at least one platform.</span>
              )}
              {missingAccounts.length > 0 && (
                <span className="hp-pill hp-pill--danger">
                  No account slot for {missingAccounts.join(', ')}
                </span>
              )}
            </div>
            <div className="compose__section" role="group" aria-labelledby="compose-media-label">
              <p id="compose-media-label" className="compose__label">
                Media · {media.length} of {mediaMax}
              </p>
              {media.length === 0 ? (
                <button
                  type="button"
                  className="media-drop"
                  disabled={busy}
                  onClick={() => void perform(attach)}
                >
                  <ImagePlus size={18} aria-hidden="true" />
                  <span>Add media</span>
                  <small>or drop and paste files anywhere on this screen</small>
                </button>
              ) : (
                <div className="media-strip">
                  <div className="media-list">
                    {media.map((row) => (
                      <div className="media-tile" key={row.id}>
                        <span className="media-tile__thumb" aria-hidden="true">
                          {row.kind === 'video' ? <Film size={20} /> : <ImageIcon size={20} />}
                        </span>
                        <span className="media-tile__info">
                          <code className="media-tile__name">
                            {fileName(row.path)} <span>{mediaFacts(row)}</span>
                          </code>
                          <input
                            className="hp-input"
                            aria-label={`Alt text for ${fileName(row.path)}`}
                            value={
                              activeTab === 'base'
                                ? (row.alt_text ?? '')
                                : String(activeOptions[`alt:${row.id}`] ?? row.alt_text ?? '')
                            }
                            placeholder={
                              activeTab === 'base'
                                ? 'Alt text'
                                : `${capabilities[activeTab].label} alt-text override`
                            }
                            onChange={(event) => {
                              const altText = event.target.value;
                              if (activeTab === 'base') {
                                setMedia((current) =>
                                  current.map((item) =>
                                    item.id === row.id ? { ...item, alt_text: altText } : item,
                                  ),
                                );
                                void handpostApi.updateMediaAlt({ mediaId: row.id, altText });
                              } else setOption(activeTab, `alt:${row.id}`, altText);
                            }}
                          />
                        </span>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="media-add"
                    aria-label="Add media"
                    disabled={busy || media.length >= mediaMax}
                    onClick={() => void perform(attach)}
                  >
                    <Plus size={16} aria-hidden="true" />
                    <span aria-hidden="true">Add</span>
                  </button>
                </div>
              )}
            </div>
            {commentPlatforms.length > 0 && (
              <div className="compose__section compose__comments">
                {commentPlatforms.map((platform) => (
                  <label className="hp-field" key={platform}>
                    <span className="compose__label compose__label--badge">
                      <PlatformBadge platform={platform} size="s" />
                      First comment
                      {commentPlatforms.length > 1 || activeTab === 'base' ? (
                        <span className="sr-only"> on {capabilities[platform].label}</span>
                      ) : null}
                    </span>
                    <input
                      value={comments[platform] ?? ''}
                      onChange={(event) =>
                        setComments((value) => ({ ...value, [platform]: event.target.value }))
                      }
                      placeholder="Optional — posted as the first reply after the post is verified"
                    />
                  </label>
                ))}
              </div>
            )}
            {platformOptionEditor}
            {templateKeys.length > 0 && (
              <fieldset className="template-variables">
                <legend>Template variables</legend>
                {templateKeys.map((key) => (
                  <label key={key} className="hp-field">
                    <span>{key}</span>
                    <input
                      value={templateValues[key] ?? ''}
                      onChange={(event) => setTemplateValue(key, event.target.value)}
                    />
                  </label>
                ))}
              </fieldset>
            )}
          </div>
          <footer className="schedule-bar">
            <div className="schedule-bar__when">
              <Segmented<ScheduleMode>
                label="When"
                value={scheduleMode}
                onChange={setScheduleMode}
                options={[
                  { value: 'slot', label: 'Next free slot' },
                  { value: 'exact', label: 'Exact time' },
                  { value: 'now', label: 'Post now' },
                ]}
              />
              {scheduleMode === 'exact' && (
                <label className="hp-field schedule-bar__date">
                  <span className="sr-only">Publish at</span>
                  <input
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={(event) => setScheduledAt(event.target.value)}
                  />
                </label>
              )}
              <code className="schedule-bar__zone">
                {timeZone} · {JITTER_NOTE.replace(' ', '')}
              </code>
            </div>
            <div className="schedule-bar__actions">
              <Button kind="ghost" disabled={busy} onClick={() => void perform(() => save('draft'))}>
                Save draft
              </Button>
              {scheduleMode !== 'slot' && (
                <Button icon={Clock3} disabled={busy || hasErrors} onClick={() => void perform(addToQueue)}>
                  Add to queue
                </Button>
              )}
              <Button
                kind="primary"
                icon={scheduleMode === 'slot' ? Clock3 : Send}
                disabled={busy || hasErrors}
                onClick={() => void runSchedule()}
              >
                {scheduleLabel}
              </Button>
            </div>
          </footer>
          {message && (
            <p
              role="status"
              className={`hp-callout ${isSuccess(message) ? 'hp-callout--ink' : 'hp-callout--danger'} compose__message`}
            >
              {message}
            </p>
          )}
        </section>
        <aside className="split__side previews" aria-label="Live previews">
          <p className="hp-section-label">Live preview</p>
          {selected.length === 0 ? (
            <div className="hp-card">
              <EmptyState>Select a platform to preview the post.</EmptyState>
            </div>
          ) : (
            selected.map((platform) => {
              const body = overrides[platform] ?? text;
              const fold = platform === 'linkedin' && body.length > 210;
              const account = accounts.find((row) => row.platform === platform);
              const name = account?.display_name?.trim() || 'Your account';
              const notes = [
                platform === 'x' && /https?:\/\//.test(body) ? 'URLs count as 23' : '',
                media.length && media.every((row) => row.alt_text) ? 'alt text attached' : '',
                fold ? '…see more appears after 210 characters' : '',
              ].filter(Boolean);
              return (
                <article
                  className="hp-card preview"
                  key={platform}
                  aria-label={`${capabilities[platform].label} preview`}
                >
                  <header className="preview__head">
                    <span className="preview__avatar" aria-hidden="true">
                      {name.slice(0, 1).toUpperCase()}
                    </span>
                    <div>
                      <strong>{name}</strong>
                      <small className="muted">
                        {account?.handle ?? capabilities[platform].label} · {previewWhen}
                      </small>
                    </div>
                    <PlatformBadge platform={platform} size="s" />
                  </header>
                  <p className="preview__text">
                    {body ? (
                      fold ? (
                        <>
                          {body.slice(0, 210)}
                          <span className="preview__fold">…see more</span>
                        </>
                      ) : (
                        body
                      )
                    ) : (
                      <span className="muted">Your post preview appears here…</span>
                    )}
                  </p>
                  {media.length > 0 && (
                    <div
                      className={`preview__media${platform === 'x' ? ' preview__media--x' : ''}`}
                      role="img"
                      aria-label={`${media.length} ${media.length === 1 ? 'attachment' : 'attachments'}`}
                    >
                      <ImageIcon size={22} aria-hidden="true" />
                    </div>
                  )}
                  {decodeThreadParts(platformOptions[platform]?.threadParts).map((part, index) => (
                    <p className="preview__thread" key={`${index}-${part}`}>
                      {index + 2}. {part}
                    </p>
                  ))}
                  {notes.length > 0 && <p className="preview__note">{notes.join(' · ')}</p>}
                </article>
              );
            })
          )}
        </aside>
      </div>
    </main>
  );
}
