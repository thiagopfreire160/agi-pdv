import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { banco, sql, Cliente, criarProduto, criarUsuarioLogado, prepararLoja, abrirCaixa, vender, venda, estoqueDe } from './ajudantes.js';

let admin: Cliente;
let caixa: Cliente;
let gerente: Cliente;

beforeEach(async () => {
  admin = await prepararLoja();
  caixa = await criarUsuarioLogado('caixa', 'cx@teste.com');
  gerente = await criarUsuarioLogado('gerente', 'ger@teste.com');
});

async function autorizar(c: Cliente, acao: string, extras: Record<string, unknown> = {}, quem = 'ger@teste.com') {
  return c.post('/api/autorizacoes', { acao, identificador: quem, senha: 'Senha1234', ...extras });
}

describe('sessão de caixa', () => {
  it('sem caixa aberto não é possível vender', async () => {
    const p = await criarProduto(admin, { nome: 'Pão', preco_venda: 100, estoque_inicial: 10 });
    const r = await caixa.post('/api/vendas', venda([{ produto: p }], [{ forma: 'pix', valor: 100 }]));
    expect(r.status).toBe(409);
    expect(r.corpo.codigo).toBe('CAIXA_FECHADO');
    expect(r.corpo.erro).toBe('Caixa fechado. Abra o caixa para começar a vender.');
  });

  it('caixa aberto ontem impede vender hoje e exige fechamento', async () => {
    const p = await criarProduto(admin, { nome: 'Pão', preco_venda: 100, estoque_inicial: 10 });
    const s = await abrirCaixa(caixa);
    await sql`UPDATE sessoes_caixa SET aberto_em = now() - interval '1 day' WHERE id = ${s.id}`.execute(banco());
    const r = await caixa.post('/api/vendas', venda([{ produto: p }], [{ forma: 'pix', valor: 100 }]));
    expect(r.status).toBe(409);
    expect(r.corpo.codigo).toBe('CAIXA_VENCIDO');
    expect((await caixa.post('/api/caixa/movimentos', { tipo: 'suprimento', valor: 100 })).corpo.codigo).toBe('CAIXA_VENCIDO');
    expect((await caixa.post('/api/caixa/abrir', { fundo_troco: 0 })).corpo.codigo).toBe('CAIXA_VENCIDO');
    expect((await caixa.get('/api/caixa/atual')).corpo.sessao.vencido).toBe(true);
    expect((await caixa.post('/api/caixa/fechar', { valor_contado: 10000 })).status).toBe(200);
    expect((await caixa.post('/api/caixa/abrir', { fundo_troco: 0 })).status).toBe(201);
  });

  it('um usuário não abre um segundo caixa enquanto tiver um aberto', async () => {
    await abrirCaixa(caixa);
    const r = await caixa.post('/api/caixa/abrir', { fundo_troco: 0 });
    expect(r.status).toBe(409);
    expect(r.corpo.codigo).toBe('CAIXA_JA_ABERTO');
    // Outro operador pode ter o seu.
    expect((await gerente.post('/api/caixa/abrir', { fundo_troco: 0 })).status).toBe(201);
  });
});

