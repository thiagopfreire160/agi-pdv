import { randomBytes } from 'node:crypto';
import { banco, sql, type Tx } from '../../db/conexao.js';
import { auditar } from '../../lib/auditoria.js';
import { ErroApp, erroValidacao } from '../../lib/erros.js';
import { hashToken } from '../../lib/sessao.js';
import { ehSupervisor, type UsuarioLogado } from '../../lib/contexto.js';
import { conferirCredenciais } from '../auth/servico.js';
import { limiteDoPerfil, obterConfiguracoes } from '../configuracoes/servico.js';

export const ACOES_AUTORIZAVEIS = ['desconto', 'remover_item', 'cancelar_venda_andamento', 'cancelar_venda', 'devolucao'] as const;
export type AcaoAutorizavel = (typeof ACOES_AUTORIZAVEIS)[number];
const MOTIVO_OBRIGATORIO: AcaoAutorizavel[] = ['remover_item', 'cancelar_venda_andamento', 'cancelar_venda'];
const VALIDADE_MINUTOS = 30;

const DESCRICAO: Record<AcaoAutorizavel, string> = {
  desconto: 'desconto acima do limite',
  remover_item: 'remoção de item',
  cancelar_venda_andamento: 'cancelamento de venda em andamento',
  cancelar_venda: 'cancelamento de venda',
  devolucao: 'troca/devolução',
};

/**
 * Janela de autorização do supervisor: valida e-mail/CPF + senha de um gerente/admin
 * e devolve um token de uso único, válido por 30 minutos, para a ação informada.
 */
export async function concederAutorizacao(
  operador: UsuarioLogado,
  ip: string,
  d: { acao: AcaoAutorizavel; identificador: string; senha: string; percentual?: number | null; motivo?: string | null; detalhes?: Record<string, unknown> | null },
) {
  if (MOTIVO_OBRIGATORIO.includes(d.acao) && (!d.motivo || d.motivo.trim().length < 3)) {
    throw erroValidacao('Escreva o motivo (pelo menos 3 letras).', { motivo: 'Obrigatório para esta autorização.' });
  }
  if (d.acao === 'desconto' && (d.percentual === undefined || d.percentual === null)) {
    throw erroValidacao('Informe o percentual de desconto a autorizar.', { percentual: 'Obrigatório para desconto.' });
  }
  const autorizador = await conferirCredenciais(d.identificador, d.senha, ip, 'autorizacao');
  const negar = async (mensagem: string) => {
    await auditar(banco(), { usuarioId: operador.id, ip }, {
      entidade: 'autorizacao',
      acao: 'autorizacao_negada',
      autorizadorId: autorizador.id,
      depois: { acao: d.acao, percentual: d.percentual ?? null, motivo: mensagem },
      soDiferencas: false,
    });
    throw new ErroApp(403, mensagem, { codigo: 'AUTORIZACAO_NEGADA' });
  };
  if (!ehSupervisor(autorizador.perfil)) await negar(`${autorizador.nome} não tem permissão para autorizar. Chame um gerente ou administrador.`);
  if (d.acao === 'desconto') {
    const limite = limiteDoPerfil(await obterConfiguracoes(), autorizador.perfil);
    if (d.percentual! > limite) {
      await negar(`O limite de desconto de ${autorizador.nome} é ${limite.toLocaleString('pt-BR')}% e não cobre ${d.percentual!.toLocaleString('pt-BR')}%. Chame um administrador.`);
    }
  }
  const token = randomBytes(24).toString('base64url');
  const a = await banco()
    .insertInto('autorizacoes')
    .values({
      token_hash: hashToken(token),
      acao: d.acao,
      operador_id: operador.id,
      autorizador_id: autorizador.id,
      percentual: d.percentual ?? null,
      motivo: d.motivo ?? null,
      detalhes: d.detalhes ? JSON.stringify(d.detalhes) : null,
      expira_em: sql`now() + make_interval(mins => ${VALIDADE_MINUTOS})`,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  // Auditada já aqui: uma remoção de item autorizada fica registrada mesmo que a venda seja descartada.
  await auditar(banco(), { usuarioId: operador.id, ip }, {
    entidade: 'autorizacao',
    entidadeId: a.id,
    acao: 'autorizar',
    autorizadorId: autorizador.id,
    depois: { acao: d.acao, percentual: d.percentual ?? null, motivo: d.motivo ?? null, detalhes: d.detalhes ?? null },
    soDiferencas: false,
  });
  return {
    token,
    acao: d.acao,
    percentual: d.percentual ?? null,
    motivo: d.motivo ?? null,
    expira_em: a.expira_em,
    autorizador: { id: autorizador.id, nome: autorizador.nome, perfil: autorizador.perfil },
  };
}

export interface AutorizacaoConsumida {
  id: string;
  acao: AcaoAutorizavel;
  autorizador_id: string;
  autorizador_perfil: string;
  percentual: number | null;
  motivo: string | null;
  detalhes: Record<string, unknown> | null;
}

/** Valida e marca como usado um token de autorização dentro da transação. */
export async function consumirAutorizacao(tx: Tx, token: string, operadorId: string, acao: AcaoAutorizavel): Promise<AutorizacaoConsumida> {
  const a = await tx
    .selectFrom('autorizacoes as a')
    .innerJoin('usuarios as u', 'u.id', 'a.autorizador_id')
    .select(['a.id', 'a.acao', 'a.operador_id', 'a.autorizador_id', 'a.percentual', 'a.motivo', 'a.detalhes', 'a.expira_em', 'a.usada_em', 'u.perfil as autorizador_perfil', 'u.ativo'])
    .where('a.token_hash', '=', hashToken(token))
    .forUpdate()
    .executeTakeFirst();
  const invalida = (msg: string) => new ErroApp(403, msg, { codigo: 'AUTORIZACAO_INVALIDA', acao });
  if (!a || a.operador_id !== operadorId) throw invalida(`Autorização de ${DESCRICAO[acao]} inválida. Peça a autorização de novo.`);
  if (a.acao !== acao) throw invalida(`Esta autorização não vale para ${DESCRICAO[acao]}. Peça a autorização correta.`);
  if (a.usada_em) throw invalida('Esta autorização já foi usada. Peça uma nova autorização.');
  if (a.expira_em.getTime() < Date.now()) throw invalida('A autorização expirou. Peça uma nova autorização.');
  if (!a.ativo) throw invalida('O autorizador foi inativado. Peça uma nova autorização.');
  await tx.updateTable('autorizacoes').set({ usada_em: sql`now()` }).where('id', '=', a.id).execute();
  return {
    id: a.id,
    acao: a.acao,
    autorizador_id: a.autorizador_id,
    autorizador_perfil: a.autorizador_perfil,
    percentual: a.percentual === null ? null : Number(a.percentual),
    motivo: a.motivo,
    detalhes: a.detalhes,
  };
}

export function autorizacaoNecessaria(acao: AcaoAutorizavel, mensagem: string, extras: Record<string, unknown> = {}) {
  return new ErroApp(403, mensagem, { codigo: 'AUTORIZACAO_NECESSARIA', acao, ...extras });
}
