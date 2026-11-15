import { banco, sql, type Tx } from '../../db/conexao.js';
import { auditar, type Ator } from '../../lib/auditoria.js';
import { conflito, erroValidacao, naoEncontrado, semPermissao } from '../../lib/erros.js';
import { quantidadeValida } from '../../lib/dinheiro.js';
import { ehSupervisor, type UsuarioLogado } from '../../lib/contexto.js';
import { bloquearProdutos, movimentarEstoque, mil } from '../estoque/movimentar.js';

export async function criarInventario(
  ator: Ator,
  d: { descricao: string; abrangencia: 'todos' | 'categoria' | 'selecionados'; categoria_ids?: string[]; produto_ids?: string[]; usuarios_designados?: string[] },
) {
  if (d.abrangencia === 'categoria' && !d.categoria_ids?.length) {
    throw erroValidacao('Escolha pelo menos uma categoria.', { categoria_ids: 'Escolha uma ou mais categorias.' });
  }
  if (d.abrangencia === 'selecionados' && !d.produto_ids?.length) {
    throw erroValidacao('Escolha pelo menos um produto.', { produto_ids: 'Escolha um ou mais produtos.' });
  }
  return banco()
    .transaction()
    .execute(async (tx) => {
      await sql`SELECT pg_advisory_xact_lock(4343)`.execute(tx);
      let q = tx.selectFrom('produtos').select(['id', 'nome']).where('excluido_em', 'is', null).where('ativo', '=', true).where('controla_estoque', '=', true);
      if (d.abrangencia === 'categoria') q = q.where('categoria_id', 'in', d.categoria_ids!);
      if (d.abrangencia === 'selecionados') q = q.where('id', 'in', d.produto_ids!);
      const produtos = await q.execute();
      if (produtos.length === 0) throw erroValidacao('Nenhum produto com controle de estoque nesta seleção. Escolha outras categorias ou produtos.');
      const emOutro = await tx
        .selectFrom('inventarios_itens as i')
        .innerJoin('inventarios as v', 'v.id', 'i.inventario_id')
        .innerJoin('produtos as p', 'p.id', 'i.produto_id')
        .select(['p.nome', 'v.numero'])
        .where('v.situacao', '=', 'em_contagem')
        .where('i.produto_id', 'in', produtos.map((p) => p.id))
        .limit(5)
        .execute();
      if (emOutro.length) {
        throw conflito(
          `Alguns produtos já estão em outro inventário em contagem (ex.: "${emOutro[0].nome}" no inventário nº ${emOutro[0].numero}). Finalize ou cancele aquele inventário antes.`,
          { codigo: 'PRODUTO_EM_OUTRO_INVENTARIO', produtos: emOutro },
        );
      }
      const inv = await tx
        .insertInto('inventarios')
        .values({
          descricao: d.descricao,
          abrangencia: d.abrangencia,
          categoria_ids: d.categoria_ids ?? [],
          usuarios_designados: d.usuarios_designados ?? [],
          criado_por: ator.usuarioId,
          atualizado_por: ator.usuarioId,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      await tx.insertInto('inventarios_itens').values(produtos.map((p) => ({ inventario_id: inv.id, produto_id: p.id }))).execute();
      await auditar(tx, ator, { entidade: 'inventario', entidadeId: inv.id, acao: 'criar', depois: { ...inv, produtos: produtos.length }, soDiferencas: false });
      return inv.id as string;
    });
}

async function carregar(tx: Tx, id: string, bloquear = false) {
  let q = tx.selectFrom('inventarios').selectAll().where('id', '=', id);
  if (bloquear) q = q.forUpdate();
  const inv = await q.executeTakeFirst();
  if (!inv) throw naoEncontrado('Inventário não encontrado.');
  return inv;
}

function podeContar(u: UsuarioLogado, inv: Record<string, any>) {
  if (ehSupervisor(u.perfil)) return;
  if (!(inv.usuarios_designados as string[]).includes(u.id)) throw semPermissao('Você não foi designado para contar este inventário.');
}

function exigirEmContagem(inv: Record<string, any>) {
  if (inv.situacao !== 'em_contagem') throw conflito(`Este inventário está ${inv.situacao === 'finalizado' ? 'finalizado' : 'cancelado'} e não pode mais ser alterado.`);
}

export async function obterInventario(u: UsuarioLogado, id: string) {
  const db = banco();
  const inv = await carregar(db, id);
  podeContar(u, inv);
  const itens = await db
    .selectFrom('inventarios_itens as i')
    .innerJoin('produtos as p', 'p.id', 'i.produto_id')
    .leftJoin('categorias as c', 'c.id', 'p.categoria_id')
    .leftJoin('usuarios as u', 'u.id', 'i.contado_por')
    .select([
      'i.produto_id', 'p.codigo', 'p.codigo_barras', 'p.nome', 'p.unidade', 'c.nome as categoria_nome',
      'i.quantidade_contada', 'i.estoque_no_fechamento', 'p.estoque_atual', 'i.contado_em', 'u.nome as contado_por_nome',
    ])
    .where('i.inventario_id', '=', id)
    .orderBy('p.nome')
    .execute();
  const finalizado = inv.situacao === 'finalizado';
  const fmt = itens.map((i) => {
    // Na revisão, compara com o estoque do momento; após finalizar, com o estoque registrado no fechamento.
    const sistema = finalizado && i.estoque_no_fechamento !== null ? Number(i.estoque_no_fechamento) : Number(i.estoque_atual);
    const contada = i.quantidade_contada === null ? null : Number(i.quantidade_contada);
    return {
      ...i,
      estoque_atual: Number(i.estoque_atual),
      estoque_sistema: sistema,
      quantidade_contada: contada,
      contado: contada !== null,
      diferenca: contada === null ? null : (mil(contada) - mil(sistema)) / 1000,
    };
  });
  return {
    ...inv,
    itens: fmt,
    resumo: {
      total_produtos: fmt.length,
      contados: fmt.filter((i) => i.contado).length,
      nao_contados: fmt.filter((i) => !i.contado).length,
      com_diferenca: fmt.filter((i) => i.diferenca !== null && i.diferenca !== 0).length,
    },
  };
}

export async function listarInventarios(u: UsuarioLogado, f: { situacao?: string }) {
  let q = banco()
    .selectFrom('inventarios as v')
    .leftJoin('usuarios as u', 'u.id', 'v.criado_por')
    .select(['v.id', 'v.numero', 'v.descricao', 'v.abrangencia', 'v.situacao', 'v.criado_em', 'v.finalizado_em', 'u.nome as criado_por_nome', 'v.usuarios_designados'])
    .select(sql<number>`(SELECT count(*) FROM inventarios_itens i WHERE i.inventario_id = v.id)::int`.as('total_produtos'))
    .select(sql<number>`(SELECT count(*) FROM inventarios_itens i WHERE i.inventario_id = v.id AND i.quantidade_contada IS NOT NULL)::int`.as('contados'));
  if (f.situacao) q = q.where('v.situacao', '=', f.situacao);
  if (!ehSupervisor(u.perfil)) q = q.where(sql<boolean>`${u.id}::uuid = ANY(v.usuarios_designados)`).where('v.situacao', '=', 'em_contagem');
  return { itens: await q.orderBy('v.numero', 'desc').execute() };
}

/** Leitura do código de barras: cada leitura soma 1 à contagem do produto. */
export async function registrarLeitura(u: UsuarioLogado, id: string, codigo: string) {
  return banco()
    .transaction()
    .execute(async (tx) => {
      const inv = await carregar(tx, id);
      podeContar(u, inv);
      exigirEmContagem(inv);
      const c = codigo.trim();
      const p = await tx
        .selectFrom('produtos')
        .select(['id', 'nome'])
        .where('excluido_em', 'is', null)
        .where((eb) => eb.or([eb('codigo_barras', '=', c), eb('codigo', '=', c)]))
        .executeTakeFirst();
      if (!p) throw naoEncontrado(`Nenhum produto encontrado com o código ${c}.`);
      const r = await sql<{ quantidade_contada: number }>`
        UPDATE inventarios_itens SET quantidade_contada = coalesce(quantidade_contada, 0) + 1, contado_por = ${u.id}, contado_em = now()
         WHERE inventario_id = ${id} AND produto_id = ${p.id}
        RETURNING quantidade_contada`.execute(tx);
      if (!r.rows.length) throw erroValidacao(`O produto "${p.nome}" não faz parte deste inventário.`);
      return { produto_id: p.id, nome: p.nome, quantidade_contada: Number(r.rows[0].quantidade_contada) };
    });
}

export async function definirContagem(u: UsuarioLogado, id: string, produtoId: string, quantidade: number | string | null) {
  return banco()
    .transaction()
    .execute(async (tx) => {
      const inv = await carregar(tx, id);
      podeContar(u, inv);
      exigirEmContagem(inv);
      const p = await tx.selectFrom('produtos').select(['unidade', 'nome']).where('id', '=', produtoId).executeTakeFirst();
      if (!p) throw naoEncontrado('Produto não encontrado.');
      const valor = quantidade === null ? null : quantidadeValida(quantidade, p.unidade, 'quantidade_contada', true) / 1000;
      const r = await tx
        .updateTable('inventarios_itens')
        .set({ quantidade_contada: valor, contado_por: valor === null ? null : u.id, contado_em: valor === null ? null : sql`now()` })
        .where('inventario_id', '=', id)
        .where('produto_id', '=', produtoId)
        .executeTakeFirst();
      if (Number(r.numUpdatedRows) === 0) throw erroValidacao(`O produto "${p.nome}" não faz parte deste inventário.`);
      return { produto_id: produtoId, quantidade_contada: valor };
    });
}

export async function finalizarInventario(ator: Ator, id: string, naoContados: 'manter' | 'zerar') {
  return banco()
    .transaction()
    .execute(async (tx) => {
      const inv = await carregar(tx, id, true);
      exigirEmContagem(inv);
      const itens = await tx.selectFrom('inventarios_itens').selectAll().where('inventario_id', '=', id).execute();
      const produtos = await bloquearProdutos(tx, itens.map((i) => i.produto_id));
      const porId = new Map(produtos.map((p) => [p.id, p]));
      let ajustados = 0;
      for (const i of itens) {
        const atual = mil(porId.get(i.produto_id)!.estoque_atual);
        await tx.updateTable('inventarios_itens').set({ estoque_no_fechamento: atual / 1000 }).where('inventario_id', '=', id).where('produto_id', '=', i.produto_id).execute();
        let alvo: number | null = i.quantidade_contada === null ? null : mil(i.quantidade_contada);
        if (alvo === null && naoContados === 'zerar') alvo = 0;
        if (alvo === null || alvo === atual) continue;
        await movimentarEstoque(tx, {
          produtoId: i.produto_id,
          tipo: 'inventario',
          variacaoMil: alvo - atual,
          usuarioId: ator.usuarioId!,
          origemTipo: 'inventario',
          origemId: id,
        });
        ajustados++;
      }
      await tx
        .updateTable('inventarios')
        .set({ situacao: 'finalizado', nao_contados: naoContados, finalizado_em: sql`now()`, finalizado_por: ator.usuarioId, atualizado_em: sql`now()`, atualizado_por: ator.usuarioId })
        .where('id', '=', id)
        .execute();
      await auditar(tx, ator, { entidade: 'inventario', entidadeId: id, acao: 'finalizar', depois: { nao_contados: naoContados, produtos_ajustados: ajustados }, soDiferencas: false });
      return { produtos_ajustados: ajustados };
    });
}

export async function cancelarInventario(ator: Ator, id: string) {
  await banco()
    .transaction()
    .execute(async (tx) => {
      const inv = await carregar(tx, id, true);
      exigirEmContagem(inv);
      await tx
        .updateTable('inventarios')
        .set({ situacao: 'cancelado', cancelado_em: sql`now()`, cancelado_por: ator.usuarioId, atualizado_em: sql`now()`, atualizado_por: ator.usuarioId })
        .where('id', '=', id)
        .execute();
      await auditar(tx, ator, { entidade: 'inventario', entidadeId: id, acao: 'cancelar' });
    });
}