describe('venda: cálculos, descontos e autorizações', () => {
  it('0,350 kg × R$ 29,90 = R$ 10,47; desconto de 10% em R$ 33,33 dá total R$ 30,00', async () => {
    const queijo = await criarProduto(admin, { nome: 'Queijo', unidade: 'KG', preco_venda: 2990, estoque_inicial: 5 });
    await abrirCaixa(caixa);
    const v = await vender(caixa, venda([{ produto: queijo, quantidade: '0,350' }], [{ forma: 'dinheiro', valor: 1047 }]));
    expect(v.total).toBe(1047);
    expect(v.itens[0].quantidade).toBe(0.35);

    const x = await criarProduto(admin, { nome: 'Kit', preco_venda: 3333, estoque_inicial: 5 });
    const g = await abrirCaixa(gerente);
    void g;
    const v2 = await vender(gerente, { ...venda([{ produto: x }], [{ forma: 'pix', valor: 3000 }]), desconto_venda: 333 });
    expect(v2.total).toBe(3000);
    expect(v2.desconto_venda).toBe(333);
  });

  it('rateio: R$ 1,00 de desconto em 3 itens de R$ 10,00 → 0,34/0,33/0,33 e Σ líquidos = total', async () => {
    const ps = await Promise.all(['A1', 'B1', 'C1'].map((n) => criarProduto(admin, { nome: n, preco_venda: 1000, estoque_inicial: 5 })));
    await abrirCaixa(admin);
    const v = await vender(admin, { ...venda(ps.map((p) => ({ produto: p })), [{ forma: 'pix', valor: 2900 }]), desconto_venda: 100 });
    expect(v.itens.map((i: any) => i.rateio_desconto)).toEqual([34, 33, 33]);
    expect(v.itens.reduce((s: number, i: any) => s + i.total_liquido, 0)).toBe(v.total);
  });

  it('caixa com limite 5% aplicando 6% precisa de autorização; com gerente válido finaliza e registra os dois', async () => {
    const p = await criarProduto(admin, { nome: 'Cesta', preco_venda: 10000, estoque_inicial: 5 });
    await abrirCaixa(caixa);
    const base = { ...venda([{ produto: p }], [{ forma: 'pix', valor: 9400 }]), desconto_venda: 600 };
    const sem = await caixa.post('/api/vendas', base);
    expect(sem.status).toBe(403);
    expect(sem.corpo.codigo).toBe('AUTORIZACAO_NECESSARIA');
    expect(sem.corpo.percentual).toBe(6);
    expect(sem.corpo.limite).toBe(5);
    const errada = await caixa.post('/api/autorizacoes', { acao: 'desconto', identificador: 'ger@teste.com', senha: 'errada', percentual: 6 });
    expect(errada.status).toBe(401);
    const aut = await autorizar(caixa, 'desconto', { percentual: 6 });
    expect(aut.status).toBe(201);
    const ok = await caixa.post('/api/vendas', { ...base, autorizacoes: [aut.corpo.token] });
    expect(ok.status).toBe(201);
    const a = ok.corpo.venda.autorizacoes[0];
    expect(a.tipo).toBe('desconto_acima_limite');
    expect(a.operador_nome).toMatch(/caixa/);
    expect(a.autorizador_nome).toMatch(/gerente/);
    expect(a.percentual).toBe(6);
    // Token é de uso único.
    const reuso = await caixa.post('/api/vendas', { ...base, id: randomUUID(), autorizacoes: [aut.corpo.token] });
    expect(reuso.status).toBe(403);
  });

  it('desconto maior que o autorizado exige nova autorização', async () => {
    const p = await criarProduto(admin, { nome: 'Cesta', preco_venda: 10000, estoque_inicial: 5 });
    await abrirCaixa(caixa);
    const aut = await autorizar(caixa, 'desconto', { percentual: 6 });
    const r = await caixa.post('/api/vendas', { ...venda([{ produto: p }], [{ forma: 'pix', valor: 9000 }]), desconto_venda: 1000, autorizacoes: [aut.corpo.token] });
    expect(r.status).toBe(403);
    expect(r.corpo.codigo).toBe('AUTORIZACAO_NECESSARIA');
  });

  it('gerente (limite 20%) não autoriza 25%; administrador autoriza', async () => {
    const p = await criarProduto(admin, { nome: 'Cesta', preco_venda: 10000, estoque_inicial: 5 });
    await abrirCaixa(caixa);
    const neg = await autorizar(caixa, 'desconto', { percentual: 25 });
    expect(neg.status).toBe(403);
    expect(neg.corpo.codigo).toBe('AUTORIZACAO_NEGADA');
    const aut = await autorizar(caixa, 'desconto', { percentual: 25 }, 'admin@teste.com');
    expect(aut.status).toBe(201);
    const r = await caixa.post('/api/vendas', { ...venda([{ produto: p }], [{ forma: 'pix', valor: 7500 }]), desconto_venda: 2500, autorizacoes: [aut.corpo.token] });
    expect(r.status).toBe(201);
    // Caixa não pode autorizar.
    const c2 = await criarUsuarioLogado('caixa', 'cx2@teste.com');
    void c2;
    expect((await autorizar(caixa, 'desconto', { percentual: 3 }, 'cx2@teste.com')).status).toBe(403);
  });

  it('gerente vende com desconto até 20% sem autorização; acima exige', async () => {
    const p = await criarProduto(admin, { nome: 'Cesta', preco_venda: 10000, estoque_inicial: 5 });
    await abrirCaixa(gerente);
    expect((await gerente.post('/api/vendas', { ...venda([{ produto: p, desconto: 1000 }], [{ forma: 'pix', valor: 8000 }]), desconto_venda: 1000 })).status).toBe(201);
    expect((await gerente.post('/api/vendas', { ...venda([{ produto: p }], [{ forma: 'pix', valor: 7900 }]), desconto_venda: 2100 })).status).toBe(403);
  });

  it('alterar o limite do Caixa vale na próxima finalização', async () => {
    const p = await criarProduto(admin, { nome: 'Cesta', preco_venda: 10000, estoque_inicial: 5 });
    await abrirCaixa(caixa);
    const pedido = { ...venda([{ produto: p }], [{ forma: 'pix', valor: 9200 }]), desconto_venda: 800 };
    expect((await caixa.post('/api/vendas', pedido)).status).toBe(403);
    const cfg = (await admin.get('/api/configuracoes')).corpo;
    await admin.put('/api/configuracoes', { versao: cfg.versao, limite_desconto_caixa: 10 });
    expect((await caixa.post('/api/vendas', pedido)).status).toBe(201);
  });

  it('remoção de item por perfil Caixa: autorização com motivo, registrada na venda e na auditoria', async () => {
    const p = await criarProduto(admin, { nome: 'Pão', preco_venda: 100, estoque_inicial: 10 });
    await abrirCaixa(caixa);
    expect((await autorizar(caixa, 'remover_item', {})).status).toBe(422);
    const aut = await autorizar(caixa, 'remover_item', { motivo: 'Cliente desistiu', detalhes: { descricao: 'Refrigerante', quantidade: 1, total: 899 } });
    expect(aut.status).toBe(201);
    const v = await vender(caixa, { ...venda([{ produto: p }], [{ forma: 'pix', valor: 100 }]), autorizacoes: [aut.corpo.token] });
    expect(v.autorizacoes[0].tipo).toBe('remover_item');
    expect(v.autorizacoes[0].motivo).toBe('Cliente desistiu');
    const aud = await admin.get('/api/auditoria?entidade=autorizacao&acao=autorizar');
    expect(aud.corpo.itens[0].depois.acao).toBe('remover_item');
  });

  it('cancelar venda em andamento: caixa precisa de autorização; fica na auditoria', async () => {
    await abrirCaixa(caixa);
    const corpo = { itens: [{ descricao: 'Arroz', quantidade: 1, total: 2500 }], total: 2500 };
    expect((await caixa.post('/api/vendas/descartes', corpo)).status).toBe(403);
    const aut = await autorizar(caixa, 'cancelar_venda_andamento', { motivo: 'Cliente sem dinheiro' });
    expect((await caixa.post('/api/vendas/descartes', { ...corpo, token_autorizacao: aut.corpo.token })).status).toBe(200);
    const aud = await admin.get('/api/auditoria?entidade=venda_em_andamento');
    expect(aud.corpo.itens[0].depois.total).toBe(2500);
    expect(aud.corpo.itens[0].autorizador_nome).toMatch(/gerente/);
  });
});

