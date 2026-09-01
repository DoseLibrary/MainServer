import { cn } from '@/lib/utils';

export interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  /** Accessible name when the switch is not wrapped in a visible label. */
  'aria-label'?: string;
  'aria-describedby'?: string;
  id?: string;
  className?: string;
}

/**
 * An on/off control.
 *
 * A native checkbox reads as "pick this option"; a switch reads as "this is on
 * now", which is what settings and enable/disable actually mean. Built on a
 * button with `role="switch"` so keyboard, screen readers, and testing-library's
 * checked queries all behave like the native control it replaces.
 */
export function Switch({ checked, onCheckedChange, disabled, id, className, ...aria }: SwitchProps) {
  return (
    <button
      {...aria}
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none',
        checked ? 'bg-foreground' : 'bg-muted-foreground/30',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none block h-5 w-5 rounded-full bg-background shadow-sm ring-0 transition-transform duration-200 motion-reduce:transition-none',
          checked ? 'translate-x-5' : 'translate-x-0',
        )}
      />
    </button>
  );
}
