import { banco, sql, type Tx } from '../../db/conexao.js';
import { auditar, type Ator } from '../../lib/auditoria.js';
import { conflito, erroConflitoVersao, erroValidacao, naoEncontrado } from '../../lib/erros.js';
import { codigoBarrasValido } from '../../lib/documentos.js';
import { fracionavel, quantidadeValida } from '../../lib/dinheiro.js';
import { movimentarEstoque, mil } from '../estoque/movimentar.js';
import { formatarProduto } from './formato.js';

/** Consulta base com nomes de categoria e fornecedor. */
export const consultaProdutos = (db: Tx) =>
  db
    .selectFrom('produtos as p')
    .leftJoin('categorias as c', 'c.id', 'p.categoria_id')
    .leftJoin('fornecedores as f', 'f.id', 'p.fornecedor_id')
    .where('p.excluido_em', 'is', null)
    .selectAll('p')
    .select(['c.nome as categoria_nome', 'f.nome_fantasia as fornecedor_nome']);

const filtroBusca = (termo: string) =>
  sql<boolean>`(f_normalizar(p.nome) LIKE '%' || f_normalizar(${termo}) || '%'
             OR p.codigo ILIKE ${'%' + termo + '%'}
             OR p.codigo_barras LIKE ${'%' + termo + '%'})`;

export async function listarProdutos(
  f: { busca?: string; categoria_id?: string; situacao: string; estoque_baixo?: boolean; ordenar: string; direcao: 'asc' | 'desc'; pagina: number; por_pagina: number },
  verCusto: boolean,
) {
  let q = consultaProdutos(banco());
  if (f.busca?.trim()) q = q.where(filtroBusca(f.busca.trim()));
  if (f.categoria_id === 'sem') q = q.where('p.categoria_id', 'is', null);
  else if (f.categoria_id) q = q.where('p.categoria_id', '=', f.categoria_id);
  if (f.situacao === 'ativos') q = q.where('p.ativo', '=', true);
  if (f.situacao === 'inativos') q = q.where('p.ativo', '=', false);
  if (f.estoque_baixo) {
    q = q.where('p.controla_estoque', '=', true).where('p.estoque_minimo', '>', 0).where(sql<boolean>`p.estoque_atual <= p.estoque_minimo`).where('p.ativo', '=', true);
  }
  const total = await q.clearSelect().select(sql<number>`count(*)`.as('n')).executeTakeFirstOrThrow();
  const coluna = { nome: 'p.nome', estoque: 'p.estoque_atual', preco: 'p.preco_venda', codigo: 'p.codigo' }[f.ordenar] as 'p.nome';
  const linhas = await q
    .orderBy(coluna, f.direcao)
    .orderBy('p.nome')
    .limit(f.por_pagina)
    .offset((f.pagina - 1) * f.por_pagina)
    .execute();
  return { itens: linhas.map((p) => formatarProduto(p, verCusto)), total: Number(total.n), pagina: f.pagina, por_pagina: f.por_pagina };
}

/** Busca do caixa (F2): só ativos, até 20. */
export async function buscarParaCaixa(termo: string, verCusto: boolean) {
  const linhas = await consultaProdutos(banco())
    .where('p.ativo', '=', true)
    .where(filtroBusca(termo.trim()))
    .orderBy('p.nome')
    .limit(20)
    .execute();
  return { itens: linhas.map((p) => formatarProduto(p, verCusto)) };
}

/** Leitor de código de barras / código interno: correspondência exata. */
export async function buscarPorCodigo(codigo: string, verCusto: boolean) {
  const c = codigo.trim();
  const p = await consultaProdutos(banco())
    .where((eb) => eb.or([eb('p.codigo_barras', '=', c), eb('p.codigo', '=', c)]))
    .orderBy(sql`(p.codigo_barras = ${c})`, 'desc')
    .orderBy('p.ativo', 'desc')
    .executeTakeFirst();
  if (!p) throw naoEncontrado(`Produto não encontrado para o código ${c}. Confira o código ou busque pelo nome (F2).`);
  if (!p.ativo) throw naoEncontrado(`O produto "${p.nome}" (código ${c}) está inativo e não pode ser vendido.`);
  return formatarProduto(p, verCusto);
}

export async function obterProduto(id: string, verCusto: boolean) {
  const p = await consultaProdutos(banco()).where('p.id', '=', id).executeTakeFirst();
  if (!p) throw naoEncontrado('Produto não encontrado.');
  return formatarProduto(p, verCusto);
}

