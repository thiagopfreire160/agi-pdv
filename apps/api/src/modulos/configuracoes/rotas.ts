import type { FastifyInstance } from 'fastify';
import { validar } from '../../lib/esquemas.js';
import { ator, SO_ADMIN } from '../../lib/contexto.js';
import { esquemaConfiguracoes } from './esquemas.js';
import { atualizarConfiguracoes, obterConfiguracoes } from './servico.js';
import { dadosRecibo } from '../vendas/recibo.js';

export default async function rotas(app: FastifyInstance) {
  app.get('/configuracoes', async () => obterConfiguracoes());

  app.put('/configuracoes', { config: { perfis: SO_ADMIN } }, async (req) =>
    atualizarConfiguracoes(validar(esquemaConfiguracoes, req.body), ator(req)),
  );

  // Recibo de teste com venda de exemplo (pré-visualização / impressão de teste).
  app.get('/configuracoes/recibo-teste', async () => dadosRecibo(null, { exemplo: true }));
}
