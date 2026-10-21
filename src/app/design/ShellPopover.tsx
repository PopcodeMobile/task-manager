import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '../../components/ui/button';

/** A portaled shell popup avoids clipping in both expanded and collapsed navigation. */
export function ShellPopover({
  label,
  trigger,
  children,
  className = '',
  menu = false,
}: {
  label: string;
  trigger: ReactNode;
  children: ReactNode;
  className?: string;
  menu?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const id = useId();
  const container = useRef<HTMLDivElement>(null),
    button = useRef<HTMLButtonElement>(null),
    content = useRef<HTMLDivElement>(null);
  const contains = (target: Node | null) => !!target && !!(container.current?.contains(target) || content.current?.contains(target));
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const triggerRect = button.current?.getBoundingClientRect(),
        popup = content.current?.getBoundingClientRect();
      if (!triggerRect || !popup) return;
      setPosition({
        left: Math.max(8, Math.min(triggerRect.left, innerWidth - popup.width - 8)),
        top: triggerRect.bottom + 4 + popup.height > innerHeight - 8 ? Math.max(8, triggerRect.top - popup.height - 4) : triggerRect.bottom + 4,
      });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    (
      content.current?.querySelector<HTMLElement>('[aria-checked=true]') ??
      content.current?.querySelector<HTMLElement>('button:not(:disabled),select,input,a[href]')
    )?.focus();
    const close = (event: PointerEvent) => {
      if (!contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);
  return (
    <div
      ref={container}
      className={`shell-popover ${className}`}
      onBlur={event => {
        if (!contains(event.relatedTarget as Node)) setOpen(false);
      }}
      onKeyDown={event => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
          button.current?.focus();
        }
        if (menu && open && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
          event.preventDefault();
          const items = [...(content.current?.querySelectorAll<HTMLButtonElement>('[role^=menuitem]:not(:disabled)') ?? [])];
          const at = items.indexOf(document.activeElement as HTMLButtonElement);
          items[
            event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (at + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
          ]?.focus();
        }
        if (menu && !open && event.key === 'ArrowDown') {
          event.preventDefault();
          setOpen(true);
        }
      }}
    >
      <Button
        ref={button}
        variant="ghost"
        className="shell-popover-trigger"
        aria-label={label}
        title={label}
        aria-haspopup={menu ? 'menu' : 'dialog'}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen(value => !value)}
      >
        {trigger}
      </Button>
      {open &&
        createPortal(
          <div
            id={id}
            ref={content}
            style={position}
            className={`shell-popover-content ${className
              .split(' ')
              .filter(Boolean)
              .map(name => `${name}-content`)
              .join(' ')}`}
            role={menu ? 'menu' : 'dialog'}
            aria-label={label}
            onClick={event => {
              if ((event.target as HTMLElement).closest('[role^=menuitem]')) {
                setOpen(false);
                button.current?.focus();
              }
            }}
          >
            {children}
          </div>,
          document.body,
        )}
    </div>
  );
}
