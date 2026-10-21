# Plataforma de agentes: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** permitir que Hermes e os Claudes de cada usuário coordenem tarefas por MCP, com eventos para Hermes e supervisão em React.

**Architecture:** Supabase é o backend completo. API e MCP nas Edge Functions compartilham operações transacionais sobre PostgreSQL normalizado; Auth/OAuth e RLS preservam identidade e acesso. Webhooks são entregues por fila persistente, sem executar agentes neste produto.

**Tech Stack:** React, TypeScript, Vite, shadcn/ui, Supabase PostgreSQL/Auth/Edge Functions/Queues/Cron, SDK oficial MCP, Deno, Node test runner, Playwright.

**Spec:** [Desenho e critérios de aceite](../specs/2026-10-20-agent-platform-design.md).

Estado: escopo completo aprovado pelo usuário; execução por etapas autorizada.

## Global Constraints

- Agentes são os usuários principais; Hermes e Claude executam externamente.
- Sem servidor Node separado nem TanStack Start nesta migração.
- Preservar IDs legados texto, dados, referências, PT-BR padrão/inglês e design tokens.
- Nenhum segredo em arquivo versionado, browser, payload de evento ou log.
- API/MCP usam a mesma autorização e regras; PostgreSQL garante invariantes e concorrência.
- Não manter snapshot e tabelas normalizadas como writers independentes.
- Sem importação automática de demonstração local, uploads de bytes ou gestão de modelos.
- Não executar migração remota sem identificar e revisar o projeto de destino.
- Dependências novas devem ser versões estáveis compatíveis com Node >=22.12 e Deno 2;
  registrar versões exatas no lockfile. Verificar documentação oficial antes de instalar.
- Cada etapa termina com verificação independente; ativação cloud é separada de prova local.

## Review Focus

- Token OAuth revogado ou membership removida: negar mesmo com JWT ainda válido.
- Dois clientes com o mesmo ID legado: relações nunca atravessam workspace.
- Agente que volta após perder reserva: não altera a execução assumida por outro.
- Falha entre commit da tarefa e entrega: evento persiste e repetição não duplica efeito.
- Navegador legado aberto durante corte: escrita antiga é recusada sem apagar dados novos.

## Sequência e interfaces

Etapas 1 a 4 e o complemento 4a entregam o backend em ambiente de teste; 5 e 6 migram e validam a UI;
7 ativa clientes reais. A migração de um workspace em uso só ocorre quando o frontend
normalizado cobre seus fluxos e o export de recuperação foi validado.

Contrato comum, a definir em `src/domain/contracts.ts` na etapa 1:

```ts
type EntityRef = { workspaceId: string; id: string };
type Command<T> = {
  workspaceId: string;
  idempotencyKey: string;
  expectedVersion?: number;
  input: T;
};
type Actor = { userId: string; clientId: string | null; connectionId: string | null };
type CommandResult<T> = { data: T; eventId: string; requestId: string };
type Page<T> = { items: T[]; nextCursor: string | null };
```

Ator só é produzido por autenticação validada, nunca por JSON do cliente. O nome
das propriedades em contratos novos é camelCase, mapeado para snake_case no SQL.
`Task` expõe ao menos `id`, `workspaceId`, `projectId`, `title`, `description`,
`status`, `priority`, `version`, `assigneeUserId`, `executorAgentId`, `updatedAt`.
Demais campos e entidades seguem o inventário da spec e os modelos atuais.

### Task 1: banco normalizado e corte sem perda de dados

**Arquivos:** criar `src/domain/contracts.ts`, `src/domain/legacy-map.ts`,
`supabase/migrations/202610200001_normalized_work.sql`,
`tests/normalized-sql.test.js`, `tests/legacy-map.test.mjs`,
`supabase/tests/normalized-rls.sql`; modificar `src/workspace/supabase.js` apenas
quando o novo repositório estiver pronto e `docs/adr/0001-workspace-storage.md`
para apontar a substituição implementada.

**Interfaces:** produzir tipos de domínio, `inspectLegacyWorkspace(payload)` e
`migrate_workspace(workspace_id, expected_snapshot_revision)` restrita à administração.
O diagnóstico retorna contagens, IDs duplicados, órfãos e campos sem mapeamento.
O migrador é transacional e idempotente. O snapshot original fica somente leitura.

- [x] Escrever testes que aplicam a migração sobre o schema antigo e exigem:
      preservação de `p1/t1`, FKs com workspace, status/prioridades válidos, duas
      migrações sem duplicatas e aborto integral com referência inválida.
      Adicionar favoritos/notificações com autoria comprovada: só o autor recebe os
      valores pessoais; outro membro permanece sem esses valores. Sem autoria, nenhum
      membro recebe valores pessoais e o snapshot original mantém o estado antigo.
- [x] Executar `node --test tests/normalized-sql.test.js tests/legacy-map.test.mjs`
      e registrar a falha esperada por ausência do modelo/migrador.
- [x] Implementar tabelas, índices, mapeamento e versão de armazenamento da spec.
      Copiar todos os campos existentes ou preservá-los em metadata validada. Não
      inventar usuários Auth para referências locais fictícias.
- [x] Impedir `save_workspace_snapshot` após corte. Testar navegador antigo tentando
      gravar contra workspace migrado e garantir que versões e registros novos não mudam.
