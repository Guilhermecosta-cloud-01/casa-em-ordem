import { type Browser, expect, type Page, test } from '@playwright/test'
import { createFamily, createList, itemRow, money, quickAdd, signIn, signUp, uniqueEmail, waitSynced } from './helpers'

// Módulos da etapa 6: tarefas, estoque, despesas, agenda, conversas,
// notificações, categorias, aparência, exclusão de conta e uso offline.

async function familyOfTwo(browser: Browser, family: string) {
  const a = await (await browser.newContext()).newPage()
  const b = await (await browser.newContext()).newPage()
  await signUp(a, 'Rita Lima', uniqueEmail('rita'))
  await createFamily(a, family)
  await a.goto('/familia')
  await a.getByRole('button', { name: 'Convidar' }).click()
  await a.getByRole('button', { name: 'Criar link de convite' }).click()
  const link = (await a.getByLabel('Link do convite').textContent())!.trim()
  await a.keyboard.press('Escape')
  await signUp(b, 'Caio Lima', uniqueEmail('caio'), new URL(link).pathname)
  await b.getByRole('button', { name: 'Entrar na família' }).click()
  await b.waitForURL((url) => url.pathname === '/')
  return { a, b }
}

function sheet(page: Page) {
  return page.getByRole('dialog')
}

test('tarefas: responsável, recorrência, conclusão e histórico', async ({ page }) => {
  await signUp(page, 'Teste Tarefas', uniqueEmail('tarefas'))
  await createFamily(page, 'Família Tarefas')
  await page.goto('/tarefas')
  await page.getByPlaceholder('Nova tarefa, ex.: levar o lixo').fill('Regar as plantas')
  await page.getByRole('button', { name: 'Adicionar', exact: true }).click()
  await page.getByRole('button', { name: /^Regar as plantas/ }).click()
  await sheet(page).getByRole('button', { name: 'Hoje' }).click()
  await sheet(page).getByLabel('Repetir').selectOption('weekly')
  await sheet(page).getByLabel('Responsável').selectOption({ label: 'Você' })
  await sheet(page).getByRole('button', { name: 'Salvar' }).click()
  await expect(page.getByText('Toda semana')).toBeVisible()
  await waitSynced(page)

  await page.getByRole('checkbox', { name: 'Marcar Regar as plantas como feita' }).click()
  await expect(page.getByText('Feita. A próxima já está na lista.')).toBeVisible()
  await waitSynced(page)
  await page.reload()
  // A próxima ocorrência (daqui a 7 dias) já está na lista de "A fazer".
  await expect(page.getByRole('checkbox', { name: 'Marcar Regar as plantas como feita' })).toBeVisible()
  await expect(page.getByText('Próximos 7 dias')).toBeVisible()
  await page.getByRole('radio', { name: 'Feitas' }).click()
  await expect(page.getByText(/Feita por você em/)).toBeVisible()
})

test('estoque: mínimo, alerta de reposição e envio para a lista', async ({ page }) => {
  await signUp(page, 'Teste Estoque', uniqueEmail('estoque'))
  await createFamily(page, 'Família Estoque')
  await createList(page, 'Mercado')
  await page.goto('/estoque')
  await page.getByRole('button', { name: 'Novo' }).click()
  await sheet(page).getByLabel('Item').fill('Café')
  await sheet(page).getByLabel('Quantidade em casa').fill('2')
  await sheet(page).getByLabel('Unidade').selectOption('pacote')
  await sheet(page).getByLabel('Estoque mínimo').fill('1')
  await sheet(page).getByLabel('Onde fica').fill('Despensa')
  await sheet(page).getByRole('button', { name: 'Cadastrar' }).click()
  await expect(page.getByText('2 pacotes')).toBeVisible()

  await page.getByRole('button', { name: 'Diminuir Quantidade de Café' }).click()
  await expect(page.getByText('Acabando', { exact: true })).toBeVisible()
  await expect(page.getByText('1 item acabando')).toBeVisible()
  await page.getByRole('button', { name: 'Pôr todos na lista' }).click()
  await sheet(page).getByRole('button', { name: 'Pôr na lista' }).click()
  await expect(page.getByText('Café incluído em Mercado.')).toBeVisible()
  await waitSynced(page)
  await page.goto('/listas')
  await page.getByRole('link', { name: /Mercado/ }).first().click()
  await expect(itemRow(page, 'Café')).toBeVisible()
})

