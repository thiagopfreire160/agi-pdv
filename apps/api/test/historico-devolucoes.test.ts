import { describe, it, expect, beforeEach } from 'vitest';
import { banco, sql, Cliente, criarProduto, criarUsuarioLogado, prepararLoja, abrirCaixa, vender, venda, estoqueDe } from './ajudantes.js';

let admin: Cliente;
let caixa: Cliente;

beforeEach(async () => {
  admin = await prepararLoja();
  caixa = await criarUsuarioLogado('caixa', 'cx@teste.com');
  await criarUsuarioLogado('gerente', 'ger@teste.com');
});

const autorizar = (c: Cliente, acao: string, extras: Record<string, unknown> = {}) =>
  c.post('/api/autorizacoes', { acao, identificador: 'ger@teste.com', senha: 'Senha1234', ...extras });

describe('histórico de vendas', () => {
  it('filtro padrão é hoje e o rodapé soma só as finalizadas', async () => {
    const p = await criarProduto(admin, { nome: 'Item', preco_venda: 1000, estoque_inicial: 50 });
    await abrirCaixa(admin);
    const a = await vender(admin, venda([{ produto: p }], [{ forma: 'pix', valor: 1000 }]));
    await vender(admin, venda([{ produto: p, quantidade: 2 }], [{ forma: 'pix', valor: 2000 }]));
    await admin.post(`/api/vendas/${a.id}/cancelar`, { motivo: 'Erro de digitação' });
    const ontem = await vender(admin, venda([{ produto: p, quantidade: 5 }], [{ forma: 'pix', valor: 5000 }]));
    await sql`UPDATE vendas SET finalizada_em = now() - interval '2 days' WHERE id = ${ontem.id}`.execute(banco());
    const r = await admin.get('/api/vendas');
    expect(r.corpo.itens).toHaveLength(2);
    expect(r.corpo.totais).toEqual({ quantidade: 2, quantidade_finalizadas: 1, soma_finalizadas: 2000 });
    expect(r.corpo.itens[0].formas_resumo).toBe('PIX');
  });

  it('perfil Caixa vê apenas as vendas da própria sessão aberta', async () => {
    const p = await criarProduto(admin, { nome: 'Item', preco_venda: 1000, estoque_inicial: 50 });
    await abrirCaixa(admin);
    const daAdmin = await vender(admin, venda([{ produto: p }], [{ forma: 'pix', valor: 1000 }]));
    expect((await caixa.get('/api/vendas')).corpo.itens).toHaveLength(0);
    await abrirCaixa(caixa);
    await vender(caixa, venda([{ produto: p }], [{ forma: 'pix', valor: 1000 }]));
    const lista = await caixa.get('/api/vendas?inicio=2000-01-01&fim=2100-01-01');
    expect(lista.corpo.itens).toHaveLength(1);
    expect((await caixa.get(`/api/vendas/${daAdmin.id}`)).status).toBe(403);
  });

  it('reimpressão traz a marca de 2ª via e gera auditoria', async () => {
    const p = await criarProduto(admin, { nome: 'Item', preco_venda: 1000, estoque_inicial: 50 });
    await abrirCaixa(admin);
    const v = await vender(admin, venda([{ produto: p }], [{ forma: 'dinheiro', valor: 2000 }]));
    const primeira = (await admin.get(`/api/vendas/${v.id}/recibo`)).corpo;
    expect(primeira.segunda_via).toBe(false);
    expect(primeira.venda.troco).toBe(1000);
    expect(primeira.venda.codigo_barras_venda).toBe(String(v.numero));
    expect(primeira.aviso_nao_fiscal).toBeTruthy();
    const segunda = (await admin.get(`/api/vendas/${v.id}/recibo?segunda_via=true`)).corpo;
    expect(segunda.segunda_via).toBe(true);
    expect((await admin.get('/api/auditoria?acao=reimprimir')).corpo.itens).toHaveLength(1);
  });

  it('cancelar com caixa aberto: devolve estoque, exige motivo e reduz o esperado em dinheiro', async () => {
    const p = await criarProduto(admin, { nome: 'Item', preco_venda: 3000, estoque_inicial: 10 });
    const s = await abrirCaixa(admin, 10000);
    const v = await vender(admin, venda([{ produto: p, quantidade: 2 }], [{ forma: 'dinheiro', valor: 10000 }]));
    expect(await estoqueDe(p.id)).toBe(8);
    const esperadoAntes = (await admin.get(`/api/caixa/sessoes/${s.id}`)).corpo.resumo.esperado_dinheiro;
    expect(esperadoAntes).toBe(16000);
    expect((await admin.post(`/api/vendas/${v.id}/cancelar`, {})).status).toBe(422);
    const r = await admin.post(`/api/vendas/${v.id}/cancelar`, { motivo: 'Cliente desistiu' });
    expect(r.status).toBe(200);
    expect(r.corpo.situacao).toBe('cancelada');
    expect(await estoqueDe(p.id)).toBe(10);
    const depois = (await admin.get(`/api/caixa/sessoes/${s.id}`)).corpo.resumo;
    expect(depois.esperado_dinheiro).toBe(10000);
    expect(depois.canceladas).toEqual({ quantidade: 1, valor: 6000 });
    expect((await admin.get('/api/estoque/movimentacoes?tipo=cancelamento_venda')).corpo.itens).toHaveLength(1);
  });

  it('caixa só cancela com autorização (motivo obrigatório)', async () => {
    const p = await criarProduto(admin, { nome: 'Item', preco_venda: 3000, estoque_inicial: 10 });
    await abrirCaixa(caixa);
    const v = await vender(caixa, venda([{ produto: p }], [{ forma: 'pix', valor: 3000 }]));
    const sem = await caixa.post(`/api/vendas/${v.id}/cancelar`, { motivo: 'Erro' });
    expect(sem.status).toBe(403);
    expect(sem.corpo.codigo).toBe('AUTORIZACAO_NECESSARIA');
    const aut = await autorizar(caixa, 'cancelar_venda', { motivo: 'Erro de lançamento' });
    const ok = await caixa.post(`/api/vendas/${v.id}/cancelar`, { motivo: 'Erro de lançamento', token_autorizacao: aut.corpo.token });
    expect(ok.status).toBe(200);
    expect(ok.corpo.cancelamento_autorizado_por_nome).toMatch(/gerente/);
  });

  it('cancelar venda cuja sessão já foi fechada é recusado com orientação para devolução', async () => {
    const p = await criarProduto(admin, { nome: 'Item', preco_venda: 3000, estoque_inicial: 10 });
    await abrirCaixa(admin, 0);
    const v = await vender(admin, venda([{ produto: p }], [{ forma: 'pix', valor: 3000 }]));
    await admin.post('/api/caixa/fechar', { valor_contado: 0 });
    const r = await admin.post(`/api/vendas/${v.id}/cancelar`, { motivo: 'Tarde demais' });
    expect(r.status).toBe(409);
    expect(r.corpo.erro).toMatch(/devolução/);
  });

  it('cancelar venda paga com vale devolve o saldo ao vale (expirado ganha +30 dias)', async () => {
    const p = await criarProduto(admin, { nome: 'Item', preco_venda: 3000, estoque_inicial: 10 });
    const vale = await banco().insertInto('vales_troca').values({ codigo: 'VALEXYZW', valor_original: 5000, saldo: 5000, validade: '2999-01-01' }).returning('id').executeTakeFirstOrThrow();
    await abrirCaixa(admin);
    const v = await vender(admin, venda([{ produto: p }], [{ forma: 'vale_troca', valor: 3000, codigo_vale: 'VALEXYZW' }]));
    expect((await admin.get(`/api/vales-troca/${vale.id}`)).corpo.saldo).toBe(2000);
    await sql`UPDATE vales_troca SET validade = '2020-01-01' WHERE id = ${vale.id}`.execute(banco());
    await admin.post(`/api/vendas/${v.id}/cancelar`, { motivo: 'Cliente desistiu' });
    const depois = (await admin.get(`/api/vales-troca/${vale.id}`)).corpo;
    expect(depois.saldo).toBe(5000);
    expect(depois.situacao).toBe('ativo');
    expect(depois.validade > '2020-01-01').toBe(true);
  });
});