- [x] Testar membership, guest, outsider, relações cruzadas e revogação em PostgreSQL
      real, estendendo `supabase/tests/run-postgres.sh` com seleção de suíte.
- [x] Passar testes novos e `npm test`; obter revisão independente de SQL e dados.
- [x] Commit: `feat(database): normalize workspace entities and preserve legacy data`.

### Task 2: operações transacionais, API e identidade de agente

**Arquivos:** criar `supabase/migrations/202610200002_agent_operations.sql`,
`supabase/functions/_shared/{auth,errors,validation,operations}.ts`,
`supabase/functions/api/index.ts`, `supabase/functions/deno.json`,
`supabase/functions/tests/{api,operations}.test.ts`, `tests/agent-sql.test.js`.
Modificar `supabase/config.toml` para habilitar Edge Runtime no ambiente de teste.

**Interfaces:** `authenticate(request): Promise<Actor>` valida token real;
`executeCommand(actor, operation, command): Promise<CommandResult<unknown>>`
consome o contrato da etapa 1. SQL produz RPCs transacionais para CRUD, comentários,
claim/renew/release/complete e paginação; entradas e saídas têm schemas explícitos.
API usa `/api/v1/workspaces/:workspaceId/...` e inclui request ID nos erros.

- [x] Escrever testes para duas reservas simultâneas, lease de 15 minutos, retomada
      após expiração, conclusão por executor antigo, intervenção humana e conflito de versão.
      Cobrir tentativa de concluir por update_task, troca de executor sem intervenção
      e escrita de agente sem lease, inclusive via RPC direta.
- [x] Escrever testes para mesma idempotency key/payload com um evento; payload
      diferente com conflito; replay após revogação proibido; geração concorrente de
      chaves de projeto, recorrência e referências inválidas sem efeitos parciais.
- [x] Executar os testes e registrar falhas pela ausência das operações.
- [x] Implementar autorização no banco e funções compartilhadas, com autoria do
      servidor e tarefas/eventos/fila na mesma transação. Proibir DML direto que burle
      versionamento ou auditoria; proteger igualmente todas as RPCs expostas.
- [x] Implementar API paginada e limites por ator/conexão; não confiar em ator
      enviado no payload nem usar service-role nas operações de usuários.
- [x] Passar `deno test --allow-env --allow-net supabase/functions/tests/`,
      `npm test`, suíte SQL real e revisão independente dos caminhos de autorização.
- [x] Commit: `feat(api): add transactional task operations and agent claims`.

### Task 3: MCP remoto, OAuth e consentimento individual

**Arquivos:** criar `supabase/functions/mcp/{index,tools}.ts`,
`supabase/migrations/202610200003_integration_grants.sql`,
`supabase/functions/tests/{mcp,oauth}.test.ts`,
`src/app/{main,App}.tsx`, `src/app/auth/{ConsentPage,AuthProvider}.tsx`,
`src/app/integrations/{ConnectionsPage,client}.ts*`, `src/components/ui/`,
`components.json`, `tsconfig.json`, `react.html`; modificar `package.json`,
`package-lock.json`, `vite.config.js`, `eslint.config.js`, `supabase/config.toml`.
Não importar listeners ou renderer globais do frontend legado na nova raiz.

**Interfaces:** MCP consome `authenticate` e `executeCommand`, com as 12 ferramentas
da spec. Consentimento usa a API OAuth do Supabase e persiste grants vinculados a
usuário/cliente/workspace antes de aprovar. Recusa ou falha não deixa grant ativo.
Painel permite revogar conexão e visualizar capacidades concedidas.

- [x] Escrever teste de transporte MCP real listando e chamando ferramentas com
      token válido; negar token ausente, expirado, emissor/audience incorretos e grants ausentes.
- [x] Escrever testes com dois usuários Claude simulados por OAuth real local,
      mesmo client_id e workspaces distintos; revogar grant/membership e provar negação
      em API, MCP e PostgREST/RPC sem depender da expiração do token.
      Verificar que grant de escrita cria executor vinculado à conexão, enquanto
      conexão somente leitura não cria executor nem pode reservar trabalho.
- [x] Executar testes para demonstrar falha antes de implementar o MCP e os grants.
- [x] Instalar dependências compatíveis, iniciar React/TS/shadcn em entrypoint
      independente, mapear tokens existentes e implementar `/oauth/consent` com login,
      escolha de acesso, aprovação, recusa e conexão revogável.
- [x] Implementar MCP stateless com SDK oficial e middleware Supabase; adaptar
      descoberta OAuth e autenticar as chamadas dentro da função. Não desabilitar auth
      simplesmente para fazer um cliente conectar.
- [x] Passar `npm run typecheck`, testes Deno/MCP, testes OAuth locais e Playwright
      de consentimento; revisão independente de grants e tratamento de callbacks.
- [x] Commit: `feat(mcp): expose authenticated tools and user oauth connections`.

### Task 4: eventos persistentes e webhooks compatíveis com Hermes

**Arquivos:** criar `supabase/migrations/202610200004_webhook_delivery.sql`,
`supabase/functions/webhook-dispatch/index.ts`,
`supabase/functions/_shared/{webhook-signing,webhook-targets,webhook-delivery}.ts`,
`supabase/functions/tests/webhook-delivery.test.ts`,
`tests/webhook-sql.test.js`, `docs/hermes-integration.md`.

