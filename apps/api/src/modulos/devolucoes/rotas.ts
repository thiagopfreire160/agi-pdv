import type { FastifyInstance } from 'fastify';
import { validar, z, uuid, quantidade, paginacao, dataIsoOpc } from '../../lib/esquemas.js';
import { usuario, SUPERVISORES } from '../../lib/contexto.js';
import * as s from './servico.js';
import { banco } from '../../db/conexao.js';
import { naoEncontrado } from '../../lib/erros.js';
import { obterVenda } from '../vendas/servico.js';

const esquemaItens = z.array(z.object({ venda_item_id: uuid, quantidade, volta_estoque: z.boolean().default(true) }), { error: 'Informe os itens.' });

const esquemaDevolucao = z.object({
  venda_id: uuid,
  itens: esquemaItens,
  destino: z.enum(['vale_troca', 'estorno'], { error: 'Destino deve ser vale_troca ou estorno.' }),
  forma_estorno: z.enum(['dinheiro', 'debito', 'credito', 'pix']).nullable().optional(),
  motivo: z.enum(['defeito', 'arrependimento', 'tamanho_modelo', 'outro'], { error: 'Motivo inválido.' }),
  motivo_texto: z.string().trim().max(200).nullable().optional(),
  token_autorizacao: z.string().optional(),
});

export default async function rotas(app: FastifyInstance) {
  app.post('/devolucoes/simular', async (req) => s.simularDevolucao(usuario(req), validar(z.object({ venda_id: uuid, itens: esquemaItens }), req.body)));

  app.post('/devolucoes', async (req, reply) => {
    const id = await s.registrarDevolucao(usuario(req), req.ip, validar(esquemaDevolucao, req.body));
    return reply.status(201).send(await s.obterDevolucao(id));
  });

  app.get('/devolucoes', { config: { perfis: SUPERVISORES } }, async (req) =>
    s.listarDevolucoes(
      validar(
        z.object({
          inicio: dataIsoOpc,
          fim: dataIsoOpc,
          destino: z.enum(['vale_troca', 'estorno']).optional(),
          motivo: z.string().optional(),
          venda_id: z.string().uuid().optional(),
          ...paginacao,
        }),
        req.query,
      ),
    ),
  );

  // Localiza a venda de origem pelo número (ou pelo código de barras do recibo), para qualquer perfil.
  app.get<{ Params: { numero: string } }>('/devolucoes/venda/:numero', async (req) => {
    const numero = Number(req.params.numero.replace(/\D/g, ''));
    const v = await banco().selectFrom('vendas').select('id').where('numero', '=', numero).executeTakeFirst();
    if (!v) throw naoEncontrado(`Venda nº ${req.params.numero} não encontrada. Confira o número no recibo.`);
    return obterVenda(v.id, usuario(req), { ignorarEscopo: true });
  });

  app.get<{ Params: { id: string } }>('/devolucoes/:id', async (req) => s.obterDevolucao(req.params.id));
}
