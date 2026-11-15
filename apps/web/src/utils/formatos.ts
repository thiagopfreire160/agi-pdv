// Formatos brasileiros (seção 1.4 da especificação). Dinheiro sempre em centavos inteiros.

export const FUSO_PADRAO = 'America/Sao_Paulo'
let fusoAtual = FUSO_PADRAO
export function definirFuso(fuso: string | null | undefined) {
  fusoAtual = fuso || FUSO_PADRAO
}

const fmtDinheiro = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

/** 123456 -> "R$ 1.234,56" */
export function dinheiro(centavos: number | null | undefined): string {
  return fmtDinheiro.format((centavos ?? 0) / 100).replace(/ /g, ' ')
}

/** 123456 -> "1.234,56" */
export function dinheiroSemSimbolo(centavos: number | null | undefined): string {
  return ((centavos ?? 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** Valor compacto para eixos: 120720 -> "R$ 1,2 mil" */
export function dinheiroCompacto(centavos: number): string {
  const reais = centavos / 100
  if (Math.abs(reais) >= 1000) {
    return 'R$ ' + (reais / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mil'
  }
  return 'R$ ' + reais.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
}

/** Converte texto digitado ("12,34", "1.234,5", "1234") em centavos. */
export function textoParaCentavos(texto: string): number {
  const limpo = texto.replace(/[^\d,.-]/g, '')
  if (!limpo) return 0
  if (limpo.includes(',')) {
    const [inteiro, dec = ''] = limpo.replace(/\./g, '').split(',')
    return parseInt(inteiro || '0', 10) * 100 + parseInt((dec + '00').slice(0, 2), 10)
  }
  return Math.round(parseFloat(limpo) * 100)
}

export function quantidade(q: number | string | null | undefined, unidade?: string): string {
  const n = typeof q === 'string' ? parseFloat(q.replace(',', '.')) : (q ?? 0)
  const fracionavel = unidade ? ['KG', 'L', 'M'].includes(unidade) : !Number.isInteger(n)
  return n.toLocaleString('pt-BR', {
    minimumFractionDigits: fracionavel && !Number.isInteger(n) ? 3 : 0,
    maximumFractionDigits: 3,
  })
}

/** Lê quantidade digitada com vírgula: "0,350" -> 0.35 */
export function textoParaQuantidade(texto: string): number {
  const n = parseFloat(texto.replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? Math.round(n * 1000) / 1000 : NaN
}

export function percentual(p: number | null | undefined, casas = 1): string {
  if (p === null || p === undefined) return '—'
  return p.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: casas }) + '%'
}

function partes(iso: string | Date) {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  const f = new Intl.DateTimeFormat('pt-BR', {
    timeZone: fusoAtual, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  })
  const p: Record<string, string> = {}
  for (const x of f.formatToParts(d)) p[x.type] = x.value
  return p
}

/** ISO -> "dd/mm/aaaa hh:mm" no fuso da loja */
export function dataHora(iso: string | null | undefined): string {
  if (!iso) return '—'
  const p = partes(iso)
  return `${p.day}/${p.month}/${p.year} ${p.hour === '24' ? '00' : p.hour}:${p.minute}`
}

/** ISO -> "hh:mm" */
export function hora(iso: string | null | undefined): string {
  if (!iso) return '—'
  const p = partes(iso)
  return `${p.hour === '24' ? '00' : p.hour}:${p.minute}`
}

/** "aaaa-mm-dd" (ou ISO) -> "dd/mm/aaaa" */
export function data(valor: string | null | undefined): string {
  if (!valor) return '—'
  if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    const [a, m, d] = valor.split('-')
    return `${d}/${m}/${a}`
  }
  const p = partes(valor)
  return `${p.day}/${p.month}/${p.year}`
}

/** Hoje no fuso da loja, "aaaa-mm-dd" */
export function hojeIso(deslocamentoDias = 0): string {
  const d = new Date(Date.now() + deslocamentoDias * 86400000)
  const p = partes(d)
  return `${p.year}-${p.month}-${p.day}`
}

export function inicioMesIso(deslocamentoMeses = 0): string {
  const [a, m] = hojeIso().split('-').map(Number)
  const d = new Date(Date.UTC(a, m - 1 + deslocamentoMeses, 1))
  return d.toISOString().slice(0, 10)
}
export function fimMesIso(deslocamentoMeses = 0): string {
  const [a, m] = hojeIso().split('-').map(Number)
  const d = new Date(Date.UTC(a, m + deslocamentoMeses, 0))
  return d.toISOString().slice(0, 10)
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
export function rotuloMes(aaaaMm: string): string {
  const [a, m] = aaaaMm.split('-')
  return `${MESES[Number(m) - 1]}/${a.slice(2)}`
}
export function rotuloDiaCurto(aaaaMmDd: string): string {
  const [, m, d] = aaaaMmDd.split('-')
  return `${d}/${m}`
}

export function duracao(minutos: number): string {
  const h = Math.floor(minutos / 60)
  const m = Math.floor(minutos % 60)
  if (h === 0) return `${m} min`
  return `${h} h ${String(m).padStart(2, '0')} min`
}

/* ---------- Documentos ---------- */

export const soDigitos = (v: string | null | undefined) => (v ?? '').replace(/\D/g, '')

export function mascararCpf(v: string) {
  const d = soDigitos(v).slice(0, 11)
  return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2')
}
export function mascararCnpj(v: string) {
  const d = soDigitos(v).slice(0, 14)
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2')
}
/** Decide pelo tamanho: até 11 dígitos é CPF, acima é CNPJ. */
export function mascararDocumento(v: string | null | undefined) {
  const d = soDigitos(v)
  if (!d) return ''
  return d.length <= 11 ? mascararCpf(d) : mascararCnpj(d)
}

export function cpfValido(v: string): boolean {
  const d = soDigitos(v)
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false
  const dig = (n: number) => {
    let s = 0
    for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i)
    const r = (s * 10) % 11
    return r === 10 ? 0 : r
  }
  return dig(9) === Number(d[9]) && dig(10) === Number(d[10])
}

export function cnpjValido(v: string): boolean {
  const d = soDigitos(v)
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false
  const calc = (n: number) => {
    const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    const s = pesos.reduce((acc, p, i) => acc + Number(d[i]) * p, 0)
    const r = s % 11
    return r < 2 ? 0 : 11 - r
  }
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13])
}

