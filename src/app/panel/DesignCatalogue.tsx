import { LABELS } from '../../core/constants.js';
import { iso, addD } from '../../core/calendar.js';
import type { CSSProperties } from 'react';
import {
  Activity,
  Archive,
  ArrowUpDown,
  Bell,
  Calendar,
  ChartGantt,
  Check,
  CircleCheck,
  Copy,
  Ellipsis,
  Eye,
  FolderKanban,
  GitBranch,
  Heart,
  House,
  Inbox,
  Link,
  ListChecks,
  Lock,
  Mail,
  MessageSquare,
  Moon,
  Paperclip,
  Pencil,
  Plus,
  Repeat,
  Search,
  Settings,
  Share2,
  Star,
  Sun,
  Tag,
  Timer,
  Trash2,
  Upload,
  Users,
  Info,
  TriangleAlert,
  CircleAlert,
  Bold,
  Italic,
  List,
  ListOrdered,
  Heading,
  X,
  LayoutGrid,
  Table2,
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { TaskStatusIcon, TaskPriorityIcon } from '../tasks/TaskVisual';
import { priorityLabel, statusLabel } from '../tasks/TaskList';
import { MemberStack, ProjectStatus } from '../projects/ProjectVisual';
import { MiniTasks, PersonAvatar, ProgressBar, relativeDate } from './PanelVisual';
import type { PanelProps } from './types';
export function DesignCatalogue(p: PanelProps & { onModal: () => void; onConfirm: () => void; onToast: (error?: boolean) => void }) {
  const { t } = p;
  const sampleTasks = p.snapshot.tasks.some(task => task.id === 't3' && !task.archived)
    ? p.snapshot.tasks.filter(task => task.id === 't3' && !task.archived)
    : p.snapshot.tasks.filter(task => !task.archived).slice(0, 1);
  const colors = [
    [t('Fundo', 'Background'), 'bg'],
    [t('Barra lateral', 'Sidebar'), 'bg-side'],
    [t('Superfície', 'Surface'), 'surface'],
    [t('Superfície 2', 'Surface 2'), 'surface-2'],
    [t('Superfície 3', 'Surface 3'), 'surface-3'],
    [t('Borda', 'Border'), 'border'],
    [t('Borda forte', 'Border strong'), 'border-strong'],
    [t('Texto', 'Text'), 'text'],
    [t('Texto 2', 'Text 2'), 'text-2'],
    [t('Texto 3', 'Text 3'), 'text-3'],
    [t('Destaque', 'Accent'), 'accent'],
    [t('Sucesso', 'Success'), 'green'],
    [t('Aviso', 'Warning'), 'amber'],
    [t('Erro', 'Error'), 'red'],
  ];
  return (
    <>
      <section className="ds-sec">
        <h2>
          {t('Cores', 'Color')} <span>{t('Tokens semânticos para cada tema', 'Semantic tokens, redefined per theme')}</span>
        </h2>
        <div className="ds-grid">
          {colors.map(([label, token]) => (
            <div className="ds-tok" key={token}>
              <div className="c" style={{ '--c': `var(--${token})` } as CSSProperties} />
              <div className="n">
                <span>{label}</span>
                <code>--{token}</code>
              </div>
            </div>
          ))}
        </div>
      </section>
      <section className="ds-sec">
        <h2>
          {t('Status e prioridade', 'Status & priority')} <span>{t('Sempre com texto ou dica', 'Always paired with text or a tooltip')}</span>
        </h2>
        <div className="ds-row">
          {(['backlog', 'todo', 'progress', 'review', 'done'] as const).map(status => (
            <span key={status} className="pillbtn bordered">
              <TaskStatusIcon status={status} />
              {statusLabel(status, t)}
            </span>
          ))}
        </div>
        <div className="ds-row">
          {(['urgent', 'high', 'medium', 'low', 'none'] as const).map(priority => (
            <span key={priority} className="pillbtn bordered">
              <TaskPriorityIcon priority={priority} />
              {priorityLabel(priority, t)}
            </span>
          ))}
        </div>
        <div className="ds-row">
          {LABELS.map(label => (
            <span className="lbl" key={label.id}>
              <i style={{ '--c': label.c } as CSSProperties} />
              {label.name}
            </span>
          ))}
        </div>
      </section>
      <section className="ds-sec">
        <h2>
          {t('Tipografia', 'Typography')} <span>Geist · Geist Mono</span>
        </h2>
        <div className="panel ds-typography">
          {[
            [t('Título da página', 'Page title'), 'var(--fs-2xl)', 'var(--fw-semibold)', t('Novo site', 'Website Redesign')],
            [t('Título de seção', 'Section title'), 'var(--fs-xl)', 'var(--fw-semibold)', t('Prazos próximos', 'Upcoming deadlines')],
            [t('Subseção', 'Subsection'), 'var(--fs-md)', 'var(--fw-semibold)', t('Subtarefas', 'Subtasks')],
            [t('Corpo', 'Body'), 'var(--fs)', 'var(--fw-regular)', t('Wireframes da nova página inicial.', 'Low-fidelity wireframes for the new homepage.')],
            [t('Secundário', 'Secondary'), 'var(--fs-sm)', 'var(--fw-regular)', t('Atualizado há 38 minutos', 'Updated 38 minutes ago')],
            [t('Metadados', 'Metadata'), 'var(--fs-xs)', 'var(--fw-medium)', t('WEB-109 · Para amanhã', 'WEB-109 · Due tomorrow')],
            [t('Rótulo', 'Label'), 'var(--fs-2xs)', 'var(--fw-semibold)', t('ESPAÇO', 'WORKSPACE')],
          ].map(([label, size, weight, example]) => (
            <div className="row" key={label}>
              <span className="faint ds-type-label">{label}</span>
              <span className="grow trunc" style={{ fontSize: size, fontWeight: weight }}>
                {example}
              </span>
              <code className="mono faint">
                {size.replace('var(', '').replace(')', '')} / {weight === 'var(--fw-semibold)' ? '600' : weight === 'var(--fw-medium)' ? '500' : '400'}
              </code>
            </div>
          ))}
        </div>
      </section>
      <section className="ds-sec">
        <h2>
          {t('Espaçamento, raio e sombra', 'Spacing, radius, elevation')} <span>{t('Escala de 4 pontos', '4pt scale')}</span>
        </h2>
        <div className="grid2">
          <div className="panel ds-spacing">
            {[1, 2, 3, 4, 5, 6, 8, 10, 12].map(n => (
              <div className="row" key={n}>
                <code className="mono faint">--s-{n}</code>
                <span style={{ width: `var(--s-${n})` }} />
                <span className="faint">{n * 4}px</span>
              </div>
            ))}
          </div>
          <div className="panel row ds-radius">
            {[
              ['xs', '4'],
              ['sm', '6'],
              ['', '8'],
              ['lg', '10'],
            ].map(([suffix, value]) => (
              <div className="col" key={value}>
                <span style={{ borderRadius: `var(--r${suffix ? '-' + suffix : ''})` }} />
                <span className="faint">{value}px</span>
              </div>
            ))}
            {['card', 'pop', 'drag'].map(shadow => (
              <div className="col" key={shadow}>
                <span style={{ boxShadow: `var(--shadow-${shadow})` }} />
                <span className="faint">{shadow}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="ds-sec">
        <h2>
          {t('Botões', 'Buttons')} <span>{t('Primário · Secundário · Discreto · Destrutivo · Ícone', 'Primary · Secondary · Ghost · Destructive · Icon')}</span>
        </h2>
        {(['default', 'outline', 'ghost', 'destructive'] as const).map(variant => (
          <div className="ds-row" key={variant}>
            <span className="lab">
              {
                {
                  default: t('Primário', 'Primary'),
                  outline: t('Secundário', 'Secondary'),
                  ghost: t('Discreto', 'Ghost'),
                  destructive: t('Destrutivo', 'Destructive'),
                }[variant]
              }
            </span>
            {['Default', 'Hover', 'Active', 'Focus', 'Disabled', 'Loading'].map(state => (
              <div className="col" key={state}>
                <span className="faint ds-control-state">
                  {
                    {
                      Default: t('Padrão', 'Default'),
                      Hover: t('Ponteiro', 'Hover'),
                      Active: t('Ativo', 'Active'),
                      Focus: t('Foco', 'Focus'),
                      Disabled: t('Desabilitado', 'Disabled'),
                      Loading: t('Carregando', 'Loading'),
                    }[state]
                  }
                </span>
                <Button
                  variant={variant}
                  className={state === 'Loading' ? 'is-loading' : ['Hover', 'Active', 'Focus'].includes(state) ? 'state-' + state.toLowerCase() : ''}
                  disabled={state === 'Disabled'}
                >
                  {variant === 'default'
                    ? t('Criar tarefa', 'Create task')
                    : variant === 'outline'
                      ? t('Compartilhar', 'Share')
                      : variant === 'ghost'
                        ? t('Filtrar', 'Filter')
                        : t('Excluir', 'Delete')}
                </Button>
              </div>
            ))}
          </div>
        ))}
        <div className="ds-row">
          <span className="lab">{t('Ícone', 'Icon')}</span>
          {[Plus, Search, Ellipsis, Star, Share2, Settings].map((Icon, index) => (
            <Button className="ibtn" variant="ghost" key={index} aria-label={t('Exemplo de ícone', 'Icon example') + index}>
              <Icon size={16} />
            </Button>
          ))}
          <Button className="btn-sm" variant="outline">
            {t('Pequeno', 'Small')}
          </Button>
          <Button variant="outline">{t('Médio', 'Medium')}</Button>
          <Button className="btn-lg" variant="outline">
            {t('Grande', 'Large')}
          </Button>
          <Button className="ibtn" variant="ghost" disabled aria-label={t('Ícone desabilitado', 'Disabled icon')}>
            <Trash2 size={16} />
          </Button>
        </div>
      </section>
      <section className="ds-sec">
        <h2>{t('Campos', 'Inputs')}</h2>
        <div className="panel ds-inputs">
          <label className="field">
            <span>{t('Texto', 'Text')}</span>
            <Input placeholder={t('Nome da tarefa', 'Task name')} />
          </label>
          <label className="field">
            <span>{t('Foco', 'Focus')}</span>
            <Input className="state-focus" defaultValue={t('Wireframes da página inicial', 'Homepage wireframes')} />
          </label>
          <label className="field">
            <span>{t('Erro', 'Error')}</span>
            <Input className="is-error" defaultValue="alex@" />
            <span className="err">{t('Informe um email válido', 'Enter a valid email address')}</span>
          </label>
          <label className="field">
            <span>{t('Desabilitado', 'Disabled')}</span>
            <Input defaultValue="hello@gr8rstudio.com" disabled />
          </label>
          <label className="field">
            <span>{t('Busca', 'Search')}</span>
            <Input placeholder={t('Buscar tarefas', 'Search tasks')} />
          </label>
          <label className="field">
            <span>{t('Seleção', 'Select')}</span>
            <select className="select">
              <option>{t('Em andamento', 'In Progress')}</option>
              <option>{t('Revisão', 'Review')}</option>
            </select>
          </label>
          <label className="field">
            <span>{t('Data', 'Date')}</span>
            <Input type="date" defaultValue={iso(addD(new Date(), 3))} />
          </label>
          <div className="field">
            <span>{t('Seleção múltipla', 'Multi-select')}</span>
            <div className="input ds-multiselect">
              {p.snapshot.labels.slice(0, 3).map(label => (
                <span className="lbl" key={label.id}>
                  {label.name}
                </span>
              ))}
              <span className="faint">{t('Adicionar', 'Add')}…</span>
            </div>
          </div>
          <label className="field">
            <span>{t('Hora', 'Time')}</span>
            <Input type="time" defaultValue="14:30" />
          </label>
          <div className="field">
            <span>{t('Caixa de seleção · Opção · Alternância', 'Checkbox · Radio · Toggle')}</span>
            <div className="row">
              <input className="check" type="checkbox" defaultChecked aria-label={t('Seleção de exemplo', 'Checkbox example')} />
              <input className="check" type="checkbox" aria-label={t('Seleção vazia de exemplo', 'Unchecked example')} />
              <input className="check round" type="checkbox" defaultChecked aria-label={t('Seleção redonda de exemplo', 'Round checkbox example')} />
              <input
                className="radio"
                type="radio"
                name="gallery-radio"
                defaultChecked
                aria-label={t('Opção selecionada de exemplo', 'Selected radio example')}
              />
              <input className="radio" type="radio" name="gallery-radio" aria-label={t('Opção de exemplo', 'Radio example')} />
              <input className="toggle" type="checkbox" defaultChecked aria-label={t('Alternância ligada de exemplo', 'Enabled toggle example')} />
              <input className="toggle" type="checkbox" aria-label={t('Alternância de exemplo', 'Toggle example')} />
            </div>
          </div>
          <label className="field">
            <span>{t('Área de texto', 'Textarea')}</span>
            <textarea className="textarea" rows={2} defaultValue={t('Adicione uma descrição', 'Add a description')} />
          </label>
          <div className="field">
            <span>{t('Texto formatado', 'Rich text')}</span>
            <div className="rte ds-richtext">
              <div className="rte-tb">
                {[Bold, Italic, List, ListOrdered, Heading, Link].map((Icon, index) => (
                  <span className="ibtn ibtn-xs" key={index}>
                    <Icon size={13} />
                  </span>
                ))}
              </div>
              <div className="rte-body">
                <b>{t('Negrito', 'Bold')}</b>, <i>{t('itálico', 'italic')}</i> {t('e listas.', 'and lists.')}
              </div>
            </div>
          </div>
        </div>
      </section>
      <section className="ds-sec">
        <h2>{t('Navegação', 'Navigation')}</h2>
        <div className="grid2 ds-navigation">
          <div className="side ds-sidebar">
            <Button className="sitem" variant="ghost" onClick={() => p.go('home')}>
              <House size={16} />
              <span>{t('Início', 'Home')}</span>
            </Button>
            <Button className="sitem on" variant="ghost" onClick={() => p.go('inbox')}>
              <Inbox size={16} />
              <span>{t('Caixa de entrada (ativa)', 'Inbox (active)')}</span>
              <span className="ct dotc">3</span>
            </Button>
            <Button className="sitem state-hover" variant="ghost" onClick={() => p.go('mytasks')}>
              <CircleCheck size={16} />
              <span>{t('Minhas tarefas (ponteiro)', 'My Tasks (hover)')}</span>
            </Button>
            <div className="sitem">
              <span className="pico">
                <FolderKanban size={12} />
              </span>
              <span>{p.snapshot.projects[0]?.name ?? t('Projeto de exemplo', 'Sample project')}</span>
              <span className="sdot" />
            </div>
          </div>
          <div className="col ds-navigation-main">
            <nav className="crumbs ds-crumbs" aria-label={t('Caminho de exemplo', 'Sample breadcrumbs')}>
              <Button variant="ghost" onClick={() => p.go('home')}>
                {p.workspace.name}
              </Button>
              <span className="sep">/</span>
              <Button variant="ghost" onClick={() => p.go('projects')}>
                {t('Projetos', 'Projects')}
              </Button>
              <span className="sep">/</span>
              <span className="cur">{p.snapshot.projects[0]?.name ?? '—'}</span>
            </nav>
            <div className="tabs">
              {[t('Visão geral', 'Overview'), t('Quadro', 'Board'), t('Lista', 'List'), t('Tabela', 'Table')].map((label, index) => (
                <Button key={label} className={'tab' + (index === 1 ? ' on' : '')} variant="ghost">
                  {label}
                </Button>
              ))}
            </div>
            <div className="row">
              <div className="seg">
                <Button className="on" variant="ghost">
                  <LayoutGrid size={13} />
                  {t('Grade', 'Grid')}
                </Button>
                <Button variant="ghost">
                  <List size={13} />
                  {t('Lista', 'List')}
                </Button>
                <Button variant="ghost">
                  <Table2 size={13} />
                  {t('Tabela', 'Table')}
                </Button>
              </div>
              <span className="chip">
                <TaskStatusIcon status="progress" />
                <b>{t('Status', 'Status')}</b> {t('é', 'is')} <span>{t('Em andamento', 'In Progress')}</span>
                <X size={12} />
              </span>
            </div>
          </div>
        </div>
      </section>
      <section className="ds-sec">
        <h2>{t('Dados', 'Data display')}</h2>
        <div className="grid2 ds-data">
          <div className="ds-board-sample">
            {sampleTasks.map(task => (
              <article className="kcard" key={task.id}>
                <button className="task-title" onClick={() => p.openTask(task.id)}>
                  {task.title}
                </button>
                <div className="meta">
                  <span className="key">{task.key}</span>
                  <TaskPriorityIcon priority={task.priority} />
                  <span className="m num">
                    <Calendar size={12} />
                    {relativeDate(task.dueDate, p)}
                  </span>
                  <PersonAvatar member={p.snapshot.members.find(member => member.user_id === task.assigneeUserId)} />
                </div>
              </article>
            ))}
          </div>
          <div className="col ds-data-main">
            <div className="ds-row">
              <span className="lab">{t('Avatar', 'Avatar')}</span>
              {p.snapshot.members.slice(0, 6).map((member, index) => (
                <PersonAvatar key={member.user_id} member={member} size={index > 3 ? 'lg' : index > 2 ? 'md' : 'sm'} />
              ))}
              <PersonAvatar />
              <MemberStack ids={p.snapshot.members.slice(0, 6).map(member => member.user_id)} members={p.snapshot.members} max={4} size="md" />
            </div>
            <div className="ds-row">
              <span className="lab">{t('Indicador', 'Badge')}</span>
              {['', 'accent', 'green', 'amber', 'red'].map((tone, index) => (
                <span className={'badge ' + tone} key={tone}>
                  {index === 2 && <span className="dot" />}
                  {[t('Padrão', 'Default'), t('Destaque', 'Accent'), t('Ativo', 'Active'), t('Convidado', 'Invited'), t('3 atrasadas', '3 overdue')][index]}
                </span>
              ))}
              <ProjectStatus status="active" t={t} />
              <ProjectStatus status="risk" t={t} />
            </div>
            <div className="ds-row">
              <span className="lab">{t('Progresso', 'Progress')}</span>
              <ProgressBar value={64} name="64%" />
              <ProgressBar value={100} name="100%" tone="green" />
              <ProgressBar value={30} name="30%" tone="red" />
            </div>
            <div className="panel">
              <MiniTasks tasks={p.snapshot.tasks.filter(task => !task.archived).slice(0, 2)} p={p} />
            </div>
          </div>
        </div>
      </section>
      <section className="ds-sec">
        <h2>{t('Retorno da interface', 'Feedback')}</h2>
        <div className="col ds-alerts">
          <div className="alert info">
            <Info size={15} />
            <span>
              <b>{t('Atenção.', 'Heads up.')}</b>{' '}
              {t('Dependências fora de ordem aparecem tracejadas.', 'Timeline dependencies are shown as dashed when out of order.')}
            </span>
          </div>
          <div className="alert ok">
            <CircleCheck size={15} />
            <span>
              {t('Projeto arquivado.', 'Project archived.')}{' '}
              <button className="inline-link" onClick={() => p.onToast()}>
                {t('Desfazer exemplo', 'Undo sample')}
              </button>
            </span>
          </div>
          <div className="alert warn">
            <TriangleAlert size={15} />
            <span>{t('3 tarefas desta semana ainda não começaram.', '3 tasks due this week are not started.')}</span>
          </div>
          <div className="alert danger">
            <CircleAlert size={15} />
            <span>
              {t('Não foi possível salvar as alterações.', 'Your changes could not be saved.')}{' '}
              <button className="inline-link" onClick={() => p.onToast(true)}>
                {t('Tentar exemplo', 'Try sample')}
              </button>
            </span>
          </div>
        </div>
        <div className="ds-row">
          <span className="lab">{t('Ações de exemplo', 'Triggers')}</span>
          <Button variant="outline" onClick={() => p.onToast()}>
            {t('Mensagem', 'Toast')}
          </Button>
          <Button variant="outline" onClick={() => p.onToast(true)}>
            {t('Mensagem de erro', 'Error toast')}
          </Button>
          <Button variant="outline" title={t('Dicas acompanham botões com ícones', 'Tooltips pair with icon buttons')}>
            {t('Dica', 'Tooltip')}
          </Button>
          <Button variant="outline" onClick={p.onModal}>
            {t('Modal', 'Modal')}
          </Button>
          <Button variant="outline" disabled={!p.snapshot.tasks.length} onClick={() => p.openTask(p.snapshot.tasks[0].id)}>
            {t('Painel', 'Drawer')}
          </Button>
          <Button variant="outline" onClick={p.onConfirm}>
            {t('Confirmação', 'Confirmation')}
          </Button>
          <Button variant="outline" onClick={() => document.dispatchEvent(new CustomEvent('gr8r:palette'))}>
            {t('Menu de comandos', 'Command menu')}
          </Button>
        </div>
      </section>
      <section className="ds-sec">
        <h2>
          {t('Ícones', 'Iconography')} <span>Lucide · 1.8px · 12–18px</span>
        </h2>
        <div className="panel ds-icons">
          {[
            House,
            Inbox,
            CircleCheck,
            Star,
            Search,
            Bell,
            FolderKanban,
            ListChecks,
            Calendar,
            ChartGantt,
            Users,
            Activity,
            Settings,
            Plus,
            ArrowUpDown,
            Share2,
            Ellipsis,
            Paperclip,
            MessageSquare,
            Tag,
            Link,
            Copy,
            Pencil,
            Trash2,
            Archive,
            Upload,
            Repeat,
            Timer,
            GitBranch,
            Lock,
            Eye,
            Mail,
            Sun,
            Moon,
            Heart,
            Check,
          ].map((Icon, index) => (
            <span key={index}>
              <Icon size={17} />
            </span>
          ))}
        </div>
      </section>
    </>
  );
}
