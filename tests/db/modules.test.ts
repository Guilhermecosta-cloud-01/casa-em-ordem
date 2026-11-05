// Testes do banco dos módulos da etapa 6: tarefas, estoque, despesas,
// agenda, conversas, notificações, categorias e exclusão de conta.
import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  asUser,
  asUserOne,
  createFamily,
  createUser,
  expectDbError,
  inviteAndJoin,
  pool,
  type TestUser,
} from './helpers'

let ana: TestUser // administradora da família Silva
let bruno: TestUser // integrante da família Silva
let carla: TestUser // administradora da família Souza
let silva: string
let souza: string

beforeAll(async () => {
  ana = await createUser('Ana')
  bruno = await createUser('Bruno')
  carla = await createUser('Carla')
  silva = await createFamily(ana, 'Família Silva')
  souza = await createFamily(carla, 'Família Souza')
  await inviteAndJoin(ana, silva, bruno)
})

async function today(): Promise<string> {
  const { rows } = await pool.query(`select app_private.local_today()::text as d`)
  return rows[0].d as string
}

async function notificationsOf(user: TestUser, kind: string): Promise<{ title: string; body: string | null; url: string | null }[]> {
  return asUser(user, `select title, body, url from public.notifications where kind = $1 order by created_at`, [kind])
}

describe('tarefas', () => {
  it('outra família não vê, não cria e não altera tarefas', async () => {
    const task = await asUserOne<{ id: string }>(ana, `insert into public.tasks (family_id, title) values ($1, 'Lavar louça') returning id`, [silva])
    expect(await asUser(carla, `select id from public.tasks where id = $1`, [task.id])).toHaveLength(0)
    const forged = await expectDbError(asUser(carla, `insert into public.tasks (family_id, title) values ($1, 'Invasão')`, [silva]))
    expect(forged.code).toBe('42501')
    expect(await asUser(carla, `update public.tasks set title = 'x' where id = $1 returning id`, [task.id])).toHaveLength(0)
    expect(await asUser(carla, `delete from public.tasks where id = $1 returning id`, [task.id])).toHaveLength(0)
    const rpc = await expectDbError(asUser(carla, `select public.complete_task($1)`, [task.id]))
    expect(rpc.hint).toBe('NOT_FOUND')
  })

  it('responsável precisa ser da família', async () => {
    const error = await expectDbError(
      asUser(ana, `insert into public.tasks (family_id, title, assignee_id) values ($1, 'Varrer', $2)`, [silva, carla.id]),
    )
    expect(error.code).toBe('23503')
  })

  it('situação só muda pelas funções (não por update direto)', async () => {
    const task = await asUserOne<{ id: string }>(ana, `insert into public.tasks (family_id, title) values ($1, 'Regar') returning id`, [silva])
    const error = await expectDbError(asUser(ana, `update public.tasks set status = 'done' where id = $1`, [task.id]))
    expect(error.code).toBe('42501')
  })

  it('concluir tarefa recorrente cria a próxima depois de hoje, no mesmo ritmo; reabrir desfaz', async () => {
    const d = await today()
    const task = await asUserOne<{ id: string }>(
      ana,
      `insert into public.tasks (family_id, title, due_on, recurrence, assignee_id)
       values ($1, 'Trocar roupa de cama', ($2::date - 10), 'weekly', $3) returning id`,
      [silva, d, bruno.id],
    )
    const first = await asUserOne<{ id: string }>(bruno, `select public.complete_task($1) as id`, [task.id])
    const again = await asUserOne<{ id: string }>(bruno, `select public.complete_task($1) as id`, [task.id])
    expect(again.id).toBe(first.id)
    const next = await asUserOne<{ due_on: string; ok: boolean; assignee_id: string; status: string }>(
      ana,
      `select n.due_on::text, n.assignee_id, n.status,
              ((n.due_on - t.due_on) % 7 = 0 and n.due_on > $2::date and n.due_on <= $2::date + 7) as ok
       from public.tasks n, public.tasks t where n.id = $1 and t.id = $3`,
      [first.id, d, task.id],
    )
    expect(next.ok).toBe(true)
    expect(next.assignee_id).toBe(bruno.id)
    const done = await asUserOne<{ status: string; completed_by: string }>(ana, `select status, completed_by from public.tasks where id = $1`, [task.id])
    expect(done).toEqual({ status: 'done', completed_by: bruno.id })

    await asUser(ana, `select public.reopen_task($1)`, [task.id])
    expect(await asUser(ana, `select id from public.tasks where id = $1`, [first.id])).toHaveLength(0)
    const reopened = await asUserOne<{ status: string; completed_at: string | null }>(ana, `select status, completed_at from public.tasks where id = $1`, [task.id])
    expect(reopened).toEqual({ status: 'open', completed_at: null })
  })

  it('tarefa recorrente sem prazo é recusada', async () => {
    const error = await expectDbError(asUser(ana, `insert into public.tasks (family_id, title, recurrence) values ($1, 'X', 'daily')`, [silva]))
    expect(error.code).toBe('23514')
  })

  it('quem recebe uma tarefa é avisado (quem atribuiu, não)', async () => {
    await asUser(ana, `insert into public.tasks (family_id, title, assignee_id) values ($1, 'Pagar a conta de luz', $2)`, [silva, bruno.id])
    const brunoNotes = await notificationsOf(bruno, 'task')
    expect(brunoNotes.some((n) => n.body === 'Pagar a conta de luz')).toBe(true)
    await asUser(ana, `insert into public.tasks (family_id, title, assignee_id) values ($1, 'Minha tarefa', $2)`, [silva, ana.id])
    expect((await notificationsOf(ana, 'task')).some((n) => n.body === 'Minha tarefa')).toBe(false)
  })
})

