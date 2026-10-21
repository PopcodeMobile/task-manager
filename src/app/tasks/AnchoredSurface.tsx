import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';

/** An authored nonmodal surface anchored to the real initiating control. */
export function AnchoredSurface({
  anchor,
  label,
  children,
  close,
  width = 240,
  role = 'dialog',
  className = '',
}: {
  anchor: RefObject<HTMLElement | null>;
  label: string;
  children: ReactNode;
  close: (restore?: boolean) => void;
  width?: number;
  role?: 'dialog' | 'menu';
  className?: string;
}) {
  const node = useRef<HTMLDivElement>(null),
    [position, setPosition] = useState({ left: 8, top: 8 });
  useLayoutEffect(() => {
    const place = () => {
      if (!node.current || !anchor.current) return;
      const a = anchor.current.getBoundingClientRect(),
        p = node.current.getBoundingClientRect();
      setPosition({
        left: Math.max(8, Math.min(a.left, innerWidth - p.width - 8)),
        top: a.bottom + p.height + 4 < innerHeight - 8 ? a.bottom + 4 : Math.max(8, a.top - p.height - 4),
      });
    };
    place();
    addEventListener('resize', place);
    addEventListener('scroll', place, true);
    const observer = new ResizeObserver(place);
    if (node.current) observer.observe(node.current);
    return () => {
      removeEventListener('resize', place);
      removeEventListener('scroll', place, true);
      observer.disconnect();
    };
  }, [anchor]);
  useEffect(() => {
    node.current?.querySelector<HTMLElement>('input,button:not(:disabled),[tabindex="0"]')?.focus();
    const outside = (event: PointerEvent) => {
      if (!node.current?.contains(event.target as Node) && !anchor.current?.contains(event.target as Node)) close(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, []);
  return createPortal(
    <div
      ref={node}
      className={`task-field-popover anchored-surface ${className}`}
      role={role}
      aria-label={label}
      style={{ ...position, width }}
      onKeyDown={event => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          close();
          anchor.current?.focus();
        }
        if (role === 'menu' && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
          const items = [...(node.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]:not(:disabled)') ?? [])];
          const i = items.indexOf(document.activeElement as HTMLElement);
          const next =
            event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (i + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
          event.preventDefault();
          items[next]?.focus();
        }
      }}
    >
      {children}
    </div>,
    anchor.current?.closest('.ui-sheet') ?? document.body,
  );
}
