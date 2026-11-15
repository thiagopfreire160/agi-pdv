import type { FastifyInstance } from 'fastify';
import { validar, z, textoOpc, centavos, centavosPositivo, paginacao, dataIsoOpc } from '../../lib/esquemas.js';
import { ator, usuario, SUPERVISORES, ehSupervisor } from '../../lib/contexto.js';
import { banco } from '../../db/conexao.js';
import { ErroApp, semPermissao, naoEncontrado } from '../../lib/erros.js';
import * as s from './servico.js';

type ComId = { Params: { id: string } };

const esquemaFechar = z.object({
  valor_contado: centavos,
  observacao: textoOpc(500),
  /** Opcional: contagem por cédulas e moedas, ex. {"10000": 2, "5000": 1} (valor em centavos → quantidade). */
  contagem: z.record(z.string(), z.number().int().min(0)).optional(),
});

function valorDaContagem(d: { valor_contado: number; contagem?: Record<string, number> }) {
  if (!d.contagem) return d.valor_contado;
  const soma = Object.entries(d.contagem).reduce((t, [valor, qtd]) => t + Number(valor) * qtd, 0);
  if (soma !== d.valor_contado) {
    throw new ErroApp(422, 'O valor contado não confere com a soma das cédulas e moedas.', { campos: { valor_contado: 'Diferente da soma da contagem.' } });
  }
  return soma;
}

export default async function rotas(app: FastifyInstance) {
  app.get('/caixa/atual', async (req) => {
    const u = usuario(req);
    const sessao = await s.caixaAbertoDoOperador(banco(), u.id);
    if (!sessao) return { sessao: null };
    return { sessao: await s.detalharSessao(banco(), sessao.id, u) };
  });

  app.post('/caixa/abrir', async (req, reply) => {
    const d = validar(z.object({ fundo_troco: centavos, terminal: textoOpc(30) }), req.body);
    const id = await s.abrirCaixa(ator(req), d);
    return reply.status(201).send({ sessao: await s.detalharSessao(banco(), id, usuario(req)) });
  });

  app.post('/caixa/movimentos', async (req, reply) => {
    const d = validar(
      z.object({ tipo: z.enum(['sangria', 'suprimento'], { error: 'Use sangria ou suprimento.' }), valor: centavosPositivo, motivo: textoOpc(120) }),
      req.body,
    );
    return reply.status(201).send(await s.registrarMovimento(ator(req), d));
  });

  // Contagem cega: o operador informa o contado e só então vê o esperado.
  app.post('/caixa/conferencia', async (req) => {
    const d = validar(esquemaFechar.pick({ valor_contado: true, contagem: true }), req.body);
    const sessao = await s.caixaAbertoDoOperador(banco(), usuario(req).id);
    if (!sessao) throw new ErroApp(409, 'Você não tem caixa aberto.', { codigo: 'CAIXA_FECHADO' });
    return s.conferir(sessao.id, valorDaContagem(d));
  });

  app.post('/caixa/fechar', async (req) => {
    const d = validar(esquemaFechar, req.body);
    const sessao = await s.caixaAbertoDoOperador(banco(), usuario(req).id);
    if (!sessao) throw new ErroApp(409, 'Você não tem caixa aberto.', { codigo: 'CAIXA_FECHADO' });
    await s.fecharSessao(ator(req), sessao.id, { valor_contado: valorDaContagem(d), observacao: d.observacao }, false);
    return { sessao: await s.detalharSessao(banco(), sessao.id, usuario(req)) };
  });

  app.get('/caixa/sessoes', { config: { perfis: SUPERVISORES } }, async (req) =>
    s.listarSessoes(
      validar(
        z.object({ situacao: z.enum(['aberto', 'fechado']).optional(), operador_id: z.string().uuid().optional(), inicio: dataIsoOpc, fim: dataIsoOpc, ...paginacao }),
        req.query,
      ),
    ),
  );

  app.get<ComId>('/caixa/sessoes/:id', async (req) => s.detalharSessao(banco(), req.params.id, usuario(req)));

  // Fechamento forçado do caixa de outro operador (gerente/administrador).
  app.post<ComId>('/caixa/sessoes/:id/fechar', { config: { perfis: SUPERVISORES } }, async (req) => {
    const d = validar(esquemaFechar, req.body);
    const u = usuario(req);
    const sessao = await banco().selectFrom('sessoes_caixa').select(['operador_id']).where('id', '=', req.params.id).executeTakeFirst();
    if (!sessao) throw naoEncontrado('Caixa não encontrado.');
    if (!ehSupervisor(u.perfil)) throw semPermissao();
    const forcado = sessao.operador_id !== u.id;
    await s.fecharSessao(ator(req), req.params.id, { valor_contado: valorDaContagem(d), observacao: d.observacao }, forcado);
    return { sessao: await s.detalharSessao(banco(), req.params.id, u) };
  });
}
