import { expect, test } from '@playwright/test'
import { createFamily, createList, itemRow, money, openItem, quickAdd, signUp, uniqueEmail, waitSynced } from './helpers'

// Testes 3 a 8 da seção 12: listas, itens, totais, compras e sincronização.

test('3. cria, edita, duplica e exclui listas', async ({ page }) => {
  await signUp(page, 'Clara Dias', uniqueEmail('clara'))
  await createFamily(page, 'Família Dias')
  await createList(page, 'Feira de sábado')
  await quickAdd(page, 'tomate', '2 dz banana')
  await waitSynced(page)

  // Editar nome e orçamento
  await page.getByRole('button', { name: 'Opções da lista' }).click()
  await page.getByRole('button', { name: /Editar lista/ }).click()
  await page.getByLabel('Nome', { exact: true }).fill('Feira de domingo')
  await page.getByLabel('Orçamento (opcional)').fill('80')
  await page.getByRole('button', { name: 'Salvar' }).click()
  await expect(page.getByRole('heading', { name: 'Feira de domingo' })).toBeVisible()
  await expect(page.getByRole('button', { name: money('Orçamento R$ 80,00') })).toBeVisible()

  // Duplicar
  await page.getByRole('button', { name: 'Opções da lista' }).click()
  await page.getByRole('button', { name: /Duplicar lista/ }).click()
  await page.getByLabel('Nome da nova lista').fill('Feira da semana que vem')
  await page.getByRole('button', { name: 'Duplicar', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Feira da semana que vem' })).toBeVisible()
  await expect(itemRow(page, 'Tomate')).toBeVisible()
  await expect(itemRow(page, 'Banana')).toBeVisible()

  // Excluir com confirmação
  await page.getByRole('button', { name: 'Opções da lista' }).click()
  await page.getByRole('button', { name: /Excluir lista/ }).click()
  await expect(page.getByRole('heading', { name: 'Excluir "Feira da semana que vem"?' })).toBeVisible()
  await page.getByRole('button', { name: 'Excluir lista' }).click()
  await page.waitForURL('**/listas')
  await expect(page.getByText('Feira de domingo')).toBeVisible()
  await expect(page.getByText('Feira da semana que vem')).toHaveCount(0)
})

test('4, 5, 6 e 8. itens, quantidades, totais, comprados e persistência', async ({ page, context }) => {
  await signUp(page, 'Beto Ramos', uniqueEmail('beto'))
  await createFamily(page, 'Família Ramos')
  const listId = await createList(page, 'Compra do mês', '200')
  await quickAdd(page, '3 arroz 5kg', '1,5 kg carne moída', '12 leite 1L')

  // 4. Embalagens × conteúdo: 3 pacotes de 5 kg = 15 kg
  await expect(itemRow(page, 'Arroz')).toContainText('3 × 5 kg')
  await expect(itemRow(page, 'Arroz')).toContainText('(15 kg)')

  // Preço por embalagem: 3 × R$ 25,90 = R$ 77,70 (e não R$ 25,90)
  await openItem(page, 'Arroz')
  await page.getByLabel(/Preço estimado/).fill('25,90')
  await expect(page.getByText(money('R$ 77,70'))).toBeVisible()
  await page.getByRole('button', { name: 'Salvar', exact: true }).click()
  await expect(itemRow(page, 'Arroz')).toContainText(money('R$ 77,70'))

  // Preço por kg: 1,5 kg × R$ 39,90 = R$ 59,85
  await openItem(page, 'Carne moída')
  await page.getByLabel(/Preço estimado/).fill('39,90')
  await page.getByRole('radio', { name: 'por kg' }).click()
  await page.getByLabel('Observações (opcional)').fill('Moer duas vezes')
  await page.getByRole('button', { name: 'Salvar', exact: true }).click()
  await expect(itemRow(page, 'Carne moída')).toContainText(money('R$ 59,85'))
  await expect(itemRow(page, 'Carne moída')).toContainText('Moer duas vezes')

  await openItem(page, 'Leite')
  await page.getByLabel(/Preço estimado/).fill('4,99')
  await page.getByRole('button', { name: 'Salvar', exact: true }).click()

  // 5. Total estimado: 77,70 + 59,85 + 59,88 = 197,43
  await expect(page.getByText(money('R$ 197,43')).first()).toBeVisible()
  await expect(page.getByText(money('Sobram R$ 2,57'))).toBeVisible()

  // 4. Alterar quantidade rapidamente: + no leite → 13 × 4,99 = 64,87; total 202,42
  await itemRow(page, 'Leite').getByRole('button', { name: /Aumentar/ }).click()
  await expect(itemRow(page, 'Leite')).toContainText(money('R$ 64,87'))
  await expect(page.getByText(money('R$ 202,42')).first()).toBeVisible()
  await expect(page.getByText(money('Passou R$ 2,42 do orçamento'))).toBeVisible()

  // 6. Marcar como comprado e desmarcar por engano
  await page.getByRole('checkbox', { name: 'Marcar Arroz como comprado' }).click()
  await expect(page.getByRole('checkbox', { name: 'Desmarcar Arroz' })).toBeChecked()
  await expect(page.getByText('1 de 3 itens comprados')).toBeVisible()
  await page.getByRole('checkbox', { name: 'Marcar Carne moída como comprado' }).click()
  await page.getByRole('checkbox', { name: 'Desmarcar Carne moída' }).click()
  await expect(page.getByRole('checkbox', { name: 'Marcar Carne moída como comprado' })).not.toBeChecked()

  // Filtros e busca
  await page.getByRole('radio', { name: /Comprados/ }).click()
  await expect(itemRow(page, 'Arroz')).toBeVisible()
  await expect(itemRow(page, 'Leite')).toHaveCount(0)
  await page.getByRole('radio', { name: /Todos/ }).click()
  await page.getByRole('button', { name: 'Buscar item' }).click()
  await page.getByLabel('Buscar na lista').fill('carne')
  await expect(itemRow(page, 'Carne moída')).toBeVisible()
  await expect(itemRow(page, 'Arroz')).toHaveCount(0)
  await page.getByRole('button', { name: 'Fechar busca' }).click()
  await waitSynced(page)

  // 8. Fechar e reabrir: os dados vêm do servidor
  await page.close()
  const again = await context.newPage()
  await again.goto(`/listas/${listId}`)
  await expect(itemRow(again, 'Arroz')).toContainText(money('R$ 77,70'))
  await expect(again.getByRole('checkbox', { name: 'Desmarcar Arroz' })).toBeChecked()
  await expect(itemRow(again, 'Leite')).toContainText(money('R$ 64,87'))
  await expect(again.getByText(money('R$ 202,42')).first()).toBeVisible()

  // Finalizar compra → histórico
  await again.getByRole('button', { name: 'Opções da lista' }).click()
  await again.getByRole('button', { name: /Finalizar compra/ }).click()
  await again.getByLabel('Valor pago (opcional)').fill('80,10')
  await again.getByLabel('Onde vocês compraram (opcional)').selectOption('__new')
  await again.getByLabel('Nome do estabelecimento').fill('Mercado do Bairro')
  await again.getByRole('button', { name: 'Finalizar compra' }).click()
  await again.waitForURL('**/historico/*')
  await expect(again.getByText(money('R$ 80,10')).first()).toBeVisible()
  await expect(again.getByText(money('R$ 2,40 acima do estimado'))).toBeVisible()

  // O arroz entrou no catálogo com o preço registrado
  await again.goto('/produtos')
  await again.getByRole('link', { name: /Arroz/ }).click()
  await expect(again.getByText('Último preço pago')).toBeVisible()
  await expect(again.getByText(money('R$ 5,18/kg')).first()).toBeVisible()
})

test('7. dois integrantes veem as mesmas alterações', async ({ browser }) => {
  const ctxA = await browser.newContext()
  const ctxB = await browser.newContext()
  const a = await ctxA.newPage()
  const b = await ctxB.newPage()

  await signUp(a, 'Lia Prado', uniqueEmail('lia'))
  await createFamily(a, 'Família Prado')
  await a.goto('/familia')
  await a.getByRole('button', { name: 'Convidar' }).click()
  await a.getByRole('button', { name: 'Criar link de convite' }).click()
  const link = (await a.getByLabel('Link do convite').textContent())!.trim()
  await a.keyboard.press('Escape')
  const listId = await createList(a, 'Churrasco')
  await quickAdd(a, '2 kg picanha', 'carvão')
  await waitSynced(a)

  await signUp(b, 'Davi Prado', uniqueEmail('davi'), new URL(link).pathname)
  await b.getByRole('button', { name: 'Entrar na família' }).click()
  await b.waitForURL((url) => url.pathname === '/')
  await b.goto(`/listas/${listId}`)
  await expect(itemRow(b, 'Picanha')).toBeVisible()
  await expect(itemRow(b, 'Carvão')).toBeVisible()

  // B inclui um item e marca outro; A recebe sem recarregar a página.
  await quickAdd(b, '6 cerveja 350ml')
  await b.getByRole('checkbox', { name: 'Marcar Carvão como comprado' }).click()
  await waitSynced(b)
  await expect(itemRow(a, 'Cerveja')).toBeVisible({ timeout: 20_000 })
  await expect(a.getByRole('checkbox', { name: 'Desmarcar Carvão' })).toBeChecked({ timeout: 20_000 })

  // Os dois tocam em "+" ao mesmo tempo: nenhuma alteração se perde (6 + 1 + 1 = 8).
  await Promise.all([
    itemRow(a, 'Cerveja').getByRole('button', { name: /Aumentar/ }).click(),
    itemRow(b, 'Cerveja').getByRole('button', { name: /Aumentar/ }).click(),
  ])
  await waitSynced(a)
  await waitSynced(b)
  await expect(itemRow(a, 'Cerveja')).toContainText('8 × 350 mL', { timeout: 20_000 })
  await expect(itemRow(b, 'Cerveja')).toContainText('8 × 350 mL', { timeout: 20_000 })

  // Quem incluiu aparece no item.
  await openItem(a, 'Cerveja')
  await expect(a.getByText(/Incluído por Davi Prado/)).toBeVisible()

  await ctxA.close()
  await ctxB.close()
})