describe('estoque', () => {
  it('ajustes simultâneos somam, nunca ficam negativos e não repetem com o mesmo id', async () => {
    const item = await asUserOne<{ id: string }>(ana, `insert into public.stock_items (family_id, name, quantity) values ($1, 'Pilha AA', 4) returning id`, [silva])
    const op = randomUUID()
    await Promise.all([
      asUser(ana, `select public.adjust_stock_quantity($1, 1, $2)`, [item.id, op]),
      asUser(bruno, `select public.adjust_stock_quantity($1, 2)`, [item.id]),
      asUser(ana, `select public.adjust_stock_quantity($1, 1, $2)`, [item.id, op]),
    ])
    let row = await asUserOne<{ quantity: string }>(ana, `select quantity::text from public.stock_items where id = $1`, [item.id])
    expect(Number(row.quantity)).toBe(7)
    await asUser(ana, `select public.adjust_stock_quantity($1, -50)`, [item.id])
    row = await asUserOne<{ quantity: string }>(ana, `select quantity::text from public.stock_items where id = $1`, [item.id])
    expect(Number(row.quantity)).toBe(0)
    const other = await expectDbError(asUser(carla, `select public.adjust_stock_quantity($1, 1)`, [item.id]))
    expect(other.hint).toBe('NOT_FOUND')
  })

  it('ao chegar no mínimo, avisa a família (menos quem mexeu)', async () => {
    const item = await asUserOne<{ id: string }>(
      ana,
      `insert into public.stock_items (family_id, name, quantity, min_quantity) values ($1, 'Café', 3, 1) returning id`,
      [silva],
    )
    await asUser(ana, `select public.adjust_stock_quantity($1, -2)`, [item.id])
    const notes = await notificationsOf(bruno, 'stock')
    expect(notes.some((n) => n.title === 'Acabando: Café')).toBe(true)
    expect((await notificationsOf(ana, 'stock')).some((n) => n.title === 'Acabando: Café')).toBe(false)
    const low = await asUserOne<{ is_low: boolean }>(ana, `select is_low from public.stock_items where id = $1`, [item.id])
    expect(low.is_low).toBe(true)
  })

  it('soma a compra ao estoque com conversão de unidades, uma vez só', async () => {
    const product = await asUserOne<{ id: string }>(ana, `insert into public.products (family_id, name, unit) values ($1, 'Arroz', 'kg') returning id`, [silva])
    await asUser(
      ana,
      `insert into public.stock_items (family_id, product_id, name, unit, quantity) values ($1, $2, 'Arroz', 'g', 500),
       ($1, null, 'Ovos', 'un', 2), ($1, null, 'Leite', 'L', 1)`,
      [silva, product.id],
    )
    const list = await asUserOne<{ id: string }>(ana, `insert into public.shopping_lists (family_id, name) values ($1, 'Feira') returning id`, [silva])
    await asUser(
      ana,
      `insert into public.list_items (family_id, list_id, product_id, name, packages, quantity, unit, is_purchased) values
       ($1, $2, $3, 'Arroz tipo 1', 2, 5, 'kg', true),
       ($1, $2, null, 'ovos', 1, null, 'duzia', true),
       ($1, $2, null, 'Leite', 6, 1, 'L', true),
       ($1, $2, null, 'Leite', 2, 500, 'mL', true)`,
      [silva, list.id, product.id],
    )
    const purchase = await asUserOne<{ id: string }>(ana, `select public.complete_shopping_list($1) as id`, [list.id])
    const updated = await asUserOne<{ n: number }>(bruno, `select public.add_purchase_to_stock($1) as n`, [purchase.id])
    expect(updated.n).toBe(3)
    const rows = await asUser<{ name: string; quantity: string }>(
      ana,
      `select name, quantity::text from public.stock_items where family_id = $1 and name in ('Arroz', 'Ovos', 'Leite') order by name`,
      [silva],
    )
    expect(rows.map((r) => [r.name, Number(r.quantity)])).toEqual([
      ['Arroz', 10500],
      ['Leite', 8],
      ['Ovos', 14],
    ])
    const again = await expectDbError(asUser(ana, `select public.add_purchase_to_stock($1)`, [purchase.id]))
    expect(again.hint).toBe('ALREADY_APPLIED')
  })
})

