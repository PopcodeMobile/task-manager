# Tokens de agentes por organização

Status: proposta concreta para revisão, sem alteração de autenticação ou produto. Base inspecionada: `84b67e7`, React/TypeScript em `src/app`, Supabase Auth/PostgreSQL/Edge e MCP remoto existentes.

## Pedido e resultado

Hugo quer gerar pelo painel uma credencial para agentes sem navegador, como o Hermes numa VPS. Somente administradores da organização podem gerar esse acesso. O agente precisa ler e criar tarefas em uma organização determinada sem login interativo no servidor.

A proposta acrescenta tokens organizacionais ao MCP existente. OAuth dos Claudes pessoais continua disponível. O token representa um executor da organização, não a sessão pessoal do administrador criador, e não recebe acesso a outras organizações ou administração de contas. As escolhas abaixo de validade, formato, tela e implementação são propostas do implementador, ainda não decisões confirmadas pelo usuário.

## Experiência no painel

Em Integrações da organização selecionada, adicionar a seção Tokens de agentes usando os controles React/shadcn e os estilos existentes. Proprietário e administrador humano atuais podem criar, listar, rotacionar e revogar. Membros e convidados não chamam os RPCs de gestão; OAuth e outros tokens também não podem administrar credenciais, mesmo quando vinculados a um administrador.

Gerar token pede nome, capacidade Somente leitura ou Leitura e escrita e validade. Organização é fixa e identificada pelo contexto atual, sem seletor para ampliar o acesso. Nome é obrigatório, com 1–100 caracteres após trim. Somente leitura é a seleção inicial; para criar tarefas, o administrador escolhe Leitura e escrita. Proposta de validade: 90 dias por padrão; opções 30, 90, 365 dias ou sem expiração. Sem expiração deve ser uma escolha explícita. O relógio e a data final são calculados pelo servidor.

A resposta mostra o token completo uma única vez, com botão Copiar e instrução de guardar antes de fechar. A lista posterior contém somente nome, prefixo público, capacidade, criador, criação, validade, último uso e estado. Token nunca vai para localStorage/sessionStorage, URL, telemetria, mensagens de erro ou logs. A tela limpa o segredo ao fechar, trocar de organização, sair ou perder autoridade. Respostas de emissão usam no-store. Perder a resposta não permite recuperar o segredo: a lista permite revogar a credencial e emitir outra.

Rotacionar mantém a identidade do executor e substitui atomicamente a credencial; a anterior para de funcionar ao confirmar a transação, sem janela de sobreposição. Revogar exige confirmação e encerra o acesso da conexão, sem apagar tarefas, histórico ou a reserva vigente. O administrador pode gerar outra credencial depois. O token não aparece na demonstração local e não é simulado como acesso real.

## Autoridade e armazenamento

Criar identidade/conexão organizacional estável ligada exatamente a um workspace e a um registro agents. Criador é metadado de auditoria. A autoridade pertence à organização: remover o criador não pode silenciosamente personificar outro usuário nem deixar uma referência de sessão pessoal sustentando o token. Outro administrador ativo pode administrá-lo.

Separar conexão/executor de credenciais rotativas. Usar segredo CSPRNG de 256 bits com prefixo reconhecível `krs_`, seletor público e codificação URL-safe. Persistir apenas hash SHA-256 do segredo e metadados, com índice de seletor único. O segredo tem alta entropia; não é senha escolhida pelo usuário. Credenciais e hashes ficam fora da leitura direta de anon/authenticated, do GraphQL, das listas públicas e dos envelopes de eventos. A comparação do segredo e toda decisão de acesso ficam no servidor/banco. Não emitir JWT de usuário falso nem entregar service-role ao agente.

Banco valida emissão/gestão por JWT humano verificado, membership owner/admin atual e workspace correto. Interface escondida não é autorização. Acesso de agente verifica conexão ativa, hash, validade, capability e workspace em cada transação e antes de devolver qualquer resultado idempotente. Todos os erros usam códigos públicos seguros. Limites de requisições existentes continuam aplicáveis; último uso não é atualizado por tentativas inválidas. Revogação/rotação e execução usam bloqueios compatíveis com uma ordem documentada, evitando uma janela entre validação e efeito. Operações já concluídas não são desfeitas.

## Via MCP/API e autoria

Hoje auth.ts exige JWT e mcp/index.ts exige clientId OAuth; apenas gerar uma string ou remover essa verificação não implementa o pedido. Criar ramo explícito para Bearer `krs_` no boundary. Preservar a validação completa dos JWTs existentes. Actor deve discriminar usuário/OAuth de conexão organizacional e a credencial deve permanecer em armazenamento interno, sem identidade/autoridade aceita no corpo da ferramenta.

