# Notificações no celular

Os avisos **dentro do app** (Mais → Notificações) funcionam sem nenhuma
configuração extra. Para que eles também cheguem ao **celular com o app
fechado** (Web Push), são três partes:

1. o app pede permissão e registra o aparelho (já pronto);
2. uma função na Vercel (`api/push.ts`) envia a notificação aos aparelhos;
3. o banco chama essa função a cada aviso novo e, a cada 5 minutos, gera os
   lembretes da agenda e das tarefas do dia.

## 1. Gerar as chaves

No terminal, na pasta do projeto:

```bash
npx web-push generate-vapid-keys
```

Guarde a **Public Key** e a **Private Key**. Gere também um segredo qualquer
para a ligação entre o banco e a função, por exemplo:

```bash
openssl rand -hex 32
```

## 2. Variáveis na Vercel

Em *Settings → Environment Variables* (marque Production e Preview):

| Nome | Valor |
|---|---|
| `VITE_VAPID_PUBLIC_KEY` | a Public Key |
| `VAPID_PRIVATE_KEY` | a Private Key (nunca com `VITE_` na frente) |
| `VAPID_SUBJECT` | `mailto:seu-email@exemplo.com` |
| `PUSH_WEBHOOK_SECRET` | o segredo gerado no passo 1 |

A função também usa `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`, que a
integração do Supabase já cadastrou. Elas ficam só no servidor: sem o prefixo
`VITE_`, não vão para o navegador.

Depois, em *Deployments*, faça **Redeploy**.

## 3. Ligar o banco à função

No Supabase, em *Database → Extensions*, ative **pg_net**. (O **pg_cron**, que
gera os lembretes da agenda e das tarefas do dia a cada 5 minutos, já é ativado
pela migração `20261105120000_lembretes_automaticos.sql`.)

Depois, no *SQL Editor*, rode (trocando o endereço e o segredo):

```sql
insert into app_private.settings (key, value) values
  ('push_webhook_url', 'https://SEU-APP.vercel.app/api/push'),
  ('push_webhook_secret', 'O_SEGREDO_DO_PASSO_1')
on conflict (key) do update set value = excluded.value;
```

Ninguém do app consegue ler a tabela `app_private.settings`; só o banco usa o
segredo.

## 4. Ativar no celular

Cada pessoa abre o app em **Mais → Notificações → Ativar neste aparelho** e
escolhe o que quer receber.

- **Android:** funciona no Chrome, com ou sem o app instalado.
- **iPhone:** só com o app instalado na tela de início (Safari → Compartilhar →
  Adicionar à Tela de Início), iOS 16.4 ou mais recente.

## O que gera notificação

| Aviso | Quem recebe |
|---|---|
| Mensagem nas conversas | quem participa (menos quem escreveu) |
| Tarefa atribuída | o responsável (se não foi ele quem atribuiu) |
| Tarefa com prazo hoje (a partir das 9h) | o responsável, ou a família toda se não houver |
| Item do estoque chegou ao mínimo | a família (menos quem mexeu) |
| Despesa dividida | quem tem parte nela (menos quem lançou) |
| Lembrete da agenda | a família toda |

Mensagens da mesma conversa se substituem no celular, em vez de empilhar.

## Conferir se está funcionando

- Na Vercel, em *Logs*, as chamadas a `/api/push` devem responder 200.
- No Supabase, `select * from net._http_response order by created desc limit 5;`
  mostra as últimas chamadas do banco à função.
- `select * from cron.job_run_details order by start_time desc limit 5;` mostra
  as últimas execuções dos lembretes.

Para desligar o envio ao celular, apague as duas linhas de `app_private.settings`
(os avisos dentro do app continuam). Para parar os lembretes:
`select cron.unschedule('casa-em-ordem-lembretes');`
