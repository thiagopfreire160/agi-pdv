import { banco, sql } from '../../db/conexao.js';
import { auditar, type Ator } from '../../lib/auditoria.js';
import { erroValidacao, naoEncontrado } from '../../lib/erros.js';
import { quantidadeValida } from '../../lib/dinheiro.js';
import { fusoDaLoja, inicioDoDia, fimDoDia } from '../../lib/datas.js';
import { bloquearProdutos, movimentarEstoque, mil } from './movimentar.js';
import { margem } from '../produtos/formato.js';

export const MOTIVOS_AJUSTE = ['perda_quebra', 'vencido', 'uso_interno', 'furto', 'correcao_lancamento', 'bonificacao_recebida', 'outro'] as const;

const arred = (n: number) => Math.round(n);

function situacaoEstoque(p: { estoque_atual: number; estoque_minimo: number }) {
  if (p.estoque_atual < 0) return 'negativo';
  if (p.estoque_atual === 0) return 'zerado';
  if (p.estoque_minimo > 0 && p.estoque_atual <= p.estoque_minimo) return 'baixo';
  return 'ok';
}

export async function posicaoEstoque(f: { busca?: string; categoria_id?: string; somente_baixo?: boolean; somente_com_saldo?: boolean; incluir_inativos?: boolean }) {
  let q = banco()
    .selectFrom('produtos as p')
    .leftJoin('categorias as c', 'c.id', 'p.categoria_id')
    .where('p.excluido_em', 'is', null)
    .where('p.controla_estoque', '=', true)
    .select(['p.id', 'p.codigo', 'p.codigo_barras', 'p.nome', 'p.unidade', 'p.estoque_atual', 'p.estoque_minimo', 'p.preco_custo', 'p.preco_venda', 'p.ativo', 'c.nome as categoria_nome', 'p.categoria_id']);
  if (!f.incluir_inativos) q = q.where('p.ativo', '=', true);
  if (f.busca?.trim()) q = q.where(sql<boolean>`(f_normalizar(p.nome) LIKE '%' || f_normalizar(${f.busca.trim()}) || '%' OR p.codigo_barras = ${f.busca.trim()} OR p.codigo = ${f.busca.trim()})`);
  if (f.categoria_id === 'sem') q = q.where('p.categoria_id', 'is', null);
  else if (f.categoria_id) q = q.where('p.categoria_id', '=', f.categoria_id);
  if (f.somente_baixo) q = q.where('p.estoque_minimo', '>', 0).where(sql<boolean>`p.estoque_atual <= p.estoque_minimo`);
  if (f.somente_com_saldo) q = q.where('p.estoque_atual', '>', 0);
  const linhas = await q.orderBy('p.nome').execute();
  const itens = linhas.map((p) => {
    const atual = Number(p.estoque_atual);
    const minimo = Number(p.estoque_minimo);
    return {
      ...p,
      estoque_atual: atual,
      estoque_minimo: minimo,
      valor_custo: arred(atual * p.preco_custo),
      valor_venda: arred(atual * p.preco_venda),
      situacao_estoque: situacaoEstoque({ estoque_atual: atual, estoque_minimo: minimo }),
    };
  });
  return {
    itens,
    totais: {
      itens: itens.length,
      valor_custo: itens.reduce((s, i) => s + Math.max(0, i.valor_custo), 0),
      valor_venda: itens.reduce((s, i) => s + Math.max(0, i.valor_venda), 0),
    },
  };
}

/** Sugestão de compra: mínimo × 2 − atual, arredondado para cima em unidades inteiras. */
export const sugestaoCompra = (atual: number, minimo: number) => Math.max(0, Math.ceil(minimo * 2 - atual - 1e-9));

export async function estoqueBaixo(f: { fornecedor_id?: string; categoria_id?: string; limite?: number }) {
  let q = banco()
    .selectFrom('produtos as p')
    .leftJoin('fornecedores as f', 'f.id', 'p.fornecedor_id')
    .leftJoin('categorias as c', 'c.id', 'p.categoria_id')
    .where('p.excluido_em', 'is', null)
    .where('p.ativo', '=', true)
    .where('p.controla_estoque', '=', true)
    .where('p.estoque_minimo', '>', 0)
    .where(sql<boolean>`p.estoque_atual <= p.estoque_minimo`)
    .select(['p.id', 'p.codigo', 'p.nome', 'p.unidade', 'p.estoque_atual', 'p.estoque_minimo', 'p.preco_custo', 'p.fornecedor_id', 'f.nome_fantasia as fornecedor_nome', 'c.nome as categoria_nome'])
    .orderBy(sql`p.estoque_atual / p.estoque_minimo`)
    .orderBy('p.nome');
  if (f.fornecedor_id) q = q.where('p.fornecedor_id', '=', f.fornecedor_id);
  if (f.categoria_id) q = q.where('p.categoria_id', '=', f.categoria_id);
  if (f.limite) q = q.limit(f.limite);
  const linhas = await q.execute();
  const itens = linhas.map((p) => {
    const atual = Number(p.estoque_atual);
    const minimo = Number(p.estoque_minimo);
    const sugestao = sugestaoCompra(atual, minimo);
    return { ...p, estoque_atual: atual, estoque_minimo: minimo, sugestao_compra: sugestao, ultimo_custo: p.preco_custo, valor_estimado: sugestao * p.preco_custo };
  });
  return { itens, totais: { valor_estimado: itens.reduce((s, i) => s + i.valor_estimado, 0) } };
}

