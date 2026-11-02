import { readFileSync } from 'node:fs'
import { expect, type Page } from '@playwright/test'

export const PASSWORD = 'senha-de-teste-123'

export function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@teste.local`
}

export function stackEnv(): Record<string, string> {
  const text = readFileSync(new URL('../../.local-stack/env', import.meta.url), 'utf8')
  return Object.fromEntries(
    text
      .split('\n')
      .filter((l) => l.includes('='))
      .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
  )
}

export async function signUp(page: Page, name: string, email: string, next?: string) {
  await page.goto(next ? `/criar-conta?next=${encodeURIComponent(next)}` : '/criar-conta')
  await page.getByLabel('Seu nome').fill(name)
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha').fill(PASSWORD)
  await page.getByRole('button', { name: 'Criar conta' }).click()
}

export async function signIn(page: Page, email: string) {
  await page.goto('/entrar')
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha').fill(PASSWORD)
  await page.getByRole('button', { name: 'Entrar' }).click()
}

export async function createFamily(page: Page, name: string) {
  await page.waitForURL('**/comecar')
  await page.getByLabel('Nome da família').fill(name)
  await page.getByRole('button', { name: 'Criar família' }).click()
  await page.waitForURL((url) => url.pathname === '/')
}

export async function createList(page: Page, name: string, budget?: string) {
  await page.goto('/listas')
  await page.getByRole('button', { name: 'Nova lista' }).click()
  await page.getByLabel('Nome', { exact: true }).fill(name)
  if (budget) await page.getByLabel('Orçamento (opcional)').fill(budget)
  await page.getByRole('button', { name: 'Criar lista' }).click()
  await page.waitForURL('**/listas/*')
  return page.url().split('/listas/')[1]!
}

export async function quickAdd(page: Page, ...texts: string[]) {
  const input = page.getByPlaceholder('Adicionar item, ex.: 3 arroz 5kg')
  for (const text of texts) {
    await input.fill(text)
    await input.press('Enter')
    await expect(input).toHaveValue('')
  }
}

export function itemRow(page: Page, name: string) {
  return page.locator('li').filter({ has: page.getByRole('checkbox', { name: new RegExp(`${name}`) }) })
}

export async function openItem(page: Page, name: string) {
  await page.getByRole('button', { name: new RegExp(`^${name}`) }).first().click()
  await expect(page.getByRole('heading', { name: 'Editar item' })).toBeVisible()
}

/** Espera a fila de sincronização esvaziar (nada pendente para o servidor). */
export async function waitSynced(page: Page) {
  await expect(page.getByRole('button', { name: /Sincronização: .*pendente/ })).toHaveCount(0, { timeout: 20_000 })
  await expect(page.getByRole('button', { name: /Sincronização: Salvando/ })).toHaveCount(0, { timeout: 20_000 })
}

/**
 * Expressão para textos com valores em reais. O Intl separa "R$" do número
 * com espaço não separável; aqui qualquer espaço serve.
 */
export function money(value: string): RegExp {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(escaped.replaceAll('R\\$ ', 'R\\$\\s'))
}