test('despesas, conversas e notificações entre dois integrantes', async ({ browser }) => {
  const { a, b } = await familyOfTwo(browser, 'Família Lima')

  // Tarefa atribuída avisa quem recebeu.
  await a.goto('/tarefas')
  await a.getByRole('button', { name: 'Nova' }).click()
  await sheet(a).getByLabel('Tarefa').fill('Pagar a internet')
  await sheet(a).getByLabel('Responsável').selectOption({ label: 'Caio Lima' })
  await sheet(a).getByRole('button', { name: 'Adicionar tarefa' }).click()
  await waitSynced(a)
  await b.goto('/notificacoes')
  await expect(b.getByText('Nova tarefa para você')).toBeVisible({ timeout: 20_000 })
  await expect(b.getByText('Pagar a internet')).toBeVisible()

  // Despesa dividida igualmente: Caio deve R$ 40 para Rita; o acerto zera.
  await a.goto('/despesas')
  await a.getByRole('button', { name: 'Lançar' }).click()
  await sheet(a).getByLabel('Descrição').fill('Conta de água')
  await sheet(a).getByLabel('Valor').fill('80,00')
  await sheet(a).getByRole('radio', { name: 'Igual' }).click()
  await expect(sheet(a).getByText(money('R$ 40,00'))).toHaveCount(2)
  await sheet(a).getByRole('button', { name: 'Lançar despesa' }).click()
  await waitSynced(a)
  await expect(a.getByText(money('R$ 80,00')).first()).toBeVisible()
  await expect(a.getByRole('heading', { name: 'Quem deve a quem' })).toBeVisible({ timeout: 20_000 })
  await expect(a.getByRole('button', { name: 'Registrar acerto' })).toBeVisible()

  await b.goto('/despesas')
  await b.getByRole('button', { name: 'Registrar acerto' }).click()
  await b.getByRole('dialog').getByRole('button', { name: 'Registrar' }).click()
  await expect(b.getByText('Tudo certo: ninguém deve nada.')).toBeVisible()

  // Conversa do grupo: Caio vê a mensagem como não lida e responde.
  await a.goto('/conversas')
  await a.getByRole('button', { name: /Grupo da família/ }).click()
  await a.getByLabel('Mensagem').fill('Oi, família!')
  await a.getByRole('button', { name: 'Enviar' }).click()
  await waitSynced(a)
  await b.goto('/conversas')
  await expect(b.getByRole('button', { name: /Grupo da família.*1 não lidas/ })).toBeVisible({ timeout: 20_000 })
  await b.getByRole('button', { name: /Grupo da família/ }).click()
  await expect(b.getByText('Oi, família!')).toBeVisible()
  await b.getByLabel('Mensagem').fill('Oi! Tudo certo por aqui.')
  await b.getByLabel('Mensagem').press('Enter')
  await expect(a.getByText('Oi! Tudo certo por aqui.')).toBeVisible({ timeout: 20_000 })
})