describe('trocas e devoluções', () => {
  let p: any;
  let v: any;
  beforeEach(async () => {
    const cli = await admin.post('/api/clientes', { nome: 'Joana Cliente' });
    p = await criarProduto(admin, { nome: 'Camiseta', preco_venda: 1000, estoque_inicial: 10 });
    await abrirCaixa(admin, 10000);
    v = await vender(admin, { ...venda([{ produto: p, quantidade: 3 }], [{ forma: 'pix', valor: 2900 }]), desconto_venda: 100, cliente_id: cli.corpo.id });
  });

  it('não devolve mais que vendida − já devolvida', async () => {
    const item = v.itens[0];
    const r = await admin.post('/api/devolucoes/simular', { venda_id: v.id, itens: [{ venda_item_id: item.id, quantidade: 4 }] });
    expect(r.status).toBe(422);
    await admin.post('/api/devolucoes', { venda_id: v.id, itens: [{ venda_item_id: item.id, quantidade: 2 }], destino: 'vale_troca', motivo: 'defeito' });
    expect((await admin.post('/api/devolucoes', { venda_id: v.id, itens: [{ venda_item_id: item.id, quantidade: 2 }], destino: 'vale_troca', motivo: 'defeito' })).status).toBe(422);
  });

  it('devolução parcial proporcional ao líquido; sucessivas somam exatamente o líquido', async () => {
    const item = v.itens[0];
    expect(item.total_liquido).toBe(2900);
    const valores: number[] = [];
    for (let i = 0; i < 3; i++) {
      const sim = await admin.post('/api/devolucoes/simular', { venda_id: v.id, itens: [{ venda_item_id: item.id, quantidade: 1 }] });
      const d = await admin.post('/api/devolucoes', { venda_id: v.id, itens: [{ venda_item_id: item.id, quantidade: 1 }], destino: 'estorno', forma_estorno: 'pix', motivo: 'arrependimento' });
      expect(d.corpo.valor).toBe(sim.corpo.valor);
      valores.push(d.corpo.valor);
    }
    expect(valores).toEqual([967, 967, 966]);
    expect(valores.reduce((a, b) => a + b)).toBe(2900);
    expect((await admin.get(`/api/vendas/${v.id}`)).corpo.itens[0].quantidade_devolvida).toBe(3);
  });

  it('item marcado "não volta ao estoque" não gera movimentação; os demais geram "devolução"', async () => {
    const item = v.itens[0];
    await admin.post('/api/devolucoes', { venda_id: v.id, itens: [{ venda_item_id: item.id, quantidade: 1, volta_estoque: false }], destino: 'vale_troca', motivo: 'defeito' });
    expect(await estoqueDe(p.id)).toBe(7);
    await admin.post('/api/devolucoes', { venda_id: v.id, itens: [{ venda_item_id: item.id, quantidade: 1 }], destino: 'vale_troca', motivo: 'tamanho_modelo' });
    expect(await estoqueDe(p.id)).toBe(8);
    expect((await admin.get('/api/estoque/movimentacoes?tipo=devolucao')).corpo.itens).toHaveLength(1);
  });

  it('vale-troca gerado: código único, validade = hoje + dias configurados, vinculado ao cliente', async () => {
    const d = await admin.post('/api/devolucoes', { venda_id: v.id, itens: [{ venda_item_id: v.itens[0].id, quantidade: 1 }], destino: 'vale_troca', motivo: 'defeito' });
    expect(d.status).toBe(201);
    expect(d.corpo.vale_codigo).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    const vale = (await admin.get(`/api/vales-troca/codigo/${d.corpo.vale_codigo}`)).corpo;
    expect(vale.cliente_nome).toBe('Joana Cliente');
    const hoje = (await sql<{ d: string }>`SELECT to_char((now() AT TIME ZONE 'America/Sao_Paulo')::date + 90, 'YYYY-MM-DD') AS d`.execute(banco())).rows[0].d;
    expect(vale.validade).toBe(hoje);
    expect(vale.saldo).toBe(967);
    const ficha = (await admin.get(`/api/clientes/${v.cliente_id}`)).corpo;
    expect(ficha.saldo_credito).toBe(967);
    // "Usar agora no caixa": o vale é aceito como pagamento na próxima venda.
    const nova = await vender(admin, venda([{ produto: p }], [{ forma: 'vale_troca', valor: 967, codigo_vale: d.corpo.vale_codigo }, { forma: 'dinheiro', valor: 33 }]));
    expect(nova.total).toBe(1000);
  });

  it('estorno em dinheiro: sem caixa aberto é recusado; com caixa reduz o esperado; cartão/PIX não altera o caixa', async () => {
    const item = v.itens[0];
    const gerente = new Cliente('10.4.4.4');
    await gerente.entrar('ger@teste.com');
    const semCaixa = await gerente.post('/api/devolucoes', { venda_id: v.id, itens: [{ venda_item_id: item.id, quantidade: 1 }], destino: 'estorno', forma_estorno: 'dinheiro', motivo: 'defeito' });
    expect(semCaixa.status).toBe(409);
    expect(semCaixa.corpo.erro).toMatch(/caixa aberto/);

    const sessao = (await admin.get('/api/caixa/atual')).corpo.sessao;
    expect(sessao.resumo.esperado_dinheiro).toBe(10000);
    await admin.post('/api/devolucoes', { venda_id: v.id, itens: [{ venda_item_id: item.id, quantidade: 1 }], destino: 'estorno', forma_estorno: 'pix', motivo: 'defeito' });
    expect((await admin.get('/api/caixa/atual')).corpo.sessao.resumo.esperado_dinheiro).toBe(10000);
    const din = await admin.post('/api/devolucoes', { venda_id: v.id, itens: [{ venda_item_id: item.id, quantidade: 1 }], destino: 'estorno', forma_estorno: 'dinheiro', motivo: 'defeito' });
    expect(din.status).toBe(201);
    const depois = (await admin.get('/api/caixa/atual')).corpo.sessao;
    expect(depois.resumo.esperado_dinheiro).toBe(10000 - din.corpo.valor);
    expect(depois.movimentos.some((m: any) => m.tipo === 'estorno_dinheiro')).toBe(true);
  });

  it('estorno em dinheiro maior que o dinheiro do caixa é recusado', async () => {
    await admin.post('/api/caixa/movimentos', { tipo: 'sangria', valor: 10000, motivo: 'Cofre' });
    const r = await admin.post('/api/devolucoes', { venda_id: v.id, itens: [{ venda_item_id: v.itens[0].id, quantidade: 1 }], destino: 'estorno', forma_estorno: 'dinheiro', motivo: 'defeito' });
    expect(r.status).toBe(409);
    expect(r.corpo.codigo).toBe('DINHEIRO_INSUFICIENTE');
  });

  it('venda fora do prazo de trocas exige gerente/admin ou autorização; caixa sempre precisa de autorização', async () => {
    await sql`UPDATE vendas SET finalizada_em = now() - interval '40 days' WHERE id = ${v.id}`.execute(banco());
    const sim = await caixa.post('/api/devolucoes/simular', { venda_id: v.id, itens: [{ venda_item_id: v.itens[0].id, quantidade: 1 }] });
    expect(sim.corpo.fora_do_prazo).toBe(true);
    const pedido = { venda_id: v.id, itens: [{ venda_item_id: v.itens[0].id, quantidade: 1 }], destino: 'vale_troca', motivo: 'defeito' };
    const r = await caixa.post('/api/devolucoes', pedido);
    expect(r.status).toBe(403);
    expect(r.corpo.fora_do_prazo).toBe(true);
    const aut = await autorizar(caixa, 'devolucao');
    expect((await caixa.post('/api/devolucoes', { ...pedido, token_autorizacao: aut.corpo.token })).status).toBe(201);
    expect((await admin.post('/api/devolucoes', pedido)).status).toBe(201);
    // Caixa encontra a venda pelo número do recibo.
    expect((await caixa.get(`/api/devolucoes/venda/${v.numero}`)).corpo.id).toBe(v.id);
  });

  it('venda cancelada não aceita devolução; venda com devolução não pode ser cancelada', async () => {
    await admin.post('/api/devolucoes', { venda_id: v.id, itens: [{ venda_item_id: v.itens[0].id, quantidade: 1 }], destino: 'vale_troca', motivo: 'defeito' });
    expect((await admin.post(`/api/vendas/${v.id}/cancelar`, { motivo: 'Teste de regra' })).status).toBe(409);
    const v2 = await vender(admin, venda([{ produto: p }], [{ forma: 'pix', valor: 1000 }]));
    await admin.post(`/api/vendas/${v2.id}/cancelar`, { motivo: 'Teste de regra' });
    const r = await admin.post('/api/devolucoes', { venda_id: v2.id, itens: [{ venda_item_id: v2.itens[0].id, quantidade: 1 }], destino: 'vale_troca', motivo: 'defeito' });
    expect(r.status).toBe(409);
  });
});
