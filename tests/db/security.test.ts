// Testes de segurança do banco: cada família só acessa os próprios dados,
// por qualquer caminho (consulta direta, identificadores forjados, funções).
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
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
let carla: TestUser // administradora da família Souza (outra família)
let dani: TestUser // sem família
let silva: string
let souza: string
let silvaList: string
let silvaItem: string
let silvaProduct: string

beforeAll(async () => {
  ana = await createUser('Ana')
  bruno = await createUser('Bruno')
  carla = await createUser('Carla')
  dani = await createUser('Dani')
  silva = await createFamily(ana, 'Família Silva')
  souza = await createFamily(carla, 'Família Souza')
  await inviteAndJoin(ana, silva, bruno)

  const list = await asUserOne<{ id: string }>(
    ana,
    `insert into public.shopping_lists (family_id, name) values ($1, 'Compra do mês') returning id`,
    [silva],
  )
  silvaList = list.id
  const item = await asUserOne<{ id: string }>(
    ana,
    `insert into public.list_items (family_id, list_id, name, packages, quantity, unit, unit_price)
     values ($1, $2, 'Arroz', 3, 5, 'kg', 25.90) returning id`,
    [silva, silvaList],
  )
  silvaItem = item.id
  const product = await asUserOne<{ id: string }>(
    ana,
    `insert into public.products (family_id, name, unit, package_size) values ($1, 'Feijão', 'kg', 1) returning id`,
    [silva],
  )
  silvaProduct = product.id
})

afterAll(async () => {
  await pool.end()
})

describe('perfis e auditoria', () => {
  it('cria o perfil automaticamente com o nome informado no cadastro', async () => {
    const profile = await asUserOne<{ display_name: string }>(
      ana,
      'select display_name from public.profiles where id = $1',
      [ana.id],
    )
    expect(profile.display_name).toBe('Ana')
  })

  it('integrantes da mesma família veem o perfil uns dos outros; outras famílias não', async () => {
    const seenByBruno = await asUser(bruno, 'select id from public.profiles where id = $1', [ana.id])
    expect(seenByBruno).toHaveLength(1)
    const seenByCarla = await asUser(carla, 'select id from public.profiles where id = $1', [ana.id])
    expect(seenByCarla).toHaveLength(0)
  })

  it('ninguém altera o perfil de outra pessoa', async () => {
    const rows = await asUser(bruno, `update public.profiles set display_name = 'Hacker' where id = $1 returning id`, [
      ana.id,
    ])
    expect(rows).toHaveLength(0)
  })

  it('registra quem criou e quem alterou cada registro', async () => {
    await asUser(bruno, `update public.list_items set notes = 'tipo 1' where id = $1`, [silvaItem])
    const row = await asUserOne<{ created_by: string; updated_by: string }>(
      ana,
      'select created_by, updated_by from public.list_items where id = $1',
      [silvaItem],
    )
    expect(row.created_by).toBe(ana.id)
    expect(row.updated_by).toBe(bruno.id)
  })

  it('não permite forjar o autor de um registro', async () => {
    const row = await asUserOne<{ created_by: string }>(
      bruno,
      `insert into public.list_items (family_id, list_id, name) values ($1, $2, 'Café') returning created_by`,
      [silva, silvaList],
    )
    expect(row.created_by).toBe(bruno.id)
    const error = await expectDbError(
      asUser(bruno, `update public.list_items set created_by = $2 where id = $1`, [silvaItem, ana.id]),
    )
    expect(error.code).toBe('42501') // sem privilégio na coluna
  })
})