test('agenda, categorias, modo escuro e exclusão da conta', async ({ page }) => {
  const email = uniqueEmail('agenda')
  await signUp(page, 'Teste Agenda', email)
  await createFamily(page, 'Família Agenda')

  const tomorrow = new Date(Date.now() + 24 * 3600 * 1000)
  const iso = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`
  await page.goto('/agenda')
  await page.getByRole('button', { name: 'Novo' }).click()
  await sheet(page).getByLabel('Título').fill('Reunião da escola')
  await sheet(page).getByLabel('Data').fill(iso)
  await sheet(page).getByRole('switch', { name: 'Dia todo' }).click()
  await sheet(page).getByLabel('Início').fill('19:00')
  await sheet(page).getByLabel('Lembrete').selectOption('60')
  await sheet(page).getByRole('button', { name: 'Adicionar à agenda' }).click()
  await expect(page.getByRole('heading', { name: /^Amanhã/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /19:00.*Reunião da escola/ })).toBeVisible()
  await page.getByRole('radio', { name: 'Mês' }).click()
  if (tomorrow.getMonth() !== new Date().getMonth()) await page.getByRole('button', { name: 'Próximo mês' }).click()
  await page.getByRole('button', { name: new RegExp(`^${tomorrow.getDate()} de .*1 na agenda`) }).click()
  await expect(page.getByText('Reunião da escola')).toBeVisible()
  await waitSynced(page)

  // Categoria da família aparece nos itens da lista.
  await page.goto('/categorias')
  await page.getByRole('button', { name: 'Nova' }).click()
  await sheet(page).getByLabel('Nome').fill('Festa')
  await sheet(page).getByRole('button', { name: 'Salvar' }).click()
  await expect(page.getByText('Categoria criada.')).toBeVisible()
  await createList(page, 'Aniversário')
  await quickAdd(page, 'balões')
  await page.getByRole('button', { name: /^Balões/ }).first().click()
  await sheet(page).getByLabel('Categoria').selectOption({ label: '🏷️ Festa' })
  await sheet(page).getByRole('button', { name: 'Salvar', exact: true }).click()
  await expect(page.getByRole('heading', { name: /Festa/ })).toBeVisible()
  await waitSynced(page)

  // Aparência escura.
  await page.goto('/perfil')
  await page.getByRole('radio', { name: 'Escura' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

  // Excluir a conta (única integrante: a família vai junto).
  await page.getByRole('button', { name: 'Excluir minha conta' }).click()
  await page.getByLabel('Digite "EXCLUIR" para confirmar').fill('EXCLUIR')
  await page.getByRole('dialog').getByRole('button', { name: 'Excluir conta' }).click()
  await page.waitForURL('**/entrar')
  await signIn(page, email)
  await expect(page.getByText(/incorret|inválid/i)).toBeVisible()
})

test('sem internet: tarefa e lista nova ficam na fila e sobem ao voltar', async ({ page, context }) => {
  await signUp(page, 'Teste Offline', uniqueEmail('offline2'))
  await createFamily(page, 'Família Offline')
  await page.goto('/tarefas')
  await page.getByText('Nenhuma tarefa por fazer').waitFor()
  await page.waitForTimeout(1000)
  await page.goto('/listas')
  await page.waitForTimeout(1000)

  await context.setOffline(true)
  await page.getByRole('navigation', { name: 'Navegação principal' }).last().getByRole('link', { name: 'Tarefas' }).click()
  await page.getByPlaceholder('Nova tarefa, ex.: levar o lixo').fill('Comprar pilhas')
  await page.getByRole('button', { name: 'Adicionar', exact: true }).click()
  await expect(page.getByRole('button', { name: /Comprar pilhas.*pendente/ })).toBeVisible()

  await page.getByRole('navigation', { name: 'Navegação principal' }).last().getByRole('link', { name: 'Listas' }).click()
  await page.getByRole('button', { name: 'Nova lista' }).click()
  await page.getByLabel('Nome', { exact: true }).fill('Feira sem internet')
  await page.getByRole('button', { name: 'Criar lista' }).click()
  await page.waitForURL('**/listas/*')
  const listUrl = page.url()
  await quickAdd(page, 'banana')
  await expect(itemRow(page, 'Banana')).toBeVisible()

  await context.setOffline(false)
  await waitSynced(page)
  await page.goto(listUrl)
  await expect(itemRow(page, 'Banana')).toBeVisible()
  await page.goto('/tarefas')
  await expect(page.getByRole('button', { name: /^Comprar pilhas/ })).toBeVisible()
  await expect(page.getByText('pendente')).toHaveCount(0)
})
