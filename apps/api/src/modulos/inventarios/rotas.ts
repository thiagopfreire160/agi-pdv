import type { FastifyInstance } from 'fastify';
import { validar, z, textoObrig, quantidade } from '../../lib/esquemas.js';
import { ator, usuario, SUPERVISORES } from '../../lib/contexto.js';
import * as s from './servico.js';

type ComId = { Params: { id: string } };

export default async function rotas(app: FastifyInstance) {
  const sup = { config: { perfis: SUPERVISORES } };

  app.get('/inventarios', async (req) =>
    s.listarInventarios(usuario(req), validar(z.object({ situacao: z.enum(['em_contagem', 'finalizado', 'cancelado']).optional() }), req.query)),
  );

  app.post('/inventarios', sup, async (req, reply) => {
    const d = validar(
      z.object({
        descricao: textoObrig(80),
        abrangencia: z.enum(['todos', 'categoria', 'selecionados'], { error: 'Use todos, categoria ou selecionados.' }),
        categoria_ids: z.array(z.string().uuid()).optional(),
        produto_ids: z.array(z.string().uuid()).optional(),
        usuarios_designados: z.array(z.string().uuid()).optional(),
      }),
      req.body,
    );
    const id = await s.criarInventario(ator(req), d);
    return reply.status(201).send(await s.obterInventario(usuario(req), id));
  });

  app.get<ComId>('/inventarios/:id', async (req) => s.obterInventario(usuario(req), req.params.id));

  app.post<ComId>('/inventarios/:id/leituras', async (req) => {
    const { codigo } = validar(z.object({ codigo: z.string().trim().min(1, 'Informe o código lido.') }), req.body);
    return s.registrarLeitura(usuario(req), req.params.id, codigo);
  });

  app.put<{ Params: { id: string; produtoId: string } }>('/inventarios/:id/itens/:produtoId', async (req) => {
    const { quantidade_contada } = validar(z.object({ quantidade_contada: quantidade.nullable() }), req.body);
    return s.definirContagem(usuario(req), req.params.id, req.params.produtoId, quantidade_contada);
  });

  app.post<ComId>('/inventarios/:id/finalizar', sup, async (req) => {
    const { nao_contados } = validar(z.object({ nao_contados: z.enum(['manter', 'zerar']).default('manter') }), req.body);
    await s.finalizarInventario(ator(req), req.params.id, nao_contados);
    return s.obterInventario(usuario(req), req.params.id);
  });

  app.post<ComId>('/inventarios/:id/cancelar', sup, async (req) => {
    await s.cancelarInventario(ator(req), req.params.id);
    return s.obterInventario(usuario(req), req.params.id);
  });
}
