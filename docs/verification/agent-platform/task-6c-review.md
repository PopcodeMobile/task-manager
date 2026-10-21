# Spec Compliance

- **❌ Issues found.** Task 6c ainda não cumpre integralmente concorrência/CAS, separação de rascunhos de conversa e paridade das ações de navegação. Cinco achados Important abaixo. Revisão delimitada a `f1bdeb0e16cc7b11873117c2ebb30971888d8959..a003627048c790e258443b347c0edc988a28b960`, 28 arquivos; pacote lido uma vez. Não é revisão de merge da branch inteira.
- **⚠️ Cannot verify from diff:** prova hospedada/Hermes/Claude, corte do legado, AST/CI, adaptação do SDK e regressão ampla final continuam 6d/7, conforme escopo. Não são omissões desta entrega. Também não foi medido coverage >80%, complexidade ou certificação de acessibilidade.
- **⚠️ Cannot verify from submitted runtime evidence:** Inbox mobile Back; navegação dos links de workload/marcos; botões individuais de simulação em States; sequência completa de favoritar/desfavoritar tarefa+projeto; cada filtro de atividade. `tests/browser/local-panel.spec.ts:1914` cobre renderização das 21 rotas+404 e abas, mas renderização não demonstra essas ações. O próprio `task-6c-report.md`, matriz de paridade, delimita parte dessas lacunas. Conferir esses cenários após as correções, sem converter a união de execuções em afirmação de uma suíte final 49/49.

# Strengths

- `src/app/panel/panel-model.ts:5` calcula o batch inteiro e verifica 100 operações/262144 bytes antes do envio; `src/app/panel/PeoplePages.tsx:69` captura baseline ao abrir o editor. `tests/remaining-routes.test.mjs:19,117` exercita leitura pura, drift legado e rollback de batch rejeitado. Isso protege a substituição sequencial e conflitos das equipes efetivamente incluídas; não cobre a relação ausente descrita em I2.
- `src/workspace/local-panel.js:176,238` usa `member.team` e importa preferências iniciais apenas para o ator local real; `src/app/panel/panel-model.ts:47` filtra filhos de projetos privados nas páginas agregadas. O mapa de notificações preserva IDs desconhecidos sequencialmente; a limitação cloud shallow/noCAS está declarada, sem inventar garantia adicional.
- `src/app/panel/password-model.ts:17` verifica a identidade, encerra somente a sessão temporária e revalida o usuário principal antes de atualizar a senha. `tests/browser/agent-panel.spec.ts:1666` e `/tmp/task6c-cloud-final-scroll.log` mostram prova Auth/DB local real e preservação do session_id principal; testes de cleanup/abort estão em `tests/remaining-routes.test.mjs:167`.
- `src/app/panel/SettingsPage.tsx:109,337,414` distingue funções cloud indisponíveis, perfil read-only e senha real. `src/app/panel/panel-model.ts:32` e `src/app/schedules/ScheduleView.tsx:87` preservam sábado e formato de data curto; controles store-only não foram transformados em efeitos inventados.
- `src/app/tasks/TaskDrawer.tsx:365` exporta o rascunho efetivo após erro, e `tests/browser/local-panel.spec.ts:95` verifica seu conteúdo na recuperação de conflito.

# Issues

## Critical

- Nenhum achado Critical identificado neste diff. Isso não é certificação de ausência de vulnerabilidades em toda a branch.

## Important

### I1 — Reset aceita rascunho antigo de arquivo sobre os dados restaurados

- **`src/workspace/local-mutations/panel.js:72-79`.** O reset substitui o grafo por `seed()`, mantém `_panel` e avança somente versões de task/project/team. Arquivos reutilizados pelo seed mantêm sua versão anterior, embora seu conteúdo seja substituído. Uma edição aberta em outra aba antes do reset passa no CAS e sobrescreve a restauração.
- **Reprodução executada em memória:** criar repositório com o seed real; ler `f1`; `update_file` para `before-reset.pdf`; capturar versão 2; executar `local_reset_demo`; enviar outro `update_file` com a versão capturada. Saída: `{"file":"f1","staleVersion":2,"resetVersion":2,"staleWrite":"accepted","finalName":"stale-draft-after-reset.pdf"}`. Nenhum storage real ou arquivo do produto foi alterado.
- Invalidar também as entidades versionadas substituídas pelo reset, inclusive arquivos materializados/embutidos e demais coleções com CAS. Preservar os receipts para replay sem reaplicação. Acrescentar regressão de arquivo, além das regressões existentes limitadas a tarefa/equipe em `tests/remaining-routes.test.mjs:98,156`.