describe('venda: pagamentos', () => {
  let p50: any;
  beforeEach(async () => {
    p50 = await criarProduto(admin, { nome: 'Item 50', preco_venda: 5000, estoque_inicial: 20 });
    await abrirCaixa(caixa);
  });

  it('total R$ 50: R$ 20 débito + R$ 50 dinheiro → troco R$ 20', async () => {
    const v = await vender(caixa, venda([{ produto: p50 }], [{ forma: 'debito', valor: 2000 }, { forma: 'dinheiro', valor: 5000 }]));
    expect(v.troco).toBe(2000);
    expect(v.pagamentos).toHaveLength(2);
  });

  it('débito maior que o restante é recusado; troco sem dinheiro é impossível', async () => {
    expect((await caixa.post('/api/vendas', venda([{ produto: p50 }], [{ forma: 'debito', valor: 6000 }]))).status).toBe(422);
    expect((await caixa.post('/api/vendas', venda([{ produto: p50 }], [{ forma: 'pix', valor: 3000 }, { forma: 'credito', valor: 3000 }]))).status).toBe(422);
    expect((await caixa.post('/api/vendas', venda([{ produto: p50 }], [{ forma: 'pix', valor: 3000 }]))).corpo.erro).toMatch(/falta receber R\$ 20,00/i);
  });

  it('crédito aceita 1 a 12 parcelas e recusa acima', async () => {
    expect((await caixa.post('/api/vendas', venda([{ produto: p50 }], [{ forma: 'credito', valor: 5000, parcelas: 12 }]))).status).toBe(201);
    const r = await caixa.post('/api/vendas', venda([{ produto: p50 }], [{ forma: 'credito', valor: 5000, parcelas: 13 }]));
    expect(r.status).toBe(422);
    expect(r.corpo.erro).toMatch(/1 a 12/);
    expect((await caixa.post('/api/vendas', venda([{ produto: p50 }], [{ forma: 'pix', valor: 5000, parcelas: 2 }]))).status).toBe(422);
  });

  it('vale-troca de R$ 30: em venda de R$ 50 abate 30 e zera; em venda de R$ 10 deixa R$ 20; expirado é recusado', async () => {
    const criarVale = async (codigo: string, saldo: number, validade = '2999-12-31') =>
      banco().insertInto('vales_troca').values({ codigo, valor_original: saldo, saldo, validade }).returning('id').executeTakeFirstOrThrow();
    await criarVale('VALEAAAA', 3000);
    const v = await vender(caixa, venda([{ produto: p50 }], [{ forma: 'vale_troca', valor: 3000, codigo_vale: 'valeaaaa' }, { forma: 'pix', valor: 2000 }]));
    expect(v.pagamentos[0].codigo_vale).toBe('VALEAAAA');
    expect((await caixa.get('/api/vales-troca/codigo/VALEAAAA')).corpo).toMatchObject({ saldo: 0, situacao: 'usado' });

    await criarVale('VALEBBBB', 3000);
    const p10 = await criarProduto(admin, { nome: 'Item 10', preco_venda: 1000, estoque_inicial: 5 });
    await vender(caixa, venda([{ produto: p10 }], [{ forma: 'vale_troca', valor: 1000, codigo_vale: 'VALEBBBB' }]));
    expect((await caixa.get('/api/vales-troca/codigo/VALEBBBB')).corpo).toMatchObject({ saldo: 2000, situacao: 'ativo', utilizavel: true });

    await criarVale('VALECCCC', 3000, '2020-01-01');
    expect((await caixa.get('/api/vales-troca/codigo/VALECCCC')).corpo.situacao).toBe('expirado');
    const r = await caixa.post('/api/vendas', venda([{ produto: p10 }], [{ forma: 'vale_troca', valor: 1000, codigo_vale: 'VALECCCC' }]));
    expect(r.status).toBe(422);
    expect(r.corpo.erro).toMatch(/expirou/);
    // Vale não pode passar do saldo.
    expect((await caixa.post('/api/vendas', venda([{ produto: p50 }], [{ forma: 'vale_troca', valor: 2500, codigo_vale: 'VALEBBBB' }, { forma: 'pix', valor: 2500 }]))).status).toBe(422);
  });

  it('cliente opcional e CPF no recibo validado', async () => {
    expect((await caixa.post('/api/vendas', { ...venda([{ produto: p50 }], [{ forma: 'pix', valor: 5000 }]), documento_recibo: '111.111.111-11' })).status).toBe(422);
    const v = await vender(caixa, { ...venda([{ produto: p50 }], [{ forma: 'pix', valor: 5000 }]), documento_recibo: '529.982.247-25' });
    expect(v.documento_recibo).toBe('52998224725');
  });
});