**Interfaces:** `dispatchWebhookBatch()` consome fila pgmq; cada entrega guarda
tentativa, próxima execução, resposta resumida e estado terminal.
`signHermesWebhook(secret, timestamp, rawBody)` produz Generic V2 da spec.
Subscription é administrada por owner/admin, referenciando segredo no Vault.

- [x] Escrever teste com receptor HTTP verificando HMAC, timestamp e payload;
      primeira resposta 503, depois 200; manter `event_id` e `X-Request-ID`, com assinatura
      renovada e uma tarefa/evento no banco. Simular timeout após aceite do receptor.
- [x] Testar oito tentativas, `Retry-After`, falha terminal, reenvio manual,
      bloqueio de destino privado/metadata/redirect e exclusão de eventos do próprio agente.
- [x] Executar testes e observar falhas esperadas antes de implementar dispatcher.
- [x] Implementar Vault, fila, worker em lotes e agendamento autenticado. A fila
      só confirma sucesso após resposta aceita; retenção e deduplicação não dependem de RAM.
- [x] Passar testes Deno, SQL real, simulação de crash entre envio e confirmação
      e revisão independente; documentar configuração Hermes sem segredos reais.
- [x] Commit: `feat(webhooks): deliver signed task events to external agents`.

### Task 4a: completar os contratos exigidos pela paridade do painel

Complemento identificado pela comparação estática do frontend existente com a API
normalizada após as etapas 2/3. Corrige lacunas do escopo já aprovado antes de construir
as telas; não acrescenta funcionalidades ao produto. Evidência de preparação em
[notas permanentes de paridade](../../verification/agent-platform/ui-api-parity-notes.md).

**Arquivos:** criar `supabase/migrations/202610200005_ui_contracts.sql`, testes de
contratos/concorrência em `tests/` e `supabase/tests/`; modificar somente os contratos
`src/domain/contracts.ts`, validação/operações compartilhadas, API/OpenAPI e testes
necessários. Não editar migrations já aplicadas nem o frontend nesta fatia.

**Interfaces:** leitura autorizada de execução retorna somente
`{agentId, claimedAt, expiresAt, active}`, sem `claimToken`; distingue atribuição de
reserva. Operações em lote são atômicas, restritas a um workspace e no máximo 100
comandos, com chave de idempotência do lote e versões dos registros afetados. Usam
a mesma autorização, leases, auditoria e outbox das operações individuais.

- [x] Reproduzir os gaps em testes antes de alterar a implementação: leitura segura
      de reserva, limpar descrição, detalhes de subtarefa, excluir comentário,
      rollback/replay de lote, recorrência e configuração de workspace.
- [x] Expor metadados seguros de reserva a humanos e leitores autorizados; nenhuma
      leitura, evento, erro ou lote pode devolver o token privado da reserva.
- [x] Permitir atribuição, prazo e nota de subtarefa com CAS/reserva da tarefa pai;
      preservar os valores históricos sem inventar vínculos com usuários Auth.
      Descrições podem ser limpas; títulos/nomes vazios continuam inválidos.
- [x] Permitir exclusão autorizada de comentário com autoria do servidor, controle
      de versão apropriado e evento imutável; não criar remoção genérica sem política.
- [x] Implementar o envelope transacional de lote para ações existentes compostas:
      edição em massa, ações de coluna, relações e promoção de subtarefa. Um conflito
      aborta tudo, inclusive efeitos, eventos, fila e deduplicação; repetição não duplica.
- [x] Alinhar recorrência ao comportamento existente: somente gerar sucessora se
      houver recorrência e prazo, Monthly equivale a 30 dias, início da sucessora
      igual ao novo prazo e detalhes de subtarefas preservados com done resetado.
- [x] Atualizar nome/slug/cor de workspace somente por humano owner/admin, com
      versão, validação e auditoria. Não reabrir writer de snapshot ou grants OAuth.
- [x] Passar testes Node/Deno e PostgreSQL real nos caminhos alterados, incluindo
      revogação, isolamento, rollback de lote e novo outbox da etapa 4; revisão
      independente de contrato e autorização antes de iniciar a etapa 5.
- [x] Commit: `fix(api): complete contracts for existing panel workflows`.

### Task 4d: precondição autoritativa de relações de equipe

**Arquivos:** nova migration008 aditiva, validação/schema compartilhados, handlers locais e testes SQL/Deno/local focados. Não alterar migrations001–007 já revisadas/deployadas, engine/fanout/OAuth, políticas ou UI.

**Contrato:** acrescentar `expectedMemberships?: Array<{ userId: string; teamIds: string[] }>` SOMENTE a create_team/update_team. Quando fornecido, comparar o conjunto exato de relações atuais de cada usuário com teamIds sob o mutex de workspace existente e ANTES das escritas desse comando. Divergência retorna version_conflict sem qualquer escrita/evento/receipt parcial. Sem a propriedade, contratos publicados preservam comportamento, inclusive capacidade de múltiplas equipes. Não mudar set/remove_team_member nem adicionar ferramenta MCP. Esse é um guard de snapshot explícito para composição do painel, não uma nova unicidade global.

