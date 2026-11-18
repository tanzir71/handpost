import type { LucideIcon } from 'lucide-react';

/** Figma Nav item 5:98 — optional count badge, red when the screen has items needing attention. */
export function NavItem({
  icon: Icon,
  label,
  active,
  count,
  attention,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  active: boolean;
  count?: number;
  attention?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="hp-nav-item"
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
    >
      <Icon size={18} aria-hidden="true" />
      <span>{label}</span>
      {count ? (
        <span
          className={`hp-nav-item__count${attention ? ' hp-nav-item__count--attention' : ''}`}
          aria-label={`${count} waiting`}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}
