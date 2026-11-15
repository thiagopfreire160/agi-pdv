import type { FastifyInstance, FastifyReply } from 'fastify';
import { validar, z, booleanoQuery, paginacao, dataIsoOpc, quantidade, uuid } from '../../lib/esquemas.js';
import { ator, SUPERVISORES } from '../../lib/contexto.js';
import { gerarCsv, moedaCsv, numeroCsv } from '../../lib/csv.js';
import { fusoDaLoja, hojeNoFuso } from '../../lib/datas.js';
import { banco } from '../../db/conexao.js';
import * as s from './servico.js';

const esquemaAjuste = z.object({
  produto_id: uuid,
  operacao: z.enum(['adicionar', 'retirar', 'definir'], { error: 'Use adicionar, retirar ou definir.' }),
  quantidade,
  motivo: z.enum(s.MOTIVOS_AJUSTE, { error: 'Escolha um motivo válido.' }),
  motivo_texto: z.string().trim().max(200).nullable().optional(),
});

async function enviarCsv(reply: FastifyReply, nome: string, conteudo: string) {
  return reply
    .header('Content-Type', 'text/csv; charset=utf-8')
    .header('Content-Disposition', `attachment; filename="${nome}"`)
    .send(conteudo);
}

export default async function rotas(app: FastifyInstance) {
  const sup = { config: { perfis: SUPERVISORES } };

  app.get('/estoque/posicao', sup, async (req) =>
    s.posicaoEstoque(
      validar(
        z.object({
          busca: z.string().optional(),
          categoria_id: z.string().optional(),
          somente_baixo: booleanoQuery.optional(),
          somente_com_saldo: booleanoQuery.optional(),
          incluir_inativos: booleanoQuery.optional(),
        }),
        req.query,
      ),
    ),
  );

  app.get('/estoque/baixo', sup, async (req, reply) => {
    const f = validar(
      z.object({ fornecedor_id: z.string().uuid().optional(), categoria_id: z.string().uuid().optional(), formato: z.enum(['json', 'csv']).default('json') }),
      req.query,
    );
    const r = await s.estoqueBaixo(f);
    if (f.formato === 'json') return r;
    const hoje = hojeNoFuso(await fusoDaLoja(banco()));
    const csv = gerarCsv(
      ['Código', 'Produto', 'Unidade', 'Fornecedor', 'Estoque', 'Mínimo', 'Sugestão de compra', 'Último custo', 'Valor estimado'],
      r.itens.map((i) => [i.codigo, i.nome, i.unidade, i.fornecedor_nome, numeroCsv(i.estoque_atual), numeroCsv(i.estoque_minimo), i.sugestao_compra, moedaCsv(i.ultimo_custo), moedaCsv(i.valor_estimado)]),
    );
    return enviarCsv(reply, `estoque_baixo_${hoje}.csv`, csv);
  });

  app.get('/estoque/movimentacoes', sup, async (req) =>
    s.listarMovimentacoes(
      validar(
        z.object({
          produto_id: z.string().uuid().optional(),
          tipo: z.string().optional(),
          usuario_id: z.string().uuid().optional(),
          inicio: dataIsoOpc,
          fim: dataIsoOpc,
          ...paginacao,
        }),
        req.query,
      ),
    ),
  );

  app.post('/estoque/ajustes', sup, async (req, reply) => reply.status(201).send(await s.ajustarEstoque(ator(req), validar(esquemaAjuste, req.body))));
}
