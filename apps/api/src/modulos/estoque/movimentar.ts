import { sql, type Tx } from '../../db/conexao.js';

export type TipoMovimentacao =
  | 'estoque_inicial' | 'entrada' | 'ajuste_mais' | 'ajuste_menos' | 'inventario' | 'venda' | 'cancelamento_venda' | 'devolucao';

export const mil = (qtd: number | string) => Math.round(Number(qtd) * 1000);
export const qtd = (milesimos: number) => milesimos / 1000;

/**
 * Aplica uma variação de estoque (em milésimos, com sinal) e grava a movimentação.
 * A linha do produto deve estar bloqueada (FOR UPDATE) pela transação chamadora.
 */
export async function movimentarEstoque(
  tx: Tx,
  m: {
    produtoId: string;
    tipo: TipoMovimentacao;
    variacaoMil: number;
    usuarioId: string;
    custoUnitario?: number | null;
    motivo?: string | null;
    motivoTexto?: string | null;
    origemTipo?: string | null;
    origemId?: string | null;
  },
) {
  const p = await tx.selectFrom('produtos').select(['estoque_atual']).where('id', '=', m.produtoId).executeTakeFirstOrThrow();
  const anterior = mil(p.estoque_atual);
  const posterior = anterior + m.variacaoMil;
  await tx
    .updateTable('produtos')
    .set({ estoque_atual: qtd(posterior), atualizado_em: sql`now()` })
    .where('id', '=', m.produtoId)
    .execute();
  const quantidade = m.tipo === 'inventario' ? m.variacaoMil : Math.abs(m.variacaoMil);
  await tx
    .insertInto('movimentacoes_estoque')
    .values({
      produto_id: m.produtoId,
      tipo: m.tipo,
      quantidade: qtd(quantidade),
      saldo_anterior: qtd(anterior),
      saldo_posterior: qtd(posterior),
      custo_unitario: m.custoUnitario ?? null,
      motivo: m.motivo ?? null,
      motivo_texto: m.motivoTexto ?? null,
      origem_tipo: m.origemTipo ?? null,
      origem_id: m.origemId ?? null,
      usuario_id: m.usuarioId,
    })
    .execute();
  return { anterior, posterior };
}

/** Bloqueia as linhas dos produtos em ordem fixa (evita impasse entre transações). */
export async function bloquearProdutos(tx: Tx, ids: string[]) {
  if (ids.length === 0) return [];
  const unicos = [...new Set(ids)].sort();
  return tx.selectFrom('produtos').selectAll().where('id', 'in', unicos).orderBy('id').forUpdate().execute();
}
