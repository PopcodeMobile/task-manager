import { useLayoutEffect, useRef, useState } from 'react';
import { Bold, Italic, List, ListOrdered, Heading, Link, Code, Eye } from 'lucide-react';
import { safeRichText } from '../../core/rich-text.js';
import type { Translate } from '../auth/ConsentPage';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';

/** Rich user content only. The existing task Save and draft guard own persistence. */
export function TaskDescriptionEditor({ value, onChange, disabled, t }: { value: string; onChange: (value: string) => void; disabled: boolean; t: Translate }) {
  const editor = useRef<HTMLDivElement>(null);
  const [source, setSource] = useState(false),
    [link, setLink] = useState<string | null>(null);
  const selection = useRef<Range | null>(null);
  useLayoutEffect(() => {
    if (editor.current && document.activeElement !== editor.current) editor.current.innerHTML = safeRichText(value);
  }, [value, source]);
  function format(command: string, argument?: string) {
    if (disabled || !editor.current) return;
    editor.current.focus();
    const selected = window.getSelection();
    if (selection.current && selected && editor.current.contains(selection.current.commonAncestorContainer)) {
      selected.removeAllRanges();
      selected.addRange(selection.current);
    }
    document.execCommand(command, false, argument);
    if (editor.current.innerHTML.length <= 100000) onChange(editor.current.innerHTML);
    else editor.current.innerHTML = safeRichText(value);
  }
  return (
    <section className="task-description-section dsec">
      <div className="dsec-h">
        <h3>{t('Descrição', 'Description')}</h3>
        <div className="rte-tb" role="toolbar" aria-label={t('Formatação', 'Formatting')}>
          {(
            [
              ['bold', t('Negrito', 'Bold'), Bold],
              ['italic', t('Itálico', 'Italic'), Italic],
              ['insertUnorderedList', t('Lista com marcadores', 'Bulleted list'), List],
              ['insertOrderedList', t('Lista numerada', 'Numbered list'), ListOrdered],
              ['formatBlock', t('Título', 'Heading'), Heading],
            ] as const
          ).map(([command, label, Icon]) => (
            <Button
              type="button"
              variant="ghost"
              className="ibtn ibtn-xs"
              aria-label={label}
              key={command}
              disabled={disabled || source}
              onMouseDown={event => event.preventDefault()}
              onClick={() => format(command, command === 'formatBlock' ? 'h4' : undefined)}
            >
              <Icon size={13} />
            </Button>
          ))}
          <Button
            type="button"
            variant="ghost"
            className="ibtn ibtn-xs"
            aria-label={t('Inserir link', 'Insert link')}
            disabled={disabled || source}
            onMouseDown={event => event.preventDefault()}
            onClick={() => {
              const selected = window.getSelection();
              selection.current =
                selected?.rangeCount && editor.current?.contains(selected.getRangeAt(0).commonAncestorContainer) ? selected.getRangeAt(0).cloneRange() : null;
              setLink('https://');
            }}
          >
            <Link size={13} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="ibtn ibtn-xs"
            aria-label={source ? t('Visualizar descrição', 'Preview description') : t('Editar descrição', 'Edit description')}
            disabled={disabled}
            onClick={() => {
              setSource(current => !current);
              setLink(null);
            }}
          >
            {source ? <Eye size={13} /> : <Code size={13} />}
          </Button>
        </div>
      </div>
      {link !== null && (
        <div className="task-description-link">
          <Input type="url" aria-label={t('URL do link', 'Link URL')} value={link} onChange={event => setLink(event.target.value)} />
          <Button
            type="button"
            variant="outline"
            disabled={disabled || !/^https?:\/\/\S+$/i.test(link)}
            onClick={() => {
              format('createLink', link);
              setLink(null);
              selection.current = null;
            }}
          >
            {t('Aplicar link', 'Apply link')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setLink(null);
              selection.current = null;
            }}
          >
            {t('Cancelar', 'Cancel')}
          </Button>
        </div>
      )}
      {source ? (
        <textarea
          autoFocus
          className="task-description-source"
          aria-label={t('Descrição', 'Description')}
          value={value}
          maxLength={100000}
          onChange={event => onChange(event.target.value)}
          disabled={disabled}
        />
      ) : (
        <div
          ref={editor}
          className="rich-content task-description-preview rte-body"
          role="textbox"
          aria-label={t('Descrição', 'Description')}
          aria-multiline="true"
          aria-readonly={disabled}
          contentEditable={!disabled}
          suppressContentEditableWarning
          data-placeholder={t('Adicione uma descrição...', 'Add a description…')}
          onInput={event => {
            if (event.currentTarget.innerHTML.length <= 100000) onChange(event.currentTarget.innerHTML);
            else event.currentTarget.innerHTML = safeRichText(value);
          }}
          onPaste={event => {
            event.preventDefault();
            if (disabled) return;
            const html = event.clipboardData.getData('text/html');
            document.execCommand(html ? 'insertHTML' : 'insertText', false, html ? safeRichText(html) : event.clipboardData.getData('text/plain'));
            if (event.currentTarget.innerHTML.length <= 100000) onChange(event.currentTarget.innerHTML);
            else event.currentTarget.innerHTML = safeRichText(value);
          }}
          onDrop={event => event.preventDefault()}
          onBlur={event => {
            if (!disabled && event.currentTarget.innerHTML !== safeRichText(value)) event.currentTarget.innerHTML = safeRichText(value);
          }}
        />
      )}
    </section>
  );
}