- [x] RED reproduz dois planos que selecionam o mesmo usuário inicialmente sem equipe, A→B serializados, e exige que a segunda substituição com guard stale falhe integralmente. Cobrir relação em equipe criada após baseline e membro já selecionado, além de sucesso após revisão explícita.
- [x] Validar estritamente forma, IDs com formato compatível, propriedades desconhecidas, duplicatas de usuários/teamIds e isolamento. Ordem dos conjuntos não importa; [] declara ausência para aquele usuário. Lista vazia de guards é válida. Referências de baseline com formato válido mas usuário removido ou equipe/relação desaparecida/estrangeira são version_conflict, comparando somente a workspace atual; não exigir existência atual de cada teamId esperado. Forma inválida/duplicatas/unknowns são validation_error. Não fabricar Auth para referências históricas. Usar limites de payload existentes; nenhum agregado/chunk sem limite ou incremento artificial de versões.
- [x] SQL guard sob lock atual, idealmente comparação set-based/indexável. Helper privado/ACLs/GraphQL/PostgREST revisados; engine e evento normal create/update preservados. Não aumentar versões de equipes não modificadas só para assert.
- [x] Guard aplicado antes de mutações do comando dentro do batch; composição do painel o colocará no primeiro create/update_team e depois suas remoções/inclusões. Batch continua <=100/262144, uma transação. Replay autorizado devolve receipt anterior sem reexecutar guard já satisfeito; revogação atual continua negando.
- [x] Adapter local espelha contrato a partir da autoridade member.team e pure localTeams; validação/falha não altera bytes/revision, unknowns preservados. Não corrigir reset ou outros findings UI nesta etapa.
- [x] Provar em PostgreSQL real as duas requisições e rollback do batch, compatibilidade sem guard, tenant/guest/agent/replay, warm007 antes de008 e acesso privado. Testes focados Deno/shared/local, typecheck/lint/scopedformat/build se afetados. Não repetir suítes passing sem motivo.
- [x] Reportar arquivos/commit/hash008/comandos/resultados/logs e limites; revisão independente e deploy congelado local/hosted por root antes de retomar6c.
- [x] Commit `feat(api): guard team membership baselines atomically`.

### Task 5: painel React de supervisão e trabalho

**Arquivos:** criar `src/app/workspaces/`, `src/app/tasks/`, `src/app/projects/`,
`src/app/agents/`, `src/app/activity/`, `src/app/shell/`,
`src/workspace/normalized.ts`, `tests/browser/agent-panel.spec.ts`;
modificar `src/app/App.tsx`, estilos/tokens somente onde necessário e catálogos PT/EN.

**Interfaces:** novo repositório chama a API da etapa 2 por queries/commands;
sessão/workspace formam as chaves de cache e escopo das atualizações. Estado de
interface vive em React. O painel usa os mesmos Command/Task/Actor da etapa 1.

- [x] Escrever Playwright para login/workspace, criar/editar tarefa, lista/quadro,
      drawer, comentário, atribuição a agente, ver execução bloqueada e retomada humana.
- [x] Adicionar casos de versão desatualizada, erro de rede, mudança de workspace
      durante request e logout; nenhum resultado atrasado reidrata a identidade anterior.
      Verificar preferências pessoais vazias quando a autoria legada não puder ser
      recuperada, com estado compartilhado preservado no snapshot original.
- [x] Executar a suíte nova e observar falhas antes das telas novas.
- [x] Implementar componentes reais, overlays shadcn, ícones React e navegação por
      URL. Preservar temas, densidade e PT/EN; rich text é sanitizado, títulos são texto.
- [x] Atualizar atividade após alteração por MCP sem exigir reload manual, usando
      polling com invalidação e interrupção ao trocar sessão/workspace; Realtime fica
      opcional se os testes demonstrarem necessidade.
- [x] Passar typecheck, testes de domínio/browser e auditoria visual em claro/escuro,
      PT/EN e mobile; revisão independente comparando o painel atual e os fluxos novos.
- [x] Commit: `feat(ui): add react task supervision and agent integration screens`.

### Task 6: paridade das superfícies atuais e corte do frontend

**Arquivos:** criar os módulos React restantes de `src/app/` para as rotas atuais;
modificar `index.html`, `playwright.config.js`, `tests/browser/`, `scripts/check-tokens.mjs`,
`README.md`, `docs/design-system.md`, `docs/supabase-setup.md`, `CONTEXT.md` e CI.
Remover módulos legados somente quando a superfície equivalente estiver coberta.

**Interfaces:** manter o contrato de dados e API; portar calendário, timeline,
arquivos/metadados, equipes/membros, busca, favoritos, notificações, arquivos mortos,
settings e catálogo de tokens. Views salvas e todas as oito abas têm teste explícito.
Local demo ganha adaptador React separado, sem simular sucesso cloud.

- [ ] Converter testes existentes baseados em `window.__gr8r` para ações visíveis
      de usuário e adicionar inventário cobrindo as 21 rotas registradas, o fallback 404, abas e autenticação.
- [ ] Executar esses testes contra o novo entrypoint e registrar as lacunas reais.
- [ ] Portar por fatias completas, preservar a demonstração local e preferências,
      substituir renderer/router/event listeners antigos e manter importação manual de
      dados locais condicionada ao mapeamento de membros e visibilidade.
- [ ] Atualizar auditor de tokens para TS/TSX sem relaxar suas garantias; tratar
      aliases/shadcn/Tailwind na configuração de build, lint e typecheck.
      Testar edição/recarga da demo local em React sem conta cloud; integrações devem
      informar indisponibilidade local em vez de simular conexão ou entrega.
