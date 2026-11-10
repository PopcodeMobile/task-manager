# Tokens de agentes

Tokens permitem conectar agentes externos ao MCP/API do Kairos sem login interativo na máquina do agente. Cada conexão pertence a uma única organização e tem um executor próprio. A sessão pessoal do administrador não é usada como credencial do agente.

## Gerar no painel

1. Entre no Kairos e selecione a organização desejada.
2. Abra **Configurações → Integrações → Tokens de agentes**. Integrações fica na seção da organização. O atalho em Ajuda e recursos e a busca no menu de comandos também continuam disponíveis.
3. Informe um nome, como Hermes VPS.
4. Selecione **Somente leitura** ou **Leitura e escrita**. Para criar projetos ou tarefas, use leitura e escrita. Você pode criar o projeto pelo próprio MCP antes de adicionar tarefas.
5. Escolha 30, 90 ou 365 dias, ou **Sem expiração**. O padrão é 90 dias.
6. Clique em **Gerar token**, copie e guarde o valor. Depois de fechar a exibição, o segredo não pode ser recuperado.

Somente proprietários e administradores humanos atuais da organização podem gerar, listar, rotacionar e revogar tokens. Membros, convidados, conexões OAuth e outros tokens não podem gerenciar credenciais. Não há emissão real na demonstração local.

A lista mostra prefixo público, permissão, criador, datas, último uso e estado. **Rotacionar** invalida o token anterior e mantém o mesmo executor e identidade de tentativas; **Revogar** encerra o acesso da conexão. Ambas as ações pedem confirmação. Tokens pertencem à organização e podem ser gerenciados por outro administrador caso o criador saia.

## Usar no Hermes

Endpoint:

```text
https://ddodhyhtpgvsqzpipgcq.supabase.co/functions/v1/mcp
```

Guarde o token como `KAIROS_AGENT_TOKEN` nos segredos do perfil ou em arquivo de ambiente privado da VPS, com permissão 0600. No `config.yaml`, use uma referência à variável:

```yaml
mcp_servers:
  kairos:
    url: 'https://ddodhyhtpgvsqzpipgcq.supabase.co/functions/v1/mcp'
    headers:
      Authorization: 'Bearer ${KAIROS_AGENT_TOKEN}'
```

A [referência oficial do Hermes](https://hermes-agent.nousresearch.com/docs/reference/mcp-config-reference) documenta headers HTTP e interpolação de variáveis. Confira o suporte na versão instalada antes de aplicar o exemplo. O token completo fica no ambiente/gestor de segredos, sem ser embutido no YAML, URL, repositório ou histórico de comandos. A implantação do Kairos não aplica esse arquivo na VPS.

Exemplo de pedido ao agente:

> Liste os projetos da organização autorizada no Kairos. No projeto Marketing, crie a tarefa “Revisar página de vendas”, com prioridade alta, e confirme o identificador criado.

## Limites e operações

As oito leituras são `list_workspaces`, `list_projects`, `list_tasks`, `get_task`, `list_task_activity`, `list_labels`, `list_task_labels` e `list_members`. Com escrita, as treze ações adicionais são `create_project`, `update_project`, `archive_project`, `create_task`, `claim_task`, `renew_task_claim`, `release_task_claim`, `update_task`, `add_task_comment`, `complete_task`, `create_label`, `set_task_label` e `remove_task_label`. As rotas REST equivalentes também aceitam o Bearer. Configurações, criação e alteração de membros, renomear e excluir etiquetas, exclusão de projetos, logos, webhooks, preferências e administração de tokens não são liberados por essa credencial. Consulte os [exemplos de projetos](mcp-projects.md).

`list_workspaces` retorna somente a organização do token. Entidades usam `workspace_id`; escritas usam `idempotency_key`; atualizações/reservas exigem a versão atual e, quando aplicável, o `claimToken`. Repetir uma tentativa idêntica usa a mesma chave. A rotação preserva essa identidade, evitando tarefas duplicadas. Falta de permissão, expiração, substituição ou revogação impede novas chamadas, inclusive tentativas de recuperar recibos antigos.

## Etiquetas e responsável

`list_labels` lista as etiquetas da organização e `list_members` lista a composição da organização. `list_members` devolve apenas `workspaceId`, `userId` e `role`, sem nome, e-mail ou qualquer credencial: use o `userId` como `assigneeUserId`. `list_task_labels` aceita `taskId` e devolve os vínculos entre tarefa e etiqueta.

`create_label` recebe `input: { "name": "cockpit" }` e um `id` opcional, sem `expected_version`. `set_task_label` e `remove_task_label` recebem `input: { "id": "ID_DA_TAREFA", "labelId": "ID_DA_ETIQUETA", "claimToken": "..." }`, a versão atual da tarefa em `expected_version` e uma nova chave de idempotência. Como qualquer escrita em tarefa feita por agente, elas exigem a reserva viva devolvida por `claim_task`; sem ela a chamada falha com `claim_expired`. Cada vínculo incrementa a versão da tarefa, então releia a versão antes da chamada seguinte.

`update_task` e `create_task` aceitam `assigneeUserId`, com `null` em `update_task` para limpar o responsável. O identificador precisa pertencer à organização da tarefa; outro valor devolve erro de validação. Renomear e excluir etiquetas, alterar a composição da organização e os demais membros de projeto e equipe continuam fora desta credencial.

Exemplo de pedido ao agente:

> Liste as etiquetas da organização no Kairos. Se não existir a etiqueta cockpit, crie. Reserve a tarefa KAI-12, aplique a etiqueta nela e defina como responsável o membro cujo userId você obteve em list_members.

A revogação não desfaz ações confirmadas. Uma reserva de execução não expirada continua bloqueada até expirar ou sofrer intervenção humana; o executor revogado não ganha permissão para concluí-la. Comentários e atividade identificam o agente, sem atribuir suas ações ao administrador criador.

OAuth dos usuários Claude continua disponível. Tokens não configuram o receptor de webhooks do Hermes, não ativam Cron e não encerram os gates originais de integração/retomada/retenção. Consulte a [verificação desta entrega](verification/agent-platform/organization-agent-tokens-2026-10-21.md).
