# E-mails do Kairos pelo Resend

Os e-mails do Supabase Auth usam **Kairos <send@deltaacademy.com.br>** pelo Resend. Isso inclui confirmação de cadastro e recuperação de senha nos fluxos existentes do painel.

Configuração do projeto Supabase `ddodhyhtpgvsqzpipgcq`:

| Campo               | Valor                                                                                     |
| ------------------- | ----------------------------------------------------------------------------------------- |
| Host SMTP           | `smtp.resend.com`                                                                         |
| Porta               | `465` (TLS)                                                                               |
| Usuário SMTP        | `resend`                                                                                  |
| Nome do remetente   | `Kairos`                                                                                  |
| E-mail do remetente | `send@deltaacademy.com.br`                                                                |
| Credencial          | Chave dedicada `Kairos Supabase Auth`, `sending_access`, restrita a `deltaacademy.com.br` |

A chave fica na configuração SMTP hospedada. Não inclua o segredo no frontend, no repositório ou em mensagens. O arquivo `supabase/config.toml` deste repositório continua sendo configuração local de testes com caixa de captura; não envie seus padrões locais completos para produção.

## Alterar ou rotacionar a chave

Crie outra chave de envio restrita ao domínio verificado no Resend. Atualize somente a senha do SMTP no Supabase Auth e valide um envio controlado antes de retirar a credencial dedicada anterior. O nome do remetente não cria uma caixa de entrada: esta configuração cobre o envio de e-mails.

A chave compartilhada no chat foi usada para criar a chave dedicada, sem ser configurada como senha SMTP. Rotacione essa chave compartilhada no Resend; a credencial do Kairos é separada.

Para automação, use um arquivo de configuração privado e esparso, com o segredo vindo de uma variável de ambiente:

```toml
project_id = "task-manager-resend"

[auth.email.smtp]
enabled = true
host = "smtp.resend.com"
port = 465
user = "resend"
pass = "env(KAIROS_RESEND_SMTP_KEY)"
admin_email = "send@deltaacademy.com.br"
sender_name = "Kairos"
```

Confira o diff antes de aplicar ao projeto alvo. Mantenha a variável disponível no processo da CLI. Uma leitura remota em arquivo vazio pode omitir a seção SMTP ativa, pois a API não devolve a senha; preserve a referência local de ambiente ou confira a convergência do diff com essa configuração declarada.

## Validação

A [verificação de ativação](verification/agent-platform/resend-smtp-2026-10-22.md) registra30checks reais de cadastro e recuperação. Os destinatários eram aliases oficiais `delivered+label@resend.dev`, que simulam a entrega no Resend; isso comprova o caminho Auth→SMTP→Resend e os links, sem afirmar entrega na caixa de entrada de uma pessoa.

Esta configuração atende os e-mails dos fluxos de Auth existentes. Notificações de atividade e tarefas precisam de seus próprios fluxos de envio e preferências. Templates e configurações de OAuth, sessão, senha, redirecionamentos e limites existentes foram preservados.

Referências: [Resend com Supabase SMTP](https://resend.com/docs/send-with-supabase-smtp), [SMTP do Supabase](https://supabase.com/docs/guides/auth/auth-smtp), [endereços de teste do Resend](https://resend.com/docs/dashboard/emails/send-test-emails).