- [ ] Passar `npm run check`, `npm run typecheck`, `npm run test:e2e`, Deno e
      PostgreSQL real. Rodar build com e sem configuração cloud e verificar bundle
      sem segredos nem logs de debug. Revisão independente de paridade e acessibilidade.
- [ ] Commit: `refactor(ui): finish react migration and retire legacy rendering`.

A etapa 6 será executada pelos quatro gates sequenciais abaixo. O escopo e o
aceite acima continuam obrigatórios; cada gate tem implementador novo e revisão
independente antes do seguinte. O entrypoint antigo só sai no último gate.

### Task 6a: repositório local React e preservação dos dados do navegador

**Arquivos:** adaptador local normalizado em `src/workspace/`, interface de
repositório compartilhada com o adapter cloud, pontos de injeção do shell/auth e
testes locais. Não remover o entrypoint legado, alterar backend ou implementar
agora todas as rotas restantes.

**Interfaces:** consumir o contrato final da etapa 5; reusar os helpers puros de
storage/domínio quando apropriado, sem renderer/router/listeners legados em React.
O shell recebe uma interface de repositório, sem depender de um cliente cloud
concreto para funcionar localmente.

- [x] Escrever testes RED para dados antigos `gr8r.v2` e `gr8r.workspaces.v1`,
      preservação de IDs/grafo/metadados/preferências e revisão de armazenamento.
- [x] Implementar queries e commands locais dos fluxos existentes sobre o storage
      atual, incluindo lote atômico, recorrência e relações, com conflito/draft
      preservado. Sem reset silencioso, import cloud automático ou Auth fictício.
- [x] Abrir o shell React em demonstração local sem configuração cloud; criar,
      editar, comentar, trocar workspace e recarregar preservando dados. Integrações
      explicam a exigência de cloud e não simulam conexão/entrega.
- [x] Verificar preferências por identidade/workspace, idioma anterior ao login,
      isolamento de resposta atrasada e armazenamento corrompido/indisponível.
- [x] Documentar a interface consumida por 6b/6c; testes focados e revisão independente.
- [x] Commit: `feat(ui): preserve local workspaces in the react panel`.

### Task 6b: fluxos completos de tarefas e projetos

**Arquivos:** módulos React de tarefas/projetos, componentes compartilhados de
calendário/timeline/arquivos/views, rotas correspondentes e testes de comportamento.
Não remover legado. Reusar adapter/interface da etapa 6a. As exceções de backend
são os pré-requisitos contratuais 4b e 4c abaixo, revisados antes das UIs dependentes.

**Interfaces:** cumprir o inventário [inventário permanente](../../verification/agent-platform/task-6-route-inventory.md) para todas as ações
de tarefas/projetos e as oito abas mais views salvas; componentes compartilhados
servem as rotas globais de calendário, timeline e arquivos sem duplicar regras.

- [x] Escrever RED de fluxos ainda ausentes: filtros/ordenação/colunas/grupos,
      seleção e lote, movimento/duplicação/recorrência, dependências/subtarefas,
      labels/reações/anexos e ações do drawer. Cobrir conflitos e relações protegidas.
- [x] Portar as abas de projeto e views salvas com seus comportamentos reais,
      calendário/timeline e metadados de arquivos, criação/edição/arrasto existentes.
      Campos de título/nome são texto; conteúdo rico mantém sanitização explícita.
- [x] Preservar templates, notas, membros e ações de projeto no limite cloud/local
      original; bytes de upload e novas políticas de privacidade continuam fora.
- [x] Rodar testes visíveis de mutação, reload e escopo nos adapters local/cloud,
      PT/EN, claro/escuro e mobile; render smoke isolado não comprova os fluxos.
- [x] Testes focados, revisão independente e contrato dos componentes para 6c.
- [x] Commit: `feat(ui): complete react task and project workflows`.

A etapa 6b agrega os cinco gates menores abaixo. As superfícies existentes só
serão consideradas completas após 6b4, com cobertura acumulada de todos os gates.
Cada gate mantém revisão independente; nenhum remove legado. Mudança de backend
fica limitada aos pré-requisitos 4b e 4c, sem ampliar políticas ou ferramentas MCP.

### Task 6b0: fronteira tipada e handlers locais coesos

**Arquivos:** fronteira `App`/`RepositoryFactory`, declaração do adaptador local,
dispatcher e módulos de handlers por família em `src/workspace/`, testes.

- [x] Reproduzir a ausência de checagem estrutural removendo o double cast;
      declarar o contrato local de forma verificável pelo TypeScript/JSDoc.
- [x] Extrair handlers coesos de tarefas/projetos/comentários/subtarefas/relações,
      preservando uma única transação/validação/CAS/idempotência/evento por comando.
      Não criar framework genérico, novos comandos ou superfícies neste gate.
- [x] Preservar os 32 casos locais atuais, incluindo import concorrente,
      versões retornadas, recorrência efetiva e writer legado; verificar o shell
      local/cloud nos pontos alterados e os DTOs consumidos pelos próximos gates.
- [x] Relatar interfaces, checks e limites; revisão independente e commit:
      `refactor(ui): type the local repository and split mutation handlers`.

### Task 6b1: lista, quadro, lote e ações sobre rascunhos

**Arquivos:** controles de tarefas/lista/quadro, estado de view, comandos compostos,
testes; extensões locais necessárias sem alterar backend.

