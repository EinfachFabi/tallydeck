import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '../utils/format';

interface PopoverProps {
  /** Renders the trigger button. */
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  /** Panel content; call `close()` after a selection. */
  children: (close: () => void) => ReactNode;
  align?: 'left' | 'right';
  direction?: 'down' | 'up';
  /** Tailwind width class of the panel. */
  panelClassName?: string;
  className?: string;
}

/** Lightweight dropdown panel: closes on outside click and Escape. */
export function Popover({
  trigger,
  children,
  align = 'left',
  direction = 'down',
  panelClassName,
  className,
}: PopoverProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Capture phase + stopPropagation: only close the dropdown, not a surrounding modal.
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointer);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      {trigger({ open, toggle: () => setOpen((v) => !v) })}
      {open && (
        <div
          className={cn(
            'absolute z-40 animate-fade-in overflow-hidden rounded-xl border border-line bg-surface shadow-2xl',
            direction === 'up' ? 'bottom-full mb-1.5' : 'top-full mt-1.5',
            align === 'right' ? 'right-0' : 'left-0',
            panelClassName ?? 'w-64',
          )}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

/** Small rounded counter badge used in dropdowns and lists. */
export function CountBadge({ value, highlight }: { value: number; highlight?: boolean }) {
  return (
    <span
      className={cn(
        'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums',
        highlight && value > 0 ? 'bg-accent/20 text-accent' : 'bg-canvas/70 text-muted',
      )}
    >
      {value}
    </span>
  );
}
