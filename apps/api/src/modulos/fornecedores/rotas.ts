import type { FastifyInstance } from 'fastify';
import { validar, z, textoObrig, textoOpc, documentoOpc, telefoneOpc, emailOpc, enderecoCampos, conferirCidadeUf, versao, situacaoFiltro, paginacao } from '../../lib/esquemas.js';
import { ator, SUPERVISORES } from '../../lib/contexto.js';
import { banco, sql, type Tx } from '../../db/conexao.js';
import { auditar } from '../../lib/auditoria.js';
import { conflito, erroConflitoVersao, naoEncontrado } from '../../lib/erros.js';
import { somenteDigitos } from '../../lib/documentos.js';

type ComId = { Params: { id: string } };

const campos = {
  nome_fantasia: textoObrig(80),
  razao_social: textoOpc(120),
  documento: documentoOpc,
  contato: textoOpc(80),
  telefone: telefoneOpc,
  email: emailOpc,
  ...enderecoCampos,
  observacoes: textoOpc(500),
};
const esquemaCriar = z.object(campos);
const esquemaEditar = z.object({ ...campos, nome_fantasia: campos.nome_fantasia.optional(), versao });

const formatar = (f: Record<string, any>) => {
  const { excluido_em: _e, excluido_por: _p, ...resto } = f;
  return resto;
};

async function conferirDocumento(tx: Tx, documento: string | null | undefined, ignorarId?: string) {
  if (!documento) return;
  let q = tx.selectFrom('fornecedores').select(['id', 'nome_fantasia']).where('documento', '=', documento).where('excluido_em', 'is', null);
  if (ignorarId) q = q.where('id', '!=', ignorarId);
  const r = await q.executeTakeFirst();
  if (r) {
    throw conflito(`Este documento já está cadastrado para o fornecedor "${r.nome_fantasia}".`, {
      campos: { documento: `Já cadastrado para ${r.nome_fantasia}.` },
      fornecedor_existente: { id: r.id, nome_fantasia: r.nome_fantasia },
    });
  }
}

async function obter(id: string) {
  const db = banco();
  const f = await db.selectFrom('fornecedores').selectAll().where('id', '=', id).where('excluido_em', 'is', null).executeTakeFirst();
  if (!f) throw naoEncontrado('Fornecedor não encontrado.');
  const produtos = await db
    .selectFrom('produtos')
    .select(['id', 'codigo', 'nome', 'estoque_atual', 'estoque_minimo', 'preco_custo', 'ativo'])
    .where('fornecedor_id', '=', id)
    .where('excluido_em', 'is', null)
    .orderBy('nome')
    .execute();
  const entradas = await sql`
    SELECT e.id, e.numero, e.data_recebimento, e.numero_nota, e.situacao,
           coalesce(sum(round(i.quantidade * i.custo_unitario)), 0)::bigint AS total
      FROM entradas e LEFT JOIN entradas_itens i ON i.entrada_id = e.id
     WHERE e.fornecedor_id = ${id}
     GROUP BY e.id ORDER BY e.data_recebimento DESC, e.numero DESC LIMIT 10`.execute(db);
  return { ...formatar(f), produtos, ultimas_entradas: entradas.rows };
}

