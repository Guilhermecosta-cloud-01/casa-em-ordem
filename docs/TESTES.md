# Testes

Três camadas:

| Camada | Comando | O que cobre |
|---|---|---|
| Unitários (Vitest) | `npm test` | Calculadora, conversões, totais, entrada de números, adição rápida, categorias, fila offline, recorrência, tarefas, estoque, divisão de despesas, agenda, envio de notificações |
| Banco (Vitest + Postgres) | `npm run test:db` | RLS, isolamento entre famílias, convites, papéis, funções, arredondamento no SQL; tarefas, estoque, despesas, agenda, conversas, avisos, categorias, exclusão de conta e a função `api/push` |
| Ponta a ponta (Playwright) | `npm run test:e2e` | Fluxos completos no navegador com dois usuários reais |

## Preparar o ambiente local

Os testes de banco e ponta a ponta precisam de um Supabase local.

**Sem Docker (Linux x86-64)**, com PostgreSQL 15+ instalado no sistema:

```bash
npm run stack:up              # baixa Supabase Auth e PostgREST, sobe tudo em :54321
npm run test:db

grep '^VITE_' .local-stack/env > .env.local   # só as variáveis públicas
echo VITE_SYNC_POLL_MS=3000 >> .env.local    # consulta periódica mais rápida nos testes
npm run build
npx playwright install chromium             # só na primeira vez
npm run test:e2e

npm run stack:down
```

`RESET=1 npm run stack:up` apaga o banco local e recria do zero.

**Com Docker**, use `npx supabase start` e aponte `DATABASE_URL` (testes de
banco) e o `.env.local` (ponta a ponta) para o ambiente do Supabase CLI.

## Os 18 testes obrigatórios (seção 12)

| # | Teste | Onde |
|---|---|---|
| 1 | Criação de conta e entrada | e2e `01` (teste 1) |
| 2 | Criar família e convidar | e2e `01` (teste 2); banco: convites |
| 3 | Criar, editar e excluir listas | e2e `02` (teste 3) |
| 4 | Adicionar produtos e alterar quantidades | e2e `02` (testes 4–8) |
| 5 | Total estimado correto | e2e `02`; unitários `totals.test.ts`; banco `item_line_total` |
| 6 | Marcar itens comprados | e2e `02` |
| 7 | Sincronização entre dois usuários | e2e `02` (teste 7, inclui "+" simultâneos) |
| 8 | Persistência ao fechar e reabrir | e2e `02` |
| 9 | Acesso negado a outras famílias | e2e `01` (teste 9, pela URL e pela API); banco: isolamento |
| 10 | 250 g por R$ 12,00 × 100 g por R$ 7,00 | e2e `03`; unitários `compare.test.ts` |
| 11 | Conversão g ↔ kg | e2e `03`; unitários |
| 12 | Conversão mL ↔ L | e2e `03`; unitários |
| 13 | Três ou mais opções | e2e `03`; unitários |
| 14 | Valores inválidos e divisão por zero | e2e `03`; unitários |
| 15 | Quantidade equivalente e embalagens inteiras | e2e `03`; unitários |
| 16 | Celular e computador | e2e `04` (teste 16) |
| 17 | Perda de conexão | e2e `04` (teste 17: fila, recarregar offline, reenvio) |
| 18 | Instalação e abertura como PWA | e2e `04` (teste 18: manifesto, ícones, service worker) |

## Módulos da etapa 6 (`tests/e2e/05-modulos.spec.ts`)

| Teste | O que cobre |
|---|---|
| Tarefas | Responsável, prazo, recorrência semanal, conclusão cria a próxima, histórico |
| Estoque | Mínimo, alerta "Acabando", "Pôr todos na lista" e o item na lista |
| Dois integrantes | Aviso de tarefa atribuída, despesa dividida e acerto, conversa no grupo com não lidas |
| Agenda e conta | Compromisso com horário e lembrete, visão do mês, categoria personalizada, modo escuro, exclusão da conta |
| Sem internet | Tarefa e lista nova com item ficam pendentes e sobem ao voltar |

Ver [LIMITACOES.md](LIMITACOES.md) para o que não pôde ser testado neste ambiente
(Realtime, notificações no celular, e-mails, aparelhos reais).
