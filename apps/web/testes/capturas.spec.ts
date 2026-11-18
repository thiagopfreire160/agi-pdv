import { expect, test, type Page } from '@playwright/test'
import path from 'node:path'

// Gera as capturas de tela (1440x900) das telas principais nos temas claro e escuro.
// Saída: docs/capturas/<tela>-<tema>.png
// Rodar com: npx playwright test testes/capturas.spec.ts

const PASTA = path.resolve(import.meta.dirname, '../../../docs/capturas')

async function entrar(page: Page, tema: string, email = 'admin@agipdv.local', senha = 'Admin@123') {
  await page.goto('/entrar')
  await page.getByLabel('E-mail ou CPF').fill(email)
  await page.getByLabel('Senha', { exact: true }).fill(senha)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await page.waitForURL((u) => !u.pathname.startsWith('/entrar'))
  // O tema vem do perfil do usuário (padrão escuro): grava o da captura e recarrega.
  await page.request.put('/api/auth/perfil', { headers: { 'X-Agi-Csrf': '1' }, data: { tema } })
  await page.reload()
}

async function fecharCaixaSeAberto(page: Page) {
  const { sessao } = await (await page.request.get('/api/caixa/atual')).json()
  if (sessao) {
    await page.request.post('/api/caixa/fechar', {
      headers: { 'X-Agi-Csrf': '1' },
      data: { valor_contado: sessao.resumo.esperado_dinheiro ?? 0, observacao: 'Fechamento automático das capturas' },
    })
  }
}

async function foto(page: Page, nome: string, tema: string) {
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(700)
  await page.screenshot({ path: path.join(PASTA, `${nome}-${tema}.png`) })
}