describe('isolamento entre famílias', () => {
  it('outra família não enxerga listas, itens, produtos nem a própria família', async () => {
    expect(await asUser(carla, 'select id from public.shopping_lists where id = $1', [silvaList])).toHaveLength(0)
    expect(await asUser(carla, 'select id from public.list_items where list_id = $1', [silvaList])).toHaveLength(0)
    expect(await asUser(carla, 'select id from public.products where id = $1', [silvaProduct])).toHaveLength(0)
    expect(await asUser(carla, 'select id from public.families where id = $1', [silva])).toHaveLength(0)
    expect(await asUser(carla, 'select * from public.family_members where family_id = $1', [silva])).toHaveLength(0)
  })

  it('visões de totais e preços também respeitam o RLS', async () => {
    expect(
      await asUser(carla, 'select * from public.shopping_list_summaries where list_id = $1', [silvaList]),
    ).toHaveLength(0)
    const own = await asUser<{ estimated_total: string }>(
      ana,
      'select estimated_total from public.shopping_list_summaries where list_id = $1',
      [silvaList],
    )
    expect(own).toHaveLength(1)
  })

  it('não insere item na lista de outra família, nem forjando o family_id', async () => {
    const forgedFamily = await expectDbError(
      asUser(carla, `insert into public.list_items (family_id, list_id, name) values ($1, $2, 'Invasão')`, [
        silva,
        silvaList,
      ]),
    )
    expect(forgedFamily.code).toBe('42501') // RLS
    const forgedList = await expectDbError(
      asUser(carla, `insert into public.list_items (family_id, list_id, name) values ($1, $2, 'Invasão')`, [
        souza,
        silvaList,
      ]),
    )
    expect(forgedList.code).toBe('23503') // a lista não pertence à família informada
  })

  it('não vincula produto de outra família a um item próprio', async () => {
    const souzaList = await asUserOne<{ id: string }>(
      carla,
      `insert into public.shopping_lists (family_id, name) values ($1, 'Feira') returning id`,
      [souza],
    )
    const error = await expectDbError(
      asUser(carla, `insert into public.list_items (family_id, list_id, product_id, name) values ($1, $2, $3, 'X')`, [
        souza,
        souzaList.id,
        silvaProduct,
      ]),
    )
    expect(error.code).toBe('23503')
  })

  it('alterações e exclusões em dados de outra família não afetam nenhuma linha', async () => {
    expect(
      await asUser(carla, `update public.list_items set name = 'X' where id = $1 returning id`, [silvaItem]),
    ).toHaveLength(0)
    expect(await asUser(carla, 'delete from public.list_items where id = $1 returning id', [silvaItem])).toHaveLength(
      0,
    )
    expect(
      await asUser(carla, 'delete from public.shopping_lists where id = $1 returning id', [silvaList]),
    ).toHaveLength(0)
    const still = await asUser(ana, 'select id from public.list_items where id = $1', [silvaItem])
    expect(still).toHaveLength(1)
  })

  it('funções não operam em listas de outra família', async () => {
    for (const sql of [
      'select public.set_featured_list($1)',
      'select public.duplicate_shopping_list($1)',
      'select public.complete_shopping_list($1)',
    ]) {
      const error = await expectDbError(asUser(carla, sql, [silvaList]))
      expect(error.hint).toBe('NOT_FOUND')
    }
    const adjust = await expectDbError(asUser(carla, 'select public.adjust_list_item_packages($1, 1)', [silvaItem]))
    expect(adjust.hint).toBe('NOT_FOUND')
    const packages = await asUserOne<{ packages: string }>(ana, 'select packages from public.list_items where id = $1', [
      silvaItem,
    ])
    expect(Number(packages.packages)).toBe(3)
  })

  it('não move registros para outra família', async () => {
    // Usuário comum: a coluna family_id nem pode ser alterada.
    const asMember = await expectDbError(
      asUser(ana, 'update public.products set family_id = $2 where id = $1', [silvaProduct, souza]),
    )
    expect(asMember.code).toBe('42501')
    // Mesmo como superusuário (sem RLS), o gatilho impede a troca.
    const asSuperuser = await pool
      .query('update public.products set family_id = $2 where id = $1', [silvaProduct, souza])
      .then(
        () => null,
        (e: { code?: string }) => e,
      )
    expect(asSuperuser?.code).toBe('42501')
  })

  it('visitante anônimo não acessa tabelas', async () => {
    const error = await expectDbError(asUser(null, 'select * from public.shopping_lists'))
    expect(error.code).toBe('42501')
  })
})

