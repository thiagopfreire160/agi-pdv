import type { FastifyInstance } from 'fastify';
import { validar, z, textoOpc, uuid, uuidOpc, quantidade, dataIsoOpc, paginacao, centavos } from '../../lib/esquemas.js';
import { ator, SUPERVISORES } from '../../lib/contexto.js';
import * as s from './servico.js';

type ComId = { Params: { id: string } };

const esquemaEntrada = z.object({
  fornecedor_id: uuidOpc,
  numero_nota: textoOpc(30),
  data_recebimento: dataIsoOpc,
  atualizar_custo: z.boolean().default(true),
  observacoes: textoOpc(500),
  itens: z.array(z.object({ produto_id: uuid, quantidade, custo_unitario: centavos.nullable().optional() }), { error: 'Informe os itens.' }),
  confirmar: z.boolean().default(false),
  versao: z.number().int().optional(),
});

export default async function rotas(app: FastifyInstance) {
  const sup = { config: { perfis: SUPERVISORES } };

  app.get('/entradas', sup, async (req) =>
    s.listarEntradas(
      validar(
        z.object({
          situacao: z.enum(['rascunho', 'confirmada']).optional(),
          fornecedor_id: z.string().uuid().optional(),
          inicio: dataIsoOpc,
          fim: dataIsoOpc,
          busca: z.string().optional(),
          ...paginacao,
        }),
        req.query,
      ),
    ),
  );
  app.get<ComId>('/entradas/:id', sup, async (req) => s.obterEntrada(req.params.id));
  app.post('/entradas', sup, async (req, reply) => {
    const id = await s.criarEntrada(ator(req), validar(esquemaEntrada, req.body));
    return reply.status(201).send(await s.obterEntrada(id));
  });
  app.put<ComId>('/entradas/:id', sup, async (req) => {
    await s.editarEntrada(ator(req), req.params.id, validar(esquemaEntrada, req.body));
    return s.obterEntrada(req.params.id);
  });
  app.post<ComId>('/entradas/:id/confirmar', sup, async (req) => {
    await s.confirmarEntrada(ator(req), req.params.id);
    return s.obterEntrada(req.params.id);
  });
}