Usar entradas SQL estreitas para autenticar a credencial e executar somente consultas/comandos permitidos. Elas podem receber o token com chave pública do projeto; não precisam transformar service-role em transporte genérico de domínio. Contexto de agente é estabelecido exclusivamente por código privado após validação e não pode ser injetado por claims, headers, parâmetros ou RPCs públicos auxiliares. A implementação deve provar essa fronteira, incluindo chamadas diretas ao PostgREST. Nenhum helper genérico de SQL, set_config ou bypass de RLS pode se tornar alcançável.

Escopo inicial: as mesmas 12 ferramentas MCP atuais. Leituras list_workspaces (apenas esta organização), list_projects, list_tasks, get_task e list_task_activity. Escritas create_task, claim_task, renew_task_claim, release_task_claim, update_task, add_task_comment e complete_task. O token read rejeita todas as sete escritas. O mesmo token pode usar as rotas REST equivalentes, com a mesma lista de operações imposta no banco. Não permite gerenciar projetos, membros, preferências, logos, integrações, webhooks ou outros tokens. Não amplia o catálogo de ferramentas.

Preservar CAS, idempotência, cursores, reservas, tarefas bloqueadas e paginação de contexto. Rotação mantém namespace de idempotência e executor: repetir uma tentativa idêntica não cria outra tarefa. Após revogação, execução projetada fica inativa, mas uma reserva não expirada continua bloqueando até expirar ou sofrer intervenção humana, como no contrato atual. O agente não pode concluir uma execução usando outra credencial/conexão.

Autoria deve distinguir executor organizacional de humano em eventos, comentários e painel. Não usar o administrador criador como autor de ações do token, nem criar membership humana artificial. comments.author_user_id tem FK de membership e precisa permanecer nulo para esse novo tipo de autor; acrescentar a referência explícita ao agente e projetá-la. O desenho de persistência do namespace técnico de principal nos eventos/idempotência/limites fica ao implementador, mas deve ser discriminado e preservar integralmente os registros/recibos humanos e OAuth existentes. Nomes de colunas legados não justificam atribuição humana falsa.

## Uso na VPS

O agente envia `Authorization: Bearer <token>` para o mesmo endpoint MCP já publicado. O painel entrega exemplo com variável de ambiente, sem colocar o valor no comando. A documentação oficial do Hermes suporta headers HTTP e referências `${VAR}` / `${env:VAR}` no config.yaml, resolvidas no escopo de segredos do perfil: https://hermes-agent.nousresearch.com/docs/reference/mcp-config-reference . Conferir a versão instalada antes de aplicar qualquer configuração real. Este recurso não ativa automaticamente webhooks ou Cron, nem altera outros perfis do Hermes.

## Escopo técnico e aceite

Planejar migração aditiva após010; novos RPCs de gestão/autorização; DTOs e helpers de token isolados; branches compartilhados de auth/operations/MCP; autoria e projeção de agentes; componente AgentTokensPanel integrado a IntegrationsPanel; linha na matriz de permissões; OpenAPI e documentação de configuração. Preservar001–010, OAuth atual, layout, contratos humanos e gate original de integração main.

Dado owner/admin humano ativo, quando cria token, então só recebe o segredo na resposta inicial e a lista posterior não o recupera. Dado membro/convidado/OAuth/token, quando tenta qualquer gestão, então o banco nega, mesmo em chamada direta.

Dado token válido read, quando consulta sua organização, então lê projetos/tarefas/contexto; quando escreve ou troca workspace, então é negado. Dado token write, quando cria tarefa num projeto existente, então a tarefa tem autoria de agente, recibo estável e nenhuma ampliação administrativa.

Dado token expirado, revogado ou substituído, quando tenta initialize, descoberta de ferramentas, leitura, escrita ou replay, então não recebe acesso, mesmo com cache/recibo antigo. Dada rotação e tentativa idêntica previamente concluída, então não duplica o efeito. Dada corrida entre execução e revogação, então o limite de confirmação e a ordem de bloqueios são testados com sessões distintas.

Validar com testes SQL reais de papéis/principais e fronteira do catálogo, testes Edge/API/MCP, testes browser isolados de segredo/organização/sessão e fixtures hospedadas descartáveis. Nenhum segredo ou usuário real entra na evidência. Revisores independentes verificam segurança e interface antes da publicação. Finalizar com migração/API/MCP/painel publicados, prova real de listar/criar/revogar e limpeza das fixtures. A configuração definitiva do Hermes, webhooks e retenção continua fora desta aprovação específica.
