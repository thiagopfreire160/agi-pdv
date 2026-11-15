import type { FastifyInstance } from 'fastify';
import { validar } from '../../lib/esquemas.js';
import { ator, ehSupervisor, usuario, SUPERVISORES } from '../../lib/contexto.js';
import { esquemaCriarCliente, esquemaEditarCliente, esquemaListarClientes } from './esquemas.js';
import * as s from './servico.js';

type ComId = { Params: { id: string } };

export default async function rotas(app: FastifyInstance) {
  app.get('/clientes', async (req) => {
    const f = validar(esquemaListarClientes, req.query);
    // Caixa só enxerga clientes ativos (busca no caixa).
    if (!ehSupervisor(usuario(req).perfil)) f.situacao = 'ativos';
    return s.listarClientes(f);
  });

  app.get<ComId>('/clientes/:id', async (req) => s.obterCliente(req.params.id));

  app.post('/clientes', async (req, reply) => {
    const d = validar(esquemaCriarCliente, req.body);
    // Perfil Caixa faz apenas o cadastro rápido: nome, documento e celular.
    const dados = ehSupervisor(usuario(req).perfil) ? d : { nome: d.nome, documento: d.documento, celular: d.celular };
    const id = await s.criarCliente(ator(req), dados);
    return reply.status(201).send(await s.obterCliente(id));
  });

  app.put<ComId>('/clientes/:id', { config: { perfis: SUPERVISORES } }, async (req) => {
    await s.editarCliente(ator(req), req.params.id, validar(esquemaEditarCliente, req.body));
    return s.obterCliente(req.params.id);
  });

  app.post<ComId>('/clientes/:id/inativar', { config: { perfis: SUPERVISORES } }, async (req) => {
    await s.alterarSituacaoCliente(ator(req), req.params.id, false);
    return s.obterCliente(req.params.id);
  });
  app.post<ComId>('/clientes/:id/reativar', { config: { perfis: SUPERVISORES } }, async (req) => {
    await s.alterarSituacaoCliente(ator(req), req.params.id, true);
    return s.obterCliente(req.params.id);
  });
  app.delete<ComId>('/clientes/:id', { config: { perfis: SUPERVISORES } }, async (req) => {
    await s.excluirCliente(ator(req), req.params.id);
    return { ok: true };
  });
}
