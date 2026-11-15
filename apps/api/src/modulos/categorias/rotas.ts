import type { FastifyInstance } from 'fastify';
import { validar, z, textoObrig, versao, situacaoFiltro } from '../../lib/esquemas.js';
import { ator, SUPERVISORES } from '../../lib/contexto.js';
import { banco, sql, type Tx } from '../../db/conexao.js';
import { auditar } from '../../lib/auditoria.js';
import { conflito, erroConflitoVersao, naoEncontrado } from '../../lib/erros.js';

type ComId = { Params: { id: string } };

async function conferirNome(tx: Tx, nome: string, ignorarId?: string) {
  let q = tx.selectFrom('categorias').select('nome').where(sql`f_normalizar(nome)`, '=', sql`f_normalizar(${nome})`).where('excluido_em', 'is', null);
  if (ignorarId) q = q.where('id', '!=', ignorarId);
  const r = await q.executeTakeFirst();
  if (r) throw conflito(`Já existe a categoria "${r.nome}".`, { campos: { nome: 'Categoria já cadastrada.' } });
}

const formatar = (c: Record<string, any>) => ({
  id: c.id,
  nome: c.nome,
  ativo: c.ativo,
  versao: c.versao,
  quantidade_produtos: c.quantidade_produtos !== undefined ? Number(c.quantidade_produtos) : undefined,
});

export default async function rotas(app: FastifyInstance) {
  app.get('/categorias', async (req) => {
    const f = validar(z.object({ situacao: situacaoFiltro, busca: z.string().optional() }), req.query);
    let q = banco()
      .selectFrom('categorias as c')
      .where('c.excluido_em', 'is', null)
      .select(['c.id', 'c.nome', 'c.ativo', 'c.versao'])
      .select(sql<number>`(SELECT count(*) FROM produtos p WHERE p.categoria_id = c.id AND p.excluido_em IS NULL)`.as('quantidade_produtos'));
    if (f.situacao === 'ativos') q = q.where('c.ativo', '=', true);
    if (f.situacao === 'inativos') q = q.where('c.ativo', '=', false);
    if (f.busca) q = q.where(sql`f_normalizar(c.nome)`, 'like', sql`'%' || f_normalizar(${f.busca}) || '%'`);
    return { itens: (await q.orderBy('c.nome').execute()).map(formatar) };
  });

  app.post('/categorias', { config: { perfis: SUPERVISORES } }, async (req, reply) => {
    const { nome } = validar(z.object({ nome: textoObrig(50) }), req.body);
    const c = await banco()
      .transaction()
      .execute(async (tx) => {
        await conferirNome(tx, nome);
        const c = await tx.insertInto('categorias').values({ nome, criado_por: ator(req).usuarioId, atualizado_por: ator(req).usuarioId }).returningAll().executeTakeFirstOrThrow();
        await auditar(tx, ator(req), { entidade: 'categoria', entidadeId: c.id, acao: 'criar', depois: c });
        return c;
      });
    return reply.status(201).send(formatar(c));
  });

  app.put<ComId>('/categorias/:id', { config: { perfis: SUPERVISORES } }, async (req) => {
    const d = validar(z.object({ nome: textoObrig(50), versao }), req.body);
    return banco()
      .transaction()
      .execute(async (tx) => {
        const antes = await tx.selectFrom('categorias').selectAll().where('id', '=', req.params.id).where('excluido_em', 'is', null).forUpdate().executeTakeFirst();
        if (!antes) throw naoEncontrado('Categoria não encontrada.');
        if (antes.versao !== d.versao) throw erroConflitoVersao();
        await conferirNome(tx, d.nome, antes.id);
        const depois = await tx
          .updateTable('categorias')
          .set({ nome: d.nome, versao: sql`versao + 1`, atualizado_em: sql`now()`, atualizado_por: ator(req).usuarioId })
          .where('id', '=', antes.id)
          .returningAll()
          .executeTakeFirstOrThrow();
        await auditar(tx, ator(req), { entidade: 'categoria', entidadeId: antes.id, acao: 'editar', antes, depois });
        return formatar(depois);
      });
  });

  for (const [rota, ativo] of [['inativar', false], ['reativar', true]] as const) {
    app.post<ComId>(`/categorias/:id/${rota}`, { config: { perfis: SUPERVISORES } }, async (req) => {
      const antes = await banco().selectFrom('categorias').selectAll().where('id', '=', req.params.id).where('excluido_em', 'is', null).executeTakeFirst();
      if (!antes) throw naoEncontrado('Categoria não encontrada.');
      const depois = await banco()
        .updateTable('categorias')
        .set({ ativo, versao: sql`versao + 1`, atualizado_em: sql`now()`, atualizado_por: ator(req).usuarioId })
        .where('id', '=', antes.id)
        .returningAll()
        .executeTakeFirstOrThrow();
      await auditar(banco(), ator(req), { entidade: 'categoria', entidadeId: antes.id, acao: rota, antes, depois });
      return formatar(depois);
    });
  }

  // Exclusão lógica: só para categoria criada por engano, sem produtos.
  app.delete<ComId>('/categorias/:id', { config: { perfis: SUPERVISORES } }, async (req) => {
    const c = await banco().selectFrom('categorias').selectAll().where('id', '=', req.params.id).where('excluido_em', 'is', null).executeTakeFirst();
    if (!c) throw naoEncontrado('Categoria não encontrada.');
    const uso = await banco().selectFrom('produtos').select('id').where('categoria_id', '=', c.id).executeTakeFirst();
    if (uso) throw conflito('Esta categoria tem produtos e não pode ser excluída. Inative-a em vez disso.');
    await banco().updateTable('categorias').set({ excluido_em: sql`now()`, excluido_por: ator(req).usuarioId }).where('id', '=', c.id).execute();
    await auditar(banco(), ator(req), { entidade: 'categoria', entidadeId: c.id, acao: 'excluir', antes: c, soDiferencas: false });
    return { ok: true };
  });
}
