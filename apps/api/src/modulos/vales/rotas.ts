import type { FastifyInstance } from 'fastify';
import { validar, z, paginacao, dataIso } from '../../lib/esquemas.js';
import { ator, SO_ADMIN } from '../../lib/contexto.js';
import * as s from './servico.js';

type ComId = { Params: { id: string } };

export default async function rotas(app: FastifyInstance) {
  app.get('/vales-troca', async (req) =>
    s.listarVales(
      validar(
        z.object({
          busca: z.string().optional(),
          situacao: z.enum(['ativo', 'usado', 'expirado', 'cancelado']).optional(),
          cliente_id: z.string().uuid().optional(),
          ...paginacao,
        }),
        req.query,
      ),
    ),
  );
  app.get<{ Params: { codigo: string } }>('/vales-troca/codigo/:codigo', async (req) => s.obterVale({ codigo: req.params.codigo }));
  app.get<ComId>('/vales-troca/:id', async (req) => s.obterVale({ id: req.params.id }));
  app.post<ComId>('/vales-troca/:id/cancelar', { config: { perfis: SO_ADMIN } }, async (req) => {
    const { motivo } = validar(z.object({ motivo: z.string({ error: 'Informe o motivo.' }).trim().min(3, 'Informe o motivo (mínimo 3 caracteres).').max(200) }), req.body);
    await s.cancelarVale(ator(req), req.params.id, motivo);
    return s.obterVale({ id: req.params.id });
  });
  app.post<ComId>('/vales-troca/:id/reativar', { config: { perfis: SO_ADMIN } }, async (req) => {
    const { validade } = validar(z.object({ validade: dataIso }), req.body);
    await s.reativarVale(ator(req), req.params.id, validade);
    return s.obterVale({ id: req.params.id });
  });
}