for (const tema of ['claro', 'escuro'] as const) {
  test.describe(`capturas ${tema}`, () => {
    test.use({ colorScheme: tema === 'claro' ? 'light' : 'dark', viewport: { width: 1440, height: 900 } })
    test.beforeEach(async ({ page }) => {
      await page.addInitScript((t) => { try { localStorage.setItem('agipdv-tema', t) } catch {} }, tema)
    })

    test(`acesso ${tema}`, async ({ page }) => {
      await page.goto('/entrar')
      await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible()
      await foto(page, 'login', tema)

      await page.route('**/api/primeiro-acesso', (r) => (r.request().method() === 'GET' ? r.fulfill({ json: { necessario: true } }) : r.continue()))
      await page.goto('/primeiro-acesso')
      await expect(page.getByText('Vamos começar pela sua loja')).toBeVisible()
      await foto(page, 'primeiro-acesso', tema)
    })

    test(`telas ${tema}`, async ({ page }) => {
      await entrar(page, tema)
      await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
      await expect(page.getByText('Mais vendidos')).toBeVisible()
      await foto(page, 'dashboard', tema)

      await page.goto('/vendas')
      await expect(page.getByRole('heading', { name: 'Vendas' })).toBeVisible()
      await foto(page, 'vendas', tema)
      await page.getByRole('row').nth(1).click()
      await expect(page.getByRole('dialog')).toBeVisible()
      await foto(page, 'vendas-detalhe', tema)
      await page.keyboard.press('Escape')

      await page.goto('/vendas?aba=caixas')
      await foto(page, 'vendas-caixas', tema)

      // Troca com uma venda recente já carregada
      const vendas = await (await page.request.get('/api/vendas', { params: { inicio: '2026-11-01', fim: '2026-11-30', situacao: 'finalizada' } })).json()
      const numero = vendas.itens[0]?.numero
      await page.goto(`/trocas?venda=${numero}`)
      await expect(page.getByText(`Venda nº ${numero}`)).toBeVisible()
      await page.getByRole('checkbox', { disabled: false }).first().check()
      await page.waitForTimeout(800)
      await foto(page, 'trocas', tema)

      await page.goto('/produtos')
      await expect(page.getByRole('heading', { name: 'Produtos' })).toBeVisible()
      await foto(page, 'produtos', tema)
      await page.getByRole('row').filter({ hasText: 'Arroz Tipo 1' }).click()
      await expect(page.getByRole('dialog')).toBeVisible()
      await foto(page, 'produtos-cadastro', tema)
      await page.keyboard.press('Escape')

      await page.goto('/estoque')
      await expect(page.getByRole('heading', { name: 'Estoque' })).toBeVisible()
      await foto(page, 'estoque', tema)
      await page.goto('/estoque?aba=baixo')
      await foto(page, 'estoque-baixo', tema)
      await page.goto('/estoque?aba=movimentacoes')
      await foto(page, 'estoque-movimentacoes', tema)

      await page.goto('/clientes')
      await foto(page, 'clientes', tema)
      await page.goto('/fornecedores')
      await foto(page, 'fornecedores', tema)

      await page.goto('/relatorios')
      await expect(page.getByRole('heading', { name: 'Vendas por período' })).toBeVisible()
      await foto(page, 'relatorios', tema)

      await page.goto('/usuarios')
      await foto(page, 'usuarios', tema)
      await page.goto('/empresa')
      await expect(page.getByTitle('Prévia do recibo')).toBeVisible()
      await page.waitForTimeout(800)
      await foto(page, 'empresa', tema)
      await page.goto('/configuracoes')
      await foto(page, 'configuracoes', tema)
      await page.goto('/ajuda')
      await foto(page, 'ajuda', tema)
    })

    test(`caixa ${tema}`, async ({ page }) => {
      await entrar(page, tema, 'gerente@agipdv.local', 'Gerente@123')
      await fecharCaixaSeAberto(page)
      await page.goto('/caixa')
      await expect(page.getByRole('heading', { name: 'Abrir o caixa' })).toBeVisible()
      await page.getByLabel('Fundo de troco').fill('15000')
      await foto(page, 'caixa-abertura', tema)
      await page.getByRole('button', { name: 'Abrir caixa' }).click()

      const leitura = page.getByLabel('Código de barras ou busca')
      for (const c of ['7891000000007', '3*7891134623172', '0,850*000027', '7891023757032', '2*7891087109112']) {
        await leitura.fill(c)
        await leitura.press('Enter')
        await page.waitForTimeout(300)
      }
      await expect(page.getByRole('cell', { name: /Refrigerante Cola/ })).toBeVisible()
      await foto(page, 'caixa', tema)

      await page.keyboard.press('F4')
      const pag = page.getByRole('dialog', { name: 'Pagamento' })
      await expect(pag).toBeVisible()
      await page.keyboard.press('4')
      await pag.getByLabel('Valor', { exact: true }).fill('3000')
      await pag.getByLabel('Valor', { exact: true }).press('Enter')
      await page.keyboard.press('1')
      await foto(page, 'caixa-pagamento', tema)
      await page.keyboard.press('Escape')

      // Descarta a venda e fecha o caixa (contagem cega)
      await page.getByRole('button', { name: 'Cancelar venda' }).click()
      await page.getByRole('dialog', { name: 'Cancelar esta venda?' }).getByRole('button', { name: 'Cancelar venda' }).click()
      await expect(page.locator('[data-teste="total"]')).toHaveText('R$ 0,00')
      await page.getByRole('button', { name: 'Fechar caixa' }).click()
      const fech = page.getByRole('dialog', { name: 'Fechar o caixa' })
      await fech.getByLabel('Dinheiro contado na gaveta').fill('14950')
      await fech.getByRole('button', { name: 'Conferir' }).click()
      await expect(fech.getByText('Esperado em dinheiro')).toBeVisible()
      await fech.getByRole('textbox').last().fill('Faltou uma moeda de 50 centavos')
      await foto(page, 'caixa-fechamento', tema)
      await fech.getByLabel('Imprimir relatório de fechamento').uncheck()
      await fech.getByRole('button', { name: 'Fechar caixa' }).click()
      await page.getByRole('dialog', { name: 'Fechar o caixa?' }).getByRole('button', { name: 'Fechar caixa' }).click()
      await expect(page.getByRole('heading', { name: 'Abrir o caixa' })).toBeVisible()
    })

    test(`celular ${tema}`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 })
      await entrar(page, tema)
      await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
      await page.waitForTimeout(800)
      await page.screenshot({ path: path.join(PASTA, `celular-dashboard-${tema}.png`) })
      await page.getByRole('button', { name: 'Abrir menu' }).click()
      await page.waitForTimeout(400)
      await page.screenshot({ path: path.join(PASTA, `celular-menu-${tema}.png`) })
    })
  })
}