### I2 — Duas substituições cloud atribuem a mesma pessoa a equipes diferentes

- **`src/app/panel/panel-model.ts:19-23`.** O planner remove relações somente do baseline e exige CAS somente das equipes que vai modificar. Se o usuário M não tinha equipe no baseline de dois editores, salvar M na equipe A e depois salvar o outro editor em B produz duas relações cloud, contrariando a semântica de uma equipe por pessoa exigida no handoff.
- **Probe do planner executado:** com A/B em versão 1 e `relations=[]`, o plano A é `update_team(A,v1)`, `set_team_member(A,M,v2)`; o plano B é `update_team(B,v1)`, `set_team_member(B,M,v2)`. Não existe precondição sobre M ou A no segundo plano.
- **Verificação específica fora do diff:** `supabase/migrations/202610200005_ui_contracts.sql:292-297` valida e incrementa só a versão da equipe destino; `supabase/migrations/202610200001_normalized_work.sql:207-213` permite `(workspace, A, M)` e `(workspace, B, M)` porque a chave primária contém team_id. O mutex por workspace serializa as transações, mas não invalida B: após o commit de A, B continua na versão 1. A ordem serial A→B já reproduz o problema lógico; não depende de interleaving dentro da transação.
- Falta precondição autoritativa da relação atual do usuário, revisão do conjunto de relações ou substituição que leia/remova as relações atuais sob o mesmo lock. Os contratos publicados consultados não expressam essa precondição: `set_team_member/remove_team_member` aceitam `id/userId` e CAS da equipe alvo. Reler antes do envio deixa janela; tocar todas as equipes com updates artificiais não é uma solução adequada e não cobre uma equipe criada depois. Um agregado/precondição estreito no backend precisa ser decidido pelo root; não dividir em chunks nem enfraquecer a aceitação. Não executei teste DB desta corrida; conclusão sustentada pelos planos concretos e pelo SQL publicado.

### I3 — Rascunho da Inbox muda silenciosamente de tarefa

- **`src/app/panel/RemainingRoutes.tsx:413,444`.** Selecionar outra notificação troca `task` na mesma instância de `TaskDiscussionSection`, sem chave/estado por tarefa nem proteção do rascunho. O consumidor, inspecionado por esse risco específico, mantém `body` e `id` em `useState` (`src/app/tasks/TaskDiscussionSection.tsx:38-40`) e envia usando o `task.id` atual (`:125-130`).
- Abrir conversa A, digitar resposta, selecionar notificação da tarefa B e clicar Comentar publica o texto preparado para A em B. Se um envio falha em A, a troca também reaproveita o mesmo ID em outra tarefa e impede uma recuperação confiável.
- Manter rascunhos separados por task e proteger a troca quando houver rascunho/ação pendente. Uma remount simples que descarte silenciosamente o texto também não satisfaz recuperação. Adicionar cenário de duas conversas com texto não enviado e falha de envio. Achado por identidade/estado do componente, sem novo servidor/browser run.

### I4 — Métrica de atrasadas abre filtro com outro dia

- **`src/app/shell/WorkspacePanel.tsx:256`.** O destino `tasks?filter=overdue` compara com `new Date().toISOString().slice(0,10)` (UTC), enquanto Home/MyTasks calculam dia local com `iso(new Date())` em `src/app/panel/RemainingRoutes.tsx:88,237`. A lista aberta pela métrica não corresponde à contagem em horários próximos da virada UTC.
- **Probe executado:** `TZ=America/Maceio`, relógio `2026-10-20T22:30:00-03:00`, vencimento `2026-10-20`: `{"localDay":"2026-10-20","utcDay":"2026-10-21","homeOverdue":false,"destinationOverdue":true}`.
- Usar o mesmo helper local no filtro de destino e testar a métrica→lista nesse horário. A preferência `tz` continua store-only; a correção é consistência com o calendário local já adotado.

### I5 — Atalho/comando Criar projeto não abre editor se ProjectsPage já está montada