describe('convites', () => {
  it('somente administradores criam convites', async () => {
    const error = await expectDbError(asUser(bruno, 'select public.create_family_invite($1)', [silva]))
    expect(error.hint).toBe('NOT_ADMIN')
  })

  it('o token é guardado apenas como hash', async () => {
    const invite = await asUserOne<{ data: { token: string; invite_id: string } }>(
      ana,
      'select public.create_family_invite($1) as data',
      [silva],
    )
    const stored = await pool.query('select token_hash from public.family_invites where id = $1', [
      invite.data.invite_id,
    ])
    expect(stored.rows[0].token_hash).not.toContain(invite.data.token)
    expect(stored.rows[0].token_hash).toHaveLength(64)
    expect(invite.data.token.length).toBeGreaterThanOrEqual(40)
  })

  it('prévia funciona sem login e o convite é de uso único', async () => {
    const invite = await asUserOne<{ data: { token: string } }>(
      ana,
      'select public.create_family_invite($1) as data',
      [silva],
    )
    const preview = await asUserOne<{ data: { status: string; family_name: string; invited_by: string } }>(
      null,
      'select public.get_invite_preview($1) as data',
      [invite.data.token],
    )
    expect(preview.data).toMatchObject({ status: 'valid', family_name: 'Família Silva', invited_by: 'Ana' })

    const joined = await asUserOne<{ id: string }>(dani, 'select public.accept_family_invite($1) as id', [
      invite.data.token,
    ])
    expect(joined.id).toBe(silva)

    const eve = await createUser('Eve')
    const reused = await expectDbError(asUser(eve, 'select public.accept_family_invite($1)', [invite.data.token]))
    expect(reused.hint).toBe('INVITE_USED')

    // dani sai para não interferir nos demais testes
    await asUser(dani, 'select public.leave_family($1)', [silva])
  })

  it('convites revogados e expirados são recusados', async () => {
    const revoked = await asUserOne<{ data: { token: string; invite_id: string } }>(
      ana,
      'select public.create_family_invite($1) as data',
      [silva],
    )
    await asUser(ana, 'select public.revoke_family_invite($1)', [revoked.data.invite_id])
    const e1 = await expectDbError(asUser(dani, 'select public.accept_family_invite($1)', [revoked.data.token]))
    expect(e1.hint).toBe('INVITE_REVOKED')

    const expired = await asUserOne<{ data: { token: string; invite_id: string } }>(
      ana,
      'select public.create_family_invite($1) as data',
      [silva],
    )
    await pool.query(`update public.family_invites set expires_at = now() - interval '1 minute' where id = $1`, [
      expired.data.invite_id,
    ])
    const e2 = await expectDbError(asUser(dani, 'select public.accept_family_invite($1)', [expired.data.token]))
    expect(e2.hint).toBe('INVITE_EXPIRED')

    const e3 = await expectDbError(asUser(dani, 'select public.accept_family_invite($1)', ['token-inventado-que-nao-existe']))
    expect(e3.hint).toBe('INVITE_INVALID')
  })

  it('integrantes comuns não veem convites; outras famílias também não', async () => {
    expect(await asUser(bruno, 'select id from public.family_invites where family_id = $1', [silva])).toHaveLength(0)
    expect(await asUser(carla, 'select id from public.family_invites where family_id = $1', [silva])).toHaveLength(0)
    expect(
      (await asUser(ana, 'select id from public.family_invites where family_id = $1', [silva])).length,
    ).toBeGreaterThan(0)
  })
})

