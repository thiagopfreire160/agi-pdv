import { describe, it, expect, beforeEach } from 'vitest';
import { banco, Cliente, criarProduto, criarUsuarioLogado, prepararLoja, estoqueDe, abrirCaixa, vender, venda } from './ajudantes.js';

let admin: Cliente;
beforeEach(async () => {
  admin = await prepararLoja();
});

describe('produtos e categorias', () => {
  it('cadastra só com nome e preço; código interno é gerado', async () => {
    const r = await admin.post('/api/produtos', { nome: 'Pão de queijo', preco_venda: 150 });
    expect(r.status).toBe(201);
    expect(r.corpo.codigo).toBe('000001');
    expect(r.corpo.unidade).toBe('UN');
    expect(r.corpo.estoque_atual).toBe(0);
    expect((await admin.post('/api/produtos', { nome: 'Sem preço' })).status).toBe(422);
    expect((await admin.post('/api/produtos', { nome: 'Zero', preco_venda: 0 })).status).toBe(422);
  });

  it('código de barras duplicado é recusado informando o produto que já o usa', async () => {
    await criarProduto(admin, { nome: 'Café Bom', codigo_barras: '7891000315507' });
    const r = await admin.post('/api/produtos', { nome: 'Outro', preco_venda: 100, codigo_barras: '7891000315507' });
    expect(r.status).toBe(409);
    expect(r.corpo.erro).toContain('Café Bom');
    expect(r.corpo.produto_existente.nome).toBe('Café Bom');
  });

  it('EAN-13 com dígito verificador errado pede confirmação; confirmado, salva', async () => {
    const r = await admin.post('/api/produtos', { nome: 'Balança', preco_venda: 100, codigo_barras: '7891000315508' });
    expect(r.status).toBe(422);
    expect(r.corpo.codigo).toBe('CODIGO_BARRAS_INVALIDO');
    const ok = await admin.post('/api/produtos', { nome: 'Balança', preco_venda: 100, codigo_barras: '7891000315508', confirmar_codigo_barras_invalido: true });
    expect(ok.status).toBe(201);
  });

  it('estoque inicial gera movimentação "estoque inicial"; estoque atual não é editável', async () => {
    const p = await criarProduto(admin, { nome: 'Leite', estoque_inicial: 12 });
    const m = await admin.get(`/api/estoque/movimentacoes?produto_id=${p.id}`);
    expect(m.corpo.itens).toHaveLength(1);
    expect(m.corpo.itens[0].tipo).toBe('estoque_inicial');
    expect(m.corpo.itens[0].saldo_posterior).toBe(12);
    const ed = await admin.put(`/api/produtos/${p.id}`, { versao: p.versao, estoque_atual: 999, nome: 'Leite Integral' });
    expect(ed.status).toBe(200);
    expect(ed.corpo.estoque_atual).toBe(12);
  });

  it('UN rejeita 1,5; KG aceita 1,535 e rejeita 1,5355', async () => {
    expect((await admin.post('/api/produtos', { nome: 'Lata', preco_venda: 100, estoque_inicial: 1.5 })).status).toBe(422);
    expect((await admin.post('/api/produtos', { nome: 'Queijo', preco_venda: 100, unidade: 'KG', estoque_inicial: '1,535' })).status).toBe(201);
    expect((await admin.post('/api/produtos', { nome: 'Queijo 2', preco_venda: 100, unidade: 'KG', estoque_inicial: '1,5355' })).status).toBe(422);
  });

  it('não muda a unidade para inteira com estoque fracionado', async () => {
    const p = await criarProduto(admin, { nome: 'Queijo', unidade: 'KG', estoque_inicial: 1.5 });
    const r = await admin.put(`/api/produtos/${p.id}`, { versao: p.versao, unidade: 'UN' });
    expect(r.status).toBe(422);
    expect(r.corpo.erro).toMatch(/ajuste/);
  });

  it('margem = (venda − custo)/venda com 1 casa; alerta de preço abaixo do custo', async () => {
    const p = await criarProduto(admin, { nome: 'X', preco_venda: 300, preco_custo: 200 });
    expect(p.margem).toBe(33.3);
    const q = await criarProduto(admin, { nome: 'Y', preco_venda: 100, preco_custo: 150 });
    expect(q.preco_abaixo_do_custo).toBe(true);
    expect((await criarProduto(admin, { nome: 'Z', preco_venda: 100 })).margem).toBeNull();
  });

  it('produto inativo não aparece na busca nem no leitor do caixa', async () => {
    const p = await criarProduto(admin, { nome: 'Biscoito Recheado', codigo_barras: '7891000315507' });
    await admin.post(`/api/produtos/${p.id}/inativar`);
    expect((await admin.get('/api/produtos/busca?q=biscoito')).corpo.itens).toHaveLength(0);
    const r = await admin.get('/api/produtos/codigo/7891000315507');
    expect(r.status).toBe(404);
    expect(r.corpo.erro).toMatch(/inativo/);
    expect((await admin.get('/api/produtos?situacao=inativos')).corpo.itens).toHaveLength(1);
  });

  it('busca ignora maiúsculas e acentos', async () => {
    await criarProduto(admin, { nome: 'Feijão Carioca' });
    expect((await admin.get('/api/produtos/busca?q=FEIJAO')).corpo.itens).toHaveLength(1);
  });

  it('edição concorrente: o segundo a salvar recebe conflito', async () => {
    const p = await criarProduto(admin, { nome: 'Arroz' });
    const g = await criarUsuarioLogado('gerente', 'g@teste.com');
    expect((await admin.put(`/api/produtos/${p.id}`, { versao: p.versao, preco_venda: 1100 })).status).toBe(200);
    const r = await g.put(`/api/produtos/${p.id}`, { versao: p.versao, preco_venda: 1200 });
    expect(r.status).toBe(409);
    expect(r.corpo.codigo).toBe('CONFLITO_VERSAO');
  });

  it('exclusão só sem movimentação; caso contrário orienta inativar', async () => {
    const a = await criarProduto(admin, { nome: 'A', estoque_inicial: 5 });
    expect((await admin.del(`/api/produtos/${a.id}`)).status).toBe(200);
    const b = await criarProduto(admin, { nome: 'B', estoque_inicial: 5 });
    await admin.post('/api/estoque/ajustes', { produto_id: b.id, operacao: 'retirar', quantidade: 1, motivo: 'perda_quebra' });
    const r = await admin.del(`/api/produtos/${b.id}`);
    expect(r.status).toBe(409);
    expect(r.corpo.erro).toMatch(/Inative/);
  });

  it('categorias: nome único sem diferenciar maiúsculas/acentos; contagem de produtos', async () => {
    const c = await admin.post('/api/categorias', { nome: 'Laticínios' });
    expect((await admin.post('/api/categorias', { nome: 'LATICINIOS' })).status).toBe(409);
    await criarProduto(admin, { nome: 'Iogurte', categoria_id: c.corpo.id });
    expect((await admin.get('/api/categorias')).corpo.itens[0].quantidade_produtos).toBe(1);
  });
});

