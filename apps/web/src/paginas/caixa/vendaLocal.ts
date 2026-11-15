// Venda em andamento: vive só no terminal (localStorage) até a finalização (seção 5.3).
import type { Forma, Produto } from '../../api/tipos'

export const CHAVE_VENDA = 'nexo-venda-andamento'
export const CHAVE_TERMINAL = 'nexo-terminal'

export interface ItemLocal {
  chave: string
  produto_id: string
  codigo: string
  codigo_barras: string | null
  nome: string
  unidade: string
  fracionavel: boolean
  preco_unitario: number
  quantidade: number
  desconto: number
  controla_estoque: boolean
  estoque_atual: number
  estoque_baixo: boolean
}

export interface PagamentoLocal {
  chave: string
  forma: Forma
  valor: number
  parcelas?: number
  codigo_vale?: string
  observacao?: string
}

export interface VendaLocal {
  id: string
  sessao_id: string
  iniciada_em: string
  itens: ItemLocal[]
  desconto_venda: number
  cliente: { id: string; nome: string; documento: string | null } | null
  documento_recibo: string | null
  pagamentos: PagamentoLocal[]
  autorizacoes: string[]
  /** Maior percentual de desconto já autorizado nesta venda. */
  percentual_autorizado: number
  /** Vale-troca a usar no pagamento ("usar agora no caixa"). */
  vale_pendente?: string | null
}

export function novoId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

export function vendaVazia(sessao_id: string): VendaLocal {
  return {
    id: novoId(), sessao_id, iniciada_em: new Date().toISOString(), itens: [], desconto_venda: 0, cliente: null,
    documento_recibo: null, pagamentos: [], autorizacoes: [], percentual_autorizado: 0,
  }
}

export function lerVenda(): VendaLocal | null {
  try {
    const t = localStorage.getItem(CHAVE_VENDA)
    if (!t) return null
    const v = JSON.parse(t) as VendaLocal
    return v && Array.isArray(v.itens) ? v : null
  } catch {
    return null
  }
}

export function salvarVenda(v: VendaLocal | null) {
  try {
    if (!v || (v.itens.length === 0 && v.pagamentos.length === 0 && !v.cliente)) localStorage.removeItem(CHAVE_VENDA)
    else localStorage.setItem(CHAVE_VENDA, JSON.stringify(v))
  } catch {
    /* sem armazenamento local: a venda segue só na memória */
  }
}

export function haVendaEmAndamento() {
  const v = lerVenda()
  return !!v && v.itens.length > 0
}

export function lerTerminal(): string {
  try {
    return localStorage.getItem(CHAVE_TERMINAL) || 'Caixa 1'
  } catch {
    return 'Caixa 1'
  }
}
export function salvarTerminal(t: string) {
  try {
    localStorage.setItem(CHAVE_TERMINAL, t)
  } catch {
    /* ignora */
  }
}

/* ---------- Cálculos (centavos inteiros, seção 5.5) ---------- */

/** arred(qtd × preço) com metade para cima, em milésimos inteiros. */
export function totalBruto(quantidade: number, preco: number) {
  const mil = Math.round(quantidade * 1000)
  return Math.floor((mil * preco + 500) / 1000)
}

export const arred = (x: number) => Math.floor(x + 0.5)

export interface Totais {
  somaBruto: number
  descontoItens: number
  subtotal: number
  descontoVenda: number
  descontoTotal: number
  total: number
  percentualDesconto: number
  pago: number
  pagoDinheiro: number
  restante: number
  troco: number
  quantidadeItens: number
}

export function calcularTotais(v: VendaLocal): Totais {
  let somaBruto = 0
  let descontoItens = 0
  let quantidadeItens = 0
  for (const i of v.itens) {
    somaBruto += totalBruto(i.quantidade, i.preco_unitario)
    descontoItens += i.desconto
    quantidadeItens += i.fracionavel ? 1 : i.quantidade
  }
  const subtotal = somaBruto - descontoItens
  const descontoVenda = Math.min(v.desconto_venda, Math.max(0, subtotal - 1))
  const total = subtotal - descontoVenda
  const descontoTotal = descontoItens + descontoVenda
  const percentualDesconto = somaBruto > 0 ? Math.ceil((descontoTotal * 10000) / somaBruto - 1e-9) / 100 : 0
  const pago = v.pagamentos.reduce((s, p) => s + p.valor, 0)
  const pagoDinheiro = v.pagamentos.filter((p) => p.forma === 'dinheiro').reduce((s, p) => s + p.valor, 0)
  const restante = Math.max(0, total - pago)
  const troco = pagoDinheiro > 0 ? Math.min(pagoDinheiro, Math.max(0, pago - total)) : 0
  return { somaBruto, descontoItens, subtotal, descontoVenda, descontoTotal, total, percentualDesconto, pago, pagoDinheiro, restante, troco, quantidadeItens }
}

export function itemDeProduto(p: Produto, quantidade: number): ItemLocal {
  return {
    chave: novoId(), produto_id: p.id, codigo: p.codigo, codigo_barras: p.codigo_barras, nome: p.nome, unidade: p.unidade,
    fracionavel: p.fracionavel, preco_unitario: p.preco_venda, quantidade, desconto: 0, controla_estoque: p.controla_estoque,
    estoque_atual: p.estoque_atual, estoque_baixo: p.estoque_baixo,
  }
}

/** Interpreta "3*789...", "3x789...", "0,350*789..." -> {quantidade, codigo}. */
export function interpretarLeitura(texto: string): { quantidade: number | null; codigo: string } {
  const m = /^\s*(\d+(?:[.,]\d{1,3})?)\s*[*xX]\s*(.+)$/.exec(texto)
  if (!m) return { quantidade: null, codigo: texto.trim() }
  return { quantidade: parseFloat(m[1].replace(',', '.')), codigo: m[2].trim() }
}
