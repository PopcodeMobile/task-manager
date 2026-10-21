import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '../../components/ui/button';
import type { Translate } from '../auth/ConsentPage';
export function SavedViewMenu({
  x,
  y,
  t,
  close,
  rename,
  remove,
}: {
  x: number;
  y: number;
  t: Translate;
  close: (restore?: boolean) => void;
  rename: () => void;
  remove: () => void;
}) {
  const menu = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: x, top: y });
  useLayoutEffect(() => {
    const rect = menu.current!.getBoundingClientRect();
    setPosition({ left: Math.max(0, Math.min(x, innerWidth - rect.width)), top: Math.max(0, Math.min(y, innerHeight - rect.height)) });
    menu.current!.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [x, y]);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node)) close(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [close]);
  function keyboard(event: KeyboardEvent) {
    if (event.key === 'Escape' || event.key === 'Tab') {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
      }
      close();
      return;
    }
    const items = [...menu.current!.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      event.key === 'ArrowDown'
        ? (index + 1) % items.length
        : event.key === 'ArrowUp'
          ? (index - 1 + items.length) % items.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? items.length - 1
              : null;
    if (next !== null) {
      event.preventDefault();
      event.stopPropagation();
      items[next]?.focus();
    }
  }
  return createPortal(
    <div ref={menu} className="task-context-menu" style={position} role="menu" aria-label={t('Ações da visualização', 'View actions')} onKeyDown={keyboard}>
      <Button role="menuitem" tabIndex={-1} variant="ghost" onClick={rename}>
        {t('Renomear visualização', 'Rename view')}
      </Button>
      <Button role="menuitem" tabIndex={-1} variant="ghost" onClick={remove}>
        {t('Excluir visualização', 'Delete view')}
      </Button>
    </div>,
    document.body,
  );
}
