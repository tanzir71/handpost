import { useId, type InputHTMLAttributes, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

/** Figma Toggle 9:68 — a real switch button. */
export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      className="hp-toggle"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    />
  );
}

/** A labelled toggle with a one-line explanation (Settings rows). */
export function ToggleRow({
  title,
  detail,
  checked,
  onChange,
  disabled,
}: {
  title: string;
  detail?: ReactNode;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="hp-toggle-row">
      <span>
        <strong>{title}</strong>
        {detail && <small>{detail}</small>}
      </span>
      <Toggle checked={checked} onChange={onChange} label={title} {...(disabled ? { disabled } : {})} />
    </div>
  );
}

/** Figma Field 9:92 — 36 px, surface, strong line, optional leading icon. */
export function Field({
  label,
  icon: Icon,
  hint,
  hideLabel,
  ...input
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  icon?: LucideIcon;
  hint?: string;
  hideLabel?: boolean;
}) {
  const id = useId();
  return (
    <label className={`hp-field${Icon ? ' hp-field--icon' : ''}`} htmlFor={input.id ?? id}>
      <span className={hideLabel ? 'sr-only' : undefined}>{label}</span>
      <span className="hp-field__control">
        {Icon && <Icon size={16} aria-hidden="true" />}
        <input id={input.id ?? id} {...input} />
      </span>
      {hint && <small>{hint}</small>}
    </label>
  );
}

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

/** Segmented control (Compose schedule modes, theme picker). A radiogroup of buttons. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: Array<SegmentOption<T>>;
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div className="hp-segmented" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          onKeyDown={(event) => {
            if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
            event.preventDefault();
            const index = options.findIndex((item) => item.value === value);
            const next =
              options[(index + (event.key === 'ArrowRight' ? 1 : options.length - 1)) % options.length]!;
            onChange(next.value);
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export interface TabItem<T extends string> {
  id: T;
  label: string;
}

/** Tabs with arrow-key navigation (roving focus). */
export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
  label,
}: {
  tabs: Array<TabItem<T>>;
  active: T;
  onChange: (id: T) => void;
  label: string;
}) {
  return (
    <div className="hp-tabs" role="tablist" aria-label={label}>
      {tabs.map((tab, index) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          className="hp-tab"
          aria-selected={active === tab.id}
          tabIndex={active === tab.id ? 0 : -1}
          onClick={() => onChange(tab.id)}
          onKeyDown={(event) => {
            if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
            event.preventDefault();
            const next = tabs[(index + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]!;
            onChange(next.id);
            (
              event.currentTarget.parentElement?.children[tabs.indexOf(next)] as HTMLElement | undefined
            )?.focus();
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