async function conferirCodigos(tx: Tx, dados: { codigo?: string | null; codigo_barras?: string | null; confirmar_codigo_barras_invalido?: boolean }, ignorarId?: string) {
  if (dados.codigo_barras) {
    if (!codigoBarrasValido(dados.codigo_barras) && !dados.confirmar_codigo_barras_invalido) {
      throw erroValidacao('O dígito verificador do código de barras não confere. Confira o código ou confirme para salvar mesmo assim.', {
        codigo_barras: 'Dígito verificador inválido.',
      }, { codigo: 'CODIGO_BARRAS_INVALIDO' });
    }
    let q = tx.selectFrom('produtos').select(['id', 'nome', 'codigo']).where('codigo_barras', '=', dados.codigo_barras).where('excluido_em', 'is', null);
    if (ignorarId) q = q.where('id', '!=', ignorarId);
    const r = await q.executeTakeFirst();
    if (r) {
      throw conflito(`Este código de barras já é usado pelo produto "${r.nome}" (código ${r.codigo}).`, {
        campos: { codigo_barras: `Já usado por ${r.nome}.` },
        produto_existente: { id: r.id, nome: r.nome, codigo: r.codigo },
      });
    }
  }
  if (dados.codigo) {
    let q = tx.selectFrom('produtos').select(['id', 'nome']).where('codigo', '=', dados.codigo).where('excluido_em', 'is', null);
    if (ignorarId) q = q.where('id', '!=', ignorarId);
    const r = await q.executeTakeFirst();
    if (r) throw conflito(`O código interno ${dados.codigo} já é usado pelo produto "${r.nome}".`, { campos: { codigo: `Já usado por ${r.nome}.` } });
  }
}

async function conferirReferencias(tx: Tx, d: { categoria_id?: string | null; fornecedor_id?: string | null }) {
  if (d.categoria_id) {
    const c = await tx.selectFrom('categorias').select('id').where('id', '=', d.categoria_id).where('excluido_em', 'is', null).executeTakeFirst();
    if (!c) throw erroValidacao('Categoria não encontrada.', { categoria_id: 'Categoria inexistente.' });
  }
  if (d.fornecedor_id) {
    const f = await tx.selectFrom('fornecedores').select('id').where('id', '=', d.fornecedor_id).where('excluido_em', 'is', null).executeTakeFirst();
    if (!f) throw erroValidacao('Fornecedor não encontrado.', { fornecedor_id: 'Fornecedor inexistente.' });
  }
}

export async function gerarCodigoInterno(tx: Tx): Promise<string> {
  for (;;) {
    const r = await sql<{ n: number }>`SELECT nextval('seq_codigo_produto') AS n`.execute(tx);
    const codigo = String(r.rows[0].n).padStart(6, '0');
    const uso = await tx.selectFrom('produtos').select('id').where('codigo', '=', codigo).where('excluido_em', 'is', null).executeTakeFirst();
    if (!uso) return codigo;
  }
}

