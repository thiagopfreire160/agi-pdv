import { banco, sql, type Tx } from '../../db/conexao.js';
import { auditar, type Ator } from '../../lib/auditoria.js';
import { conflito, erroConflitoVersao, erroValidacao, naoEncontrado } from '../../lib/erros.js';
import { quantidadeValida, totalBruto } from '../../lib/dinheiro.js';
import { fusoDaLoja, hojeNoFuso, inicioDoDia, fimDoDia } from '../../lib/datas.js';
import { bloquearProdutos, movimentarEstoque, mil } from '../estoque/movimentar.js';

export interface DadosEntrada {
  fornecedor_id?: string | null;
  numero_nota?: string | null;
  data_recebimento?: string | null;
  atualizar_custo?: boolean;
  observacoes?: string | null;
  itens: { produto_id: string; quantidade: number | string; custo_unitario?: number | null }[];
  confirmar?: boolean;
  versao?: number;
}

async function prepararItens(tx: Tx, d: DadosEntrada) {
  if (!d.itens?.length) throw erroValidacao('Adicione pelo menos um item à entrada.', { itens: 'Inclua pelo menos um produto.' });
  const ids = d.itens.map((i) => i.produto_id);
  const produtos = await tx.selectFrom('produtos').selectAll().where('id', 'in', ids).where('excluido_em', 'is', null).execute();
  const porId = new Map(produtos.map((p) => [p.id, p]));
  return d.itens.map((it, idx) => {
    const p = porId.get(it.produto_id);
    if (!p) throw erroValidacao(`Produto do item ${idx + 1} não encontrado.`, { [`itens.${idx}.produto_id`]: 'Produto inexistente.' });
    if (!p.controla_estoque) {
      throw erroValidacao(`O produto "${p.nome}" não controla estoque e não pode entrar numa entrada de mercadoria.`, {
        [`itens.${idx}.produto_id`]: 'Produto não controla estoque.',
      });
    }
    const q = quantidadeValida(it.quantidade, p.unidade, `itens.${idx}.quantidade`);
    return { ordem: idx + 1, produto_id: p.id, quantidade: q / 1000, custo_unitario: it.custo_unitario ?? p.preco_custo };
  });
}

async function conferirCabecalho(tx: Tx, d: DadosEntrada, fuso: string) {
  const data = d.data_recebimento ?? hojeNoFuso(fuso);
  if (data > hojeNoFuso(fuso)) throw erroValidacao('A data de recebimento não pode ser futura.', { data_recebimento: 'Data futura.' });
  if (d.fornecedor_id) {
    const f = await tx.selectFrom('fornecedores').select(['ativo']).where('id', '=', d.fornecedor_id).where('excluido_em', 'is', null).executeTakeFirst();
    if (!f) throw erroValidacao('Fornecedor não encontrado.', { fornecedor_id: 'Fornecedor inexistente.' });
    if (!f.ativo) throw erroValidacao('Este fornecedor está inativo. Reative-o ou escolha outro.', { fornecedor_id: 'Fornecedor inativo.' });
  }
  return data;
}

async function confirmarNaTransacao(tx: Tx, ator: Ator, entradaId: string) {
  const e = await tx.selectFrom('entradas').selectAll().where('id', '=', entradaId).forUpdate().executeTakeFirstOrThrow();
  if (e.situacao !== 'rascunho') throw conflito('Esta entrada já foi confirmada e não pode ser alterada. Corrija com um ajuste de estoque.');
  const itens = await tx.selectFrom('entradas_itens').selectAll().where('entrada_id', '=', entradaId).orderBy('ordem').execute();
  await bloquearProdutos(tx, itens.map((i) => i.produto_id));
  for (const i of itens) {
    await movimentarEstoque(tx, {
      produtoId: i.produto_id,
      tipo: 'entrada',
      variacaoMil: mil(i.quantidade),
      usuarioId: ator.usuarioId!,
      custoUnitario: i.custo_unitario,
      origemTipo: 'entrada',
      origemId: entradaId,
    });
    if (e.atualizar_custo) {
      await tx.updateTable('produtos').set({ preco_custo: i.custo_unitario, versao: sql`versao + 1` }).where('id', '=', i.produto_id).execute();
    }
  }
  await tx
    .updateTable('entradas')
    .set({ situacao: 'confirmada', confirmada_em: sql`now()`, confirmada_por: ator.usuarioId, versao: sql`versao + 1`, atualizado_em: sql`now()`, atualizado_por: ator.usuarioId })
    .where('id', '=', entradaId)
    .execute();
  await auditar(tx, ator, { entidade: 'entrada', entidadeId: entradaId, acao: 'confirmar', depois: { numero: e.numero, itens: itens.length }, soDiferencas: false });
}