describe('despesas', () => {
  it('divide igualmente, com os centavos que sobram para os primeiros', async () => {
    const id = randomUUID()
    const dani = await createUser('Dani')
    await inviteAndJoin(ana, silva, dani)
    await asUser(
      ana,
      `select public.save_expense($1, $2, 'Conta de luz', 'contas', 100.00, null, $3, 'equal', $4::jsonb)`,
      [id, silva, ana.id, JSON.stringify([ana.id, bruno.id, dani.id])],
    )
    const shares = await asUser<{ user_id: string; amount: string }>(
      bruno,
      `select user_id, amount::text from public.expense_shares where expense_id = $1 order by amount desc, user_id`,
      [id],
    )
    expect(shares.map((s) => s.amount)).toEqual(['33.34', '33.33', '33.33'])
    expect(shares[0]!.user_id).toBe(ana.id)
    const notes = await notificationsOf(bruno, 'expense')
    expect(notes.some((n) => n.body === 'Conta de luz: sua parte é R$ 33,33')).toBe(true)
  })

  it('divisão personalizada precisa fechar com o valor; participantes precisam ser da família', async () => {
    const mismatch = await expectDbError(
      asUser(ana, `select public.save_expense($1, $2, 'Pizza', 'lazer', 80, null, $3, 'custom', $4::jsonb)`, [
        randomUUID(),
        silva,
        ana.id,
        JSON.stringify([
          { user_id: ana.id, amount: 30 },
          { user_id: bruno.id, amount: 40 },
        ]),
      ]),
    )
    expect(mismatch.hint).toBe('SHARES_MISMATCH')
    const outsider = await expectDbError(
      asUser(ana, `select public.save_expense($1, $2, 'Pizza', 'lazer', 80, null, $3, 'equal', $4::jsonb)`, [
        randomUUID(),
        silva,
        ana.id,
        JSON.stringify([ana.id, carla.id]),
      ]),
    )
    expect(outsider.hint).toBe('INVALID_MEMBER')
    const direct = await expectDbError(
      asUser(ana, `insert into public.expenses (family_id, description, amount) values ($1, 'x', 10)`, [silva]),
    )
    expect(direct.code).toBe('42501')
  })

  it('saldos: quem pagou tem a receber; acertos zeram a diferença', async () => {
    const fam = await createFamily(ana, 'Família Saldo')
    const eva = await createUser('Eva')
    await inviteAndJoin(ana, fam, eva)
    await asUser(ana, `select public.save_expense($1, $2, 'Mercado', 'mercado', 90, null, $3, 'equal', $4::jsonb)`, [
      randomUUID(),
      fam,
      ana.id,
      JSON.stringify([ana.id, eva.id]),
    ])
    await asUser(ana, `select public.save_expense($1, $2, 'Gás', 'contas', 120, null, $3, 'none')`, [randomUUID(), fam, ana.id])
    let balances = await asUser<{ user_id: string; balance: string }>(eva, `select user_id, balance::text from public.expense_balances where family_id = $1`, [fam])
    const of = (list: typeof balances, u: TestUser) => Number(list.find((b) => b.user_id === u.id)?.balance ?? 0)
    expect(of(balances, ana)).toBe(45)
    expect(of(balances, eva)).toBe(-45)
    await asUser(eva, `insert into public.expense_settlements (family_id, from_user, to_user, amount) values ($1, $2, $3, 45)`, [fam, eva.id, ana.id])
    balances = await asUser(eva, `select user_id, balance::text from public.expense_balances where family_id = $1`, [fam])
    expect(of(balances, ana)).toBe(0)
    expect(of(balances, eva)).toBe(0)
    expect(await asUser(carla, `select * from public.expense_balances where family_id = $1`, [fam])).toHaveLength(0)
    const forged = await expectDbError(
      asUser(eva, `insert into public.expense_settlements (family_id, from_user, to_user, amount) values ($1, $2, $3, 10)`, [fam, eva.id, carla.id]),
    )
    expect(forged.code).toBe('42501')
  })
})

