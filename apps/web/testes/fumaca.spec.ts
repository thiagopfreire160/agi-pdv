import { expect, test, type Page } from '@playwright/test'

// Teste de fumaça: login, dashboard, abre o caixa, vende 2 produtos com pagamento dividido,
// confere no histórico e fecha o caixa com contagem cega.
// Pré-requisitos: API em :3333 com a semente de demonstração e o front em :5173.

const ADMIN = { email: 'admin@nexo.local', senha: 'Admin@123' }
const ARROZ = '7891000000007' // Arroz Tipo 1 5kg — R$ 26,90
const ACUCAR = '7891015838022' // Açúcar Refinado 1kg — R$ 4,99

async function entrar(page: Page) {
  await page.goto('/entrar')
  await page.getByLabel('E-mail ou CPF').fill(ADMIN.email)
  await page.getByLabel('Senha', { exact: true }).fill(ADMIN.senha)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await page.waitForURL('**/dashboard')
}

/** Se um teste anterior deixou o caixa aberto, fecha antes de começar. */
async function garantirCaixaFechado(page: Page) {
  const r = await page.request.get('/api/caixa/atual')
  const { sessao } = await r.json()
  if (!sessao) return
  const esperado = sessao.resumo.esperado_dinheiro ?? 0
  await page.request.post('/api/caixa/fechar', {
    headers: { 'X-Nexo-Csrf': '1' },
    data: { valor_contado: esperado, observacao: 'Fechamento automático do teste de fumaça' },
  })
}