export async function listarMovimentacoes(f: {
  produto_id?: string; tipo?: string; usuario_id?: string; inicio?: string | null; fim?: string | null; pagina: number; por_pagina: number;
}) {
  const db = banco();
  const fuso = await fusoDaLoja(db);
  let q = db
    .selectFrom('movimentacoes_estoque as m')
    .innerJoin('produtos as p', 'p.id', 'm.produto_id')
    .innerJoin('usuarios as u', 'u.id', 'm.usuario_id');
  if (f.produto_id) q = q.where('m.produto_id', '=', f.produto_id);
  if (f.tipo) q = q.where('m.tipo', '=', f.tipo);
  if (f.usuario_id) q = q.where('m.usuario_id', '=', f.usuario_id);
  if (f.inicio) q = q.where('m.data_hora', '>=', inicioDoDia(f.inicio, fuso));
  if (f.fim) q = q.where('m.data_hora', '<', fimDoDia(f.fim, fuso));
  const total = await q.select(sql<number>`count(*)`.as('n')).executeTakeFirstOrThrow();
  const itens = await q
    .select([
      'm.id', 'm.data_hora', 'm.produto_id', 'p.nome as produto_nome', 'p.codigo as produto_codigo', 'p.unidade', 'm.tipo',
      'm.quantidade', 'm.saldo_anterior', 'm.saldo_posterior', 'm.custo_unitario', 'm.motivo', 'm.motivo_texto',
      'm.usuario_id', 'u.nome as usuario_nome', 'm.origem_tipo', 'm.origem_id',
    ])
    .select(
      sql<number | null>`CASE m.origem_tipo
        WHEN 'venda' THEN (SELECT numero FROM vendas WHERE id = m.origem_id)
        WHEN 'devolucao' THEN (SELECT numero FROM devolucoes WHERE id = m.origem_id)
        WHEN 'entrada' THEN (SELECT numero FROM entradas WHERE id = m.origem_id)
        WHEN 'inventario' THEN (SELECT numero FROM inventarios WHERE id = m.origem_id)
        END`.as('origem_numero'),
    )
    .orderBy('m.sequencia', 'desc')
    .limit(f.por_pagina)
    .offset((f.pagina - 1) * f.por_pagina)
    .execute();
  return {
    itens: itens.map((m) => ({ ...m, quantidade_com_sinal: quantidadeComSinal(m.tipo, Number(m.quantidade)) })),
    total: Number(total.n),
    pagina: f.pagina,
    por_pagina: f.por_pagina,
  };
}

export function quantidadeComSinal(tipo: string, quantidade: number) {
  if (tipo === 'inventario') return quantidade;
  return ['ajuste_menos', 'venda'].includes(tipo) ? -quantidade : quantidade;
}

export async function ajustarEstoque(
  ator: Ator,
  d: { produto_id: string; operacao: 'adicionar' | 'retirar' | 'definir'; quantidade: number | string; motivo: string; motivo_texto?: string | null },
) {
  if (d.motivo === 'outro' && (!d.motivo_texto || d.motivo_texto.trim().length < 3)) {
    throw erroValidacao('Descreva o motivo do ajuste (pelo menos 3 letras).', { motivo_texto: 'Obrigatório quando o motivo é "outro".' });
  }
  return banco()
    .transaction()
    .execute(async (tx) => {
      const [p] = await bloquearProdutos(tx, [d.produto_id]);
      if (!p || p.excluido_em) throw naoEncontrado('Produto não encontrado.');
      if (!p.controla_estoque) throw erroValidacao('Este produto não controla estoque. Ative "controla estoque" no cadastro para ajustar.');
      const q = quantidadeValida(d.quantidade, p.unidade, 'quantidade', d.operacao === 'definir');
      const atual = mil(p.estoque_atual);
      const variacao = d.operacao === 'adicionar' ? q : d.operacao === 'retirar' ? -q : q - atual;
      if (variacao === 0) throw erroValidacao('A quantidade informada é igual ao estoque atual. Nada a ajustar.', { quantidade: 'Sem diferença.' });
      if (atual + variacao < 0) {
        throw erroValidacao(`O estoque ficaria negativo (atual: ${atual / 1000}). Confira a quantidade.`, {
          quantidade: 'Estoque ficaria negativo.',
        });
      }
      const r = await movimentarEstoque(tx, {
        produtoId: p.id,
        tipo: variacao > 0 ? 'ajuste_mais' : 'ajuste_menos',
        variacaoMil: variacao,
        usuarioId: ator.usuarioId!,
        motivo: d.motivo,
        motivoTexto: d.motivo_texto ?? null,
        origemTipo: 'ajuste',
      });
      await auditar(tx, ator, {
        entidade: 'produto',
        entidadeId: p.id,
        acao: 'ajuste_estoque',
        antes: { estoque_atual: r.anterior / 1000 },
        depois: { estoque_atual: r.posterior / 1000, motivo: d.motivo, motivo_texto: d.motivo_texto ?? null },
        soDiferencas: false,
      });
      return { produto_id: p.id, saldo_anterior: r.anterior / 1000, saldo_posterior: r.posterior / 1000, variacao: variacao / 1000 };
    });
}

export { margem };
