import { useEffect, useId, useState, type FormEvent } from 'react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { normalizeAccentHex } from '../../core/custom-accent.js';
import type { Translate } from '../auth/ConsentPage';

type CustomAccentProps = {
  value: string;
  onSave: (accent: string) => Promise<void>;
  busy: boolean;
  t: Translate;
};

export function CustomAccent({ value, onSave, busy, t }: CustomAccentProps) {
  const id = useId();
  const [draft, setDraft] = useState(() => normalizeAccentHex(value) ?? '');
  const [error, setError] = useState<'invalid' | 'save' | null>(null);
  const [saving, setSaving] = useState(false);
  const normalized = normalizeAccentHex(draft);
  const disabled = busy || saving;
  useEffect(() => {
    setDraft(normalizeAccentHex(value) ?? '');
    setError(null);
  }, [value]);

  function update(value: string) {
    setDraft(value);
    setError(null);
  }
  async function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled) return;
    if (!normalized) {
      setError('invalid');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await onSave(normalized);
      setDraft(normalized);
    } catch {
      setError('save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="form-field custom-accent" noValidate onSubmit={event => void apply(event)} aria-busy={saving}>
      <label htmlFor={`${id}-hex`}>{t('Cor personalizada', 'Custom color')}</label>
      <div className="row">
        <Input
          type="color"
          className="input custom-accent-picker"
          aria-label={t('Escolher cor personalizada', 'Choose custom color')}
          value={normalized ?? '#5A67D8'}
          disabled={disabled}
          onChange={event => update(event.target.value)}
        />
        <Input
          id={`${id}-hex`}
          className="input"
          aria-label={t('Código HEX', 'HEX code')}
          aria-describedby={`${id}-help${error ? ` ${id}-error` : ''}`}
          aria-invalid={error === 'invalid'}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          placeholder="#RRGGBB"
          value={draft}
          disabled={disabled}
          onChange={event => update(event.target.value)}
        />
      </div>
      <span id={`${id}-help`} className="hint">
        {t(
          'Confira a cor no seletor e clique em Aplicar. O contraste se ajusta ao tema. A cor escolhida fica salva.',
          'Preview the color in the picker, then click Apply. Contrast adjusts to the theme. Your chosen color stays saved.',
        )}
      </span>
      {error && (
        <span id={`${id}-error`} role="alert">
          {error === 'invalid'
            ? t('Use um código HEX válido: #RGB ou #RRGGBB.', 'Enter a valid HEX code: #RGB or #RRGGBB.')
            : t('Não foi possível salvar a cor. Tente novamente.', 'Could not save the color. Try again.')}
        </span>
      )}
      <Button type="submit" disabled={disabled || (normalized !== null && normalized === normalizeAccentHex(value))}>
        {saving ? t('Aplicando...', 'Applying...') : t('Aplicar', 'Apply')}
      </Button>
    </form>
  );
}
