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

Etapas 1 a 4 entregam o backend em ambiente de teste; 5 e 6 migram e validam a UI;
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

### Etapa 1: banco normalizado e corte sem perda de dados

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

- [ ] Escrever testes que aplicam a migração sobre o schema antigo e exigem:
      preservação de `p1/t1`, FKs com workspace, status/prioridades válidos, duas
      migrações sem duplicatas e aborto integral com referência inválida.
      Adicionar favoritos/notificações com autoria comprovada: só o autor recebe os
      valores pessoais; outro membro permanece sem esses valores. Sem autoria, nenhum
      membro recebe valores pessoais e o snapshot original mantém o estado antigo.
- [ ] Executar `node --test tests/normalized-sql.test.js tests/legacy-map.test.mjs`
      e registrar a falha esperada por ausência do modelo/migrador.
- [ ] Implementar tabelas, índices, mapeamento e versão de armazenamento da spec.
      Copiar todos os campos existentes ou preservá-los em metadata validada. Não
      inventar usuários Auth para referências locais fictícias.
- [ ] Impedir `save_workspace_snapshot` após corte. Testar navegador antigo tentando
      gravar contra workspace migrado e garantir que versões e registros novos não mudam.
- [ ] Testar membership, guest, outsider, relações cruzadas e revogação em PostgreSQL
      real, estendendo `supabase/tests/run-postgres.sh` com seleção de suíte.
- [ ] Passar testes novos e `npm test`; obter revisão independente de SQL e dados.
- [ ] Commit: `feat(database): normalize workspace entities and preserve legacy data`.

### Etapa 2: operações transacionais, API e identidade de agente

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

- [ ] Escrever testes para duas reservas simultâneas, lease de 15 minutos, retomada
      após expiração, conclusão por executor antigo, intervenção humana e conflito de versão.
      Cobrir tentativa de concluir por update_task, troca de executor sem intervenção
      e escrita de agente sem lease, inclusive via RPC direta.
- [ ] Escrever testes para mesma idempotency key/payload com um evento; payload
      diferente com conflito; replay após revogação proibido; geração concorrente de
      chaves de projeto, recorrência e referências inválidas sem efeitos parciais.
- [ ] Executar os testes e registrar falhas pela ausência das operações.
- [ ] Implementar autorização no banco e funções compartilhadas, com autoria do
      servidor e tarefas/eventos/fila na mesma transação. Proibir DML direto que burle
      versionamento ou auditoria; proteger igualmente todas as RPCs expostas.
- [ ] Implementar API paginada e limites por ator/conexão; não confiar em ator
      enviado no payload nem usar service-role nas operações de usuários.
- [ ] Passar `deno test --allow-env --allow-net supabase/functions/tests/`,
      `npm test`, suíte SQL real e revisão independente dos caminhos de autorização.
- [ ] Commit: `feat(api): add transactional task operations and agent claims`.

### Etapa 3: MCP remoto, OAuth e consentimento individual

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

- [ ] Escrever teste de transporte MCP real listando e chamando ferramentas com
      token válido; negar token ausente, expirado, emissor/audience incorretos e grants ausentes.
- [ ] Escrever testes com dois usuários Claude simulados por OAuth real local,
      mesmo client_id e workspaces distintos; revogar grant/membership e provar negação
      em API, MCP e PostgREST/RPC sem depender da expiração do token.
      Verificar que grant de escrita cria executor vinculado à conexão, enquanto
      conexão somente leitura não cria executor nem pode reservar trabalho.
- [ ] Executar testes para demonstrar falha antes de implementar o MCP e os grants.
- [ ] Instalar dependências compatíveis, iniciar React/TS/shadcn em entrypoint
      independente, mapear tokens existentes e implementar `/oauth/consent` com login,
      escolha de acesso, aprovação, recusa e conexão revogável.
- [ ] Implementar MCP stateless com SDK oficial e middleware Supabase; adaptar
      descoberta OAuth e autenticar as chamadas dentro da função. Não desabilitar auth
      simplesmente para fazer um cliente conectar.
- [ ] Passar `npm run typecheck`, testes Deno/MCP, testes OAuth locais e Playwright
      de consentimento; revisão independente de grants e tratamento de callbacks.
- [ ] Commit: `feat(mcp): expose authenticated tools and user oauth connections`.

### Etapa 4: eventos persistentes e webhooks compatíveis com Hermes