describe('venda: estoque, concorrência e idempotência', () => {
  it('finalização baixa o estoque e gera movimentação "venda"; produto sem controle não baixa', async () => {
    const p = await criarProduto(admin, { nome: 'Lata', preco_venda: 500, estoque_inicial: 10 });
    const sacola = await criarProduto(admin, { nome: 'Sacola', preco_venda: 10, controla_estoque: false });
    await abrirCaixa(caixa);
    await vender(caixa, venda([{ produto: p, quantidade: 3 }, { produto: sacola, quantidade: 2 }], [{ forma: 'dinheiro', valor: 2000 }]));
    expect(await estoqueDe(p.id)).toBe(7);
    expect(await estoqueDe(sacola.id)).toBe(0);
    const m = (await admin.get(`/api/estoque/movimentacoes?tipo=venda`)).corpo.itens;
    expect(m).toHaveLength(1);
    expect(m[0].quantidade_com_sinal).toBe(-3);
    expect(m[0].origem_numero).toBe(1);
  });

  it('estoque insuficiente recusa (considerando a soma das linhas do mesmo produto)', async () => {
    const p = await criarProduto(admin, { nome: 'Lata', preco_venda: 500, estoque_inicial: 2 });
    await abrirCaixa(caixa);
    const r = await caixa.post('/api/vendas', venda([{ produto: p }, { produto: p, quantidade: 2, desconto: 10 }], [{ forma: 'dinheiro', valor: 2000 }]));
    expect(r.status).toBe(409);
    expect(r.corpo.codigo).toBe('ESTOQUE_INSUFICIENTE');
    expect(r.corpo.disponivel).toBe(2);
  });

  it('dois terminais vendendo a última unidade ao mesmo tempo: só uma venda é aceita', async () => {
    const p = await criarProduto(admin, { nome: 'Último', preco_venda: 500, estoque_inicial: 1 });
    await abrirCaixa(caixa);
    await abrirCaixa(gerente);
    const [a, b] = await Promise.all([
      caixa.post('/api/vendas', venda([{ produto: p }], [{ forma: 'pix', valor: 500 }])),
      gerente.post('/api/vendas', venda([{ produto: p }], [{ forma: 'pix', valor: 500 }])),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect(await estoqueDe(p.id)).toBe(0);
  });

  it('reenviar a mesma finalização não cria venda duplicada (inclusive em paralelo)', async () => {
    const p = await criarProduto(admin, { nome: 'Lata', preco_venda: 500, estoque_inicial: 10 });
    await abrirCaixa(caixa);
    const pedido = venda([{ produto: p }], [{ forma: 'dinheiro', valor: 1000 }]);
    const r1 = await caixa.post('/api/vendas', pedido);
    const r2 = await caixa.post('/api/vendas', pedido);
    expect(r1.status).toBe(201);
    expect(r2.status).toBe(200);
    expect(r2.corpo.ja_registrada).toBe(true);
    expect(r2.corpo.venda.numero).toBe(r1.corpo.venda.numero);
    const outro = venda([{ produto: p }], [{ forma: 'pix', valor: 500 }]);
    const paralelos = await Promise.all([1, 2, 3].map(() => caixa.post('/api/vendas', outro)));
    expect(paralelos.filter((r) => r.status === 201)).toHaveLength(1);
    expect(new Set(paralelos.map((r) => r.corpo.venda.numero)).size).toBe(1);
    expect(await estoqueDe(p.id)).toBe(8);
    const n = await banco().selectFrom('vendas').select(sql<number>`count(*)`.as('n')).executeTakeFirstOrThrow();
    expect(Number(n.n)).toBe(2);
  });

  it('preço alterado entre inclusão e finalização: recusa e informa os novos preços', async () => {
    const p = await criarProduto(admin, { nome: 'Leite', preco_venda: 500, estoque_inicial: 10 });
    await abrirCaixa(caixa);
    const pedido = venda([{ produto: p }], [{ forma: 'pix', valor: 500 }]);
    await admin.put(`/api/produtos/${p.id}`, { versao: p.versao, preco_venda: 550 });
    const r = await caixa.post('/api/vendas', pedido);
    expect(r.status).toBe(409);
    expect(r.corpo.codigo).toBe('PRECOS_ALTERADOS');
    expect(r.corpo.precos_alterados[0]).toMatchObject({ produto_id: p.id, preco_informado: 500, preco_atual: 550 });
  });

  it('produto inativado durante a venda é recusado', async () => {
    const p = await criarProduto(admin, { nome: 'Leite', preco_venda: 500, estoque_inicial: 10 });
    await abrirCaixa(caixa);
    await admin.post(`/api/produtos/${p.id}/inativar`);
    expect((await caixa.post('/api/vendas', venda([{ produto: p }], [{ forma: 'pix', valor: 500 }]))).corpo.erro).toMatch(/inativado/);
  });
});

describe('sangria, suprimento e fechamento', () => {
  it('sangria maior que o dinheiro esperado e sangria sem motivo são recusadas', async () => {
    await abrirCaixa(caixa, 10000);
    expect((await caixa.post('/api/caixa/movimentos', { tipo: 'sangria', valor: 5000 })).status).toBe(422);
    const r = await caixa.post('/api/caixa/movimentos', { tipo: 'sangria', valor: 10001, motivo: 'Cofre' });
    expect(r.status).toBe(422);
    expect(r.corpo.erro).toMatch(/maior que o dinheiro/);
    expect((await caixa.post('/api/caixa/movimentos', { tipo: 'sangria', valor: 10000, motivo: 'Cofre' })).status).toBe(201);
  });

  it('fechamento: 100 + 250 − 30 + 50 − 200 = esperado 170; contado 165 → falta de 5 com observação obrigatória', async () => {
    const p = await criarProduto(admin, { nome: 'Item', preco_venda: 1000, estoque_inicial: 100 });
    await abrirCaixa(caixa, 10000);
    // Dinheiro recebido 250 com troco 30.
    await vender(caixa, venda([{ produto: p, quantidade: 12 }], [{ forma: 'dinheiro', valor: 15000 }])); // 120 → troco 30
    await vender(caixa, venda([{ produto: p, quantidade: 10 }], [{ forma: 'dinheiro', valor: 10000 }])); // 100, sem troco
    await vender(caixa, venda([{ produto: p, quantidade: 5 }], [{ forma: 'debito', valor: 5000 }]));
    await caixa.post('/api/caixa/movimentos', { tipo: 'suprimento', valor: 5000 });
    await caixa.post('/api/caixa/movimentos', { tipo: 'sangria', valor: 20000, motivo: 'Depósito no cofre' });

    // Contagem cega: o operador não vê o esperado antes de contar.
    const atual = (await caixa.get('/api/caixa/atual')).corpo.sessao;
    expect(atual.resumo.esperado_dinheiro).toBeUndefined();
    expect(atual.resumo.dinheiro_recebido).toBeUndefined();
    expect(atual.resumo.troco).toBeUndefined();
    expect(atual.resumo.vendas_por_forma.dinheiro).toBeUndefined();
    expect(atual.resumo.vendas_por_forma.debito).toBe(5000);
    expect(atual.valor_esperado).toBeUndefined();
    expect(JSON.stringify(atual)).not.toContain('17000');

    const conf = await caixa.post('/api/caixa/conferencia', { valor_contado: 16500 });
    expect(conf.corpo.valor_esperado).toBe(17000);
    expect(conf.corpo.diferenca).toBe(-500);
    expect(conf.corpo.resumo).toMatchObject({ fundo_troco: 10000, dinheiro_recebido: 25000, troco: 3000, suprimentos: 5000, sangrias: 20000 });
    expect(conf.corpo.resumo.vendas_por_forma.debito).toBe(5000);

    const semObs = await caixa.post('/api/caixa/fechar', { valor_contado: 16500 });
    expect(semObs.status).toBe(422);
    expect(semObs.corpo.codigo).toBe('OBSERVACAO_OBRIGATORIA');
    expect(semObs.corpo.erro).toMatch(/falta de R\$ 5,00/);
    const ok = await caixa.post('/api/caixa/fechar', { valor_contado: 16500, observacao: 'Troco errado em uma venda' });
    expect(ok.status).toBe(200);
    expect(ok.corpo.sessao).toMatchObject({ situacao: 'fechado', valor_esperado: 17000, valor_contado: 16500, diferenca: -500 });
    expect((await caixa.post('/api/caixa/fechar', { valor_contado: 1 })).status).toBe(409);
  });

  it('contagem por cédulas soma automaticamente e precisa bater com o contado', async () => {
    await abrirCaixa(caixa, 10000);
    expect((await caixa.post('/api/caixa/conferencia', { valor_contado: 10000, contagem: { '5000': 1, '2000': 2, '1000': 1 } })).corpo.diferenca).toBe(0);
    expect((await caixa.post('/api/caixa/conferencia', { valor_contado: 9000, contagem: { '5000': 2 } })).status).toBe(422);
  });

  it('gerente fecha de forma forçada o caixa de outro operador; o fechamento fica marcado', async () => {
    const s = await abrirCaixa(caixa, 5000);
    expect((await caixa.post(`/api/caixa/sessoes/${s.id}/fechar`, { valor_contado: 5000 })).status).toBe(403);
    const abertos = (await gerente.get('/api/caixa/sessoes?situacao=aberto')).corpo.itens;
    expect(abertos).toHaveLength(1);
    const r = await gerente.post(`/api/caixa/sessoes/${s.id}/fechar`, { valor_contado: 5000 });
    expect(r.status).toBe(200);
    expect(r.corpo.sessao.fechamento_forcado).toBe(true);
    expect(r.corpo.sessao.fechado_por_nome).toMatch(/gerente/);
    const aud = await admin.get('/api/auditoria?acao=fechar_forcado');
    expect(aud.corpo.itens).toHaveLength(1);
  });

  it('alerta de sangria quando o dinheiro passa do limite configurado (não bloqueia)', async () => {
    const cfg = (await admin.get('/api/configuracoes')).corpo;
    await admin.put('/api/configuracoes', { versao: cfg.versao, alerta_sangria_valor: 15000 });
    const p = await criarProduto(admin, { nome: 'Item', preco_venda: 10000, estoque_inicial: 5 });
    await abrirCaixa(caixa, 10000);
    expect((await caixa.get('/api/caixa/atual')).corpo.sessao.alerta_sangria).toBe(false);
    await vender(caixa, venda([{ produto: p }], [{ forma: 'dinheiro', valor: 10000 }]));
    expect((await caixa.get('/api/caixa/atual')).corpo.sessao.alerta_sangria).toBe(true);
  });
});