export async function criarProduto(ator: Ator, d: Record<string, any>) {
  const minimoMil = d.estoque_minimo !== undefined ? quantidadeValida(d.estoque_minimo, d.unidade, 'estoque_minimo', true) : 0;
  const inicialMil = d.estoque_inicial !== undefined ? quantidadeValida(d.estoque_inicial, d.unidade, 'estoque_inicial', true) : 0;
  if (!d.controla_estoque && (minimoMil > 0 || inicialMil > 0)) {
    throw erroValidacao('Produto que não controla estoque não pode ter estoque inicial nem mínimo.', { estoque_minimo: 'Deixe em zero.' });
  }
  return banco()
    .transaction()
    .execute(async (tx) => {
      await conferirCodigos(tx, d);
      await conferirReferencias(tx, d);
      const codigo = d.codigo ?? (await gerarCodigoInterno(tx));
      const p = await tx
        .insertInto('produtos')
        .values({
          codigo,
          codigo_barras: d.codigo_barras ?? null,
          nome: d.nome,
          categoria_id: d.categoria_id ?? null,
          unidade: d.unidade,
          preco_venda: d.preco_venda,
          preco_custo: d.preco_custo ?? 0,
          estoque_minimo: minimoMil / 1000,
          controla_estoque: d.controla_estoque,
          fornecedor_id: d.fornecedor_id ?? null,
          observacoes: d.observacoes ?? null,
          criado_por: ator.usuarioId,
          atualizado_por: ator.usuarioId,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      if (inicialMil > 0) {
        await movimentarEstoque(tx, {
          produtoId: p.id,
          tipo: 'estoque_inicial',
          variacaoMil: inicialMil,
          usuarioId: ator.usuarioId!,
          custoUnitario: p.preco_custo,
          origemTipo: 'produto',
          origemId: p.id,
        });
      }
      await auditar(tx, ator, { entidade: 'produto', entidadeId: p.id, acao: 'criar', depois: { ...p, estoque_inicial: inicialMil / 1000 } });
      return p.id as string;
    });
}

export async function editarProduto(ator: Ator, id: string, d: Record<string, any>) {
  return banco()
    .transaction()
    .execute(async (tx) => {
      const antes = await tx.selectFrom('produtos').selectAll().where('id', '=', id).where('excluido_em', 'is', null).forUpdate().executeTakeFirst();
      if (!antes) throw naoEncontrado('Produto não encontrado.');
      if (antes.versao !== d.versao) throw erroConflitoVersao();
      if (d.codigo_barras !== undefined && d.codigo_barras === antes.codigo_barras) d.confirmar_codigo_barras_invalido = true;
      await conferirCodigos(tx, { ...d, codigo: d.codigo === antes.codigo ? undefined : d.codigo }, id);
      await conferirReferencias(tx, d);
      const unidade = d.unidade ?? antes.unidade;
      if (!fracionavel(unidade) && mil(antes.estoque_atual) % 1000 !== 0) {
        throw erroValidacao(
          `O estoque atual (${Number(antes.estoque_atual)}) tem casas decimais e a unidade ${unidade} só aceita inteiros. Faça um ajuste de estoque antes de mudar a unidade.`,
          { unidade: 'Estoque atual fracionado.' },
        );
      }
      const controla = d.controla_estoque ?? antes.controla_estoque;
      let minimo = d.estoque_minimo !== undefined ? quantidadeValida(d.estoque_minimo, unidade, 'estoque_minimo', true) / 1000 : Number(antes.estoque_minimo);
      if (!controla) {
        if (d.estoque_minimo !== undefined && minimo > 0) {
          throw erroValidacao('Produto que não controla estoque não pode ter estoque mínimo.', { estoque_minimo: 'Deixe em zero.' });
        }
        minimo = 0;
      }
      const campos: Record<string, unknown> = {};
      for (const k of ['codigo', 'codigo_barras', 'nome', 'categoria_id', 'unidade', 'preco_venda', 'preco_custo', 'controla_estoque', 'fornecedor_id', 'observacoes']) {
        if (d[k] !== undefined && !(k === 'codigo' && d[k] === null)) campos[k] = d[k];
      }
      const depois = await tx
        .updateTable('produtos')
        .set({ ...campos, estoque_minimo: minimo, versao: sql`versao + 1`, atualizado_em: sql`now()`, atualizado_por: ator.usuarioId })
        .where('id', '=', id)
        .returningAll()
        .executeTakeFirstOrThrow();
      await auditar(tx, ator, { entidade: 'produto', entidadeId: id, acao: 'editar', antes, depois });
      if (antes.preco_venda !== depois.preco_venda) {
        await auditar(tx, ator, {
          entidade: 'produto',
          entidadeId: id,
          acao: 'alterar_preco',
          antes: { preco_venda: antes.preco_venda },
          depois: { preco_venda: depois.preco_venda },
        });
      }
    });
}

export async function alterarSituacaoProduto(ator: Ator, id: string, ativo: boolean) {
  const antes = await banco().selectFrom('produtos').selectAll().where('id', '=', id).where('excluido_em', 'is', null).executeTakeFirst();
  if (!antes) throw naoEncontrado('Produto não encontrado.');
  const depois = await banco()
    .updateTable('produtos')
    .set({ ativo, versao: sql`versao + 1`, atualizado_em: sql`now()`, atualizado_por: ator.usuarioId })
    .where('id', '=', id)
    .returningAll()
    .executeTakeFirstOrThrow();
  await auditar(banco(), ator, { entidade: 'produto', entidadeId: id, acao: ativo ? 'reativar' : 'inativar', antes, depois });
}

/** Exclusão lógica: só se o produto nunca teve movimentação além do estoque inicial. */
export async function excluirProduto(ator: Ator, id: string) {
  await banco()
    .transaction()
    .execute(async (tx) => {
      const p = await tx.selectFrom('produtos').selectAll().where('id', '=', id).where('excluido_em', 'is', null).forUpdate().executeTakeFirst();
      if (!p) throw naoEncontrado('Produto não encontrado.');
      const mov = await tx.selectFrom('movimentacoes_estoque').select('id').where('produto_id', '=', id).where('tipo', '!=', 'estoque_inicial').executeTakeFirst();
      const venda = await tx.selectFrom('vendas_itens').select('id').where('produto_id', '=', id).executeTakeFirst();
      const entrada = await tx.selectFrom('entradas_itens').select('id').where('produto_id', '=', id).executeTakeFirst();
      const inv = await tx.selectFrom('inventarios_itens').select('produto_id').where('produto_id', '=', id).executeTakeFirst();
      if (mov || venda || entrada || inv) {
        throw conflito('Este produto já tem movimentações e não pode ser excluído. Inative-o para que ele saia do caixa.', { codigo: 'PRODUTO_COM_MOVIMENTACAO' });
      }
      await tx.updateTable('produtos').set({ excluido_em: sql`now()`, excluido_por: ator.usuarioId, ativo: false }).where('id', '=', id).execute();
      await auditar(tx, ator, { entidade: 'produto', entidadeId: id, acao: 'excluir', antes: p, soDiferencas: false });
    });
}
