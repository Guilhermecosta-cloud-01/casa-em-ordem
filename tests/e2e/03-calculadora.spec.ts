import { expect, type Page, test } from '@playwright/test'
import { createFamily, money, signUp, uniqueEmail } from './helpers'

// Testes 10 a 15 da seção 12 (os cálculos em si também têm testes unitários).

async function fillOption(page: Page, index: number, price: string, content: string, unit: string) {
  const option = page.locator('fieldset').nth(index)
  await option.getByLabel('Preço').fill(price)
  await option.getByLabel('Conteúdo').fill(content)
  await option.getByLabel('Unidade').selectOption(unit)
}

test.beforeEach(async ({ page }) => {
  await signUp(page, 'Teste Calculadora', uniqueEmail('calc'))
  await createFamily(page, 'Família Calculadora')
  await page.goto('/calculadora')
})

test('10. 250 g por R$ 12,00 contra 100 g por R$ 7,00', async ({ page }) => {
  await fillOption(page, 0, '12,00', '250', 'g')
  await fillOption(page, 1, '7,00', '100', 'g')
  await expect(page.getByText('A embalagem de 250 g oferece o melhor custo-benefício.', { exact: false })).toBeVisible()
  await expect(page.getByText(money('Você paga R$ 48,00 por kg, contra R$ 70,00 por kg na embalagem de 100 g.'))).toBeVisible()
  const results = page.getByRole('list', { name: 'Opções do melhor para o pior custo-benefício' })
  await expect(results.getByText(money('R$ 4,80'))).toBeVisible()
  await expect(results.getByText(money('R$ 7,00')).first()).toBeVisible()
  await expect(results.getByText('31,43%')).toBeVisible()
  await expect(results.getByText(money('+R$ 22,00 por kg'))).toBeVisible()
  await expect(page.getByText('Menor preço por kg não é o mesmo que menor gasto agora', { exact: false })).toBeVisible()
})

test('11 e 12. converte g/kg e mL/L', async ({ page }) => {
  await fillOption(page, 0, '20,00', '1', 'kg')
  await fillOption(page, 1, '11,00', '500', 'g')
  await expect(page.getByText(money('A embalagem de 1 kg oferece o melhor custo-benefício. Você paga R$ 20,00 por kg, contra R$ 22,00 por kg'))).toBeVisible()

  await fillOption(page, 0, '9,00', '2', 'L')
  await fillOption(page, 1, '2,50', '350', 'mL')
  await expect(page.getByText(money('Você paga R$ 4,50 por litro, contra R$ 7,14 por litro na embalagem de 350 mL'))).toBeVisible()
})

test('13. compara três opções', async ({ page }) => {
  await fillOption(page, 0, '25,00', '1', 'kg')
  await fillOption(page, 1, '13,00', '500', 'g')
  await page.getByRole('button', { name: 'Adicionar opção' }).click()
  await fillOption(page, 2, '45,00', '2', 'kg')
  await expect(
    page.getByText(
      money('A embalagem de 2 kg oferece o melhor custo-benefício. Você paga R$ 22,50 por kg, contra R$ 25,00 por kg na embalagem de 1 kg e R$ 26,00 por kg na embalagem de 500 g.'),
    ),
  ).toBeVisible()
  const results = page.getByRole('list', { name: 'Opções do melhor para o pior custo-benefício' })
  await expect(results.getByRole('listitem')).toHaveCount(3)
  await expect(results.getByText('3º lugar')).toBeVisible()
})

test('14. valores inválidos e divisão por zero não indicam vencedor', async ({ page }) => {
  await fillOption(page, 0, '-5', '250', 'g')
  await fillOption(page, 1, '7,00', '0', 'g')
  await expect(page.getByText('O valor não pode ser negativo.')).toBeVisible()
  await expect(page.getByText('O conteúdo não pode ser zero.')).toBeVisible()
  await expect(page.getByText('Corrija os campos das opções A e B para ver o resultado.')).toBeVisible()
  await expect(page.getByText('melhor custo-benefício', { exact: false })).toHaveCount(0)

  // Unidades incompatíveis: peso × volume sem densidade
  await fillOption(page, 0, '20,00', '1', 'kg')
  await fillOption(page, 1, '18,00', '900', 'mL')
  await expect(page.getByText('Não dá para comparar peso (g, kg) com volume (mL, L) sem saber a densidade', { exact: false })).toBeVisible()
  await page.getByLabel('Densidade do produto (g por mL)').fill('0,92')
  await expect(page.getByText('oferece o melhor custo-benefício', { exact: false })).toBeVisible()
})

test('15. simula quantidade equivalente com embalagens inteiras', async ({ page }) => {
  await fillOption(page, 0, '12,00', '250', 'g')
  await fillOption(page, 1, '7,00', '100', 'g')
  await page.getByLabel('Quantidade desejada').fill('300')
  const table = page.getByRole('table', { name: /Custo para comprar 300 g/ })
  const rowA = table.getByRole('row', { name: /^A/ })
  const rowB = table.getByRole('row', { name: /^B/ })
  await expect(rowA).toContainText(money('R$ 14,40')) // proporcional
  await expect(rowA).toContainText(money('R$ 24,00')) // 2 embalagens no caixa
  await expect(rowA).toContainText('200 g') // sobra
  await expect(rowB).toContainText(money('R$ 21,00'))
  await expect(page.getByText('a embalagem de 100 g sai mais barata no caixa', { exact: false })).toBeVisible()

  // Salvar nos favoritos e reabrir
  await page.getByRole('button', { name: 'Salvar comparação' }).click()
  await page.getByLabel('Nome', { exact: true }).fill('Café')
  await page.getByRole('switch', { name: 'Marcar como favorita' }).click()
  await page.getByRole('button', { name: 'Salvar', exact: true }).click()
  await expect(page.getByText('Comparação salva nos favoritos.')).toBeVisible()
  await page.getByRole('button', { name: 'Limpar' }).click()
  await page.goto('/calculadora/salvas')
  await page.getByRole('link', { name: /Café/ }).click()
  await expect(page.locator('fieldset').nth(0).getByLabel('Preço')).toHaveValue('12,00')
  await expect(page.getByText('A embalagem de 250 g oferece o melhor custo-benefício.', { exact: false })).toBeVisible()
})