- [x] Escrever RED e completar filtros/ordenação/colunas/grupos/seleção/arrasto e
      ações em lote do inventário, com persistência por workspace/view.
- [x] Completar movimento/duplicação/recorrência/arquivo morto e ações sobre tarefa
      com rascunho; salvar o estado efetivo e a ação por lote/CAS ordenado ou exigir
      salvamento explícito seguro. Não perder campos, reabrir tarefa por flush tardio
      ou fazer takeover implícito. Limites de lote são visíveis, sem aplicação parcial.
- [x] Provar mutações/reload/conflitos e guards em local/cloud, acessibilidade,
      PT/EN/temas/mobile; revisão independente e commit:
      `feat(ui): complete task views and composed actions`.

### Task 6b2: relações e detalhes completos do drawer

**Arquivos:** seções do drawer, projeções/comandos locais de labels/reações/anexos,
subtarefas/dependências, testes de comportamento.

- [x] Escrever RED e completar os detalhes/ações do inventário, incluindo labels,
      reações, anexos por metadados, subtarefas com detalhes e relações protegidas.
- [x] Preservar CAS de pai/registro, autoria, campos desconhecidos, sanitização de
      rich text e texto literal; exclusão exige unlink explícito das relações
      sobreviventes e intervenção continua explícita para reserva ativa.
- [x] Provar fluxos visíveis nos adapters local/cloud, retry/rollback e segurança
      de conteúdo; revisão independente e commit:
      `feat(ui): complete task detail and relation workflows`.

### Task 4b: pré-requisito de duplicação fiel dos metadados de arquivo

**Dependência descoberta durante 6b3:** executar e revisar antes de retomar sua UI.
**Arquivos:** migração aditiva `202610200006_file_duplication.sql`, validação/API
compartilhada e contrato DTO, handler/projeção local de arquivos, testes e contrato
OpenAPI necessário. Não editar migrações aplicadas 001–005, políticas ou UI 6b3.

- [x] Reproduzir RED: a cópia legada de arquivo preserva os campos desconhecidos e
      propriedade, renovando ID/nome/data/autor. `create_file` não oferece essa cópia.
- [x] Adicionar operação estrita `duplicate_file` com `input:{id,newId?,name?}` e
      `expectedVersion` do arquivo de origem. Servidor gera ID quando ausente;
      nome padrão reproduz `name.replace(/(\.[^.]+)$/, ' copy$1')`. Não aceitar
      autoria/data/metadata arbitrárias do cliente. Reusar autenticação, autoridade,
      transação, CAS, idempotência, limites, auditoria e evento existentes, sem
      ampliar acesso de agentes. Incluir em lote somente sob as mesmas garantias.
- [x] Copiar nome efetivo, projeto, tarefa proprietária, tipo, tamanho e metadata
      desconhecida. Renovar ID, data e autor com identidade real do servidor; os
      aliases legados desses campos também não podem manter autoria/data antiga.
      Não copiar joins de anexos. Preservar a origem e todos os seus vínculos.
      Local usa a mesma projeção/materialização canônica de 6b2, incluindo arquivo
      embutido, proprietário derivado e proprietário explicitamente nulo.
- [x] Declarar `createdAt` no DTO e projetá-lo localmente sem alterar bytes ao ler;
      campos históricos devem permanecer honestos e compatíveis com import legado.
- [x] Evitar duplicação verbatim do motor SQL: usar seam pequeno e privado se
      necessário; nenhuma função auxiliar pode ficar acessível por Data API.
- [x] Provar SQL/validação/local: metadata desconhecida, autoria/data renovadas,
      origem intacta, CAS stale, replay/colisão de chave e ID, tenant/autoridade,
      atomicidade/lote, reload e arquivo embutido. Preservar compiler guards reais.
      Rodar checks afetados e fornecer logs e hash de 006. Não repetir suítes amplas
      sem motivo nem mudar limites/timeouts para obter verde.
- [x] Revisão independente do commit; só depois root aplica 006 aditivamente em
      local/hosted e publica fonte revisada, com probes reais do novo contrato e
      regressão MCP existente. Worker não altera ambientes compartilhados.
- [x] Commit: `fix(api): preserve file metadata when duplicating`.

### Task 6b3: componentes globais e compartilhados de agenda e arquivos

**Arquivos:** calendário/timeline/arquivos React, projeções/comandos locais e rotas
globais, testes; componentes aceitam escopo opcional de projeto para 6b4.

- [x] Escrever RED e portar os comportamentos do inventário: calendário mês/semana,
      eventos/criação/data/arrasto/overflow, timeline/grupos/arrasto/duração e
      arquivos/pastas/filtros/metadados/ações existentes.
- [x] Preservar datas/escopo/estado após reload e emitir comandos seguros; uploads
      de bytes continuam fora do escopo e a UI respeita capacidades reais cloud/local.
- [x] Verificar mutações e uso móvel/teclado/PT/EN/temas nos dois adapters; revisão
      independente, contrato dos componentes para as abas e commit:
      `feat(ui): add shared react schedules and file workflows`.

### Task 4c: cópia atômica e completa do grafo de tarefa