**Arquivos:** criar `supabase/migrations/202610200004_webhook_delivery.sql`,
`supabase/functions/webhook-dispatch/index.ts`,
`supabase/functions/_shared/{webhook-signing,webhook-targets,webhook-delivery}.ts`,
`supabase/functions/tests/webhook-delivery.test.ts`,
`tests/webhook-sql.test.js`, `docs/hermes-integration.md`.

**Interfaces:** `dispatchWebhookBatch()` consome fila pgmq; cada entrega guarda
tentativa, próxima execução, resposta resumida e estado terminal.
`signHermesWebhook(secret, timestamp, rawBody)` produz Generic V2 da spec.
Subscription é administrada por owner/admin, referenciando segredo no Vault.

- [ ] Escrever teste com receptor HTTP verificando HMAC, timestamp e payload;
      primeira resposta 503, depois 200; manter `event_id` e `X-Request-ID`, com assinatura
      renovada e uma tarefa/evento no banco. Simular timeout após aceite do receptor.
- [ ] Testar oito tentativas, `Retry-After`, falha terminal, reenvio manual,
      bloqueio de destino privado/metadata/redirect e exclusão de eventos do próprio agente.
- [ ] Executar testes e observar falhas esperadas antes de implementar dispatcher.
- [ ] Implementar Vault, fila, worker em lotes e agendamento autenticado. A fila
      só confirma sucesso após resposta aceita; retenção e deduplicação não dependem de RAM.
- [ ] Passar testes Deno, SQL real, simulação de crash entre envio e confirmação
      e revisão independente; documentar configuração Hermes sem segredos reais.
- [ ] Commit: `feat(webhooks): deliver signed task events to external agents`.

### Etapa 5: painel React de supervisão e trabalho

**Arquivos:** criar `src/app/workspaces/`, `src/app/tasks/`, `src/app/projects/`,
`src/app/agents/`, `src/app/activity/`, `src/app/shell/`,
`src/workspace/normalized.ts`, `tests/browser/agent-panel.spec.ts`;
modificar `src/app/App.tsx`, estilos/tokens somente onde necessário e catálogos PT/EN.

**Interfaces:** novo repositório chama a API da etapa 2 por queries/commands;
sessão/workspace formam as chaves de cache e escopo das atualizações. Estado de
interface vive em React. O painel usa os mesmos Command/Task/Actor da etapa 1.

- [ ] Escrever Playwright para login/workspace, criar/editar tarefa, lista/quadro,
      drawer, comentário, atribuição a agente, ver execução bloqueada e retomada humana.
- [ ] Adicionar casos de versão desatualizada, erro de rede, mudança de workspace
      durante request e logout; nenhum resultado atrasado reidrata a identidade anterior.
      Verificar preferências pessoais vazias quando a autoria legada não puder ser
      recuperada, com estado compartilhado preservado no snapshot original.
- [ ] Executar a suíte nova e observar falhas antes das telas novas.
- [ ] Implementar componentes reais, overlays shadcn, ícones React e navegação por
      URL. Preservar temas, densidade e PT/EN; rich text é sanitizado, títulos são texto.
- [ ] Atualizar atividade após alteração por MCP sem exigir reload manual, usando
      polling com invalidação e interrupção ao trocar sessão/workspace; Realtime fica
      opcional se os testes demonstrarem necessidade.
- [ ] Passar typecheck, testes de domínio/browser e auditoria visual em claro/escuro,
      PT/EN e mobile; revisão independente comparando o painel atual e os fluxos novos.
- [ ] Commit: `feat(ui): add react task supervision and agent integration screens`.

### Etapa 6: paridade das superfícies atuais e corte do frontend

**Arquivos:** criar os módulos React restantes de `src/app/` para as rotas atuais;
modificar `index.html`, `playwright.config.js`, `tests/browser/`, `scripts/check-tokens.mjs`,
`README.md`, `docs/design-system.md`, `docs/supabase-setup.md`, `CONTEXT.md` e CI.
Remover módulos legados somente quando a superfície equivalente estiver coberta.

**Interfaces:** manter o contrato de dados e API; portar calendário, timeline,
arquivos/metadados, equipes/membros, busca, favoritos, notificações, arquivos mortos,
settings e catálogo de tokens. Views salvas e todas as oito abas têm teste explícito.
Local demo ganha adaptador React separado, sem simular sucesso cloud.

- [ ] Converter testes existentes baseados em `window.__gr8r` para ações visíveis
      de usuário e adicionar inventário cobrindo as 22 rotas/abas/autenticação.
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

### Etapa 7: ativação no ambiente alvo e prova com clientes reais

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