export async function criarEntrada(ator: Ator, d: DadosEntrada) {
  const fuso = await fusoDaLoja(banco());
  return banco()
    .transaction()
    .execute(async (tx) => {
      const data = await conferirCabecalho(tx, d, fuso);
      const itens = await prepararItens(tx, d);
      const e = await tx
        .insertInto('entradas')
        .values({
          fornecedor_id: d.fornecedor_id ?? null,
          numero_nota: d.numero_nota ?? null,
          data_recebimento: data,
          atualizar_custo: d.atualizar_custo ?? true,
          observacoes: d.observacoes ?? null,
          criado_por: ator.usuarioId,
          atualizado_por: ator.usuarioId,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      await tx.insertInto('entradas_itens').values(itens.map((i) => ({ ...i, entrada_id: e.id }))).execute();
      await auditar(tx, ator, { entidade: 'entrada', entidadeId: e.id, acao: 'criar', depois: { ...e, itens }, soDiferencas: false });
      if (d.confirmar) await confirmarNaTransacao(tx, ator, e.id);
      return e.id as string;
    });
}

export async function editarEntrada(ator: Ator, id: string, d: DadosEntrada) {
  const fuso = await fusoDaLoja(banco());
  return banco()
    .transaction()
    .execute(async (tx) => {
      const antes = await tx.selectFrom('entradas').selectAll().where('id', '=', id).forUpdate().executeTakeFirst();
      if (!antes) throw naoEncontrado('Entrada não encontrada.');
      if (antes.situacao !== 'rascunho') throw conflito('Entrada confirmada não pode ser editada. Corrija com um ajuste de estoque.');
      if (d.versao !== undefined && antes.versao !== d.versao) throw erroConflitoVersao();
      const data = await conferirCabecalho(tx, d, fuso);
      const itens = await prepararItens(tx, d);
      await tx
        .updateTable('entradas')
        .set({
          fornecedor_id: d.fornecedor_id ?? null,
          numero_nota: d.numero_nota ?? null,
          data_recebimento: data,
          atualizar_custo: d.atualizar_custo ?? true,
          observacoes: d.observacoes ?? null,
          versao: sql`versao + 1`,
          atualizado_em: sql`now()`,
          atualizado_por: ator.usuarioId,
        })
        .where('id', '=', id)
        .execute();
      await tx.deleteFrom('entradas_itens').where('entrada_id', '=', id).execute();
      await tx.insertInto('entradas_itens').values(itens.map((i) => ({ ...i, entrada_id: id }))).execute();
      await auditar(tx, ator, { entidade: 'entrada', entidadeId: id, acao: 'editar', antes, depois: { ...d } });
      if (d.confirmar) await confirmarNaTransacao(tx, ator, id);
    });
}

export async function confirmarEntrada(ator: Ator, id: string) {
  await banco()
    .transaction()
    .execute(async (tx) => {
      const e = await tx.selectFrom('entradas').select('id').where('id', '=', id).executeTakeFirst();
      if (!e) throw naoEncontrado('Entrada não encontrada.');
      await confirmarNaTransacao(tx, ator, id);
    });
}

export async function obterEntrada(id: string) {
  const db = banco();
  const e = await db
    .selectFrom('entradas as e')
    .leftJoin('fornecedores as f', 'f.id', 'e.fornecedor_id')
    .leftJoin('usuarios as u', 'u.id', 'e.criado_por')
    .selectAll('e')
    .select(['f.nome_fantasia as fornecedor_nome', 'u.nome as criado_por_nome'])
    .where('e.id', '=', id)
    .executeTakeFirst();
  if (!e) throw naoEncontrado('Entrada não encontrada.');
  const itens = await db
    .selectFrom('entradas_itens as i')
    .innerJoin('produtos as p', 'p.id', 'i.produto_id')
    .select(['i.id', 'i.ordem', 'i.produto_id', 'p.nome as produto_nome', 'p.codigo as produto_codigo', 'p.codigo_barras', 'p.unidade', 'i.quantidade', 'i.custo_unitario'])
    .where('i.entrada_id', '=', id)
    .orderBy('i.ordem')
    .execute();
  const itensFmt = itens.map((i) => ({ ...i, total: totalBruto(mil(i.quantidade), i.custo_unitario) }));
  return { ...e, itens: itensFmt, total: itensFmt.reduce((s, i) => s + i.total, 0) };
}

export async function listarEntradas(f: { situacao?: string; fornecedor_id?: string; inicio?: string | null; fim?: string | null; busca?: string; pagina: number; por_pagina: number }) {
  const db = banco();
  let q = db.selectFrom('entradas as e').leftJoin('fornecedores as f', 'f.id', 'e.fornecedor_id');
  if (f.situacao) q = q.where('e.situacao', '=', f.situacao);
  if (f.fornecedor_id) q = q.where('e.fornecedor_id', '=', f.fornecedor_id);
  if (f.inicio) q = q.where('e.data_recebimento', '>=', f.inicio);
  if (f.fim) q = q.where('e.data_recebimento', '<=', f.fim);
  if (f.busca?.trim()) {
    const t = f.busca.trim();
    q = q.where((eb) => eb.or([eb('e.numero_nota', 'ilike', `%${t}%`), ...(/^\d+$/.test(t) ? [eb('e.numero', '=', Number(t))] : [])]));
  }
  const total = await q.select(sql<number>`count(*)`.as('n')).executeTakeFirstOrThrow();
  const itens = await q
    .select(['e.id', 'e.numero', 'e.data_recebimento', 'e.fornecedor_id', 'f.nome_fantasia as fornecedor_nome', 'e.numero_nota', 'e.situacao', 'e.criado_em', 'e.versao'])
    .select(sql<number>`(SELECT coalesce(sum(round(i.quantidade * i.custo_unitario)), 0) FROM entradas_itens i WHERE i.entrada_id = e.id)::bigint`.as('total'))
    .select(sql<number>`(SELECT count(*) FROM entradas_itens i WHERE i.entrada_id = e.id)::int`.as('quantidade_itens'))
    .orderBy('e.numero', 'desc')
    .limit(f.por_pagina)
    .offset((f.pagina - 1) * f.por_pagina)
    .execute();
  return { itens, total: Number(total.n), pagina: f.pagina, por_pagina: f.por_pagina };
}

export { inicioDoDia, fimDoDia };
