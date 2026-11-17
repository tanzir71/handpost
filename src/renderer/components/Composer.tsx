import { useMemo, useState, type ClipboardEvent, type DragEvent } from 'react';
import { ImagePlus, Save, Send, Timer } from 'lucide-react';
import { capabilities, countText, postWarnings, validatePost } from '../../shared/capabilities';
import { renderTemplate, templateVariables } from '../../shared/templates';
import type { MediaInput, PlatformId } from '../../shared/types';
import { handpostApi } from '../lib/api';

interface ComposerProps {
  accounts: any[];
  templates: any[];
  posts?: any[];
  targets?: any[];
  storedMedia?: any[];
  onSaved: () => void;
}
interface MediaRow extends MediaInput {
  id: number;
  duration_s?: number;
  size_bytes?: number;
  alt_text?: string;
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

export function Composer({
  accounts,
  templates,
  posts = [],
  targets = [],
  storedMedia = [],
  onSaved,
}: ComposerProps) {
  const [postId, setPostId] = useState<number>();
  const [text, setText] = useState('');
  const [selected, setSelected] = useState<PlatformId[]>(['x']);
  const [scheduledAt, setScheduledAt] = useState(() =>
    new Date(Date.now() + 3_600_000).toISOString().slice(0, 16),
  );
  const [message, setMessage] = useState('');
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
  const chooseDraft = (id: string) => {
    const draft = posts.find((item) => String(item.id) === id && item.status === 'draft');
    if (!draft) {
      setPostId(undefined);
      return;
    }
    const draftTargets = targets.filter((item) => item.post_id === draft.id && item.status === 'draft');
    setPostId(Number(draft.id));
    setText(String(draft.base_text));
    setMedia(storedMedia.filter((item) => item.post_id === draft.id));
    setSelected(draftTargets.map((item) => item.platform));
    setOverrides(
      Object.fromEntries(
        draftTargets.filter((item) => item.override_text).map((item) => [item.platform, item.override_text]),
      ),
    );
    setComments(
      Object.fromEntries(
        draftTargets.filter((item) => item.first_comment).map((item) => [item.platform, item.first_comment]),
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
    setMessage('Draft loaded');
  };
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
  return (
    <main className="screen" onDrop={drop} onDragOver={(event) => event.preventDefault()} onPaste={paste}>
      <header className="screen-header">
        <div>
          <p className="eyebrow">CREATE</p>
          <h1>Compose once. Publish everywhere.</h1>
          <p>Drop or paste media anywhere. Content stays on this device.</p>
        </div>
        <div className="header-badge">
          <span className="status-dot ok" />
          Scheduler active
        </div>
      </header>
      <div className="composer-grid">
        <section className="panel editor" aria-busy={busy}>
          <div className="platform-row" aria-label="Target platforms">
            {accounts
              .filter((account) => account.platform !== 'mock')
              .map((account) => (
                <button
                  key={account.platform}
                  className={selected.includes(account.platform) ? 'platform selected' : 'platform'}
                  onClick={() => toggle(account.platform)}
                  aria-pressed={selected.includes(account.platform)}
                >
                  {capabilities[account.platform as PlatformId]!.label.slice(0, 2)}
                </button>
              ))}
          </div>
          <div className="tabs">
            <button className={activeTab === 'base' ? 'active' : ''} onClick={() => setActiveTab('base')}>
              Base content
            </button>
            {selected.map((platform) => (
              <button
                key={platform}
                className={activeTab === platform ? 'active' : ''}
                onClick={() => setActiveTab(platform)}
              >
                {capabilities[platform].label}
              </button>
            ))}
          </div>
          <label className="sr-only" htmlFor="post-text">
            Post text
          </label>
          <textarea
            id="post-text"
            value={activeText}
            onChange={(event) =>
              activeTab === 'base'
                ? setText(event.target.value)
                : setOverrides((value) => ({ ...value, [activeTab]: event.target.value }))
            }
            placeholder="What do you want to share?"
          />
          <div className="editor-meta">
            <span>
              {activeTab === 'base'
                ? 'Used unless overridden'
                : `${countText(activeTab, activeText)} / ${capabilities[activeTab].maxChars}`}
            </span>
            <button className="subtle" disabled={busy} onClick={() => void perform(attach)}>
              <ImagePlus size={16} />
              Attach media
            </button>
          </div>
          {activeTab !== 'base' && (
            <label className="first-comment">
              First comment
              <input
                value={comments[activeTab] ?? ''}
                onChange={(event) => setComments((value) => ({ ...value, [activeTab]: event.target.value }))}
                placeholder="Optional first comment"
              />
            </label>
          )}
          {platformOptionEditor}
          {media.length > 0 && (
            <div className="media-strip">
              {media.map((row) => (
                <label key={row.id}>
                  <strong>
                    {row.kind} · {row.path.split(/[\\/]/).pop()}
                  </strong>
                  <input
                    value={
                      activeTab === 'base'
                        ? (row.alt_text ?? '')
                        : String(activeOptions[`alt:${row.id}`] ?? row.alt_text ?? '')
                    }
                    placeholder={
                      activeTab === 'base' ? 'Alt text' : `${capabilities[activeTab].label} alt-text override`
                    }
                    onChange={(event) => {
                      const altText = event.target.value;
                      if (activeTab === 'base') {
                        setMedia((current) =>
                          current.map((item) => (item.id === row.id ? { ...item, alt_text: altText } : item)),
                        );
                        void handpostApi.updateMediaAlt({ mediaId: row.id, altText });
                      } else setOption(activeTab, `alt:${row.id}`, altText);
                    }}
                  />
                </label>
              ))}
            </div>
          )}
          {selected.flatMap((platform) =>
            (errors[platform] ?? []).map((error) => (
              <p className="validation" key={`${platform}-${error}`}>
                {capabilities[platform].label}: {error}
              </p>
            )),
          )}
          {selected.flatMap((platform) =>
            (warnings[platform] ?? []).map((warning) => (
              <p className="warning-chip" key={`${platform}-${warning}`}>
                {capabilities[platform].label}: {warning}
              </p>
            )),
          )}
          {optionErrors.map((error) => (
            <p className="validation" key={error}>
              {error}
            </p>
          ))}
          {selected.length === 0 && <p className="validation">Select at least one platform.</p>}
          <div className="template-row">
            <label>
              Draft
              <select defaultValue="" onChange={(event) => chooseDraft(event.target.value)}>
                <option value="">Choose…</option>
                {posts
                  .filter((post) => post.status === 'draft')
                  .map((post) => (
                    <option key={post.id} value={post.id}>
                      {post.base_text.slice(0, 40) || `Draft ${post.id}`}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Template
              <select defaultValue="" onChange={(event) => chooseTemplate(event.target.value)}>
                <option value="">Choose…</option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Publish at
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(event) => setScheduledAt(event.target.value)}
              />
            </label>
          </div>
          {templateKeys.length > 0 && (
            <fieldset className="template-variables">
              <legend>Template variables</legend>
              {templateKeys.map((key) => (
                <label key={key}>
                  {key}
                  <input
                    value={templateValues[key] ?? ''}
                    onChange={(event) => setTemplateValue(key, event.target.value)}
                  />
                </label>
              ))}
            </fieldset>
          )}
          <footer className="composer-actions">
            <button className="subtle" disabled={busy} onClick={() => void perform(() => save('draft'))}>
              <Save size={16} />
              Save draft
            </button>
            <button
              className="secondary"
              disabled={busy || hasErrors}
              onClick={() => void perform(addToQueue)}
            >
              <Timer size={16} />
              Add to queue
            </button>
            <button
              className="secondary"
              disabled={busy || hasErrors}
              onClick={() => void perform(() => save('scheduled'))}
            >
              Schedule
            </button>
            <button
              className="primary"
              disabled={busy || hasErrors}
              onClick={() => void perform(() => save('scheduled', new Date().toISOString()))}
            >
              <Send size={16} />
              Post now
            </button>
          </footer>
          {message && (
            <p
              role="status"
              className={
                message.includes('saved') ||
                message.includes('scheduled') ||
                message.includes('attached') ||
                message.includes('Added') ||
                message.includes('loaded')
                  ? 'success-message'
                  : 'validation'
              }
            >
              {message}
            </p>
          )}
        </section>
        <aside className="preview-stack">
          <div className="preview-heading">
            <span>Live previews</span>
            <small>{selected.length} channels</small>
          </div>
          {selected.length === 0 ? (
            <div className="empty panel">Select a platform to preview.</div>
          ) : (
            selected.map((platform) => (
              <article className="preview-card" key={platform}>
                <header>
                  <span className="avatar">Y</span>
                  <div>
                    <strong>Your account</strong>
                    <small>@you · now</small>
                  </div>
                  <span className="platform-tag">{capabilities[platform].label}</span>
                </header>
                <p>
                  {(overrides[platform] ?? text) || (
                    <span className="muted">Your post preview appears here…</span>
                  )}
                </p>
                {media.length > 0 && (
                  <div className="preview-media">
                    {media.length} media attachment{media.length === 1 ? '' : 's'}
                  </div>
                )}
                <footer>♡ &nbsp; ◯ &nbsp; ↗</footer>
              </article>
            ))
          )}
        </aside>
      </div>
    </main>
  );
}
