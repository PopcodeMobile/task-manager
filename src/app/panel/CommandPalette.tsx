import { useEffect, useState } from 'react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '../../components/ui/sheet';
import type { Translate } from '../auth/ConsentPage';
export type PaletteItem = { id: string; label: string; kind: 'command' | 'task' | 'project' | 'person' | 'file' | 'comment'; run: () => void };
export function CommandPalette({
  open,
  onOpenChange,
  opener,
  items,
  t,
  initialMode,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  opener: HTMLElement | null;
  items: PaletteItem[];
  t: Translate;
  initialMode: 'command' | 'search';
}) {
  const [query, setQuery] = useState(''),
    [mode, setMode] = useState(initialMode),
    [scope, setScope] = useState('all');
  useEffect(() => {
    if (open) {
      setQuery('');
      setMode(initialMode);
      setScope('all');
    }
  }, [open, initialMode]);
  const results = items
    .filter(
      item =>
        (mode === 'command' ? item.kind === 'command' : item.kind !== 'command' && (scope === 'all' || scope === item.kind)) &&
        item.label.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
    )
    .slice(0, 50);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        closeLabel={t('Fechar', 'Close')}
        onCloseAutoFocus={event => {
          event.preventDefault();
          if (opener?.isConnected) opener.focus();
          else document.querySelector<HTMLElement>('#work-content')?.focus();
        }}
      >
        <SheetTitle>{t('Comandos e busca', 'Commands and search')}</SheetTitle>
        <SheetDescription>
          {t('Tab alterna comandos e busca. Use as setas e Enter para escolher.', 'Tab switches commands and search. Use arrows and Enter to choose.')}
        </SheetDescription>
        <div className="button-row">
          <Button variant={mode === 'command' ? 'default' : 'ghost'} onClick={() => setMode('command')}>
            {t('Comandos', 'Commands')}
          </Button>
          <Button variant={mode === 'search' ? 'default' : 'ghost'} onClick={() => setMode('search')}>
            {t('Busca', 'Search')}
          </Button>
        </div>
        <Input
          aria-label={t('Buscar comandos', 'Search commands')}
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => {
            const rows = Array.from(e.currentTarget.parentElement!.querySelectorAll<HTMLButtonElement>('[data-command]'));
            if (e.key === 'Tab') {
              e.preventDefault();
              setMode(mode === 'command' ? 'search' : 'command');
            }
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault();
              rows[e.key === 'ArrowDown' ? 0 : rows.length - 1]?.focus();
            }
            if (e.key === 'Enter') {
              e.preventDefault();
              rows[0]?.click();
            }
          }}
        />
        {mode === 'search' && (
          <label className="form-field">
            {t('Categoria da busca', 'Search category')}
            <select value={scope} onChange={e => setScope(e.target.value)}>
              {[
                ['all', t('Tudo', 'All')],
                ['task', t('Tarefas', 'Tasks')],
                ['project', t('Projetos', 'Projects')],
                ['person', t('Pessoas', 'People')],
                ['file', t('Arquivos', 'Files')],
                ['comment', t('Comentários', 'Comments')],
              ].map(([key, label]) => (
                <option value={key} key={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        )}
        <div
          className="panel-page"
          onKeyDown={e => {
            const buttons = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('[data-command]'));
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault();
              const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
              buttons[(index + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus();
            }
          }}
        >
          {results.map(item => (
            <Button
              data-command
              key={item.kind + item.id}
              variant="ghost"
              onClick={() => {
                onOpenChange(false);
                item.run();
              }}
            >
              {item.label}
            </Button>
          ))}
          {!results.length && <p>{t('Nenhum resultado.', 'No results.')}</p>}
        </div>
      </SheetContent>
    </Sheet>
  );
}
