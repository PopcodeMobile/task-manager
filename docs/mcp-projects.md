# Projetos pelo MCP

O MCP oferece `create_project`, `update_project` e `archive_project`, além das ferramentas de tarefas. Use token da organização com **Leitura e escrita**, ou uma conexão OAuth com permissão de escrita nessa organização. Tokens de escrita já emitidos recebem essas operações sem precisar gerar outro segredo. Tokens somente de leitura continuam sem acesso a alterações.

Cada chamada exige `workspace_id` da organização e uma `idempotency_key` exclusiva. Reutilize a chave somente para repetir a mesma operação e os mesmos argumentos. O retorno contém o projeto em `data`, incluindo `id` e `version`.

## Criar e renomear

Chame `create_project`:

```json
{
  "workspace_id": "11111111-1111-4111-8111-111111111111",
  "idempotency_key": "marketing-create-1",
  "input": { "name": "Marketing", "description": "Campanhas e conteúdo", "status": "active" }
}
```

Depois, use o `data.id` retornado como `projectId` ao criar tarefas. Para renomear, chame `update_project` com o ID e a versão atual:

```json
{
  "workspace_id": "11111111-1111-4111-8111-111111111111",
  "idempotency_key": "marketing-rename-1",
  "expected_version": 1,
  "input": { "id": "ID_RETORNADO", "name": "Marketing Delta" }
}
```

`update_project` também edita descrição, chave, status, equipe, responsável humano, datas, ordenação e atributos `icon`, `color` e `milestones`. Campos opcionais de equipe, responsável e datas aceitam null para limpar. Status válidos: `planning`, `active`, `risk`, `hold`, `complete`. Nomes têm de 1 a 500 caracteres, sem contar espaços nas pontas na chamada MCP. Identificadores de equipe e responsável precisam pertencer à mesma organização.

## Arquivar e evitar conflitos

`archive_project` recebe `input: { "id": "ID_RETORNADO" }`, a versão atual em `expected_version` e uma nova chave de idempotência. Arquivar marca o projeto como arquivado; não exclui tarefas nem cancela reservas de execução. O campo existente `archived` de `update_project` pode ser usado com false para reexibir o projeto, também com controle de versão.

Para obter a versão atual, use `list_projects` e siga `nextCursor` se houver outra página. Se receber `version_conflict`, leia novamente o projeto e decida a alteração com base no estado atual. Uma nova tentativa com argumentos diferentes precisa de outra chave. Repetir uma chamada idêntica com a mesma chave retorna o resultado original sem duplicar o projeto ou evento.

Os três comandos não liberam exclusão de projetos, alteração de membros, criação de organizações ou administração de tokens. A organização autorizada continua fixa. Expiração, rotação e revogação continuam sendo verificadas antes de executar ou devolver um recibo anterior.

Exemplo de pedido ao agente: “Crie o projeto Marketing Delta no Kairos. Depois crie nele as tarefas Planejar calendário e Revisar campanha. Confirme os identificadores criados.”
