import type { FastifyInstance } from 'fastify';
import { validar, z } from '../../lib/esquemas.js';
import { ator, usuario, SUPERVISORES, SO_ADMIN, exigirPerfil } from '../../lib/contexto.js';
import { esquemaCriarUsuario, esquemaEditarUsuario, esquemaListarUsuarios } from './esquemas.js';
import * as s from './servico.js';
import { formatarUsuario } from './formato.js';

type ComId = { Params: { id: string } };
const idValido = (id: string) => validar(z.object({ id: z.string().uuid('Identificador inválido.') }), { id }).id;

export default async function rotas(app: FastifyInstance) {
  const sup = { config: { perfis: SUPERVISORES } };

  app.get('/usuarios', sup, async (req) => s.listarUsuarios(validar(esquemaListarUsuarios, req.query)));
  app.get<ComId>('/usuarios/:id', sup, async (req) => formatarUsuario(await s.obterUsuario(idValido(req.params.id))));
  app.post('/usuarios', sup, async (req, reply) =>
    reply.status(201).send(await s.criarUsuario(usuario(req), ator(req), validar(esquemaCriarUsuario, req.body))),
  );
  app.put<ComId>('/usuarios/:id', sup, async (req) =>
    s.editarUsuario(usuario(req), ator(req), idValido(req.params.id), validar(esquemaEditarUsuario, req.body)),
  );
  app.post<ComId>('/usuarios/:id/redefinir-senha', sup, async (req) => s.redefinirSenha(usuario(req), ator(req), idValido(req.params.id)));
  app.post<ComId>('/usuarios/:id/inativar', sup, async (req) => s.alterarSituacao(usuario(req), ator(req), idValido(req.params.id), false));
  app.post<ComId>('/usuarios/:id/reativar', sup, async (req) => s.alterarSituacao(usuario(req), ator(req), idValido(req.params.id), true));
  app.post<ComId>('/usuarios/:id/encerrar-sessoes', sup, async (req) => s.encerrarSessoes(usuario(req), ator(req), idValido(req.params.id)));

  app.get('/sessoes', { config: { perfis: SO_ADMIN } }, async () => s.listarSessoesAtivas());
  app.delete<ComId>('/sessoes/:id', { config: { perfis: SO_ADMIN } }, async (req) => {
    exigirPerfil(req, 'administrador');
    return s.encerrarSessao(ator(req), idValido(req.params.id));
  });
}
