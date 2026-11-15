import { randomInt } from 'node:crypto';
import { banco, sql, type Tx } from '../../db/conexao.js';
import { auditar, type Ator } from '../../lib/auditoria.js';
import { conflito, erroValidacao, naoEncontrado } from '../../lib/erros.js';
import { fusoDaLoja, hojeNoFuso } from '../../lib/datas.js';

// Sem caracteres ambíguos (0/O, 1/I).
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export async function gerarCodigoVale(tx: Tx): Promise<string> {
  for (;;) {
    const codigo = Array.from({ length: 8 }, () => ALFABETO[randomInt(ALFABETO.length)]).join('');
    const existe = await tx.selectFrom('vales_troca').select('id').where('codigo', '=', codigo).executeTakeFirst();
    if (!existe) return codigo;
  }
}

/** Situação para exibição: "expirado" é derivado da validade. */
export function situacaoEfetiva(v: { situacao: string; validade: string }, hoje: string) {
  return v.situacao === 'ativo' && v.validade < hoje ? 'expirado' : v.situacao;
}

const consulta = () =>
  banco()
    .selectFrom('vales_troca as v')
    .leftJoin('clientes as c', 'c.id', 'v.cliente_id')
    .leftJoin('devolucoes as d', 'd.id', 'v.devolucao_id')
    .leftJoin('vendas as vd', 'vd.id', 'd.venda_id')
    .selectAll('v')
    .select(['c.nome as cliente_nome', 'd.numero as devolucao_numero', 'vd.numero as venda_origem_numero']);

function formatar(v: Record<string, any>, hoje: string) {
  const situacao = situacaoEfetiva(v as { situacao: string; validade: string }, hoje);
  return { ...v, situacao, utilizavel: situacao === 'ativo' && v.saldo > 0 };
}

export async function listarVales(f: { busca?: string; situacao?: string; cliente_id?: string; pagina: number; por_pagina: number }) {
  const hoje = hojeNoFuso(await fusoDaLoja(banco()));
  let q = consulta();
  if (f.busca?.trim()) {
    const t = f.busca.trim();
    q = q.where((eb) => eb.or([eb('v.codigo', '=', t.toUpperCase()), eb(sql`f_normalizar(c.nome)`, 'like', sql`'%' || f_normalizar(${t}) || '%'`)]));
  }
  if (f.cliente_id) q = q.where('v.cliente_id', '=', f.cliente_id);
  if (f.situacao === 'expirado') q = q.where('v.situacao', '=', 'ativo').where('v.validade', '<', hoje);
  else if (f.situacao === 'ativo') q = q.where('v.situacao', '=', 'ativo').where('v.validade', '>=', hoje);
  else if (f.situacao) q = q.where('v.situacao', '=', f.situacao);
  const total = await q.clearSelect().select(sql<number>`count(*)`.as('n')).executeTakeFirstOrThrow();
  const itens = await q.orderBy('v.criado_em', 'desc').limit(f.por_pagina).offset((f.pagina - 1) * f.por_pagina).execute();
  return { itens: itens.map((v) => formatar(v, hoje)), total: Number(total.n), pagina: f.pagina, por_pagina: f.por_pagina };
}

export async function obterVale(filtro: { id?: string; codigo?: string }) {
  const hoje = hojeNoFuso(await fusoDaLoja(banco()));
  let q = consulta();
  q = filtro.id ? q.where('v.id', '=', filtro.id) : q.where('v.codigo', '=', filtro.codigo!.trim().toUpperCase());
  const v = await q.executeTakeFirst();
  if (!v) throw naoEncontrado('Vale-troca não encontrado. Confira o código.');
  return formatar(v, hoje);
}

export async function cancelarVale(ator: Ator, id: string, motivo: string) {
  const v = await banco().selectFrom('vales_troca').selectAll().where('id', '=', id).executeTakeFirst();
  if (!v) throw naoEncontrado('Vale-troca não encontrado.');
  if (v.situacao === 'cancelado') throw conflito('Este vale já está cancelado.');
  await banco()
    .updateTable('vales_troca')
    .set({ situacao: 'cancelado', motivo_cancelamento: motivo, atualizado_em: sql`now()`, atualizado_por: ator.usuarioId })
    .where('id', '=', id)
    .execute();
  await auditar(banco(), ator, { entidade: 'vale_troca', entidadeId: id, acao: 'cancelar', antes: { situacao: v.situacao }, depois: { situacao: 'cancelado', motivo } });
}

/** Reativa vale expirado estendendo a validade (somente administrador). */
export async function reativarVale(ator: Ator, id: string, novaValidade: string) {
  const hoje = hojeNoFuso(await fusoDaLoja(banco()));
  if (novaValidade < hoje) throw erroValidacao('A nova validade deve ser hoje ou uma data futura.', { validade: 'Data no passado.' });
  const v = await banco().selectFrom('vales_troca').selectAll().where('id', '=', id).executeTakeFirst();
  if (!v) throw naoEncontrado('Vale-troca não encontrado.');
  if (v.situacao !== 'ativo' || v.saldo === 0) throw conflito('Só é possível reativar vale expirado com saldo. Vales usados ou cancelados não podem ser reativados.');
  await banco().updateTable('vales_troca').set({ validade: novaValidade, atualizado_em: sql`now()`, atualizado_por: ator.usuarioId }).where('id', '=', id).execute();
  await auditar(banco(), ator, { entidade: 'vale_troca', entidadeId: id, acao: 'reativar', antes: { validade: v.validade }, depois: { validade: novaValidade } });
}
