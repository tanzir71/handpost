import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';
import type { LucideIcon } from 'lucide-react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  kind?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'coffee';
  size?: 'm' | 's';
  icon?: LucideIcon;
  /** Icon-only button: `label` becomes the accessible name and tooltip. */
  label?: string;
  children?: ReactNode;
  ref?: Ref<HTMLButtonElement>;
}

/** Figma Button (Kind × Size) 5:46. */
export function Button({
  kind = 'secondary',
  size = 'm',
  icon: Icon,
  label,
  children,
  className,
  ...rest
}: ButtonProps) {
  const iconOnly = !children && Boolean(label);
  return (
    <button
      type="button"
      {...rest}
      aria-label={iconOnly ? label : rest['aria-label']}
      title={iconOnly ? label : rest.title}
      className={[
        'hp-button',
        `hp-button--${kind}`,
        size === 's' ? 'hp-button--s' : '',
        iconOnly ? 'hp-icon-button' : '',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {Icon && <Icon size={size === 's' ? 14 : 16} aria-hidden="true" />}
      {children}
    </button>
  );
}
