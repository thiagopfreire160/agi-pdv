import type { FastifyInstance } from 'fastify';
import { validar, z, booleanoQuery } from '../../lib/esquemas.js';
import { usuario } from '../../lib/contexto.js';
import { esquemaCancelarVenda, esquemaDescarte, esquemaFinalizarVenda, esquemaListarVendas } from './esquemas.js';
import * as s from './servico.js';
import { dadosRecibo } from './recibo.js';

type ComId = { Params: { id: string } };

export default async function rotas(app: FastifyInstance) {
  app.post('/vendas', async (req, reply) => {
    const r = await s.finalizarVenda(usuario(req), req.ip, validar(esquemaFinalizarVenda, req.body));
    return reply.status(r.ja_registrada ? 200 : 201).send(r);
  });

  app.get('/vendas', async (req) => s.listarVendas(usuario(req), validar(esquemaListarVendas, req.query)));

  app.get<ComId>('/vendas/:id', async (req) => s.obterVenda(req.params.id, usuario(req)));

  app.post<ComId>('/vendas/:id/cancelar', async (req) => {
    await s.cancelarVenda(usuario(req), req.ip, req.params.id, validar(esquemaCancelarVenda, req.body));
    return s.obterVenda(req.params.id, usuario(req), { ignorarEscopo: true });
  });

  app.get<ComId>('/vendas/:id/recibo', async (req) => {
    const { segunda_via } = validar(z.object({ segunda_via: booleanoQuery.default(false) }), req.query);
    return dadosRecibo({ id: req.params.id, quem: usuario(req), segundaVia: segunda_via, ip: req.ip });
  });

  app.post('/vendas/descartes', async (req) => s.registrarDescarte(usuario(req), req.ip, validar(esquemaDescarte, req.body)));
}
