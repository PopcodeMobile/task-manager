/* ---------- seed data ---------- */
import { dOff, minsAgo, uid } from '../core/utils.js';

export function seed() {
  const members = [
    {
      id: 'm1',
      name: 'Rafael Costa',
      email: 'rafael@exemplo.com',
      role: 'Owner',
      team: 'product',
      title: 'Líder de produto',
      c: '#5A67D8',
      status: 'active',
      last: 0,
      tz: 'San Francisco',
    },
    {
      id: 'm2',
      name: 'Marina Alves',
      email: 'marina@exemplo.com',
      role: 'Admin',
      team: 'design',
      title: 'Líder de design',
      c: '#C54B78',
      status: 'active',
      last: 4,
      tz: 'New York',
    },
    {
      id: 'm3',
      name: 'João Pereira',
      email: 'joao@exemplo.com',
      role: 'Member',
      team: 'eng',
      title: 'Desenvolvedor frontend',
      c: '#3B82C4',
      status: 'active',
      last: 22,
      tz: 'London',
    },
    {
      id: 'm4',
      name: 'Camila Santos',
      email: 'camila@exemplo.com',
      role: 'Member',
      team: 'design',
      title: 'Designer de produto',
      c: '#23918A',
      status: 'active',
      last: 9,
      tz: 'Berlin',
    },
    {
      id: 'm5',
      name: 'Juliana Rocha',
      email: 'juliana@exemplo.com',
      role: 'Member',
      team: 'mkt',
      title: 'Estrategista de conteúdo',
      c: '#C48A1E',
      status: 'active',
      last: 95,
      tz: 'Toronto',
    },
    {
      id: 'm6',
      name: 'Lucas Ferreira',
      email: 'lucas@exemplo.com',
      role: 'Member',
      team: 'eng',
      title: 'Desenvolvedor backend',
      c: '#8662C9',
      status: 'active',
      last: 240,
      tz: 'Singapore',
    },
    {
      id: 'm7',
      name: 'Ana Oliveira',
      email: 'ana@exemplo.com',
      role: 'Admin',
      team: 'product',
      title: 'Líder de qualidade',
      c: '#3D8E5F',
      status: 'active',
      last: 1500,
      tz: 'Munich',
    },
    {
      id: 'm8',
      name: 'Diego Souza',
      email: 'diego@exemplo.com',
      role: 'Guest',
      team: 'mkt',
      title: 'Redator freelancer',
      c: '#C0612B',
      status: 'invited',
      last: null,
      tz: 'Madrid',
    },
  ];
  const projects = [
    {
      id: 'p1',
      key: 'WEB',
      name: 'Redesign do site',
      icon: 'globe',
      color: 'indigo',
      status: 'active',
      team: 'design',
      lead: 'm2',
      due: dOff(24),
      start: dOff(-30),
      fav: true,
      members: ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7'],
      desc: 'Reorganizar o site com uma navegação clara, interfaces responsivas e um blog mais rápido.',
      milestones: [
        { name: 'Wireframes aprovados', date: dOff(2) },
        { name: 'Entrega para desenvolvimento', date: dOff(14) },
        { name: 'Lançamento público', date: dOff(24) },
      ],
      last: 12,
    },
    {
      id: 'p2',
      key: 'MOB',
      name: 'Aplicativo móvel',
      icon: 'smartphone',
      color: 'blue',
      status: 'active',
      team: 'eng',
      lead: 'm3',
      due: dOff(52),
      start: dOff(-45),
      fav: true,
      members: ['m1', 'm3', 'm4', 'm6', 'm7'],
      desc: 'Aplicativo para equipes em campo, com sincronização offline, notificações e acesso por biometria.',
      milestones: [
        { name: 'Versão beta', date: dOff(9) },
        { name: 'Envio para a App Store', date: dOff(45) },
      ],
      last: 48,
    },
    {
      id: 'p3',
      key: 'MKT',
      name: 'Campanha de marketing',
      icon: 'megaphone',
      color: 'rose',
      status: 'planning',
      team: 'mkt',
      lead: 'm5',
      due: dOff(40),
      start: dOff(-10),
      fav: false,
      members: ['m1', 'm4', 'm5', 'm7', 'm8'],
      desc: 'Campanha de divulgação com mídia paga, email e apresentação online para lideranças de operações.',
      milestones: [
        { name: 'Aprovação das peças', date: dOff(12) },
        { name: 'Campanha no ar', date: dOff(21) },
      ],
      last: 130,
    },
    {
      id: 'p4',
      key: 'LCH',
      name: 'Lançamento do produto',
      icon: 'rocket',
      color: 'amber',
      status: 'risk',
      team: 'product',
      lead: 'm1',
      due: dOff(12),
      start: dOff(-21),
      fav: false,
      members: ['m1', 'm2', 'm3', 'm5', 'm7'],
      desc: 'Coordenar o lançamento: preços, documentação, imprensa e preparação da equipe comercial.',
      milestones: [
        { name: 'Decisão de lançamento', date: dOff(11) },
        { name: 'Dia do lançamento', date: dOff(12) },
      ],
      last: 35,
    },
    {
      id: 'p5',
      key: 'DS',
      name: 'Sistema de design',
      icon: 'component',
      color: 'violet',
      status: 'active',
      team: 'design',
      lead: 'm2',
      due: dOff(70),
      start: dOff(-60),
      fav: false,
      members: ['m2', 'm3', 'm4'],
      desc: 'Estilos, componentes e documentação compartilhados entre as equipes web e mobile.',
      milestones: [{ name: 'Tokens da versão 2', date: dOff(3) }],
      last: 300,
    },
    {
      id: 'p6',
      key: 'CP',
      name: 'Portal do cliente',
      icon: 'building-2',
      color: 'teal',
      status: 'hold',
      team: 'eng',
      lead: 'm6',
      due: dOff(90),
      start: dOff(-5),
      fav: false,
      members: ['m6', 'm7'],
      private: true,
      desc: 'Portal de cobrança e suporte para clientes. Acesso restrito durante a revisão do contrato.',
      milestones: [],
      last: 2880,
    },
    {
      id: 'p7',
      key: 'MW',
      name: 'Site institucional',
      icon: 'layout-grid',
      color: 'green',
      status: 'complete',
      team: 'mkt',
      lead: 'm5',
      due: dOff(-18),
      start: dOff(-80),
      fav: false,
      members: ['m1', 'm3', 'm5'],
      desc: 'Site da nova versão. Publicado e entregue à equipe web para manutenção.',
      milestones: [],
      last: 26000,
    },
  ];
  let n = 0;
  const T = [];
  const t = (p, title, status, a, prio, due, labels = [], x = {}) => {
    const proj = projects.find(q => q.id === p);
    const count = T.filter(q => q.project === p).length + 1;
    T.push(
      Object.assign(
        {
          id: 't' + ++n,
          key: proj.key + '-' + (100 + count * 3),
          project: p,
          title,
          status,
          assignee: a,
          priority: prio,
          due: due == null ? null : dOff(due),
          start: due == null ? null : dOff(due - (x.len || 4)),
          labels,
          subtasks: [],
          attachments: [],
          deps: [],
          desc: '',
          estimate: x.est || null,
          created: minsAgo(60 * 24 * (x.age || 12)),
          updated: minsAgo(60 * (x.upd || 30)),
          order: n,
          fav: false,
          recur: null,
        },
        x,
      ),
    );
  };
  // Redesign do site
  t('p1', 'Auditar a navegação atual', 'done', 'm2', 'high', -12, ['research'], { est: '2d', len: 5, age: 28 });
  t('p1', 'Resumir entrevistas com as áreas envolvidas', 'done', 'm1', 'medium', -9, ['research'], { est: '1d', age: 26 });
  t('p1', 'Criar wireframes da página inicial', 'review', 'm2', 'high', 1, ['design'], {
    est: '3d',
    len: 7,
    fav: true,
    desc: '<p>Wireframes da nova página inicial para <b>computador, tablet e celular</b>.</p><ul><li>Apresentação do produto</li><li>Marcas de clientes e resultados</li><li>Resumo das funcionalidades com links para as páginas do produto</li></ul><p>Consultar a auditoria de navegação antes de definir a estrutura.</p>',
    subtasks: [
      { id: 's1', title: 'Layout para computador', done: true },
      { id: 's2', title: 'Layout para tablet', done: true },
      { id: 's3', title: 'Layout para celular', done: true },
      { id: 's4', title: 'Documentar interações', done: false },
    ],
    attachments: [
      { id: 'a1', name: 'homepage-wireframes-v3.fig', type: 'fig', size: '4.2 MB', by: 'm2', at: minsAgo(300) },
      { id: 'a2', name: 'nav-audit-findings.pdf', type: 'pdf', size: '860 KB', by: 'm2', at: minsAgo(8000) },
    ],
  });
  t('p1', 'Finalizar a navegação', 'progress', 'm3', 'high', 0, ['design', 'frontend'], {
    est: '2d',
    len: 4,
    subtasks: [
      { id: 's5', title: 'Estrutura da navegação principal', done: true },
      { id: 's6', title: 'Conteúdo do menu expandido', done: false },
      { id: 's7', title: 'Comportamento do menu no celular', done: false },
    ],
  });
  t('p1', 'Desenhar a navegação responsiva', 'progress', 'm4', 'medium', 3, ['design'], {
    est: '3d',
    len: 6,
    subtasks: [
      { id: 's8', title: 'Regras de responsividade', done: true },
      { id: 's9', title: 'Estados do cabeçalho fixo', done: false },
    ],
  });
  t('p1', 'Preparar tokens do sistema de design', 'todo', 'm1', 'medium', 6, ['design'], { est: '2d', len: 4 });
  t('p1', 'Revisar layouts responsivos', 'todo', 'm4', 'medium', 8, ['qa', 'design'], { est: '1d', len: 3 });
  t('p1', 'Preparar a entrega para desenvolvimento', 'todo', 'm2', 'high', 14, ['frontend'], { est: '2d', len: 4, deps: ['t3', 't5'] });
  t('p1', 'Desenhar a introdução do aplicativo', 'progress', 'm4', 'urgent', -1, ['design'], {
    est: '3d',
    len: 6,
    subtasks: [
      { id: 's10', title: 'Telas de boas-vindas', done: true },
      { id: 's11', title: 'Solicitações de permissão', done: false },
      { id: 's12', title: 'Estados vazios', done: false },
    ],
  });
  t('p1', 'Escrever o texto da página inicial', 'backlog', 'm5', 'low', 18, ['content'], { est: '2d' });
  t('p1', 'Configurar eventos de análise', 'backlog', 'm6', 'medium', 20, ['backend', 'growth'], { est: '1d' });
  t('p1', 'Auditar acessibilidade dos modelos', 'backlog', 'm7', 'high', 22, ['qa'], { est: '2d' });
  t('p1', 'Construir a seção principal', 'todo', 'm3', 'medium', 10, ['frontend'], { est: '2d', len: 3, deps: ['t3'] });
  t('p1', 'Otimizar o processamento de imagens', 'review', 'm6', 'low', 2, ['backend'], { est: '1d', len: 5 });
  t('p1', 'Registrar a reunião semanal de design', 'todo', 'm1', 'low', 2, ['content'], { recur: 'Weekly', est: '30m', len: 0 });
  t('p1', 'Migrar o blog para o novo CMS', 'backlog', 'm3', 'medium', 28, ['backend'], { est: '5d', len: 8 });
  t('p1', 'Criar rodapé e páginas legais', 'done', 'm5', 'low', -5, ['frontend'], { est: '1d' });
  t('p1', 'Corrigir links quebrados na página de preços', 'done', 'm3', 'medium', -3, ['bug'], { est: '2h', len: 1 });
  // Aplicativo móvel
  t('p2', 'Prototipar o fluxo de introdução', 'progress', 'm4', 'high', 4, ['design'], { est: '3d', len: 6 });
  t('p2', 'Implementar notificações push', 'progress', 'm6', 'high', 6, ['backend'], { est: '5d', len: 9 });
  t('p2', 'Sincronizar o modo offline', 'todo', 'm3', 'urgent', 5, ['frontend', 'backend'], { est: '8d', len: 10, deps: ['t20'] });
  t('p2', 'Preparar imagens para a App Store', 'backlog', 'm5', 'low', 40, ['content'], { est: '1d' });
  t('p2', 'Configurar relatórios de falhas', 'done', 'm6', 'medium', -8, ['backend'], { est: '1d' });
  t('p2', 'Implementar acesso por biometria', 'review', 'm3', 'high', 2, ['frontend'], { est: '3d', len: 6 });
  t('p2', 'Redesenhar a tela de configurações', 'todo', 'm4', 'medium', 9, ['design'], { est: '2d' });
  t('p2', 'Avaliar comentários dos usuários beta', 'todo', 'm1', 'medium', 0, ['research'], { est: '4h', len: 1, recur: 'Weekly' });
  t('p2', 'Corrigir falha ao girar a tela no Android 12', 'todo', 'm3', 'urgent', 1, ['bug'], { est: '1d', len: 1 });
  // Campanha de marketing
  t('p3', 'Preparar o briefing da campanha', 'done', 'm5', 'medium', -6, ['content'], { est: '1d' });
  t('p3', 'Escrever o texto da página de campanha', 'progress', 'm5', 'medium', 4, ['content'], { est: '2d' });
  t('p3', 'Criar peças para mídia paga', 'todo', 'm4', 'high', 7, ['design', 'growth'], { est: '3d', len: 5 });
  t('p3', 'Preparar a sequência de emails', 'todo', 'm8', 'medium', 9, ['content'], { est: '2d' });
  t('p3', 'Listar influenciadores para contato', 'backlog', 'm7', 'low', null, ['growth']);
  t('p3', 'Preparar os slides de lançamento', 'todo', 'm1', 'medium', 15, ['content'], { est: '2d' });
  t('p3', 'Aprovar o orçamento', 'review', 'm1', 'urgent', -2, [], { est: '1h', len: 1 });
  // Lançamento do produto
  t('p4', 'Conferir a preparação do lançamento', 'progress', 'm1', 'urgent', 3, ['qa'], {
    est: '1d',
    len: 10,
    subtasks: [
      { id: 's20', title: 'Documentação publicada', done: true },
      { id: 's21', title: 'Preços publicados', done: false },
      { id: 's22', title: 'Suporte treinado', done: false },
      { id: 's23', title: 'Página de status atualizada', done: true },
    ],
  });
  t('p4', 'Atualizar a página de preços', 'todo', 'm2', 'high', 6, ['design', 'frontend'], { est: '2d' });
  t('p4', 'Escrever o comunicado à imprensa', 'review', 'm5', 'medium', 1, ['content'], { est: '1d' });
  t('p4', 'Preparar materiais para vendas', 'todo', 'm7', 'medium', 8, ['content'], { est: '2d' });
  t('p4', 'Escrever as notas da versão', 'backlog', 'm3', 'low', 11, ['content'], { est: '4h' });
  t('p4', 'Realizar a reunião de decisão', 'todo', 'm1', 'high', 11, [], { est: '1h', len: 0 });
  // Sistema de design
  t('p5', 'Atualizar tokens de cores', 'done', 'm2', 'high', -4, ['design'], { est: '3d' });
  t('p5', 'Auditar os componentes de botão', 'progress', 'm2', 'medium', 5, ['design', 'frontend'], { est: '2d' });
  t('p5', 'Definir estados dos campos de formulário', 'todo', 'm4', 'medium', 12, ['design'], { est: '3d' });
  t('p5', 'Organizar a biblioteca de ícones', 'backlog', 'm4', 'low', null, ['design']);
  t('p5', 'Criar o site de documentação', 'todo', 'm3', 'medium', 20, ['frontend'], { est: '5d', len: 8 });
  t('p5', 'Definir a paleta do modo escuro', 'review', 'm2', 'high', 2, ['design'], { est: '2d' });
  // Site institucional (complete)
  t('p7', 'Validar o site de lançamento', 'done', 'm3', 'high', -20, ['qa']);
  t('p7', 'Preparar o vídeo da nova versão', 'done', 'm5', 'medium', -24, ['content']);
  // Customer portal (restricted)
  t('p6', 'Definir o contrato da integração de cobrança', 'todo', 'm6', 'high', 30, ['backend']);

  const tk = id => T.find(x => x.id === id);
  // completed metadata
  T.filter(x => x.status === 'done').forEach((x, i) => (x.completedAt = minsAgo(60 * (6 + i * 17))));
  const comments = [
    {
      id: 'c1',
      task: 't3',
      by: 'm4',
      at: minsAgo(260),
      text: 'A faixa de marcas está apertada no tablet. Podemos mostrar quatro marcas abaixo de 1024px?',
      re: { '👍': ['m2', 'm3'] },
    },
    { id: 'c2', task: 't3', by: 'm2', at: minsAgo(210), text: 'Ajustei na versão 3. @Rafael Costa, consegue revisar até quinta?', re: {} },
    {
      id: 'c3',
      task: 't3',
      by: 'm3',
      at: minsAgo(95),
      text: 'O espaçamento segue a escala de 8 pontos. Não há impedimentos para o desenvolvimento.',
      re: { '🎉': ['m2'] },
    },
    { id: 'c4', task: 't4', by: 'm3', at: minsAgo(400), text: 'Ainda falta o conteúdo do menu. Vou deixar uma versão provisória.', re: {} },
    {
      id: 'c5',
      task: 't4',
      by: 'm5',
      at: minsAgo(120),
      text: '@João Pereira, o conteúdo está no documento compartilhado. Máximo de seis colunas.',
      re: { '👍': ['m3'] },
    },
    {
      id: 'c6',
      task: 't9',
      by: 'm1',
      at: minsAgo(55),
      text: 'O prazo passou ontem. @Camila Santos, existe algum impedimento nas solicitações de permissão?',
      re: {},
    },
    { id: 'c7', task: 't24', by: 'm7', at: minsAgo(700), text: 'A alternativa por senha ao Face ID funciona no iOS 17. Vou testar no Android.', re: {} },
    { id: 'c8', task: 't34', by: 'm2', at: minsAgo(1500), text: 'O financeiro precisa da divisão por canal antes de aprovar.', re: {} },
    {
      id: 'c9',
      task: 't35',
      by: 'm7',
      at: minsAgo(200),
      text: 'O treinamento do suporte passou para segunda. @Rafael Costa, confirme o texto da página de status.',
      re: {},
    },
  ];
  const A = (by, verb, task, project, m, extra = '') => ({ id: uid('a'), by, verb, task, project, at: minsAgo(m), extra });
  const activity = [
    A('m2', 'moved', 't3', 'p1', 38, 'to Review'),
    A('m3', 'completed', 't18', 'p1', 90),
    A('m4', 'commented on', 't19', 'p2', 140),
    A('m1', 'changed priority of', 't9', 'p1', 180, 'to Urgent'),
    A('m6', 'added a file to', 't14', 'p1', 260),
    A('m5', 'created', 't30', 'p3', 330),
    A('m2', 'assigned', 't8', 'p1', 420, 'to Marina Alves'),
    A('m7', 'completed', 't23', 'p2', 1300),
    A('m3', 'moved', 't24', 'p2', 1500, 'to Review'),
    A('m1', 'created project', null, 'p4', 30000),
    A('m2', 'created project', null, 'p1', 43000),
    A('m4', 'completed', 't41', 'p5', 5600),
    A('m5', 'completed', 't17', 'p1', 7200),
  ];
  const notifs = [
    {
      id: 'n1',
      type: 'mention',
      by: 'm2',
      task: 't3',
      text: 'mentioned you in',
      snippet: 'Atualizei na versão 3. @Rafael Costa, consegue revisar até quinta?',
      at: minsAgo(210),
      read: false,
    },
    { id: 'n2', type: 'assign', by: 'm3', task: 't28', text: 'assigned you', snippet: 'Vence hoje · Prioridade média', at: minsAgo(300), read: false },
    {
      id: 'n3',
      type: 'comment',
      by: 'm4',
      task: 't9',
      text: 'commented on',
      snippet: 'Solicitações de permissão need legal review — drafting now.',
      at: minsAgo(40),
      read: false,
    },
    {
      id: 'n4',
      type: 'mention',
      by: 'm7',
      task: 't35',
      text: 'mentioned you in',
      snippet: 'O treinamento do suporte passou para segunda. @Rafael Costa, confirme o texto da página de status.',
      at: minsAgo(200),
      read: false,
    },
    { id: 'n5', type: 'update', by: 'm2', task: 't3', text: 'moved to Review', snippet: 'To Do → Review', at: minsAgo(38), read: true },
    {
      id: 'n6',
      type: 'update',
      by: null,
      project: 'p4',
      text: 'Lançamento do produto está em risco',
      snippet: '3 tarefas desta semana ainda não começaram',
      at: minsAgo(600),
      read: false,
    },
    {
      id: 'n7',
      type: 'comment',
      by: 'm2',
      task: 't34',
      text: 'commented on',
      snippet: 'O financeiro precisa da divisão por canal antes de aprovar.',
      at: minsAgo(1500),
      read: true,
    },
    { id: 'n8', type: 'assign', by: 'm2', task: 't6', text: 'assigned you', snippet: 'Vence em 6 dias', at: minsAgo(2900), read: true },
    {
      id: 'n9',
      type: 'update',
      by: 'm3',
      task: 't18',
      text: 'completed',
      snippet: 'Corrigir links quebrados na página de preços',
      at: minsAgo(90),
      read: true,
    },
    { id: 'n10', type: 'update', by: null, task: 't28', text: 'is due today', snippet: 'Avaliar comentários dos usuários beta', at: minsAgo(20), read: false },
  ];
  const files = [
    { id: 'f1', project: 'p1', name: 'homepage-wireframes-v3.fig', type: 'fig', size: '4.2 MB', by: 'm2', at: minsAgo(300), task: 't3' },
    { id: 'f2', project: 'p1', name: 'nav-audit-findings.pdf', type: 'pdf', size: '860 KB', by: 'm2', at: minsAgo(8000), task: 't3' },
    { id: 'f3', project: 'p1', name: 'brand-photography-set.zip', type: 'zip', size: '128 MB', by: 'm4', at: minsAgo(3000) },
    { id: 'f4', project: 'p1', name: 'hero-exploration.png', type: 'img', size: '2.1 MB', by: 'm4', at: minsAgo(1400) },
    { id: 'f5', project: 'p1', name: 'content-inventory.xlsx', type: 'sheet', size: '310 KB', by: 'm5', at: minsAgo(9000) },
    { id: 'f6', project: 'p1', name: 'sitemap-v2.pdf', type: 'pdf', size: '540 KB', by: 'm1', at: minsAgo(12000) },
    { id: 'f7', project: 'p1', name: 'interview-notes.docx', type: 'doc', size: '96 KB', by: 'm1', at: minsAgo(20000) },
    { id: 'f8', project: 'p1', name: 'analytics-events.json', type: 'code', size: '12 KB', by: 'm6', at: minsAgo(700) },
    { id: 'f9', project: 'p2', name: 'onboarding-flow.fig', type: 'fig', size: '6.8 MB', by: 'm4', at: minsAgo(500) },
    { id: 'f10', project: 'p2', name: 'beta-feedback.xlsx', type: 'sheet', size: '220 KB', by: 'm1', at: minsAgo(900) },
    { id: 'f11', project: 'p3', name: 'campaign-brief.pdf', type: 'pdf', size: '1.1 MB', by: 'm5', at: minsAgo(4000) },
    { id: 'f12', project: 'p4', name: 'launch-plan.docx', type: 'doc', size: '180 KB', by: 'm1', at: minsAgo(6000) },
  ];
  const events = [
    { id: 'e1', title: 'Revisão de design', date: dOff(1), time: '10:00', project: 'p1' },
    { id: 'e2', title: 'Planejamento da sprint', date: dOff(5), time: '09:30', project: 'p2' },
    { id: 'e3', title: 'Alinhamento do lançamento', date: dOff(0), time: '15:00', project: 'p4' },
    { id: 'e4', title: 'Apresentação para as áreas envolvidas', date: dOff(9), time: '14:00', project: 'p1' },
    { id: 'e5', title: 'Início da campanha', date: dOff(-3), time: '11:00', project: 'p3' },
    { id: 'e6', title: 'Retrospectiva', date: dOff(12), time: '16:00', project: 'p2' },
  ];
  const tmp = tk('t3');
  tmp.updated = minsAgo(38);
  return {
    ws: { name: 'Gr8r Studio', url: 'gr8rstudio', c: '#1D1C1A', brand: true },
    workspaces: [
      { id: 'w1', name: 'Gr8r Studio', c: '#1D1C1A', plan: 'Team', brand: true },
      { id: 'w2', name: 'Pessoal', c: '#3D8E5F', plan: 'Free' },
      { id: 'w3', name: 'Acme Labs', c: '#3B82C4', plan: 'Business' },
    ],
    me: 'm1',
    members,
    projects,
    tasks: T,
    comments,
    activity,
    notifs,
    files,
    events,
    projOrder: projects.map(p => p.id),
    savedViews: [{ id: 'v1', project: 'p1', name: 'Alta prioridade', type: 'list', filters: [{ f: 'priority', op: 'is', v: ['urgent', 'high'] }] }],
    recentSearches: ['página inicial', 'Marina', 'wireframes'],
    sessions: [
      { id: 'se1', dev: 'MacBook Pro · Chrome', loc: 'San Francisco, US', at: 'Active now', cur: true },
      { id: 'se2', dev: 'iPhone 15 · Gr8r app', loc: 'San Francisco, US', at: '2 hours ago' },
      { id: 'se3', dev: 'Windows · Edge', loc: 'Oakland, US', at: 'Sep 12' },
    ],
    invoices: [
      { id: 'INV-2026-009', date: dOff(-23), amt: '$96.00', st: 'Paid' },
      { id: 'INV-2026-008', date: dOff(-53), amt: '$96.00', st: 'Paid' },
      { id: 'INV-2026-007', date: dOff(-84), amt: '$80.00', st: 'Paid' },
      { id: 'INV-2026-006', date: dOff(-114), amt: '$80.00', st: 'Paid' },
    ],
    tfa: false,
    notifPrefs: {
      email_mention: true,
      email_assign: true,
      email_digest: true,
      email_comment: false,
      push_mention: true,
      push_assign: true,
      push_comment: true,
      push_due: true,
      mention_all: true,
      assign_self: true,
    },
  };
}