test('fluxo completo de venda no caixa', async ({ page }) => {
  const erros: string[] = []
  page.on('pageerror', (e) => erros.push(e.message))

  // 1. Login e dashboard
  await entrar(page)
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
  await expect(page.getByText('Vendido hoje')).toBeVisible()
  await expect(page.getByText('Vendas por período')).toBeVisible()
  await garantirCaixaFechado(page)

  // 2. Abre o caixa com R$ 100,00 de fundo de troco
  await page.goto('/caixa')
  await expect(page.getByRole('heading', { name: 'Abrir o caixa' })).toBeVisible()
  await page.getByLabel('Fundo de troco').fill('10000')
  await expect(page.getByLabel('Fundo de troco')).toHaveValue('100,00')
  await page.getByRole('button', { name: 'Abrir caixa' }).click()

  // 3. Lê dois produtos: 1 arroz + 2 açúcares (quantidade antes do código)
  const leitura = page.getByLabel('Código de barras ou busca')
  await expect(leitura).toBeFocused()
  await leitura.fill(ARROZ)
  await leitura.press('Enter')
  await expect(page.getByRole('cell', { name: /Arroz Tipo 1 5kg/ })).toBeVisible()
  await expect(leitura).toBeFocused()
  await leitura.fill(`2*${ACUCAR}`)
  await leitura.press('Enter')
  await expect(page.getByRole('cell', { name: /Açúcar Refinado 1kg/ })).toBeVisible()
  await expect(page.locator('[data-teste="total"]')).toHaveText('R$ 36,88')

  // 4. Venda em andamento fica guardada no navegador (recarregar não perde)
  const guardada = await page.evaluate(() => JSON.parse(localStorage.getItem('nexo-venda-andamento') ?? 'null'))
  expect(guardada?.itens).toHaveLength(2)
  expect(guardada?.id).toMatch(/[0-9a-f-]{36}/)

  // 5. Pagamento dividido: R$ 20,00 no débito + R$ 50,00 em dinheiro (troco R$ 33,12)
  await page.keyboard.press('F4')
  const pagamento = page.getByRole('dialog', { name: 'Pagamento' })
  await expect(pagamento).toBeVisible()
  await page.keyboard.press('2') // débito
  const valor = pagamento.getByLabel('Valor', { exact: true })
  await expect(valor).toBeFocused()
  await valor.fill('2000')
  await valor.press('Enter')
  await expect(pagamento.getByText('Débito', { exact: true }).last()).toBeVisible()
  await page.keyboard.press('1') // dinheiro
  const recebido = pagamento.getByLabel('Valor recebido')
  await expect(recebido).toHaveValue('16,88')
  await recebido.fill('5000')
  await recebido.press('Enter')
  await expect(pagamento.getByText('R$ 33,12')).toBeVisible()
  await page.keyboard.press('F4') // finaliza

  // 6. Venda finalizada com troco em destaque
  const pos = page.getByRole('dialog', { name: /Venda nº \d+ finalizada/ })
  await expect(pos).toBeVisible()
  await expect(pos.locator('[data-teste="troco"]')).toHaveText('R$ 33,12')
  const titulo = await pos.getByRole('heading').first().textContent()
  const numero = titulo!.match(/\d+/)![0]
  await page.keyboard.press('Enter')
  await expect(pos).toBeHidden()
  await expect(page.locator('[data-teste="total"]')).toHaveText('R$ 0,00')

  // 7. A venda aparece no histórico com os dois pagamentos
  await page.goto('/vendas')
  const linha = page.getByRole('row').filter({ hasText: new RegExp(`^${numero}`) })
  await expect(linha).toBeVisible()
  await expect(linha).toContainText('R$ 36,88')
  await expect(linha).toContainText('Finalizada')
  await linha.click()
  const detalhe = page.getByRole('dialog', { name: `Venda nº ${numero}` })
  await expect(detalhe).toBeVisible()
  await expect(detalhe.getByText('Débito')).toBeVisible()
  await expect(detalhe.getByText('Dinheiro')).toBeVisible()
  await expect(detalhe.getByText('R$ 33,12')).toBeVisible()
  await page.keyboard.press('Escape')

  // 8. Fecha o caixa com contagem cega: 100,00 + 50,00 − 33,12 = 116,88
  await page.goto('/caixa')
  await page.getByRole('button', { name: 'Fechar caixa' }).click()
  const fechamento = page.getByRole('dialog', { name: 'Fechar o caixa' })
  await expect(fechamento).toBeVisible()
  await expect(fechamento.getByText('Esperado em dinheiro')).toHaveCount(0) // cego: não mostra antes
  await fechamento.getByLabel('Dinheiro contado na gaveta').fill('11688')
  await fechamento.getByRole('button', { name: 'Conferir' }).click()
  await expect(fechamento.getByText('Esperado em dinheiro')).toBeVisible()
  await expect(fechamento.getByText('Confere')).toBeVisible()
  await fechamento.getByLabel('Imprimir relatório de fechamento').uncheck()
  await fechamento.getByRole('button', { name: 'Fechar caixa' }).click()
  await page.getByRole('dialog', { name: 'Fechar o caixa?' }).getByRole('button', { name: 'Fechar caixa' }).click()
  await expect(page.getByText('Caixa fechado.')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Abrir o caixa' })).toBeVisible()

  expect(erros, `Erros de JavaScript na página: ${erros.join(' | ')}`).toHaveLength(0)
})

test('caixa pede autorização do gerente para desconto acima do limite', async ({ page }) => {
  await page.goto('/entrar')
  await page.getByLabel('E-mail ou CPF').fill('caixa@nexo.local')
  await page.getByLabel('Senha', { exact: true }).fill('Caixa@123')
  await page.getByRole('button', { name: 'Entrar' }).click()
  await page.waitForURL('**/caixa')

  // Perfil Caixa não vê itens de gestão no menu (vai pela tela "Sistema")
  const { sessao } = await (await page.request.get('/api/caixa/atual')).json()
  if (!sessao) {
    await page.getByLabel('Fundo de troco').fill('5000')
    await page.getByRole('button', { name: 'Abrir caixa' }).click()
  }
  const leitura = page.getByLabel('Código de barras ou busca')
  await leitura.fill(ARROZ)
  await leitura.press('Enter')
  await expect(page.locator('[data-teste="total"]')).toHaveText('R$ 26,90')

  // 10% de desconto no item: passa do limite de 5% do Caixa
  await page.keyboard.press('F6')
  const desconto = page.getByRole('dialog', { name: 'Desconto no item' })
  await desconto.getByLabel('Percentual').fill('10')
  await desconto.getByRole('button', { name: 'Aplicar desconto' }).click()
  const aut = page.getByRole('dialog', { name: 'Autorização do gerente' })
  await expect(aut).toBeVisible()
  await aut.getByLabel('E-mail ou CPF de quem autoriza').fill('gerente@nexo.local')
  await aut.getByLabel('Senha').fill('Gerente@123')
  await aut.getByRole('button', { name: 'Autorizar' }).click()
  await expect(aut).toBeHidden()
  await expect(page.locator('[data-teste="total"]')).toHaveText('R$ 24,21')
  await expect(leitura).toBeFocused()

  // Paga no PIX e finaliza
  await page.keyboard.press('F4')
  const pag = page.getByRole('dialog', { name: 'Pagamento' })
  await expect(pag).toBeVisible()
  await page.keyboard.press('4')
  await pag.getByLabel('Valor', { exact: true }).press('Enter')
  await page.keyboard.press('F4')
  const pos = page.getByRole('dialog', { name: /Venda nº \d+ finalizada/ })
  await expect(pos).toBeVisible()
  const titulo = await pos.getByRole('heading').first().textContent()
  const numero = titulo!.match(/\d+/)![0]
  const venda = await (await page.request.get('/api/vendas', { params: { numero } })).json()
  const det = await (await page.request.get(`/api/vendas/${venda.itens[0].id}`)).json()
  expect(det.autorizacoes[0].autorizador_nome).toBe('Bruno Carvalho')
  expect(det.total).toBe(2421)
})
