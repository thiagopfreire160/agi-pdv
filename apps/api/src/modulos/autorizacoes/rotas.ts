import type { FastifyInstance } from 'fastify';
import { validar, z } from '../../lib/esquemas.js';
import { usuario } from '../../lib/contexto.js';
import { ACOES_AUTORIZAVEIS, concederAutorizacao } from './servico.js';

export default async function rotas(app: FastifyInstance) {
  app.post('/autorizacoes', async (req, reply) => {
    const d = validar(
      z.object({
        acao: z.enum(ACOES_AUTORIZAVEIS, { error: 'Ação inválida.' }),
        identificador: z.string({ error: 'Informe o e-mail ou CPF do autorizador.' }).trim().min(1, 'Informe o e-mail ou CPF do autorizador.'),
        senha: z.string({ error: 'Informe a senha do autorizador.' }).min(1, 'Informe a senha do autorizador.'),
        percentual: z.number().min(0).max(100).nullable().optional(),
        motivo: z.string().trim().max(200).nullable().optional(),
        detalhes: z.record(z.string(), z.unknown()).nullable().optional(),
      }),
      req.body,
    );
    return reply.status(201).send(await concederAutorizacao(usuario(req), req.ip, d));
  });
}