describe('papéis e saída da família', () => {
  it('o único administrador não pode sair nem se rebaixar', async () => {
    const leave = await expectDbError(asUser(ana, 'select public.leave_family($1)', [silva]))
    expect(leave.hint).toBe('LAST_ADMIN')
    const demote = await expectDbError(
      asUser(ana, `select public.set_family_member_role($1, $2, 'member')`, [silva, ana.id]),
    )
    expect(demote.hint).toBe('LAST_ADMIN')
  })

  it('integrante comum não muda papéis nem remove ninguém', async () => {
    const role = await expectDbError(
      asUser(bruno, `select public.set_family_member_role($1, $2, 'admin')`, [silva, bruno.id]),
    )
    expect(role.hint).toBe('NOT_ADMIN')
    const remove = await expectDbError(asUser(bruno, 'select public.remove_family_member($1, $2)', [silva, ana.id]))
    expect(remove.hint).toBe('NOT_ADMIN')
  })

  it('quem sai da família perde o acesso imediatamente', async () => {
    const famId = await createFamily(carla, 'Família Temporária')
    const frank = await createUser('Frank')
    await inviteAndJoin(carla, famId, frank)
    const list = await asUserOne<{ id: string }>(
      carla,
      `insert into public.shopping_lists (family_id, name) values ($1, 'Churrasco') returning id`,
      [famId],
    )
    expect(await asUser(frank, 'select id from public.shopping_lists where id = $1', [list.id])).toHaveLength(1)
    await asUser(frank, 'select public.leave_family($1)', [famId])
    expect(await asUser(frank, 'select id from public.shopping_lists where id = $1', [list.id])).toHaveLength(0)
  })

  it('o último integrante precisa excluir a família, com confirmação do nome', async () => {
    const famId = await createFamily(dani, 'Casa da Dani')
    const leave = await expectDbError(asUser(dani, 'select public.leave_family($1)', [famId]))
    expect(leave.hint).toBe('LAST_MEMBER')
    const wrong = await expectDbError(asUser(dani, 'select public.delete_family($1, $2)', [famId, 'outro nome']))
    expect(wrong.hint).toBe('CONFIRM_MISMATCH')
    await asUser(dani, 'select public.delete_family($1, $2)', [famId, 'casa da dani'])
    const gone = await pool.query('select id from public.families where id = $1', [famId])
    expect(gone.rowCount).toBe(0)
  })
})

describe('permissões de exclusão', () => {
  it('integrante não exclui lista criada por outra pessoa; administrador exclui', async () => {
    const annaList = await asUserOne<{ id: string }>(
      ana,
      `insert into public.shopping_lists (family_id, name) values ($1, 'Farmácia') returning id`,
      [silva],
    )
    expect(
      await asUser(bruno, 'delete from public.shopping_lists where id = $1 returning id', [annaList.id]),
    ).toHaveLength(0)

    const brunoList = await asUserOne<{ id: string }>(
      bruno,
      `insert into public.shopping_lists (family_id, name) values ($1, 'Açougue') returning id`,
      [silva],
    )
    expect(
      await asUser(ana, 'delete from public.shopping_lists where id = $1 returning id', [brunoList.id]),
    ).toHaveLength(1)
  })

  it('destaque só muda pela função, que garante uma lista por vez', async () => {
    const direct = await expectDbError(
      asUser(bruno, 'update public.shopping_lists set is_featured = true where id = $1', [silvaList]),
    )
    expect(direct.code).toBe('42501')

    const other = await asUserOne<{ id: string }>(
      bruno,
      `insert into public.shopping_lists (family_id, name) values ($1, 'Semanal') returning id`,
      [silva],
    )
    await asUser(bruno, 'select public.set_featured_list($1)', [silvaList])
    await asUser(bruno, 'select public.set_featured_list($1)', [other.id])
    const featured = await asUser<{ id: string }>(
      ana,
      'select id from public.shopping_lists where family_id = $1 and is_featured',
      [silva],
    )
    expect(featured.map((r) => r.id)).toEqual([other.id])
  })
})