**Dependência:** após o gate 6b3 e antes de 6b4. Corrigir a lacuna comprovada de
cópia de projetos/tarefas, mantendo os comandos já publicados estáveis.
**Arquivos:** migração aditiva `202610200007_task_graph_copy.sql`, validação e
OpenAPI, handler/projeção local, catálogo de invalidação e testes afetados.
A UI consumidora pertence a 6b4.

- [x] RED de cópia com subtarefa concluída e campos desconhecidos, labels,
      dependências e anexos com metadata de relação. O comando `duplicate_task`
      atual gera IDs desconhecidos ao próximo filho do lote, redefine subtarefas e
      omite relações; composição com create/set não preserva toda a metadata.
- [x] Adicionar comando estrito `duplicate_task_graph` com
      `input:{id,projectId,mode,title?,claimToken?}`, `mode:'task'|'project'`,
      `expectedVersion` da origem. IDs seguem o contrato explícito de 4b sem
      normalização; destino novo é gerado no servidor. Nada de metadata/status/
      autoria/data arbitrários do cliente, referências a resultados ou novos tools.
- [x] Copiar scalars/metadata desconhecida da tarefa, labels, subtarefas com detalhes
      e done atual, dependências para seus alvos originais e anexos com ordem e toda
      metadata da relação. Novos IDs de tarefa/subtarefas, nova chave do projeto.
      `mode:project` põe tarefa em todo; `mode:task` preserva o estado da origem como
      a duplicação individual legada. Não copiar comentários, arquivos globais,
      histórico, views ou eventos de calendário.
- [x] Origem e seus vínculos/versões ficam intactos; arquivos continuam com seu
      proprietário original. Local materializa a projeção canônica completa antes
      de criar vínculos que possam mudar a proveniência embutida. Não duplicar IDs
      de arquivos nem transportar um arquivo para a tarefa nova.
- [x] Cópia é entidade nova: created/updated atuais, não arquivada, sem executor,
      reserva ou execução herdados. Modo task com estado done mantém completedAt da
      origem se presente; outros casos limpam completedAt. Não gerar sucessor de
      recorrência por copiar. Aliases temporais históricos continuam na metadata.
      Favoritos são preferências pessoais e sua UX será composta em 6b4.
- [x] Reusar engine externo de autenticação/serialização/transação/receipts/limites/
      auditoria/outbox e helper existente de claim. Ramo privado de grafo pequeno
      pode copiar dados da origem; não duplicar verbatim o motor inteiro. CAS e
      autoridade da origem seguem `duplicate_task`, sem grant ampliado; replay
      revalida autorização atual. Payload/evento identifica a tarefa NOVA e o
      projeto explícito. Sem evento intermediário de um clone incompleto.
- [x] Incluir no lote atômico de até 100 filhos. Sem chunks parciais; 6b4 calcula
      count/payload antes de criar projeto. Preservar numbering, limites e rollback
      de entidades, receipts, versões, eventos, outbox e contadores. Não aumentar
      quotas ou timeouts para passar testes.
- [x] Provar local/SQL/shared: modos/status/tempos, unknowns/done/relações completas,
      proprietário derivado/nulo, sourceCAS/lease válida-expirada/intervenção atual,
      tenant/actor/grant/replay/revogação, lote create-project+copy e rollback/retry,
      chave/ID novos estáveis no replay e nenhuma execução/recorrência herdada.
      Cobrir semântica antiga de duplicate_task inalterada. Atualizar loaders e
      auditoria de helpers privados; rodar SQL PostgreSQL real e checks afetados.
- [x] Revisão independente antes de root aplicar 007 e publicar API/MCP congelados;
      validar endpoint real e regressão MCP. Worker não altera ambientes compartilhados.
- [x] Commit: `fix(api): preserve task graphs in atomic copies`.

### Task 6b4: projetos, oito abas e views salvas

**Arquivos:** coleção/opções/templates/projetos React, overview/notas/atividade e
composição das oito abas com componentes 6b1–6b3, views salvas e testes.

- [x] Escrever RED e completar criação/edição/templates/membros/opções existentes,
      overview/notas e todas as oito abas mais views salvas do inventário.
- [x] Usar o contrato 4c para cópias completas de projeto e individuais, preservando
      a UX de favoritos pessoais e limites atômicos antes de qualquer escrita.
- [x] Reusar agenda/arquivos/lista/quadro, manter escopo por projeto e preferências;
      não simular convites reais ou nova privacidade cloud.
- [x] Fechar matriz acumulada de toda a etapa 6b com mutações/reload/local/cloud,
      rich content/texto literal, acessibilidade e auditoria visual nos idiomas/temas.
- [x] Rodar regressões relevantes com worktree congelado, revisão independente e
      commit: `feat(ui): complete react project tabs and saved views`.

### Task 6c: demais rotas, preferências e administração do painel

**Arquivos:** módulos React restantes para home/my work, equipes/membros, busca,
favoritos, inbox/notificações, arquivo morto, settings, catálogo e states,
navegação e testes correspondentes. Sem remoção final do legado ou backend.

**Interfaces:** fechar os itens restantes do inventário preciso de rotas/abas/auth;
reusar 6a/6b. Settings respeita papel humano e capacidades efetivamente disponíveis.

- [x] Escrever RED e implementar os fluxos restantes de cada rota e subseção
      existente do inventário, incluindo edição, filtros, favoritos/leitura pessoais,
      restauração do arquivo morto e recuperação de falha/404.
