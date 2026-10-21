import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { addD, iso, parse } from '../../core/calendar.js';
import type { Translate } from '../auth/ConsentPage';
import { preferredDate, weekStartsOn } from '../panel/panel-model';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';

export type TaskFieldChoice = { id: string; label: string; icon?: ReactNode; shortcut?: string };
export function taskDateLabel(value: string | null, t: Translate, prefs: Record<string, unknown> = {}) {
  if (!value) return t('Definir data', 'Set date');
  const today = iso(new Date());
  if (value === today) return t('Hoje', 'Today');
  if (value === iso(addD(parse(today)!, 1))) return t('Amanhã', 'Tomorrow');
  if (value === iso(addD(parse(today)!, -1))) return t('Ontem', 'Yesterday');
  const days = Math.round((parse(value)!.valueOf() - parse(today)!.valueOf()) / 86400000);
  if (days > 1 && days < 7) return parse(value)!.toLocaleDateString(t('pt-BR', 'en'), { weekday: 'short' });
  return preferredDate(value, prefs, t('pt-BR', 'en'));
}

/** Original authored popup composition, with controlled values and shadcn controls. */
export function TaskFieldControl({
  triggerLabel,
  menuLabel,
  value,
  choices = [],
  searchLabel,
  disabled,
  onChange,
  children,
  t,
  date = false,
  prefs = {},
  fieldId,
  selectedValues,
  onToggle,
  footer,
  caption,
}: {
  triggerLabel: string;
  menuLabel: string;
  value: string;
  choices?: TaskFieldChoice[];
  searchLabel?: string;
  disabled: boolean;
  onChange: (value: string) => void;
  children: ReactNode;
  t: Translate;
  date?: boolean;
  prefs?: Record<string, unknown>;
  fieldId?: string;
  selectedValues?: string[];
  onToggle?: (id: string, selected: boolean) => void;
  footer?: ReactNode;
  caption?: string;
}) {
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState(''),
    [month, setMonth] = useState(value || iso(new Date()));
  const [position, setPosition] = useState({ left: 8, top: 8 });
  const trigger = useRef<HTMLButtonElement>(null),
    popup = useRef<HTMLDivElement>(null);
  const restoreFocus = useRef<{ trigger: HTMLButtonElement; fieldId?: string } | null>(null);
  const popupId = useId();
  const locale = t('pt-BR', 'en');
  const filtered = choices.filter(choice => choice.label.toLocaleLowerCase(locale).includes(query.toLocaleLowerCase(locale)));
  const firstMonth = new Date(parse(month)!.getFullYear(), parse(month)!.getMonth(), 1);
  const firstDay = addD(firstMonth, -((firstMonth.getDay() - weekStartsOn(prefs.weekStart) + 7) % 7));
  const days = Array.from({ length: 42 }, (_, i) => addD(firstDay, i));
  function close(restore = true) {
    restoreFocus.current = restore && trigger.current ? { trigger: trigger.current, fieldId } : null;
    setOpen(false);
  }
  useEffect(() => {
    const pending = restoreFocus.current;
    if (!pending) return;
    const opener = pending.trigger;
    if (open || opener !== trigger.current || !opener.isConnected || pending.fieldId !== fieldId) {
      restoreFocus.current = null;
      return;
    }
    const sheet = opener.closest<HTMLElement>('.ui-sheet');
    const active = document.activeElement;
    if (active !== document.body && active !== sheet && active !== opener) {
      restoreFocus.current = null;
      return;
    }
    if (disabled) {
      if (active === document.body) sheet?.focus();
    } else opener.focus();
    // The write and its refreshed detail collections can disable the opener in
    // successive renders. Retain restoration until actual user focus/input moves.
    const pointer = (event: PointerEvent) => {
      if (!opener.contains(event.target as Node)) restoreFocus.current = null;
    };
    const focus = (event: FocusEvent) => {
      if (event.target !== document.body && event.target !== sheet && event.target !== opener) restoreFocus.current = null;
    };
    window.addEventListener('pointerdown', pointer, true);
    window.addEventListener('focusin', focus, true);
    return () => {
      window.removeEventListener('pointerdown', pointer, true);
      window.removeEventListener('focusin', focus, true);
    };
  }, [open, disabled, fieldId]);
  function choose(next: string) {
    if (disabled) return;
    if (selectedValues && onToggle) onToggle(next, selectedValues.includes(next));
    else {
      close();
      onChange(next);
    }
  }
  useLayoutEffect(() => {
    if (!open || !popup.current || !trigger.current) return;
    const place = () => {
      if (!popup.current || !trigger.current) return;
      const box = popup.current.getBoundingClientRect(),
        opener = trigger.current.getBoundingClientRect();
      setPosition({
        left: Math.max(8, Math.min(opener.left, innerWidth - box.width - 8)),
        top: opener.bottom + 4 + box.height > innerHeight - 8 ? Math.max(8, opener.top - box.height - 4) : opener.bottom + 4,
      });
    };
    place();
    addEventListener('resize', place);
    addEventListener('scroll', place, true);
    return () => {
      removeEventListener('resize', place);
      removeEventListener('scroll', place, true);
    };
  }, [open, query, month]);
  useEffect(() => {
    if (!open) return;
    const target = searchLabel
      ? popup.current?.querySelector<HTMLElement>('input')
      : date
        ? (popup.current?.querySelector<HTMLElement>('[data-date-choice][aria-pressed="true"]') ??
          popup.current?.querySelector<HTMLElement>('[data-date-choice]'))
        : (popup.current?.querySelector<HTMLElement>('[aria-checked="true"]') ?? popup.current?.querySelector<HTMLElement>('[role^="menuitem"]'));
    target?.focus();
    const outside = (event: PointerEvent) => {
      if (!popup.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) close(false);
    };
    // Applying a relation can disable the focused control and move focus back to
    // the sheet. Escape still belongs to this popup, before Radix dismisses it.
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || !popup.current?.isConnected) return;
      const surfaces = [...document.querySelectorAll('.task-field-popover')];
      const sheets = [...document.querySelectorAll('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]')];
      if (surfaces.at(-1) !== popup.current || (sheets.length && !sheets.at(-1)?.contains(popup.current))) return;
      event.preventDefault();
      event.stopPropagation();
      close();
    };
    document.addEventListener('pointerdown', outside);
    window.addEventListener('keydown', escape, true);
    return () => {
      document.removeEventListener('pointerdown', outside);
      window.removeEventListener('keydown', escape, true);
    };
  }, [open]);
  function keyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Tab') {
      if (!date && !footer) close(false);
      else {
        const focusable = [...(popup.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled)') ?? [])];
        const index = focusable.indexOf(document.activeElement as HTMLElement);
        if ((!event.shiftKey && index === focusable.length - 1) || (event.shiftKey && index === 0)) {
          event.preventDefault();
          focusable[event.shiftKey ? focusable.length - 1 : 0]?.focus();
        }
      }
      return;
    }
    if (!date && !(event.target instanceof HTMLInputElement)) {
      const shortcut = choices.find(choice => choice.shortcut === event.key);
      if (shortcut) {
        event.preventDefault();
        event.stopPropagation();
        choose(shortcut.id);
        return;
      }
    }
    if (event.target instanceof HTMLInputElement && !['ArrowDown', 'ArrowUp'].includes(event.key)) return;
    const items = [...(popup.current?.querySelectorAll<HTMLButtonElement>(date ? '[data-date-choice]' : '[role^="menuitem"]') ?? [])];
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    const step =
      event.key === 'ArrowDown'
        ? date
          ? 7
          : 1
        : event.key === 'ArrowUp'
          ? date
            ? -7
            : -1
          : date && event.key === 'ArrowRight'
            ? 1
            : date && event.key === 'ArrowLeft'
              ? -1
              : null;
    const next =
      event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : step === null ? null : index < 0 ? 0 : (index + step + items.length) % items.length;
    if (next !== null && items.length) {
      event.preventDefault();
      event.stopPropagation();
      items[next]?.focus();
    }
  }
  const calendarLabel = t('Escolher ', 'Choose ') + menuLabel.toLocaleLowerCase(locale);
  return (
    <>
      <Button
        ref={trigger}
        type="button"
        variant="ghost"
        className="task-field-trigger pillbtn"
        aria-label={triggerLabel}
        disabled={disabled}
        aria-haspopup={date ? 'dialog' : 'menu'}
        aria-expanded={open}
        aria-controls={open ? popupId : undefined}
        data-task-field={fieldId}
        onClick={() => {
          if (open) close();
          else {
            setQuery('');
            setMonth(value || iso(new Date()));
            setOpen(true);
          }
        }}
      >
        {children}
      </Button>
      {open &&
        createPortal(
          <div
            id={popupId}
            ref={popup}
            className={`task-field-popover pop floating ${date ? 'task-date-popover' : ''}`}
            role={date ? 'dialog' : 'menu'}
            aria-label={date ? calendarLabel : menuLabel}
            style={position}
            onKeyDown={keyboard}
          >
            {date ? (
              <>
                <div className="task-date-shortcuts">
                  {[
                    [t('Hoje', 'Today'), 0],
                    [t('Amanhã', 'Tomorrow'), 1],
                    [t('Próxima semana', 'Next week'), 7 - ((new Date().getDay() + 6) % 7)],
                    [t('Em 2 semanas', 'In 2 weeks'), 14],
                  ].map(([label, offset]) => (
                    <Button
                      type="button"
                      variant="outline"
                      className="badge"
                      key={label}
                      disabled={disabled}
                      onClick={() => choose(iso(addD(new Date(), Number(offset))))}
                    >
                      {label}
                    </Button>
                  ))}
                  {value && (
                    <Button type="button" variant="ghost" className="badge task-clear-date" disabled={disabled} onClick={() => choose('')}>
                      {t('Limpar', 'Clear')}
                    </Button>
                  )}
                </div>
                <div className="msep" />
                <div className="task-mini-calendar">
                  <div className="task-calendar-heading">
                    <b>{firstMonth.toLocaleDateString(locale, { month: 'long', year: 'numeric' })}</b>
                    <span className="sp" />
                    <Button
                      variant="ghost"
                      className="ibtn ibtn-xs"
                      aria-label={t('Mês anterior', 'Previous month')}
                      onClick={() => setMonth(iso(new Date(firstMonth.getFullYear(), firstMonth.getMonth() - 1, 1)))}
                    >
                      <ChevronLeft size={14} />
                    </Button>
                    <Button
                      variant="ghost"
                      className="ibtn ibtn-xs"
                      aria-label={t('Próximo mês', 'Next month')}
                      onClick={() => setMonth(iso(new Date(firstMonth.getFullYear(), firstMonth.getMonth() + 1, 1)))}
                    >
                      <ChevronRight size={14} />
                    </Button>
                  </div>
                  <div className="task-calendar-grid">
                    {days.slice(0, 7).map(day => (
                      <span className="faint" key={iso(day)}>
                        {day.toLocaleDateString(locale, { weekday: 'short' }).slice(0, 2)}
                      </span>
                    ))}
                    {days.map(day => {
                      const key = iso(day);
                      return (
                        <Button
                          type="button"
                          variant="ghost"
                          className={`num ${key === value ? 'on' : ''} ${key === iso(new Date()) ? 'today' : ''} ${day.getMonth() !== firstMonth.getMonth() ? 'outside' : ''}`}
                          data-date-choice={key}
                          key={key}
                          aria-pressed={key === value}
                          aria-label={preferredDate(key, prefs, locale, true)}
                          disabled={disabled}
                          onClick={() => choose(key)}
                        >
                          {day.getDate()}
                        </Button>
                      );
                    })}
                  </div>
                </div>
              </>
            ) : (
              <>
                {caption && <div className="mh">{caption}</div>}
                {searchLabel && (
                  <div className="pin">
                    <Input aria-label={searchLabel} placeholder={searchLabel} value={query} onChange={event => setQuery(event.target.value)} />
                  </div>
                )}
                {filtered.map(choice => (
                  <Button
                    type="button"
                    variant="ghost"
                    className="mi"
                    role={selectedValues ? 'menuitemcheckbox' : 'menuitemradio'}
                    aria-label={choice.label}
                    aria-checked={selectedValues ? selectedValues.includes(choice.id) : choice.id === value}
                    disabled={disabled}
                    key={choice.id}
                    onClick={() => choose(choice.id)}
                  >
                    {choice.icon}
                    <span className="trunc">{choice.label}</span>
                    {choice.shortcut && (
                      <span className="r">
                        <kbd>{choice.shortcut}</kbd>
                      </span>
                    )}
                    {(selectedValues ? selectedValues.includes(choice.id) : choice.id === value) && <Check size={14} className="ck" />}
                  </Button>
                ))}
                {!filtered.length && <div className="mi faint">{t('Nenhum resultado', 'No matches')}</div>}
              </>
            )}
            {footer && <div className="task-field-footer">{footer}</div>}
          </div>,
          trigger.current?.closest('.ui-sheet') ?? document.body,
        )}
    </>
  );
}

export function TaskDateIcon() {
  return <Calendar size={13} />;
}
