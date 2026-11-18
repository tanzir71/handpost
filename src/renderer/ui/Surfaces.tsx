import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, CircleX, X as Close, type LucideIcon } from 'lucide-react';
import { Button } from './Button';
import { Stamp } from './Stamp';

/** Figma brand/airmail-stripe 4:172 — red/blue diagonal rule. */
export function AirmailStripe({ height = 8 }: { height?: number }) {
  return <span className="hp-airmail" style={{ height }} aria-hidden="true" />;
}

export function Card({
  title,
  actions,
  stripe,
  tone,
  className,
  children,
  labelledBy,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  stripe?: boolean;
  tone?: 'sunken' | 'ink';
  className?: string;
  children: ReactNode;
  labelledBy?: string;
}) {
  const id = useId();
  return (
    <section
      className={['hp-card', tone ? `hp-card--${tone}` : '', className ?? ''].filter(Boolean).join(' ')}
      aria-labelledby={title ? (labelledBy ?? id) : undefined}
    >
      {stripe && <AirmailStripe />}
      <div className="hp-card__body">
        {(title || actions) && (
          <div className="hp-card__title">
            {title && (
              <h2 id={labelledBy ?? id} className="t-heading-s">
                {title}
              </h2>
            )}
            {actions}
          </div>
        )}
        {children}
      </div>
    </section>
  );
}

/** Every screen's empty state: the stamp at 64 px, one line, one action (UI notes §6). */
export function EmptyState({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="hp-empty">
      <Stamp size={64} tilt={-6} />
      <p>{children}</p>
      {action}
    </div>
  );
}

export type CheckTone = 'ok' | 'warn' | 'danger';
const CHECK_ICONS: Record<CheckTone, LucideIcon> = { ok: CheckCircle2, warn: AlertTriangle, danger: CircleX };

/** ✓ / ⚠ / ✕ list used by the receipt panel. */
export function Checks({ items }: { items: Array<{ tone: CheckTone; text: string }> }) {
  return (
    <ul className="hp-checks">
      {items.map((item, index) => {
        const Icon = CHECK_ICONS[item.tone];
        return (
          <li key={`${index}-${item.text}`} className={`hp-check--${item.tone}`}>
            <Icon
              size={14}
              aria-label={item.tone === 'ok' ? 'Passed' : item.tone === 'warn' ? 'Warning' : 'Error'}
            />
            <span>{item.text}</span>
          </li>
        );
      })}
    </ul>
  );
}

export interface StepLogEntry {
  name: string;
  startedAt: string;
  finishedAt: string;
  outcome: string;
  detail?: string;
}

/** Per-step publish log (✓ per step with durations, failing step highlighted). Shared by Queue and History. */
export function StepLog({ steps }: { steps: StepLogEntry[] }) {
  if (!steps.length) return <p className="muted t-body-s">No step log was recorded.</p>;
  return (
    <ol className="hp-steplog">
      {steps.map((step) => {
        const ok = step.outcome === 'ok';
        const Icon = ok ? CheckCircle2 : CircleX;
        const ms = Math.max(0, new Date(step.finishedAt).getTime() - new Date(step.startedAt).getTime());
        return (
          <li key={`${step.startedAt}-${step.name}`} className={ok ? 'is-ok' : 'is-failed'}>
            <Icon size={14} aria-label={ok ? 'ok' : 'failed'} />
            <strong>{step.name}</strong>
            <span className="hp-steplog__time">{ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`}</span>
            {step.detail && <small>{step.detail}</small>}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Confirm popover for destructive actions — never a native confirm(), which blocks the main process and
 * Playwright (UI notes §6). Escape or Cancel closes it; focus moves to the confirm button when it opens.
 */
export function ConfirmPopover({
  trigger,
  message,
  confirmLabel,
  onConfirm,
  placement = 'above',
}: {
  trigger: (open: () => void) => ReactNode;
  message: ReactNode;
  confirmLabel: string;
  onConfirm: () => void | Promise<void>;
  placement?: 'above' | 'below';
}) {
  const [open, setOpen] = useState(false);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    if (open) confirmRef.current?.focus();
  }, [open]);
  return (
    <span className="hp-popover-anchor">
      {trigger(() => setOpen(true))}
      {open && (
        <div
          className={`hp-popover${placement === 'below' ? ' hp-popover--below' : ''}`}
          role="alertdialog"
          aria-describedby={id}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setOpen(false);
          }}
        >
          <p id={id}>{message}</p>
          <div className="hp-popover__actions">
            <Button size="s" kind="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              size="s"
              kind="danger"
              ref={confirmRef}
              onClick={async () => {
                setOpen(false);
                await onConfirm();
              }}
            >
              {confirmLabel}
            </Button>
          </div>
        </div>
      )}
    </span>
  );
}

/**
 * A button that opens a short list of choices below it (Compose → Use template, Open draft). Arrow keys move
 * through the items, Escape or a click elsewhere closes it and focus returns to the button.
 */
export function MenuButton({
  label,
  icon,
  kind = 'secondary',
  items,
  onSelect,
  empty = 'Nothing here yet.',
}: {
  label: string;
  icon?: LucideIcon;
  kind?: 'primary' | 'secondary' | 'ghost';
  items: Array<{ id: string; label: string }>;
  onSelect: (id: string) => void;
  empty?: string;
}) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLSpanElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    anchor.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const away = (event: MouseEvent) => {
      if (!anchor.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  return (
    <span className="hp-popover-anchor" ref={anchor}>
      <Button
        kind={kind}
        {...(icon ? { icon } : {})}
        ref={trigger}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        {label}
      </Button>
      {open && (
        <div
          id={id}
          role="menu"
          aria-label={label}
          className="hp-popover hp-popover--below hp-menu"
          onKeyDown={(event) => {
            const options = [...event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]')];
            const index = options.indexOf(document.activeElement as HTMLElement);
            if (event.key === 'Escape') {
              event.preventDefault();
              close();
            } else if (event.key === 'ArrowDown' && options.length) {
              event.preventDefault();
              options[(index + 1) % options.length]?.focus();
            } else if (event.key === 'ArrowUp' && options.length) {
              event.preventDefault();
              options[(index - 1 + options.length) % options.length]?.focus();
            }
          }}
        >
          {items.length ? (
            items.map((item) => (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                className="hp-menu__item"
                onClick={() => {
                  close();
                  onSelect(item.id);
                }}
              >
                {item.label}
              </button>
            ))
          ) : (
            <p className="hp-menu__empty">{empty}</p>
          )}
        </div>
      )}
    </span>
  );
}

/** Modal dialog with Escape-to-close and initial focus inside. */
export function Modal({
  title,
  onClose,
  footer,
  children,
}: {
  title: string;
  onClose: () => void;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('input,select,textarea,button:not([data-close])')?.focus();
    return () => previous?.focus();
  }, []);
  return (
    <div
      className="hp-modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        className="hp-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onClose();
        }}
      >
        <header>
          <h2 id={id} className="t-heading-m">
            {title}
          </h2>
          <Button kind="ghost" size="s" icon={Close} label="Close" onClick={onClose} data-close="" />
        </header>
        <div className="hp-modal__body">{children}</div>
        {footer && <footer>{footer}</footer>}
      </div>
    </div>
  );
}