describe('agenda e lembretes', () => {
  it('ocorrências mensais não escorregam no fim do mês', async () => {
    const event = await asUserOne<{ id: string }>(
      ana,
      `insert into public.events (family_id, title, starts_on, recurrence) values ($1, 'Aluguel', '2026-01-31', 'monthly') returning id`,
      [silva],
    )
    const { rows } = await pool.query(
      `select occurs_on::text as d from app_private.event_occurrences('2026-02-01', '2026-04-30') where event_id = $1 order by 1`,
      [event.id],
    )
    expect(rows.map((r) => r.d)).toEqual(['2026-02-28', '2026-03-31', '2026-04-30'])
  })

  it('lembrete vencido vira notificação para a família, uma vez só', async () => {
    const d = await today()
    await asUser(
      ana,
      `insert into public.events (family_id, kind, title, starts_on, start_time, remind_minutes)
       values ($1, 'maintenance', 'Trocar filtro do purificador', $2, (now() at time zone 'America/Sao_Paulo')::time, 1)`,
      [silva, d],
    )
    await pool.query(`select app_private.enqueue_reminders()`)
    await pool.query(`select app_private.enqueue_reminders()`)
    const notes = (await notificationsOf(bruno, 'event')).filter((n) => n.title === 'Manutenção: Trocar filtro do purificador')
    expect(notes).toHaveLength(1)
    expect(notes[0]!.body).toMatch(/^Hoje/)
  })

  it('outra família não vê compromissos', async () => {
    const event = await asUserOne<{ id: string }>(ana, `insert into public.events (family_id, title, starts_on) values ($1, 'Dentista', '2026-12-01') returning id`, [silva])
    expect(await asUser(carla, `select id from public.events where id = $1`, [event.id])).toHaveLength(0)
    const log = await expectDbError(
      asUser(carla, `insert into public.event_logs (family_id, event_id) values ($1, $2)`, [souza, event.id]),
    )
    expect(['23503', '42501']).toContain(log.code)
  })
})