describe('clientes e fornecedores', () => {
  it('cliente só com nome; CPF repetido 111… recusado; duplicado indica existente; CNPJ define pessoa jurídica', async () => {
    expect((await admin.post('/api/clientes', { nome: 'João' })).status).toBe(201);
    expect((await admin.post('/api/clientes', { nome: 'Maria', documento: '111.111.111-11' })).status).toBe(422);
    const m = await admin.post('/api/clientes', { nome: 'Maria', documento: '529.982.247-25' });
    expect(m.corpo.tipo_pessoa).toBe('fisica');
    const dup = await admin.post('/api/clientes', { nome: 'Outra', documento: '52998224725' });
    expect(dup.status).toBe(409);
    expect(dup.corpo.cliente_existente.nome).toBe('Maria');
    expect((await admin.post('/api/clientes', { nome: 'Empresa', documento: '11.222.333/0001-81' })).corpo.tipo_pessoa).toBe('juridica');
    expect((await admin.post('/api/clientes', { nome: 'Futuro', data_nascimento: '2999-01-01' })).status).toBe(422);
  });

  it('cliente inativo não aparece na busca do caixa; busca por CPF com ou sem máscara', async () => {
    const c = await admin.post('/api/clientes', { nome: 'Pedro', documento: '529.982.247-25' });
    const caixa = await criarUsuarioLogado('caixa', 'cx@teste.com');
    expect((await caixa.get('/api/clientes?busca=529.982.247-25')).corpo.itens).toHaveLength(1);
    expect((await caixa.get('/api/clientes?busca=52998224725')).corpo.itens).toHaveLength(1);
    await admin.post(`/api/clientes/${c.corpo.id}/inativar`);
    expect((await caixa.get('/api/clientes?busca=Pedro&situacao=todos')).corpo.itens).toHaveLength(0);
    // Caixa faz cadastro rápido, mas não edita.
    expect((await caixa.post('/api/clientes', { nome: 'Rápido', celular: '11987654321', email: 'ignorado@x.com' })).corpo.email).toBeNull();
    expect((await caixa.put(`/api/clientes/${c.corpo.id}`, { versao: 1, nome: 'X' })).status).toBe(403);
  });

  it('fornecedor inativo não pode ser escolhido numa nova entrada', async () => {
    const f = await admin.post('/api/fornecedores', { nome_fantasia: 'Distribuidora Sol', documento: '11.222.333/0001-81' });
    expect(f.status).toBe(201);
    await admin.post(`/api/fornecedores/${f.corpo.id}/inativar`);
    expect((await admin.get('/api/fornecedores')).corpo.itens).toHaveLength(0);
    const p = await criarProduto(admin, { nome: 'P' });
    const r = await admin.post('/api/entradas', { fornecedor_id: f.corpo.id, itens: [{ produto_id: p.id, quantidade: 1 }] });
    expect(r.status).toBe(422);
    expect(r.corpo.erro).toMatch(/inativo/);
  });
});

