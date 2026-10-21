import { useState } from 'react';
import type { Task, FileMetadata, TaskAttachment } from '../../domain/contracts';
import type { Translate } from '../auth/ConsentPage';
import type { Execute } from '../projects/ProjectsPage';
import type { DetailAction } from './TaskRelationSection';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
export function TaskAttachmentsSection({
  task,
  files,
  attachments,
  action,
  execute,
  disabled,
  t,
}: {
  task: Task;
  files: FileMetadata[];
  attachments: TaskAttachment[];
  action: DetailAction;
  execute: Execute;
  disabled: boolean;
  t: Translate;
}) {
  const [name, setName] = useState(''),
    [type, setType] = useState('doc'),
    [size, setSize] = useState(''),
    [file, setFile] = useState(''),
    [id, setId] = useState(() => crypto.randomUUID());
  const linked = attachments.filter(a => a.taskId === task.id);
  return (
    <section className="drawer-section">
      <h3>{t('Anexos', 'Attachments')}</h3>
      <p className="permission-note">
        {t('Somente metadados. O conteúdo dos arquivos não é enviado nem armazenado.', 'Metadata only. File contents are neither uploaded nor stored.')}
      </p>
      {linked.map(link => {
        const item = files.find(f => f.id === link.fileId);
        return (
          <div className="attachment-row" key={link.fileId}>
            <div>
              <strong>{item?.name ?? link.fileId}</strong>
              <small>
                {item?.fileType} {item?.sizeLabel}
              </small>
              <details>
                <summary>{t('Ver metadados: ', 'View metadata: ') + (item?.name ?? link.fileId)}</summary>
                <p>{t('Nenhum conteúdo de arquivo está armazenado aqui.', 'No file content is stored here.')}</p>
                <dl>
                  <dt>{t('Identificador', 'Identifier')}</dt>
                  <dd>{link.fileId}</dd>
                  <dt>{t('Tipo', 'File type')}</dt>
                  <dd>{item?.fileType ?? '—'}</dd>
                  <dt>{t('Tamanho informado', 'Size label')}</dt>
                  <dd>{item?.sizeLabel ?? '—'}</dd>
                </dl>
              </details>
            </div>
            <Button
              variant="ghost"
              disabled={disabled}
              onClick={() => void action(() => execute('remove_task_attachment', { id: task.id, fileId: link.fileId }, task.version), true)}
            >
              {t('Desvincular anexo', 'Unlink attachment')}
            </Button>
          </div>
        );
      })}
      <form
        className="inline-form"
        onSubmit={e => {
          e.preventDefault();
          void action(async () => {
            await execute('set_task_attachment', { id: task.id, fileId: file }, task.version);
            setFile('');
          }, true);
        }}
      >
        <select aria-label={t('Metadados existentes', 'Existing metadata')} value={file} required disabled={disabled} onChange={e => setFile(e.target.value)}>
          <option value="">{t('Selecionar arquivo', 'Select file')}</option>
          {files
            .filter(f => !linked.some(a => a.fileId === f.id))
            .map(f => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
        </select>
        <Button variant="outline" type="submit" disabled={disabled}>
          {t('Vincular metadados', 'Link metadata')}
        </Button>
      </form>
      <form
        onSubmit={e => {
          e.preventDefault();
          void action(async () => {
            await execute('batch', {
              commands: [
                { operation: 'create_file', input: { id, projectId: task.projectId, name, fileType: type, sizeLabel: size || null } },
                { operation: 'set_task_attachment', input: { id: task.id, fileId: id }, expectedVersion: task.version },
              ],
            });
            setName('');
            setSize('');
            setId(crypto.randomUUID());
          }, true);
        }}
      >
        <label className="form-field">
          {t('Nome dos metadados', 'Metadata name')}
          <Input required maxLength={500} value={name} onChange={e => setName(e.target.value)} disabled={disabled} />
        </label>
        <div className="drawer-fields">
          <label className="form-field">
            {t('Tipo', 'File type')}
            <select value={type} disabled={disabled} onChange={e => setType(e.target.value)}>
              {['fig', 'pdf', 'zip', 'img', 'sheet', 'doc', 'code', 'other'].map(k => (
                <option key={k}>{k}</option>
              ))}
            </select>
          </label>
          <label className="form-field">
            {t('Tamanho informado', 'Size label')}
            <Input value={size} maxLength={120} disabled={disabled} onChange={e => setSize(e.target.value)} />
          </label>
        </div>
        <Button type="submit" variant="outline" disabled={disabled}>
          {t('Adicionar metadados', 'Add metadata')}
        </Button>
      </form>
    </section>
  );
}
