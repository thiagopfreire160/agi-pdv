import { fracionavel } from '../../lib/dinheiro.js';

export function estaComEstoqueBaixo(p: Record<string, any>) {
  return p.ativo && p.controla_estoque && Number(p.estoque_minimo) > 0 && Number(p.estoque_atual) <= Number(p.estoque_minimo);
}

/** Margem (%) com 1 casa decimal; null se custo = 0. */
export function margem(precoVenda: number, precoCusto: number): number | null {
  if (!precoCusto || precoCusto <= 0) return null;
  return Math.round(((precoVenda - precoCusto) / precoVenda) * 1000) / 10;
}

/** Formato público; para o perfil Caixa nunca inclui custo nem margem. */
export function formatarProduto(p: Record<string, any>, verCusto: boolean) {
  const r: Record<string, unknown> = {
    id: p.id,
    codigo: p.codigo,
    codigo_barras: p.codigo_barras,
    nome: p.nome,
    categoria_id: p.categoria_id,
    categoria_nome: p.categoria_nome ?? null,
    unidade: p.unidade,
    fracionavel: fracionavel(p.unidade),
    preco_venda: p.preco_venda,
    estoque_atual: Number(p.estoque_atual),
    estoque_minimo: Number(p.estoque_minimo),
    estoque_baixo: !!estaComEstoqueBaixo(p),
    controla_estoque: p.controla_estoque,
    fornecedor_id: p.fornecedor_id,
    fornecedor_nome: p.fornecedor_nome ?? null,
    observacoes: p.observacoes,
    ativo: p.ativo,
    versao: p.versao,
    criado_em: p.criado_em,
    atualizado_em: p.atualizado_em,
  };
  if (verCusto) {
    r.preco_custo = p.preco_custo;
    r.margem = margem(p.preco_venda, p.preco_custo);
    r.preco_abaixo_do_custo = p.preco_custo > 0 && p.preco_venda < p.preco_custo;
  }
  return r;
}
