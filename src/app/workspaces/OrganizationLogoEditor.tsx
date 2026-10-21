import { useId, useState } from 'react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { OrganizationMark } from './OrganizationMark';
import { LogoError, prepareOrganizationLogo, type PreparedLogo } from './organization-logo';
import type { Translate } from '../auth/ConsentPage';
export function OrganizationLogoEditor({
  name,
  logoPath,
  draft,
  onChange,
  onPreparing,
  disabled,
  t,
}: {
  name: string;
  logoPath?: string | null;
  draft: PreparedLogo | null | undefined;
  onChange: (logo: PreparedLogo | null | undefined) => void;
  onPreparing: (value: boolean) => void;
  disabled: boolean;
  t: Translate;
}) {
  const id = useId();
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<string>('');
  const preview = draft === undefined ? logoPath : draft?.dataUrl;
  async function select(file?: File) {
    if (!file) return;
    setError('');
    setPreparing(true);
    onPreparing(true);
    try {
      onChange(await prepareOrganizationLogo(file));
    } catch (e) {
      setError(
        e instanceof LogoError && e.code === 'format'
          ? t('Escolha uma imagem PNG, JPG ou WebP.', 'Choose a PNG, JPG or WebP image.')
          : e instanceof LogoError && e.code === 'size'
            ? t('Escolha uma imagem de até 2 MB.', 'Choose an image up to 2 MB.')
            : t('Não foi possível ler a imagem. Escolha outro arquivo.', 'Could not read this image. Choose another file.'),
      );
    } finally {
      setPreparing(false);
      onPreparing(false);
    }
  }
  return (
    <div className="organization-logo-editor">
      <div className="label">{t('Logo da organização', 'Organization logo')}</div>
      <div className="row">
        <span className="organization-logo-preview">
          <OrganizationMark name={name} logoPath={preview} brand={name === 'Kairos'} />
        </span>
        <div className="form-field">
          <label htmlFor={id}>{t('Enviar logo da organização', 'Upload organization logo')}</label>
          <Input
            id={id}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={disabled || preparing}
            aria-describedby={`${id}-help${error ? ` ${id}-error` : ''}`}
            aria-invalid={!!error}
            onChange={event => {
              const file = event.target.files?.[0];
              event.target.value = '';
              void select(file);
            }}
          />
          <span id={`${id}-help`} className="hint">
            {t('PNG, JPG ou WebP, até 2 MB. Clique em Salvar espaço para aplicar.', 'PNG, JPG or WebP, up to 2 MB. Click Save workspace to apply.')}
          </span>
        </div>
      </div>
      <div className="organization-logo-actions">
        {preview && (
          <Button
            type="button"
            variant="ghost"
            disabled={disabled || preparing}
            onClick={() => {
              onChange(null);
              setError('');
            }}
          >
            {t('Remover logo', 'Remove logo')}
          </Button>
        )}
        {draft !== undefined && (
          <Button
            type="button"
            variant="ghost"
            disabled={disabled || preparing}
            onClick={() => {
              onChange(undefined);
              setError('');
            }}
          >
            {t('Desfazer alteração do logo', 'Undo logo change')}
          </Button>
        )}
        {preparing && <span role="status">{t('Preparando imagem...', 'Preparing image...')}</span>}
      </div>
      {error && (
        <p id={`${id}-error`} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