- **`src/app/projects/ProjectsPage.tsx:99`**, chamado por **`src/app/shell/WorkspacePanel.tsx:543-549,786`**. `initialCreate` é consumido apenas no inicializador de `useState`, enquanto a chave de ProjectsPage é somente workspaceId. Em `/projects` ou `/project`, pressionar P ou escolher Criar projeto muda a URL para `/projects?create=true`, mas mantém a instância existente e `edit=null`.
- A entrada vindo de Home funciona porque monta o componente, o que explica não ser detectado pelos cenários existentes. É uma falha nos atalhos/comandos recém-adicionados em rotas comuns, não preferência de interface.
- Consumir explicitamente a solicitação de criação na navegação/estado e permitir reabertura após fechar; preservar o draft guard existente. Cobrir o comando a partir da coleção e de um projeto já aberto. Achado determinístico pelo ciclo de vida React, sem suíte extra.

## Minor

- **M1 — Tradução das novas ações de atividade incompleta.** `src/app/panel/RemainingRoutes.tsx:703` passa eventos novos ao `ActivityPage`, cujo mapa em `src/app/activity/ActivityPage.tsx:20-41` não contempla `update_workspace`, equipes e demos; o fallback `:57` exibe o identificador técnico. Root observou `Remaining owner update_workspace` na screenshot `/tmp/task6c-cloud-overview-en.png`; código confirma. Adicionar rótulos PT/EN das operações introduzidas. Texto histórico/user content deve continuar literal. As opções `light/dark/system` do catálogo em `src/app/panel/CataloguePage.tsx:69` também estão sem rótulos PT.
- **M2 — Aviso de bundle permanece.** `/tmp/task6c-build-cloud.log:20` e `/tmp/task6c-build-local.log:21` reportam chunks >500 kB. Limite já declarado pelo implementador; não bloqueia sozinho a Task 6c. Tratar a divisão de bundle no gate de entrega apropriado, sem esconder o aviso elevando o limite.

# Checks and evidence

- Requisitos consultados: `task-6c-brief.md`, `task-6c-handoff.md`, seções de rotas/settings/overlays/abas/auth de `task-6-route-inventory.md`, `task-6c-contract-preflight.md`, `task-6c-preference-consumers.md` e `task-6c-report.md`. Os trechos truncados na primeira leitura foram recuperados por leituras menores.
- Não rerodei suítes passing. Logs consultados: `/tmp/task6c-unit-final.log` (11 pass), `/tmp/task6c-focused-final.log` (58 pass anterior aos refinamentos finais), `/tmp/task6c-local-targeted-final.log` (9 pass/1 fail), `/tmp/task6c-local-final-followup.log` (2 pass/1 fail), `/tmp/task6c-local-home-final.log` (1 pass fechando aquela falha), `/tmp/task6c-local-notifications-final.log` (1 pass), `/tmp/task6c-cloud-final-scroll.log` (1 pass). A cronologia é compatível com o relatório, sem uma execução final 49/49.
- Logs finais de typecheck/lint/format/tokens consultados: sem falhas registradas; tokens reportam 234 públicos/113 arquivos. `/tmp/task6c-build-final.log` registra cloud/local exit 0, zero matches de dois valores privados e `.env.local` inalterado; scan literal não é auditoria geral de segredos.
- Únicos probes executados: Node `--input-type=module` usando o repositório local real com Map em memória para reset+CAS de arquivo; import do planner real para as duas equipes; Node com `TZ=America/Maceio` e helper `iso` real para o limite de dia. Resultados literais estão em I1/I2/I4. Não houve alteração de produto/index/HEAD, servidor, build, teste remoto ou subagente.
- Contexto adicional estritamente por risco: mutations de subtask/comment para avaliar abrangência de CAS do reset; TaskDiscussionSection para estado/recuperação entre conversas; ActivityPage para operações não traduzidas; DDL/SQL da relação de equipes para I2. `useWorkspaceData.ts:170-305` foi lido porque os hunks cortavam refresh/execute no meio, para avaliar término de ação e invalidação. Esses checks não substituem a revisão ampla posterior.

# Assessment

- **Task quality: Needs fixes.** A implementação tem limites explícitos, bom reaproveitamento e evidência real local/cloud. Entretanto, reset permite sobrescrita stale e a composição de equipes não detecta relação criada depois do baseline; Inbox e navegação têm defeitos de estado verificáveis. Corrigir I1–I5 e fechar os probes focados correspondentes antes de aprovar o gate 6c.
- **Stop condition:** revisão independente concluída; relatório entregue, produto não alterado. A Task 6c permanece sem aprovação.