export default async function rotas(app: FastifyInstance) {
  const sup = { config: { perfis: SUPERVISORES } };

  app.get('/fornecedores', sup, async (req) => {
    const f = validar(z.object({ busca: z.string().optional(), situacao: situacaoFiltro, ...paginacao }), req.query);
    let q = banco().selectFrom('fornecedores').where('excluido_em', 'is', null);
    if (f.busca?.trim()) {
      const t = f.busca.trim();
      const dig = somenteDigitos(t);
      q = q.where((eb) =>
        eb.or([
          eb(sql`f_normalizar(nome_fantasia)`, 'like', sql`'%' || f_normalizar(${t}) || '%'`),
          eb(sql`f_normalizar(coalesce(razao_social, ''))`, 'like', sql`'%' || f_normalizar(${t}) || '%'`),
          ...(dig.length >= 3 ? [eb('documento', 'like', `%${dig}%`)] : []),
        ]),
      );
    }
    if (f.situacao === 'ativos') q = q.where('ativo', '=', true);
    if (f.situacao === 'inativos') q = q.where('ativo', '=', false);
    const total = await q.select(sql<number>`count(*)`.as('n')).executeTakeFirstOrThrow();
    const itens = await q.selectAll().orderBy('nome_fantasia').limit(f.por_pagina).offset((f.pagina - 1) * f.por_pagina).execute();
    return { itens: itens.map(formatar), total: Number(total.n), pagina: f.pagina, por_pagina: f.por_pagina };
  });

  app.get<ComId>('/fornecedores/:id', sup, async (req) => obter(req.params.id));

  app.post('/fornecedores', sup, async (req, reply) => {
    const d = validar(esquemaCriar, req.body);
    conferirCidadeUf(d);
    const id = await banco()
      .transaction()
      .execute(async (tx) => {
        await conferirDocumento(tx, d.documento);
        const f = await tx.insertInto('fornecedores').values({ ...d, criado_por: ator(req).usuarioId, atualizado_por: ator(req).usuarioId }).returningAll().executeTakeFirstOrThrow();
        await auditar(tx, ator(req), { entidade: 'fornecedor', entidadeId: f.id, acao: 'criar', depois: f });
        return f.id as string;
      });
    return reply.status(201).send(await obter(id));
  });

  app.put<ComId>('/fornecedores/:id', sup, async (req) => {
    const d = validar(esquemaEditar, req.body);
    await banco()
      .transaction()
      .execute(async (tx) => {
        const antes = await tx.selectFrom('fornecedores').selectAll().where('id', '=', req.params.id).where('excluido_em', 'is', null).forUpdate().executeTakeFirst();
        if (!antes) throw naoEncontrado('Fornecedor não encontrado.');
        if (antes.versao !== d.versao) throw erroConflitoVersao();
        conferirCidadeUf({ cidade: d.cidade !== undefined ? d.cidade : antes.cidade, uf: d.uf !== undefined ? d.uf : antes.uf });
        await conferirDocumento(tx, d.documento, antes.id);
        const { versao: _v, ...c } = d;
        const depois = await tx
          .updateTable('fornecedores')
          .set({ ...c, versao: sql`versao + 1`, atualizado_em: sql`now()`, atualizado_por: ator(req).usuarioId })
          .where('id', '=', antes.id)
          .returningAll()
          .executeTakeFirstOrThrow();
        await auditar(tx, ator(req), { entidade: 'fornecedor', entidadeId: antes.id, acao: 'editar', antes, depois });
      });
    return obter(req.params.id);
  });

  for (const [rota, ativo] of [['inativar', false], ['reativar', true]] as const) {
    app.post<ComId>(`/fornecedores/:id/${rota}`, sup, async (req) => {
      const antes = await banco().selectFrom('fornecedores').selectAll().where('id', '=', req.params.id).where('excluido_em', 'is', null).executeTakeFirst();
      if (!antes) throw naoEncontrado('Fornecedor não encontrado.');
      const depois = await banco()
        .updateTable('fornecedores')
        .set({ ativo, versao: sql`versao + 1`, atualizado_em: sql`now()`, atualizado_por: ator(req).usuarioId })
        .where('id', '=', antes.id)
        .returningAll()
        .executeTakeFirstOrThrow();
      await auditar(banco(), ator(req), { entidade: 'fornecedor', entidadeId: antes.id, acao: rota, antes, depois });
      return obter(antes.id);
    });
  }

  app.delete<ComId>('/fornecedores/:id', sup, async (req) => {
    const f = await banco().selectFrom('fornecedores').selectAll().where('id', '=', req.params.id).where('excluido_em', 'is', null).executeTakeFirst();
    if (!f) throw naoEncontrado('Fornecedor não encontrado.');
    const uso =
      (await banco().selectFrom('produtos').select('id').where('fornecedor_id', '=', f.id).executeTakeFirst()) ??
      (await banco().selectFrom('entradas').select('id').where('fornecedor_id', '=', f.id).executeTakeFirst());
    if (uso) throw conflito('Este fornecedor tem produtos ou entradas vinculados e não pode ser excluído. Inative-o em vez disso.');
    await banco().updateTable('fornecedores').set({ excluido_em: sql`now()`, excluido_por: ator(req).usuarioId, ativo: false }).where('id', '=', f.id).execute();
    await auditar(banco(), ator(req), { entidade: 'fornecedor', entidadeId: f.id, acao: 'excluir', antes: f, soDiferencas: false });
    return { ok: true };
  });
}