describe('quantidades e sincronização', () => {
  it('ajustes simultâneos se somam e o mesmo ajuste reenviado vale uma vez só', async () => {
    const item = await asUserOne<{ id: string }>(
      ana,
      `insert into public.list_items (family_id, list_id, name, packages) values ($1, $2, 'Leite', 6) returning id`,
      [silva, silvaList],
    )
    await Promise.all([
      asUser(ana, 'select public.adjust_list_item_packages($1, 1)', [item.id]),
      asUser(bruno, 'select public.adjust_list_item_packages($1, 1)', [item.id]),
    ])
    const opId = randomUUID()
    await asUser(bruno, 'select public.adjust_list_item_packages($1, 2, $2)', [item.id, opId])
    await asUser(bruno, 'select public.adjust_list_item_packages($1, 2, $2)', [item.id, opId])
    const row = await asUserOne<{ packages: string }>(ana, 'select packages from public.list_items where id = $1', [
      item.id,
    ])
    expect(Number(row.packages)).toBe(10) // 6 + 1 + 1 + 2
  })

  it('a quantidade nunca chega a zero', async () => {
    const item = await asUserOne<{ id: string }>(
      ana,
      `insert into public.list_items (family_id, list_id, name, packages) values ($1, $2, 'Pão', 1) returning id`,
      [silva, silvaList],
    )
    const result = await asUserOne<{ packages: string }>(
      ana,
      'select public.adjust_list_item_packages($1, -1) as packages',
      [item.id],
    )
    expect(Number(result.packages)).toBe(1)
  })

  it('itens criados offline com o mesmo id não duplicam', async () => {
    const id = randomUUID()
    await asUser(ana, `insert into public.list_items (id, family_id, list_id, name) values ($1, $2, $3, 'Ovos')`, [
      id,
      silva,
      silvaList,
    ])
    const dup = await expectDbError(
      asUser(ana, `insert into public.list_items (id, family_id, list_id, name) values ($1, $2, $3, 'Ovos')`, [
        id,
        silva,
        silvaList,
      ]),
    )
    expect(dup.code).toBe('23505')
  })
})

