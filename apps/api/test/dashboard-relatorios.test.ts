import { describe, it, expect, beforeEach } from 'vitest';
import { Cliente, criarProduto, criarUsuarioLogado, prepararLoja, abrirCaixa, vender, venda } from './ajudantes.js';

let admin: Cliente;
beforeEach(async () => {
  admin = await prepararLoja();
});

async function cenario() {
  const a = await criarProduto(admin, { nome: 'Arroz', preco_venda: 2500, preco_custo: 2000, estoque_inicial: 50, estoque_minimo: 49 });
  const b = await criarProduto(admin, { nome: 'Queijo', unidade: 'KG', preco_venda: 4000, preco_custo: 0, estoque_inicial: 10 });
  await abrirCaixa(admin, 10000);
  const v1 = await vender(admin, venda([{ produto: a, quantidade: 2 }], [{ forma: 'dinheiro', valor: 6000 }])); // 50, troco 10
  const v2 = await vender(admin, venda([{ produto: b, quantidade: '0,5' }, { produto: a }], [{ forma: 'credito', valor: 4500, parcelas: 3 }])); // 45
  const v3 = await vender(admin, venda([{ produto: a }], [{ forma: 'pix', valor: 1000 }, { forma: 'debito', valor: 1500 }])); // 25
  const cancelada = await vender(admin, venda([{ produto: a }], [{ forma: 'pix', valor: 2500 }]));
  await admin.post(`/api/vendas/${cancelada.id}/cancelar`, { motivo: 'Erro no lançamento' });
  await admin.post('/api/devolucoes', { venda_id: v1.id, itens: [{ venda_item_id: v1.itens[0].id, quantidade: 1 }], destino: 'vale_troca', motivo: 'defeito' }); // 25
  return { a, b, v1, v2, v3 };
}

describe('dashboard', () => {
  it('total de hoje = finalizadas − devoluções; canceladas não contam; ticket médio; formas', async () => {
    await cenario();
    const d = (await admin.get('/api/dashboard')).corpo;
    expect(d.hoje.vendas_brutas).toBe(12000);
    expect(d.hoje.devolucoes).toBe(2500);
    expect(d.hoje.total_vendido).toBe(9500);
    expect(d.hoje.numero_vendas).toBe(3);
    expect(d.hoje.ticket_medio).toBe(3167);
    expect(d.hoje.itens_vendidos).toBe(4.5);
    const formas = Object.fromEntries(d.formas_pagamento.hoje.map((f: any) => [f.forma, f.valor]));
    expect(formas).toEqual({ dinheiro: 5000, debito: 1500, credito: 4500, pix: 1000, vale_troca: 0 });
    expect(d.mais_vendidos.por_quantidade[0].nome).toBe('Arroz');
    expect(d.mais_vendidos.por_valor[0].valor).toBeGreaterThan(0);
    expect(d.estoque_baixo.itens[0].nome).toBe('Arroz');
    expect(d.caixas_abertos).toHaveLength(1);
    expect(d.caixas_abertos[0].total_vendido).toBe(12000);
    expect(d.grafico.pontos).toHaveLength(7);
    expect(d.grafico.pontos.at(-1).total).toBe(9500);
    expect((await admin.get('/api/dashboard?periodo=12m')).corpo.grafico.pontos).toHaveLength(12);
  });

  it('sem vendas o ticket médio é R$ 0,00 (sem divisão por zero)', async () => {
    const d = (await admin.get('/api/dashboard?periodo=30d')).corpo;
    expect(d.hoje.ticket_medio).toBe(0);
    expect(d.mes.variacao_percentual).toBeNull();
    expect(d.grafico.pontos).toHaveLength(30);
  });

  it('perfil Caixa não acessa o dashboard nem pela API', async () => {
    const caixa = await criarUsuarioLogado('caixa', 'cx@teste.com');
    expect((await caixa.get('/api/dashboard')).status).toBe(403);
  });
});