describe('conversas', () => {
  it('grupo e conversa a dois: só quem participa lê e escreve', async () => {
    const group = await asUserOne<{ id: string }>(ana, `select public.open_group_conversation($1) as id`, [silva])
    const same = await asUserOne<{ id: string }>(bruno, `select public.open_group_conversation($1) as id`, [silva])
    expect(same.id).toBe(group.id)
    const direct = await asUserOne<{ id: string }>(ana, `select public.open_direct_conversation($1, $2) as id`, [silva, bruno.id])
    const sameDirect = await asUserOne<{ id: string }>(bruno, `select public.open_direct_conversation($1, $2) as id`, [silva, ana.id])
    expect(sameDirect.id).toBe(direct.id)

    await asUser(ana, `insert into public.chat_messages (family_id, conversation_id, body) values ($1, $2, 'Oi, Bruno!')`, [silva, direct.id])
    expect(await asUser(carla, `select id from public.chat_messages where conversation_id = $1`, [direct.id])).toHaveLength(0)
    const intrude = await expectDbError(
      asUser(carla, `insert into public.chat_messages (family_id, conversation_id, body) values ($1, $2, 'Oi')`, [silva, group.id]),
    )
    expect(intrude.code).toBe('42501')
    const notMember = await expectDbError(asUser(carla, `select public.open_direct_conversation($1, $2)`, [silva, ana.id]))
    expect(notMember.hint).toBe('NOT_FOUND')
  })

  it('autor vem do servidor, não lidas contam e zeram ao ler, só o autor apaga', async () => {
    const direct = await asUserOne<{ id: string }>(ana, `select public.open_direct_conversation($1, $2) as id`, [silva, bruno.id])
    const msg = await asUserOne<{ id: string; author_id: string }>(
      bruno,
      `insert into public.chat_messages (family_id, conversation_id, body, author_id) values ($1, $2, 'Comprei pão', $3) returning id, author_id`,
      [silva, direct.id, ana.id],
    ).catch(async () =>
      asUserOne<{ id: string; author_id: string }>(
        bruno,
        `insert into public.chat_messages (family_id, conversation_id, body) values ($1, $2, 'Comprei pão') returning id, author_id`,
        [silva, direct.id],
      ),
    )
    expect(msg.author_id).toBe(bruno.id)

    const overview = await asUser<{ conversation_id: string; unread_count: number; other_user_id: string }>(
      ana,
      `select conversation_id, unread_count, other_user_id from public.chat_overview($1)`,
      [silva],
    )
    const row = overview.find((o) => o.conversation_id === direct.id)!
    expect(row.unread_count).toBeGreaterThan(0)
    expect(row.other_user_id).toBe(bruno.id)
    const chatNotes = await asUser<{ read_at: string | null }>(ana, `select read_at from public.notifications where kind = 'chat' and ref_id = $1`, [direct.id])
    expect(chatNotes.some((n) => n.read_at === null)).toBe(true)

    await asUser(ana, `select public.mark_conversation_read($1)`, [direct.id])
    const after = await asUser<{ conversation_id: string; unread_count: number }>(ana, `select conversation_id, unread_count from public.chat_overview($1)`, [silva])
    expect(after.find((o) => o.conversation_id === direct.id)!.unread_count).toBe(0)
    const read = await asUser<{ read_at: string | null }>(ana, `select read_at from public.notifications where kind = 'chat' and ref_id = $1`, [direct.id])
    expect(read.every((n) => n.read_at !== null)).toBe(true)

    const notAuthor = await expectDbError(asUser(ana, `select public.delete_chat_message($1)`, [msg.id]))
    expect(notAuthor.hint).toBe('NOT_FOUND')
    await asUser(bruno, `select public.delete_chat_message($1)`, [msg.id])
    const deleted = await asUserOne<{ body: string; deleted: boolean }>(ana, `select body, deleted_at is not null as deleted from public.chat_messages where id = $1`, [msg.id])
    expect(deleted).toEqual({ body: '', deleted: true })
  })
})