- [x] Preservar preferências, perfil/demo local e dados ao reload/troca de workspace.
      Ações cloud indisponíveis são explícitas; sem sucesso fictício em convites,
      plano, modelos, sessões ou 2FA. Senha usa Auth real quando configurado.
- [x] Verificar todas as 21 rotas mais fallback e autenticação, com ações visíveis,
      acessibilidade/foco, PT/EN, temas e viewport móvel; atualizar matriz de paridade.
- [x] Testes focados e revisão independente antes do corte.
- [x] Commit: `feat(ui): complete remaining react panel surfaces`.

### Task 6d: corte React, auditoria de tokens, CI e prova de paridade

**Arquivos:** `index.html`, configuração Vite/Vercel/Playwright, auditor de tokens,
testes browser restantes, módulos legados substituídos, README/CONTEXT/docs/CI.

**Interfaces:** só retirar legado após os gates 6a–6c aprovados e cobertura equivalente.
Preservar callbacks/consentimento e demonstração local no entrypoint final.

- [x] Converter os testes legados restantes para ações visíveis sem `window.__gr8r`,
      manter todas as intenções do inventário e confirmar paridade sem renderer legado.
- [x] Atualizar auditor de tokens TS/TSX/Tailwind/shadcn sem relaxar garantias;
      fechar lint/types/build/configurações de rota e CI do frontend final.
- [x] Uniformizar somente a formatação dos arquivos Deno/backend revisados que
      ainda falham no Prettier global; comparar estrutura/tokenização para não mudar
      comportamento e executar os checks correspondentes. Lista exata no handoff.
- [x] Validar corte explícito de workspace antigo, negação do writer antigo e snapshot
      preservado. Sem import cloud automático ou rollback que perca escritas novas.
- [x] Passar check/typecheck/browser, Deno e PostgreSQL reais apropriados; builds com
      e sem configuração cloud, bundle sem segredos/logs e auditoria visual.
      Resultados ignorados/fixtures e uniões de execuções ficam identificados.
- [x] Aprovar revisão independente de Task6d (revisão scoped final em `fb881aa`).
- [ ] Aprovar revisão ampla final da branch pelo root.
- [x] Publicar matriz e provas permanentes; substituir ponteiros temporários do plano.
      Atualizar documentação da stack e limites, sem afirmar ativação real pendente.
- [x] Commit: `refactor(ui): finish react migration and retire legacy rendering`.

### Task 7: ativação no ambiente alvo e prova com clientes reais

**Arquivos:** atualizar `docs/verification.md`, `docs/supabase-setup.md`,
`docs/hermes-integration.md` e checklist deste plano; credenciais ficam fora do git.

**Interfaces:** projeto Supabase identificado; URL HTTPS do painel/consentimento,
URL MCP, projeto com OAuth habilitado e uma instalação Hermes acessível. Usuários
autorizam suas próprias conexões Claude; nenhuma conta ou assinatura é compartilhada.

- [ ] Conferir estado do projeto alvo, export de recuperação, versão de CLI,
      assinatura JWT assimétrica, OAuth/redirects, pgmq, Vault, Cron e permissões.
- [ ] Aplicar migrations/functions no ambiente de teste identificado, configurar
      segredos fora do git e executar os mesmos testes contra o serviço hospedado.
- [ ] Conectar Hermes real: tarefa atribuída → webhook aceito → MCP consulta/reserva
      → comentário/conclusão → histórico visível, incluindo uma falha e uma retomada.
- [ ] Conectar dois usuários Claude reais, testar isolamento e revogação, registrar
      evidências redigidas sem tokens/PII. Só marcar integração real após esse resultado.
- [ ] Fazer o corte de workspace após validar paridade e impedir escritores antigos.
      Não oferecer rollback com perda de escritas posteriores ao snapshot preservado.
- [ ] Revisão independente final; commit convencional, push e integração na main
      conforme as instruções do projeto. Reportar SHAs, verificações e pendências reais.

## Verificação inicial registrada

Antes de alterar produto, `npm run check` passou no checkout `d0c1557` em 2026-10-20:
lint e formatação aprovados, 32 testes passaram, um teste SDK cloud foi pulado por
ausência de configuração, auditoria de 234 tokens passou e build Vite concluiu.
Não representa teste de MCP/OAuth/Hermes/React, que ainda serão implementados.

Supabase CLI 2.121.0, Deno 2.9.7 e Node 24.21.0 estão instalados. A presença das
ferramentas não comprova Docker ativo, projeto remoto acessível ou clientes conectados.

## Provas permanentes após corte React

Gates6a–6c aprovados, incluindo6b0–6b4 e correções6c: [arquivo de relatórios e revisões](../../verification/agent-platform/README.md). O aggregate6b foi concluído pelos cinco commits/gates menores, não por um commit agregado adicional.

Task6d: [relatório de implementação e comandos](../../verification/agent-platform/task-6d-report.md); revisão independente do corte e revisão ampla final ainda pertencem ao root. Marcação de implementação não equivale a aprovação ou publicação.

Task7: backend hospedado até008/API/MCP e wake-up vazio possuem [prova própria](../../verification/agent-platform/hosted-preactivation-proof.md); Cron desabilitado, frontend/Auth/CORS de produção, Hermes real e dois usuários Claude reais continuam pendentes. [Hermes isolado5/5](../../verification/agent-platform/task-7-hermes-isolated-runtime.md) não substitui esses gates.