/** Mensagem de erro para documento (vazio = ok). */
export function erroDocumento(v: string, aceita: 'cpf' | 'cnpj' | 'ambos' = 'ambos'): string | null {
  const d = soDigitos(v)
  if (!d) return null
  if (aceita === 'cnpj') return cnpjValido(d) ? null : 'Confira o CNPJ: os dígitos não batem.'
  if (aceita === 'cpf') return cpfValido(d) ? null : 'Confira o CPF: os dígitos não batem.'
  if (d.length === 11) return cpfValido(d) ? null : 'Confira o CPF: os dígitos não batem.'
  if (d.length === 14) return cnpjValido(d) ? null : 'Confira o CNPJ: os dígitos não batem.'
  return 'Informe um CPF (11 dígitos) ou CNPJ (14 dígitos).'
}

export function mascararTelefone(v: string | null | undefined) {
  const d = soDigitos(v).slice(0, 11)
  if (d.length <= 2) return d ? `(${d}` : ''
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

export function mascararCep(v: string | null | undefined) {
  const d = soDigitos(v).slice(0, 8)
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d
}

export function emailValido(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())
}

/** Data digitada "dd/mm/aaaa" -> "aaaa-mm-dd" (ou null) */
export function dataBrParaIso(v: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v.trim())
  if (!m) return null
  const [, d, mes, a] = m
  const dt = new Date(Date.UTC(+a, +mes - 1, +d))
  if (dt.getUTCDate() !== +d || dt.getUTCMonth() !== +mes - 1) return null
  return `${a}-${mes}-${d}`
}
export function mascararData(v: string) {
  const d = soDigitos(v).slice(0, 8)
  if (d.length <= 2) return d
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`
}

export const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO']

export const NOMES_FORMA: Record<string, string> = {
  dinheiro: 'Dinheiro', debito: 'Débito', credito: 'Crédito', pix: 'PIX', vale_troca: 'Vale-troca',
}
export const NOMES_PERFIL: Record<string, string> = {
  administrador: 'Administrador', gerente: 'Gerente', caixa: 'Caixa',
}
export const NOMES_MOVIMENTACAO: Record<string, string> = {
  estoque_inicial: 'Estoque inicial', entrada: 'Entrada', ajuste_mais: 'Ajuste (+)', ajuste_menos: 'Ajuste (−)',
  inventario: 'Inventário', venda: 'Venda', cancelamento_venda: 'Venda cancelada', devolucao: 'Devolução',
}
export const NOMES_MOTIVO_AJUSTE: Record<string, string> = {
  perda_quebra: 'Perda ou quebra', vencido: 'Vencido', uso_interno: 'Uso interno', furto: 'Furto',
  correcao_lancamento: 'Correção de lançamento', bonificacao_recebida: 'Bonificação recebida', outro: 'Outro',
}
export const NOMES_MOTIVO_DEVOLUCAO: Record<string, string> = {
  defeito: 'Defeito', arrependimento: 'Arrependimento', tamanho_modelo: 'Tamanho ou modelo', outro: 'Outro',
}
export const UNIDADES = ['UN', 'KG', 'G', 'L', 'ML', 'M', 'CX', 'PCT']
export const fracionavel = (u: string) => ['KG', 'L', 'M'].includes(u)

export function nomeCurto(nome: string) {
  const p = nome.trim().split(/\s+/)
  return p.length > 1 ? `${p[0]} ${p[p.length - 1][0]}.` : p[0]
}
export function iniciais(nome: string) {
  const p = nome.trim().split(/\s+/)
  return ((p[0]?.[0] ?? '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase()
}