describe('notificações', () => {
  it('cada pessoa só vê e marca as próprias; ninguém cria pelo app', async () => {
    const mine = await asUser<{ id: string }>(bruno, `select id from public.notifications`)
    expect(mine.length).toBeGreaterThan(0)
    expect(await asUser(carla, `select id from public.notifications where id = $1`, [mine[0]!.id])).toHaveLength(0)
    expect(await asUser(ana, `update public.notifications set read_at = now() where id = $1 returning id`, [mine[0]!.id])).toHaveLength(0)
    const forged = await expectDbError(
      asUser(carla, `insert into public.notifications (user_id, kind, title) values ($1, 'task', 'Falso')`, [bruno.id]),
    )
    expect(forged.code).toBe('42501')
    const otherColumn = await expectDbError(asUser(bruno, `update public.notifications set title = 'x' where id = $1`, [mine[0]!.id]))
    expect(otherColumn.code).toBe('42501')
    expect(await asUser(bruno, `update public.notifications set read_at = now() where id = $1 returning id`, [mine[0]!.id])).toHaveLength(1)
  })

  it('aparelhos e preferências são de cada pessoa', async () => {
    await asUser(bruno, `select public.save_push_subscription('https://push.example/abc', 'p256', 'auth')`)
    expect(await asUser(ana, `select id from public.push_subscriptions`)).toHaveLength(0)
    expect(await asUser(bruno, `select id from public.push_subscriptions`)).toHaveLength(1)
    await asUser(bruno, `insert into public.notification_preferences (user_id, chat) values ($1, false)`, [bruno.id])
    const forged = await expectDbError(asUser(ana, `insert into public.notification_preferences (user_id) values ($1)`, [carla.id]))
    expect(forged.code).toBe('42501')
    expect(await asUser(ana, `select * from app_private.settings`).catch((e) => e.code)).toBe('42501')
  })
})

describe('categorias personalizadas', () => {
  it('só a família vê; ao excluir, itens voltam para "Outros"', async () => {
    const cat = await asUserOne<{ id: string }>(ana, `insert into public.item_categories (family_id, label, emoji) values ($1, 'Festa', '🎉') returning id`, [silva])
    expect(await asUser(carla, `select id from public.item_categories where id = $1`, [cat.id])).toHaveLength(0)
    const list = await asUserOne<{ id: string }>(ana, `insert into public.shopping_lists (family_id, name) values ($1, 'Aniversário') returning id`, [silva])
    const item = await asUserOne<{ id: string }>(
      bruno,
      `insert into public.list_items (family_id, list_id, name, category) values ($1, $2, 'Balões', $3) returning id`,
      [silva, list.id, cat.id],
    )
    expect(await asUser(bruno, `delete from public.item_categories where id = $1 returning id`, [cat.id])).toHaveLength(0)
    await asUser(ana, `delete from public.item_categories where id = $1`, [cat.id])
    const after = await asUserOne<{ category: string }>(ana, `select category from public.list_items where id = $1`, [item.id])
    expect(after.category).toBe('outros')
  })
})

describe('excluir a própria conta', () => {
  it('única administradora precisa passar a administração antes', async () => {
    const fam = await createFamily(ana, 'Família Teste Conta')
    const gil = await createUser('Gil')
    await inviteAndJoin(ana, fam, gil)
    const error = await expectDbError(asUser(ana, `select public.delete_my_account()`))
    expect(error.hint).toBe('LAST_ADMIN')
  })

  it('integrante sai de tudo; família só dela é apagada junto', async () => {
    const hugo = await createUser('Hugo')
    const solo = await createFamily(hugo, 'Família do Hugo')
    await inviteAndJoin(ana, silva, hugo)
    await asUser(hugo, `select public.delete_my_account()`)
    const { rows: users } = await pool.query(`select id from auth.users where id = $1`, [hugo.id])
    expect(users).toHaveLength(0)
    const { rows: fams } = await pool.query(`select id from public.families where id in ($1, $2)`, [solo, silva])
    expect(fams.map((f) => f.id)).toEqual([silva])
  })
})
