import type { FastifyInstance } from 'fastify';
import { validar, z } from '../../lib/esquemas.js';
import { SUPERVISORES } from '../../lib/contexto.js';
import { montarDashboard } from './servico.js';

export default async function rotas(app: FastifyInstance) {
  app.get('/dashboard', { config: { perfis: SUPERVISORES } }, async (req) => {
    const { periodo } = validar(z.object({ periodo: z.enum(['7d', '30d', '12m']).default('7d') }), req.query);
    return montarDashboard(periodo);
  });
}