describe('relatórios', () => {
  it('todos os 13 relatórios respondem em JSON e CSV (UTF-8 com BOM, ";" e vírgula decimal)', async () => {
    await cenario();
    for (let i = 1; i <= 13; i++) {
      const j = await admin.get(`/api/relatorios/r${i}`);
      expect(j.status, `R${i}`).toBe(200);
      expect(Array.isArray(j.corpo.linhas)).toBe(true);
      const csv = await admin.get(`/api/relatorios/R${i}?formato=csv`);
      expect(csv.status).toBe(200);
      expect(csv.texto.startsWith('﻿')).toBe(true);
      expect(String(csv.cabecalhos['content-disposition'])).toMatch(/_\d{4}-\d{2}-\d{2}_a_\d{4}-\d{2}-\d{2}\.csv/);
      const cab = csv.texto.slice(1).split('\r\n')[0];
      expect(cab.split(';').length).toBe(j.corpo.colunas.length);
      expect(csv.texto.split('\r\n').filter(Boolean).length - 1, `linhas R${i}`).toBe(j.corpo.linhas.length);
    }
  });

  it('R2: soma das formas = soma dos totais das vendas do período (dinheiro líquido de troco); quebra do crédito', async () => {
    await cenario();
    const r = (await admin.get('/api/relatorios/r2')).corpo;
    expect(r.totais.valor_recebido).toBe(12000);
    const principais = r.linhas.filter((l: any) => !l.detalhe);
    expect(principais.reduce((s: number, l: any) => s + l.valor_recebido, 0)).toBe(12000);
    expect(r.linhas.find((l: any) => l.forma_nome === 'Crédito em 3x').valor_recebido).toBe(4500);
    const csv = (await admin.get('/api/relatorios/r2?formato=csv')).texto;
    expect(csv).toContain('Dinheiro;1;50,00;41,67');
  });

  it('R10: diferença por sessão = contado − esperado; sobras e faltas separadas', async () => {
    await abrirCaixa(admin, 10000);
    await admin.post('/api/caixa/fechar', { valor_contado: 9800, observacao: 'Faltou troco' });
    const r = (await admin.get('/api/relatorios/r10')).corpo;
    expect(r.linhas[0]).toMatchObject({ esperado: 10000, contado: 9800, diferenca: -200 });
    expect(r.totais).toMatchObject({ faltas: -200, sobras: 0 });
  });

  it('R1, R5 e R13 batem com o cenário', async () => {
    await cenario();
    const r1 = (await admin.get('/api/relatorios/r1?agrupar=mes')).corpo;
    expect(r1.totais).toMatchObject({ numero_vendas: 3, devolucoes: 2500, total_liquido: 9500 });
    const r5 = (await admin.get('/api/relatorios/r5')).corpo;
    const arroz = r5.linhas.find((l: any) => l.produto === 'Arroz');
    expect(arroz).toMatchObject({ quantidade_vendida: 4, quantidade_devolvida: 1, faturamento_liquido: 7500, custo: 6000, lucro_bruto: 1500, margem: 20 });
    const queijo = r5.linhas.find((l: any) => l.produto === 'Queijo');
    expect(queijo.sem_custo).toBe(true);
    expect(queijo.margem).toBeNull();
    const r13 = (await admin.get('/api/relatorios/r13')).corpo;
    expect(r13.totais.por_tipo.cancelamento_venda).toEqual({ quantidade: 1, valor: 2500 });
    const r6 = (await admin.get('/api/relatorios/r6')).corpo;
    expect(r6.linhas[0].classe).toBe('A');
    expect(r6.linhas.at(-1).percentual_acumulado).toBe(100);
  });

  it('período acima de 366 dias é recusado', async () => {
    const r = await admin.get('/api/relatorios/r1?inicio=2024-01-01&fim=2025-01-02');
    expect(r.status).toBe(422);
    expect(r.corpo.erro).toMatch(/366/);
    expect((await admin.get('/api/relatorios/r1?inicio=2024-01-01&fim=2024-12-31')).status).toBe(200);
  });
});
