import { expect, test } from '@playwright/test'
import { createFamily, createList, itemRow, quickAdd, signUp, stackEnv, uniqueEmail, waitSynced } from './helpers'

// Testes 16, 17 e 18 da seção 12: celular × computador, perda de conexão e PWA.

test('16. usa navegação inferior no celular e lateral no computador', async ({ browser }) => {
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  const p = await phone.newPage()
  await signUp(p, 'Nina Melo', uniqueEmail('nina'))
  await createFamily(p, 'Família Melo')
  const bottomNav = p.locator('nav[aria-label="Navegação principal"]').last()
  await expect(bottomNav).toBeVisible()
  await expect(p.locator('aside')).toBeHidden()
  // Nada transborda horizontalmente na tela pequena.
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)

  const desktop = await browser.newContext({ viewport: { width: 1366, height: 860 }, storageState: await phone.storageState() })
  const d = await desktop.newPage()
  await d.goto('/')
  await expect(d.locator('aside')).toBeVisible()
  await expect(d.locator('aside').getByRole('link', { name: 'Calculadora' })).toBeVisible()
  await d.locator('aside').getByRole('link', { name: 'Calculadora' }).click()
  await expect(d.getByRole('heading', { name: 'Calculadora' })).toBeVisible()
  await phone.close()
  await desktop.close()
})

test('17. sem internet: guarda alterações, avisa que estão pendentes e envia ao voltar', async ({ page, context, request }) => {
  await signUp(page, 'Otávio Reis', uniqueEmail('otavio'))
  await createFamily(page, 'Família Reis')
  const listId = await createList(page, 'Mercado')
  await quickAdd(page, '2 feijão 1kg', 'café')
  await waitSynced(page)
  // Garante que o service worker já assumiu a página (abre offline depois).
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  await page.reload()
  await expect(itemRow(page, 'Feijão')).toBeVisible()
  // Na vida real ninguém perde a conexão no mesmo instante em que a lista
  // abre; damos o tempo de o aparelho guardar a lista carregada.
  await page.waitForTimeout(1000)

  await context.setOffline(true)
  await page.getByRole('checkbox', { name: 'Marcar Feijão como comprado' }).click()
  await quickAdd(page, 'açúcar')
  // A tela mostra a mudança, mas deixa claro que ainda não foi enviada.
  await expect(page.getByRole('checkbox', { name: 'Desmarcar Feijão' })).toBeChecked()
  await expect(itemRow(page, 'Açúcar')).toBeVisible()
  await expect(page.getByRole('button', { name: /Sincronização: Sem internet, 2 pendentes/ })).toBeVisible()
  await expect(itemRow(page, 'Açúcar').getByText('aguardando envio')).toBeAttached()

  // Fechar e abrir o app sem internet: a lista e as pendências continuam lá.
  await page.reload()
  await expect(itemRow(page, 'Açúcar')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('checkbox', { name: 'Desmarcar Feijão' })).toBeChecked()
  await expect(page.getByRole('button', { name: /pendentes/ })).toBeVisible()
  await page.getByRole('button', { name: /pendentes/ }).click()
  await expect(page.getByRole('heading', { name: 'Aguardando envio' })).toBeVisible()
  await expect(page.getByText('Você está sem internet.', { exact: false })).toBeVisible()
  await page.keyboard.press('Escape')

  // Ainda nada chegou ao servidor.
  const env = stackEnv()
  const serviceHeaders = { apikey: env.SUPABASE_SERVICE_ROLE_KEY!, authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` }
  let items = (await (await request.get(`${env.VITE_SUPABASE_URL}/rest/v1/list_items?list_id=eq.${listId}&select=name,is_purchased`, { headers: serviceHeaders })).json()) as Array<{ name: string; is_purchased: boolean }>
  expect(items.map((i) => i.name).sort()).toEqual(['Café', 'Feijão'])

  // Volta a conexão: a fila é enviada e o servidor confirma.
  await context.setOffline(false)
  await waitSynced(page)
  await expect.poll(async () => {
    items = (await (await request.get(`${env.VITE_SUPABASE_URL}/rest/v1/list_items?list_id=eq.${listId}&select=name,is_purchased`, { headers: serviceHeaders })).json()) as typeof items
    return items.map((i) => `${i.name}:${i.is_purchased}`).sort()
  }).toEqual(['Café:false', 'Açúcar:false', 'Feijão:true'].sort())
})

test('18. instalável como PWA: manifesto, ícones e service worker', async ({ page, request }) => {
  const manifestResponse = await request.get('/manifest.webmanifest')
  expect(manifestResponse.ok()).toBe(true)
  const manifest = (await manifestResponse.json()) as {
    name: string
    short_name: string
    display: string
    start_url: string
    lang: string
    icons: Array<{ src: string; sizes: string; purpose?: string }>
  }
  expect(manifest).toMatchObject({ name: 'Casa em Ordem', display: 'standalone', start_url: '/', lang: 'pt-BR' })
  expect(manifest.icons.map((i) => i.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']))
  expect(manifest.icons.some((i) => i.purpose === 'maskable')).toBe(true)
  for (const icon of manifest.icons) {
    expect((await request.get(icon.src)).ok()).toBe(true)
  }
  expect((await request.get('/apple-touch-icon.png')).ok()).toBe(true)

  await page.goto('/entrar')
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', /manifest\.webmanifest/)
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#2340A8')
  const controlled = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready
    return Boolean(registration.active)
  })
  expect(controlled).toBe(true)
  // Recarregada, a página é servida pelo service worker (base do uso offline).
  await page.reload()
  expect(await page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true)
})
