import type { FastifyInstance } from 'fastify';
import { validar, z, paginacao, dataIsoOpc } from '../../lib/esquemas.js';
import { SO_ADMIN } from '../../lib/contexto.js';
import { banco, sql } from '../../db/conexao.js';
import { fusoDaLoja, inicioDoDia, fimDoDia } from '../../lib/datas.js';

const esquema = z.object({
  inicio: dataIsoOpc,
  fim: dataIsoOpc,
  usuario_id: z.string().uuid().optional(),
  entidade: z.string().optional(),
  entidade_id: z.string().optional(),
  acao: z.string().optional(),
  ...paginacao,
});

export default async function rotas(app: FastifyInstance) {
  app.get('/auditoria', { config: { perfis: SO_ADMIN } }, async (req) => {
    const f = validar(esquema, req.query);
    const fuso = await fusoDaLoja(banco());
    let q = banco().selectFrom('auditoria as a').leftJoin('usuarios as u', 'u.id', 'a.usuario_id').leftJoin('usuarios as z', 'z.id', 'a.autorizador_id');
    if (f.inicio) q = q.where('a.data_hora', '>=', inicioDoDia(f.inicio, fuso));
    if (f.fim) q = q.where('a.data_hora', '<', fimDoDia(f.fim, fuso));
    if (f.usuario_id) q = q.where('a.usuario_id', '=', f.usuario_id);
    if (f.entidade) q = q.where('a.entidade', '=', f.entidade);
    if (f.entidade_id) q = q.where('a.entidade_id', '=', f.entidade_id);
    if (f.acao) q = q.where('a.acao', '=', f.acao);
    const total = await q.select(sql<number>`count(*)`.as('n')).executeTakeFirstOrThrow();
    const itens = await q
      .select([
        'a.id', 'a.data_hora', 'a.usuario_id', 'u.nome as usuario_nome', 'a.autorizador_id', 'z.nome as autorizador_nome',
        'a.entidade', 'a.entidade_id', 'a.acao', 'a.antes', 'a.depois', 'a.ip',
      ])
      .orderBy('a.id', 'desc')
      .limit(f.por_pagina)
      .offset((f.pagina - 1) * f.por_pagina)
      .execute();
    return { itens, total: Number(total.n), pagina: f.pagina, por_pagina: f.por_pagina };
  });
}
