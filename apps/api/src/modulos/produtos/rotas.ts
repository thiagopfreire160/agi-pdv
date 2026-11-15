import type { FastifyInstance } from 'fastify';
import { validar, z } from '../../lib/esquemas.js';
import { ator, ehSupervisor, usuario, SUPERVISORES } from '../../lib/contexto.js';
import { esquemaCriarProduto, esquemaEditarProduto, esquemaListarProdutos } from './esquemas.js';
import * as s from './servico.js';

type ComId = { Params: { id: string } };

export default async function rotas(app: FastifyInstance) {
  const verCusto = (req: Parameters<typeof usuario>[0]) => ehSupervisor(usuario(req).perfil);

  app.get('/produtos', async (req) => s.listarProdutos(validar(esquemaListarProdutos, req.query), verCusto(req)));

  app.get('/produtos/busca', async (req) => {
    const { q } = validar(z.object({ q: z.string({ error: 'Informe o texto da busca.' }).trim().min(1, 'Informe o texto da busca.') }), req.query);
    return s.buscarParaCaixa(q, verCusto(req));
  });

  app.get<{ Params: { codigo: string } }>('/produtos/codigo/:codigo', async (req) => s.buscarPorCodigo(req.params.codigo, verCusto(req)));

  app.get<ComId>('/produtos/:id', async (req) => s.obterProduto(req.params.id, verCusto(req)));

  app.post('/produtos', { config: { perfis: SUPERVISORES } }, async (req, reply) => {
    const id = await s.criarProduto(ator(req), validar(esquemaCriarProduto, req.body));
    return reply.status(201).send(await s.obterProduto(id, true));
  });

  app.put<ComId>('/produtos/:id', { config: { perfis: SUPERVISORES } }, async (req) => {
    await s.editarProduto(ator(req), req.params.id, validar(esquemaEditarProduto, req.body));
    return s.obterProduto(req.params.id, true);
  });

  app.post<ComId>('/produtos/:id/inativar', { config: { perfis: SUPERVISORES } }, async (req) => {
    await s.alterarSituacaoProduto(ator(req), req.params.id, false);
    return s.obterProduto(req.params.id, true);
  });

  app.post<ComId>('/produtos/:id/reativar', { config: { perfis: SUPERVISORES } }, async (req) => {
    await s.alterarSituacaoProduto(ator(req), req.params.id, true);
    return s.obterProduto(req.params.id, true);
  });

  app.delete<ComId>('/produtos/:id', { config: { perfis: SUPERVISORES } }, async (req) => {
    await s.excluirProduto(ator(req), req.params.id);
    return { ok: true };
  });
}