describe('totais e finalização da compra', () => {
  it('multiplica o preço pela quantidade de embalagens e converte g/kg', async () => {
    const cases: Array<[number, number | null, string, number, string, string]> = [
      [3, 5, 'kg', 25.9, 'package', '77.70'], // 3 pacotes de 5 kg a R$ 25,90 cada
      [1, 1.5, 'kg', 39.9, 'measure', '59.85'], // 1,5 kg a R$ 39,90/kg
      [2, 500, 'g', 39.9, 'measure', '39.90'], // 2 bandejas de 500 g a R$ 39,90/kg
      [12, 1, 'L', 4.99, 'package', '59.88'],
      [1, 350, 'mL', 10, 'measure', '3.50'],
      [3, null, 'un', 0.333, 'package', '1.00'], // 0,999 → arredonda para 1,00
    ]
    for (const [packages, quantity, unit, price, basis, expected] of cases) {
      const row = await asUserOne<{ total: string }>(
        ana,
        'select public.item_line_total($1, $2, $3, $4, $5)::text as total',
        [packages, quantity, unit, price, basis],
      )
      expect(row.total).toBe(expected)
    }
  })

  it('finaliza a compra: registra itens, preços, cria produtos e arquiva a lista', async () => {
    const list = await asUserOne<{ id: string }>(
      ana,
      `insert into public.shopping_lists (family_id, name) values ($1, 'Compra semanal') returning id`,
      [silva],
    )
    const store = await asUserOne<{ id: string }>(
      ana,
      `insert into public.stores (family_id, name) values ($1, 'Mercado Central') returning id`,
      [silva],
    )
    await asUser(
      bruno,
      `insert into public.list_items (family_id, list_id, name, brand, packages, quantity, unit, unit_price, is_purchased)
       values ($1, $2, 'Café', 'Pilão', 2, 500, 'g', 18.50, true),
              ($1, $2, 'Banana', null, 2, null, 'duzia', 6.00, true),
              ($1, $2, 'Detergente', null, 3, 500, 'mL', 2.49, false)`,
      [silva, list.id],
    )
    const purchase = await asUserOne<{ id: string }>(
      bruno,
      'select public.complete_shopping_list($1, current_date, $2, 50.00) as id',
      [list.id, store.id],
    )
    const p = await asUserOne<{ estimated_total: string; paid_total: string; items_count: number; purchased_count: number }>(
      ana,
      'select estimated_total::text, paid_total::text, items_count, purchased_count from public.purchases where id = $1',
      [purchase.id],
    )
    expect(p).toMatchObject({ estimated_total: '49.00', paid_total: '50.00', items_count: 3, purchased_count: 2 })

    const items = await asUser<{ name: string; line_total: string }>(
      ana,
      'select name, line_total::text from public.purchase_items where purchase_id = $1 order by name',
      [purchase.id],
    )
    expect(items).toEqual([
      { name: 'Banana', line_total: '12.00' },
      { name: 'Café', line_total: '37.00' },
    ])

    const prices = await asUser<{ name: string; normalized: string }>(
      ana,
      `select p.name, r.normalized_price::text as normalized
       from public.price_records r join public.products p on p.id = r.product_id
       where r.purchase_id = $1 order by p.name`,
      [purchase.id],
    )
    expect(prices).toEqual([
      { name: 'Banana', normalized: '6.000000' },
      { name: 'Café', normalized: '37.000000' }, // R$ 18,50 por 500 g = R$ 37,00/kg
    ])

    const status = await asUserOne<{ status: string; is_featured: boolean }>(
      ana,
      'select status, is_featured from public.shopping_lists where id = $1',
      [list.id],
    )
    expect(status.status).toBe('archived')

    // Reabrir e finalizar de novo substitui o retrato anterior.
    await asUser(ana, `update public.shopping_lists set status = 'active' where id = $1`, [list.id])
    await asUser(ana, 'select public.complete_shopping_list($1)', [list.id])
    const purchases = await asUser(ana, 'select id from public.purchases where list_id = $1', [list.id])
    expect(purchases).toHaveLength(1)
    const records = await asUser(
      ana,
      `select r.id from public.price_records r join public.purchases pu on pu.id = r.purchase_id where pu.list_id = $1`,
      [list.id],
    )
    expect(records).toHaveLength(2)
  })

  it('não finaliza lista sem itens comprados', async () => {
    const list = await asUserOne<{ id: string }>(
      ana,
      `insert into public.shopping_lists (family_id, name) values ($1, 'Vazia') returning id`,
      [silva],
    )
    const error = await expectDbError(asUser(ana, 'select public.complete_shopping_list($1)', [list.id]))
    expect(error.hint).toBe('NOTHING_PURCHASED')
  })

  it('histórico de preços é somente inclusão (não se altera um preço registrado)', async () => {
    const record = await asUserOne<{ id: string }>(
      ana,
      `insert into public.price_records (family_id, product_id, price, quantity, unit) values ($1, $2, 8.99, 1, 'kg') returning id`,
      [silva, silvaProduct],
    )
    const error = await expectDbError(
      asUser(ana, 'update public.price_records set price = 1 where id = $1', [record.id]),
    )
    expect(error.code).toBe('42501')
    const forged = await expectDbError(
      asUser(ana, `insert into public.price_records (family_id, product_id, price, source) values ($1, $2, 1, 'purchase')`, [
        silva,
        silvaProduct,
      ]),
    )
    expect(forged.code).toBe('42501')
  })

  it('estatísticas comparam preços normalizados de embalagens diferentes', async () => {
    const product = await asUserOne<{ id: string }>(
      ana,
      `insert into public.products (family_id, name, unit) values ($1, 'Açúcar', 'kg') returning id`,
      [silva],
    )
    await asUser(
      ana,
      `insert into public.price_records (family_id, product_id, price, quantity, unit, recorded_on)
       values ($1, $2, 25.00, 5, 'kg', current_date - 10),
              ($1, $2, 6.00, 1, 'kg', current_date)`,
      [silva, product.id],
    )
    const stats = await asUserOne<{ last_normalized: string; previous_normalized: string; min_normalized: string }>(
      ana,
      `select last_normalized::text, previous_normalized::text, min_normalized::text
       from public.product_price_stats where product_id = $1`,
      [product.id],
    )
    expect(stats).toEqual({ last_normalized: '6.000000', previous_normalized: '5.000000', min_normalized: '5.000000' })
  })
})
