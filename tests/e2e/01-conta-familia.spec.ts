import { expect, test } from '@playwright/test'
import { createFamily, createList, PASSWORD, signIn, signUp, stackEnv, uniqueEmail } from './helpers'

// Testes 1, 2 e 9 da seção 12: conta, família, convite e isolamento.

test('1. cria conta, sai e entra de novo', async ({ page }) => {
  const email = uniqueEmail('ana')
  await signUp(page, 'Ana Souza', email)
  await expect(page.getByRole('heading', { name: 'Olá, Ana!' })).toBeVisible()
  await createFamily(page, 'Família Souza')
  await expect(page.locator('header').getByText('Família Souza')).toBeVisible()

  await page.goto('/perfil')
  await page.getByRole('button', { name: 'Sair da conta' }).click()
  await page.getByRole('button', { name: 'Sair', exact: true }).click()
  await page.waitForURL('**/entrar')

  // Senha errada é recusada com mensagem clara.
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha').fill('senha-errada-000')
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page.getByText('E-mail ou senha incorretos.')).toBeVisible()

  await signIn(page, email)
  await page.waitForURL((url) => url.pathname === '/')
  await expect(page.locator('header').getByText('Família Souza')).toBeVisible()
})

test('2. cria família, convida outra pessoa e o convite vale uma vez só', async ({ browser }) => {
  const admin = await browser.newContext()
  const guest = await browser.newContext()
  const late = await browser.newContext()
  const a = await admin.newPage()
  const b = await guest.newPage()
  const c = await late.newPage()

  await signUp(a, 'Marta Lima', uniqueEmail('marta'))
  await createFamily(a, 'Família Lima')
  await a.goto('/familia')
  await a.getByRole('button', { name: 'Convidar' }).click()
  await a.getByLabel('Para quem? (opcional)').fill('Pedro')
  await a.getByRole('button', { name: 'Criar link de convite' }).click()
  const link = (await a.getByLabel('Link do convite').textContent())!.trim()
  expect(link).toMatch(/\/convite\/[A-Za-z0-9_-]{40,}$/)
  const path = new URL(link).pathname

  // Convidado abre o link sem conta, cria a conta e entra na família.
  await b.goto(path)
  await expect(b.getByRole('heading', { name: 'Convite para Família Lima' })).toBeVisible()
  await expect(b.getByText('Marta Lima convidou você')).toBeVisible()
  await b.getByRole('link', { name: 'Criar conta e entrar' }).click()
  await b.getByLabel('Seu nome').fill('Pedro Lima')
  await b.getByLabel('E-mail').fill(uniqueEmail('pedro'))
  await b.getByLabel('Senha').fill(PASSWORD)
  await b.getByRole('button', { name: 'Criar conta' }).click()
  await b.waitForURL(`**${path}`)
  await b.getByRole('button', { name: 'Entrar na família' }).click()
  await b.waitForURL((url) => url.pathname === '/')
  await b.goto('/familia')
  await expect(b.getByText('Marta Lima')).toBeVisible()
  await expect(b.getByText('Você, desde', { exact: false })).toBeVisible()
  // Integrante comum não vê o botão de convite.
  await expect(b.getByRole('button', { name: 'Convidar' })).toHaveCount(0)

  // O mesmo link não serve para uma terceira pessoa.
  await c.goto(path)
  await expect(c.getByRole('heading', { name: 'Convite indisponível' })).toBeVisible()
  await expect(c.getByText('Este convite já foi usado.')).toBeVisible()

  // A administradora vê o novo integrante.
  await a.reload()
  await expect(a.getByText('Pedro Lima')).toBeVisible()

  await admin.close()
  await guest.close()
  await late.close()
})

test('9. outra família não acessa a lista nem pela URL nem pela API', async ({ browser, request }) => {
  const owner = await browser.newContext()
  const intruder = await browser.newContext()
  const a = await owner.newPage()
  const x = await intruder.newPage()

  await signUp(a, 'Rita Alves', uniqueEmail('rita'))
  await createFamily(a, 'Família Alves')
  const listId = await createList(a, 'Lista secreta')

  const intruderEmail = uniqueEmail('intruso')
  await signUp(x, 'Intruso', intruderEmail)
  await createFamily(x, 'Outra família')

  // Pela URL: a lista "não existe" para quem é de outra família.
  await x.goto(`/listas/${listId}`)
  await expect(x.getByText('Lista não encontrada')).toBeVisible()

  // Pela API, com o token do intruso: nenhuma linha volta e nada é gravado.
  const env = stackEnv()
  const login = await request.post(`${env.VITE_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    headers: { apikey: env.VITE_SUPABASE_ANON_KEY!, 'content-type': 'application/json' },
    data: { email: intruderEmail, password: PASSWORD },
  })
  const { access_token: token } = (await login.json()) as { access_token: string }
  const headers = { apikey: env.VITE_SUPABASE_ANON_KEY!, authorization: `Bearer ${token}`, 'content-type': 'application/json' }
  const read = await request.get(`${env.VITE_SUPABASE_URL}/rest/v1/shopping_lists?id=eq.${listId}`, { headers })
  expect(await read.json()).toEqual([])
  const items = await request.get(`${env.VITE_SUPABASE_URL}/rest/v1/list_items?list_id=eq.${listId}`, { headers })
  expect(await items.json()).toEqual([])
  const write = await request.patch(`${env.VITE_SUPABASE_URL}/rest/v1/shopping_lists?id=eq.${listId}`, {
    headers: { ...headers, prefer: 'return=representation' },
    data: { name: 'Invadida' },
  })
  expect(await write.json()).toEqual([])

  await a.reload()
  await expect(a.getByRole('heading', { name: 'Lista secreta' })).toBeVisible()
  await owner.close()
  await intruder.close()
})