describe('estoque', () => {
  it('entrada confirmada soma, gera movimentação por item e atualiza custo; rascunho não altera estoque', async () => {
    const a = await criarProduto(admin, { nome: 'A', preco_custo: 100, estoque_inicial: 2 });
    const b = await criarProduto(admin, { nome: 'B', preco_custo: 200 });
    const rasc = await admin.post('/api/entradas', { itens: [{ produto_id: a.id, quantidade: 10, custo_unitario: 150 }, { produto_id: b.id, quantidade: 5, custo_unitario: 250 }] });
    expect(rasc.status).toBe(201);
    expect(rasc.corpo.situacao).toBe('rascunho');
    expect(rasc.corpo.total).toBe(10 * 150 + 5 * 250);
    expect(await estoqueDe(a.id)).toBe(2);
    const conf = await admin.post(`/api/entradas/${rasc.corpo.id}/confirmar`);
    expect(conf.corpo.situacao).toBe('confirmada');
    expect(await estoqueDe(a.id)).toBe(12);
    expect(await estoqueDe(b.id)).toBe(5);
    expect((await admin.get(`/api/produtos/${a.id}`)).corpo.preco_custo).toBe(150);
    const movs = await admin.get('/api/estoque/movimentacoes?tipo=entrada');
    expect(movs.corpo.itens).toHaveLength(2);
    expect((await admin.post(`/api/entradas/${rasc.corpo.id}/confirmar`)).status).toBe(409);
    expect((await admin.post('/api/entradas', { itens: [] })).status).toBe(422);
  });

  it('ajuste "a quantidade correta é X" gera a diferença certa; "outro" sem texto e estoque negativo são recusados', async () => {
    const p = await criarProduto(admin, { nome: 'P', estoque_inicial: 10 });
    const r = await admin.post('/api/estoque/ajustes', { produto_id: p.id, operacao: 'definir', quantidade: 7, motivo: 'correcao_lancamento' });
    expect(r.status).toBe(201);
    expect(r.corpo.variacao).toBe(-3);
    expect(r.corpo.saldo_posterior).toBe(7);
    expect((await admin.post('/api/estoque/ajustes', { produto_id: p.id, operacao: 'adicionar', quantidade: 1, motivo: 'outro' })).status).toBe(422);
    expect((await admin.post('/api/estoque/ajustes', { produto_id: p.id, operacao: 'retirar', quantidade: 8, motivo: 'furto' })).status).toBe(422);
    const m = await admin.get(`/api/estoque/movimentacoes?produto_id=${p.id}`);
    expect(m.corpo.itens[0].tipo).toBe('ajuste_menos');
    expect(m.corpo.itens[0].quantidade_com_sinal).toBe(-3);
  });

  it('inventário: 3 leituras = contagem 3; finalizar leva ao contado; não contados seguem a opção; sem dois abertos', async () => {
    const a = await criarProduto(admin, { nome: 'A', codigo_barras: '7891000315507', estoque_inicial: 10 });
    const b = await criarProduto(admin, { nome: 'B', estoque_inicial: 4 });
    const c = await criarProduto(admin, { nome: 'C', estoque_inicial: 6 });
    const inv = await admin.post('/api/inventarios', { descricao: 'Geral', abrangencia: 'todos' });
    expect(inv.status).toBe(201);
    for (let i = 0; i < 3; i++) await admin.post(`/api/inventarios/${inv.corpo.id}/leituras`, { codigo: '7891000315507' });
    await admin.put(`/api/inventarios/${inv.corpo.id}/itens/${b.id}`, { quantidade_contada: 4 });
    const rev = await admin.get(`/api/inventarios/${inv.corpo.id}`);
    expect(rev.corpo.itens.find((i: any) => i.produto_id === a.id).quantidade_contada).toBe(3);
    expect(rev.corpo.itens.find((i: any) => i.produto_id === a.id).diferenca).toBe(-7);
    expect(rev.corpo.resumo.nao_contados).toBe(1);
    const outro = await admin.post('/api/inventarios', { descricao: 'Repetido', abrangencia: 'selecionados', produto_ids: [a.id] });
    expect(outro.status).toBe(409);
    const fin = await admin.post(`/api/inventarios/${inv.corpo.id}/finalizar`, { nao_contados: 'zerar' });
    expect(fin.corpo.situacao).toBe('finalizado');
    expect(await estoqueDe(a.id)).toBe(3);
    expect(await estoqueDe(b.id)).toBe(4);
    expect(await estoqueDe(c.id)).toBe(0);
    expect((await admin.post(`/api/inventarios/${inv.corpo.id}/leituras`, { codigo: '7891000315507' })).status).toBe(409);
    const movs = (await admin.get('/api/estoque/movimentacoes?tipo=inventario')).corpo.itens;
    expect(movs).toHaveLength(2);
  });

  it('inventário: "manter" preserva o estoque dos não contados; caixa só conta se designado', async () => {
    const a = await criarProduto(admin, { nome: 'A', estoque_inicial: 10 });
    const caixa = await criarUsuarioLogado('caixa', 'cx@teste.com');
    const idCaixa = (await caixa.get('/api/auth/eu')).corpo.usuario.id;
    const inv = await admin.post('/api/inventarios', { descricao: 'X', abrangencia: 'todos' });
    expect((await caixa.put(`/api/inventarios/${inv.corpo.id}/itens/${a.id}`, { quantidade_contada: 1 })).status).toBe(403);
    await admin.post(`/api/inventarios/${inv.corpo.id}/cancelar`);
    const inv2 = await admin.post('/api/inventarios', { descricao: 'Y', abrangencia: 'todos', usuarios_designados: [idCaixa] });
    expect((await caixa.put(`/api/inventarios/${inv2.corpo.id}/itens/${a.id}`, { quantidade_contada: 1 })).status).toBe(200);
    expect((await caixa.post(`/api/inventarios/${inv2.corpo.id}/finalizar`, {})).status).toBe(403);
    await admin.put(`/api/inventarios/${inv2.corpo.id}/itens/${a.id}`, { quantidade_contada: null });
    await admin.post(`/api/inventarios/${inv2.corpo.id}/finalizar`, { nao_contados: 'manter' });
    expect(await estoqueDe(a.id)).toBe(10);
  });

  it('saldo posterior de uma movimentação = saldo anterior da seguinte (por produto)', async () => {
    const p = await criarProduto(admin, { nome: 'P', preco_venda: 100, estoque_inicial: 20 });
    await admin.post('/api/estoque/ajustes', { produto_id: p.id, operacao: 'adicionar', quantidade: 5, motivo: 'bonificacao_recebida' });
    await abrirCaixa(admin);
    await vender(admin, venda([{ produto: p, quantidade: 3 }], [{ forma: 'pix', valor: 300 }]));
    await admin.post('/api/estoque/ajustes', { produto_id: p.id, operacao: 'definir', quantidade: 2, motivo: 'correcao_lancamento' });
    const movs = (await admin.get(`/api/estoque/movimentacoes?produto_id=${p.id}`)).corpo.itens.reverse();
    for (let i = 1; i < movs.length; i++) expect(movs[i].saldo_anterior).toBe(movs[i - 1].saldo_posterior);
    expect(movs.at(-1).saldo_posterior).toBe(await estoqueDe(p.id));
  });

  it('estoque baixo: mínimo 10 e estoque 10 entra; com 11 não; sugestão = mínimo×2 − atual', async () => {
    const a = await criarProduto(admin, { nome: 'Dez', estoque_inicial: 10, estoque_minimo: 10 });
    await criarProduto(admin, { nome: 'Onze', estoque_inicial: 11, estoque_minimo: 10 });
    const baixo = (await admin.get('/api/estoque/baixo')).corpo.itens;
    expect(baixo.map((x: any) => x.nome)).toEqual(['Dez']);
    expect(baixo[0].sugestao_compra).toBe(10);
    expect((await admin.get(`/api/produtos/${a.id}`)).corpo.estoque_baixo).toBe(true);
    const csv = await admin.get('/api/estoque/baixo?formato=csv');
    expect(csv.texto.startsWith('﻿')).toBe(true);
  });
});
